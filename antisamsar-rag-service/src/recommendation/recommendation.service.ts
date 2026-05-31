import {
  Injectable,
  Logger,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Annonce, AnnonceDocument } from '../schemas/annonce.schema';
import { EmbeddingService } from '../embedding/embedding.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { InteractionAnalysisService } from '../interaction/interaction-analysis.service';
import { PromptBuilderService } from '../prompt-builder/prompt-builder.service';
import { AirLLMService } from '../airllm/airllm.service';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagResponseDto, RecommendationItemDto } from './dto/rag-response.dto';
import { QdrantHitDto } from './dto/qdrant-hit.dto';

const QDRANT_COLLECTION = 'annonces_vectors';
const TOP_K = 8;

@Injectable()
export class RecommendationService implements OnModuleInit {
  private readonly logger = new Logger(RecommendationService.name);
  private cityMapping = new Map<string, string>();
  private stateMapping = new Map<string, string>();

  constructor(
    @InjectModel(Annonce.name) private annonceModel: Model<AnnonceDocument>,
    private readonly embeddingService: EmbeddingService,
    private readonly qdrantService: QdrantService,
    private readonly interactionAnalysisService: InteractionAnalysisService,
    private readonly promptBuilderService: PromptBuilderService,
    private readonly airLLMService: AirLLMService,
  ) {}

  async onModuleInit() {
    this.logger.log(`Ensuring Qdrant collection '${QDRANT_COLLECTION}' exists...`);
    await this.qdrantService.ensureCollection(QDRANT_COLLECTION, 768);
    await this.loadLocations();
  }

