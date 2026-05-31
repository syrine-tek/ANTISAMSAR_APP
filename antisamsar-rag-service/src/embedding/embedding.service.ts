import { Injectable, OnModuleInit, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { pipeline, env } from '@xenova/transformers';
import { Annonce } from '../schemas/annonce.schema';

// Configure transformers.js to not use local models by default unless cached
env.allowLocalModels = true;
env.useBrowserCache = false;

@Injectable()
export class EmbeddingService implements OnModuleInit {
  private readonly logger = new Logger(EmbeddingService.name);
  private extractor: any;
  private modelName: string;

  constructor(private configService: ConfigService) {
    // Ensuring we use a 768 dimension model
    this.modelName = this.configService.get<string>('EMBEDDING_MODEL') || 'Xenova/all-mpnet-base-v2';
  }

  async onModuleInit() {
    this.logger.log(`Initializing EmbeddingService with model: ${this.modelName}`);
    try {
      // Load the feature extraction pipeline
      this.extractor = await pipeline('feature-extraction', this.modelName);
      this.logger.log('Embedding model loaded successfully.');
    } catch (error) {
      this.logger.error('Failed to load embedding model:', error);
      throw error;
    }
  }

  /**
   * Builds a rich text representation of an Annonce for embedding generation.
   */
  buildTextForEmbedding(annonce: Annonce | any): string {
    const parts = [];
    
    if (annonce.title) parts.push(`Titre: ${annonce.title}`);
    if (annonce.description) parts.push(`Description: ${annonce.description}`);
    if (annonce.price) parts.push(`Prix: ${annonce.price}`);
    if (annonce.transactionType) parts.push(`Transaction: ${annonce.transactionType}`);
    if (annonce.type) parts.push(`Type de bien: ${annonce.type}`);
    if (annonce.surface) parts.push(`Surface: ${annonce.surface} m²`);
    if (annonce.city) parts.push(`Ville: ${annonce.city}`);
    if (annonce.state) parts.push(`Région: ${annonce.state}`);
    if (annonce.city_level) parts.push(`Quartier: ${annonce.city_level}`);

    const specs = [];
    if (annonce.nbBedrooms) specs.push(`${annonce.nbBedrooms} chambres`);
    if (annonce.nbBathrooms) specs.push(`${annonce.nbBathrooms} salles de bain`);
    if (annonce.hasPiscine) specs.push('Piscine');
    if (annonce.hasJardin) specs.push('Jardin');
    if (annonce.hasParking) specs.push('Parking');
    if (annonce.hasBalcony) specs.push('Balcon');
    if (annonce.isFurnished) specs.push('Meublé');

    if (specs.length > 0) {
      parts.push(`Caractéristiques: ${specs.join(', ')}`);
    }

    return parts.join(' | ');
  }

  /**
   * Generates an embedding vector for a given text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.extractor) {
      throw new InternalServerErrorException('Embedding model is not initialized yet.');
    }

    // Run feature extraction
    const output = await this.extractor(text, { pooling: 'mean', normalize: true });
    const embedding = Array.from(output.data) as number[];

    // Validation: Enforce 768 dimensions
    if (embedding.length !== 768) {
      throw new InternalServerErrorException(`Invalid embedding dimension. Expected 768, got ${embedding.length}`);
    }

    return embedding;
  }
}