  private normalizeText(text: string): string {
    if (!text) return '';
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s-]/g, ' ')
      .trim();
  }

  async loadLocations() {
    try {
      this.logger.log('Loading distinct cities and states from database for filtering...');
      const cities = await this.annonceModel.distinct('city').exec();
      const states = await this.annonceModel.distinct('state').exec();
      
      this.cityMapping.clear();
      for (const city of cities) {
        if (city) {
          this.cityMapping.set(this.normalizeText(city), city);
        }
      }

      this.stateMapping.clear();
      for (const state of states) {
        if (state) {
          this.stateMapping.set(this.normalizeText(state), state);
        }
      }
      this.logger.log(`Loaded ${this.cityMapping.size} unique cities and ${this.stateMapping.size} unique states.`);
    } catch (err: any) {
      this.logger.error(`Failed to load locations: ${err.message}`);
    }
  }

  extractLocationFilter(query: string): any {
    const normalizedQuery = this.normalizeText(query);
    
    // Check cities
    for (const [normCity, originalCity] of this.cityMapping.entries()) {
      const regex = new RegExp(`\\b${normCity}\\b`, 'i');
      if (regex.test(normalizedQuery)) {
        this.logger.log(`Extracted city filter: ${originalCity}`);
        return {
          must: [
            {
              key: 'city',
              match: {
                value: originalCity,
              },
            },
          ],
        };
      }
    }

    // Check states
    for (const [normState, originalState] of this.stateMapping.entries()) {
      const regex = new RegExp(`\\b${normState}\\b`, 'i');
      if (regex.test(normalizedQuery)) {
        this.logger.log(`Extracted state filter: ${originalState}`);
        return {
          must: [
            {
              key: 'state',
              match: {
                value: originalState,
              },
            },
          ],
        };
      }
    }

    return null;
  }

  extractTransactionTypeFilter(query: string): string | null {
    const normalized = this.normalizeText(query);
    if (/\b(louer|location|loyer|coloc|colocation)\b/.test(normalized)) {
      return 'Location';
    }
    if (/\b(acheter|vente|achat|acquerir)\b/.test(normalized)) {
      return 'Vente';
    }
    return null;
  }

  extractPropertyTypeFilter(query: string): string | null {
    const normalized = this.normalizeText(query);
    if (/\b(appartement|studio|chambre|flat|s\+1|s\+2|s\+3|s\+4)\b/.test(normalized)) {
      return 'APPARTEMENT';
    }
    if (/\b(villa|maison|duplex|triplex|riad)\b/.test(normalized)) {
      return 'VILLA';
    }
    return null;
  }

  // ============================================================
  // PIPELINE RAG PRINCIPAL
  // ============================================================

  /**
   * Orchestre le pipeline RAG complet :
   * query → embedding → Qdrant Top-K → UserContext → Prompt → AirLLM → Response
   */
  async ragRecommend(dto: RagQueryDto): Promise<RagResponseDto> {
    const start = Date.now();
    this.logger.log(
      `RAG pipeline started — userId: ${dto.userId}, query: "${dto.query}"`,
    );

    // 1. Générer l'embedding de la requête (768 dimensions)
    this.logger.log('Step 1: Generating query embedding...');
    const queryVector = await this.embeddingService.generateEmbedding(dto.query);

    // 2. Recherche Top-K dans Qdrant avec filtres et fallback
    const mustConditions: any[] = [];

    const locationFilter = this.extractLocationFilter(dto.query);
    if (locationFilter) {
      mustConditions.push(...locationFilter.must);
    }

    const transType = this.extractTransactionTypeFilter(dto.query);
    if (transType) {
      mustConditions.push({
        key: 'transactionType',
        match: { value: transType }
      });
    }

    const propType = this.extractPropertyTypeFilter(dto.query);
    if (propType) {
      mustConditions.push({
        key: 'type',
        match: { value: propType }
      });
    }

    const filter = mustConditions.length > 0 ? { must: mustConditions } : undefined;
    this.logger.log(`Step 2: Searching Qdrant (Top-${TOP_K}) with filter: ${JSON.stringify(filter)}...`);

    let qdrantResults = await this.qdrantService.search(
      QDRANT_COLLECTION,
      queryVector,
      TOP_K,
      filter,
    );

    // Fallback 1: Si aucun résultat avec tous les filtres, essayer avec la localisation seule
    if (!qdrantResults.length && filter) {
      const locationOnlyConditions = mustConditions.filter(c => c.key === 'city' || c.key === 'state');
      const locationOnlyFilter = locationOnlyConditions.length > 0 ? { must: locationOnlyConditions } : undefined;

      if (locationOnlyFilter && JSON.stringify(locationOnlyFilter) !== JSON.stringify(filter)) {
        this.logger.warn(`No results found in Qdrant with strict filters. Retrying search with location filter only...`);
        qdrantResults = await this.qdrantService.search(
          QDRANT_COLLECTION,
          queryVector,
          TOP_K,
          locationOnlyFilter,
        );
      }
    }

    // Fallback 2: Si toujours aucun résultat, faire une recherche brute sans filtre
    if (!qdrantResults.length && (filter || mustConditions.length > 0)) {
      this.logger.warn(`No results found in Qdrant with filters. Retrying search without any filters...`);
      qdrantResults = await this.qdrantService.search(
        QDRANT_COLLECTION,
        queryVector,
        TOP_K,
      );
    }

    if (!qdrantResults.length) {
      this.logger.warn('No results found in Qdrant for this query.');
    }

    const hits: QdrantHitDto[] = qdrantResults.map((r) => ({
      id: r.id,
      score: r.score,
      payload: r.payload as QdrantHitDto['payload'],
    }));

    // 3. Construire le contexte utilisateur depuis MongoDB
    this.logger.log('Step 3: Building user context from interactions...');
    const userContext = await this.interactionAnalysisService.buildUserContext(
      dto.userId,
    );

    // 4. Construire le prompt RAG
    this.logger.log('Step 4: Building RAG prompt...');
    const prompt = this.promptBuilderService.buildRagPrompt(
      dto.query,
      hits,
      userContext,
    );

    // 5. Générer la réponse IA via AirLLM
    this.logger.log('Step 5: Calling AirLLM...');
    const aiResponse = await this.airLLMService.generate(prompt);

    // 6. Formater les recommandations
    const recommendations: RecommendationItemDto[] = hits.map((hit) => {
      const p = hit.payload;
      const features: string[] = [];
      if (p.hasPiscine) features.push('Piscine');
      if (p.hasJardin) features.push('Jardin');
      if (p.hasParking) features.push('Parking');
      if (p.hasBalcony) features.push('Balcon');
      if (p.isFurnished) features.push('Meublé');

      return {
        annonceId: String(p.annonceId ?? hit.id),
        score: Math.round(hit.score * 1000) / 1000,
        title: p.title ?? '',
        city: p.city ?? '',
        state: p.state ?? '',
        type: p.type ?? '',
        transactionType: p.transactionType ?? '',
        price: p.price ?? 0,
        surface: p.surface ?? 0,
        nbBedrooms: p.nbBedrooms ?? 0,
        nbBathrooms: p.nbBathrooms ?? 0,
        features,
      };
    });

    const processingTimeMs = Date.now() - start;
    this.logger.log(
      `RAG pipeline completed in ${processingTimeMs}ms — ${recommendations.length} recommendations`,
    );

    return {
      recommendations,
      aiResponse,
      userContext,
      meta: {
        query: dto.query,
        userId: dto.userId,
        topK: TOP_K,
        collectionUsed: QDRANT_COLLECTION,
        processingTimeMs,
      },
    };
  }

  // ============================================================
  // MÉTHODES EXISTANTES (inchangées)
  // ============================================================

  /**
   * Identifie les annonces sans embedding valide, génère le texte et l'embedding,
   * puis les sauvegarde dans MongoDB via des opérations batch.
   */
  async generateEmbeddingsForAllListings(): Promise<{ updatedCount: number; errors: number }> {
    this.logger.log('Starting batch embedding generation...');

    const query = {
      $or: [
        { embedding: { $exists: false } },
        { embedding: { $size: 0 } },
        { 'embedding.767': { $exists: false } },
      ],
    };

    const batchSize = 50;
    let updatedCount = 0;
    let errors = 0;
    let hasMore = true;

    while (hasMore) {
      const annonces = await this.annonceModel.find(query).limit(batchSize).exec();

      if (annonces.length === 0) {
        hasMore = false;
        break;
      }

      this.logger.log(`Processing batch of ${annonces.length} listings...`);
      const bulkOps: any[] = [];

      for (const annonce of annonces) {
        try {
          const textForEmbedding = this.embeddingService.buildTextForEmbedding(annonce);
          const embedding = await this.embeddingService.generateEmbedding(textForEmbedding);

          bulkOps.push({
            updateOne: {
              filter: { _id: annonce._id },
              update: { $set: { textForEmbedding, embedding } },
            },
          });
        } catch (error: any) {
          this.logger.error(
            `Error generating embedding for annonce ${annonce._id}: ${error.message}`,
          );
          errors++;
        }
      }

      if (bulkOps.length > 0) {
        const result = await this.annonceModel.bulkWrite(bulkOps);
        updatedCount += result.modifiedCount;
        this.logger.log(
          `Batch updated ${result.modifiedCount} listings. Total updated: ${updatedCount}`,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.log(
      `Embedding generation complete. Updated: ${updatedCount}, Errors: ${errors}`,
    );
    return { updatedCount, errors };
  }

  /**
   * Récupère le statut actuel de la base de données concernant les embeddings.
   */
  async getEmbeddingStatus() {
    const totalListings = await this.annonceModel.countDocuments();

    const validQuery = {
      embedding: { $exists: true, $ne: [] },
      'embedding.767': { $exists: true },
    };

    const withEmbedding = await this.annonceModel.countDocuments(validQuery);
    const withoutEmbedding = totalListings - withEmbedding;

    const invalidEmbedding = await this.annonceModel.countDocuments({
      embedding: { $exists: true, $ne: [] },
      $or: [{ embedding: { $not: { $size: 768 } } }],
    });

    return {
      totalListings,
      withEmbedding,
      withoutEmbedding,
      invalidEmbedding,
      expectedDimension: 768,
    };
  }
  /**
   * Synchronise toutes les annonces ayant déjà un embedding de MongoDB vers Qdrant.
   */
  async syncMongoToQdrant(): Promise<{ synced: number }> {
    this.logger.log('Starting sync from MongoDB to Qdrant...');
    
    // On prend toutes les annonces qui ont un embedding valide
    const query = {
      embedding: { $exists: true, $ne: [] },
      'embedding.767': { $exists: true },
    };

    const batchSize = 100;
    let synced = 0;
    let hasMore = true;
    let skip = 0;

    while (hasMore) {
      const annonces = await this.annonceModel.find(query).skip(skip).limit(batchSize).lean().exec();

      if (annonces.length === 0) {
        hasMore = false;
        break;
      }

      this.logger.log(`Syncing batch of ${annonces.length} listings to Qdrant...`);
      
      const points = annonces.map(annonce => {
        // Préparer le payload avec les métadonnées utiles
        const payload = {
          annonceId: String(annonce._id),
          title: annonce.title,
          city: annonce.city,
          state: annonce.state,
          city_level: annonce.city_level,
          type: annonce.type,
          transactionType: annonce.transactionType,
          price: annonce.price,
          surface: annonce.surface,
          nbBedrooms: annonce.nbBedrooms,
          nbBathrooms: annonce.nbBathrooms,
          hasPiscine: annonce.hasPiscine,
          hasJardin: annonce.hasJardin,
          hasParking: annonce.hasParking,
          hasBalcony: annonce.hasBalcony,
          isFurnished: annonce.isFurnished,
        };

        const objectIdStr = String(annonce._id);
        // Convertir ObjectId (24 chars) en UUID (32 chars avec tirets) pour Qdrant
        // ex: a5499a772d5246b2d53f4a9c -> a5499a77-2d52-46b2-d53f-4a9c00000000
        const qdrantUuid = `${objectIdStr.slice(0, 8)}-${objectIdStr.slice(8, 12)}-${objectIdStr.slice(12, 16)}-${objectIdStr.slice(16, 20)}-${objectIdStr.slice(20, 24)}00000000`;

        return {
          id: qdrantUuid,
          vector: annonce.embedding,
          payload
        };
      });

      await this.qdrantService.upsertPoints(QDRANT_COLLECTION, points);
      
      synced += points.length;
      skip += batchSize;
      
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    this.logger.log(`Sync complete. Total synced to Qdrant: ${synced}`);
    return { synced };
  }
}
