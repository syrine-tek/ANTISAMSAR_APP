import {
  Injectable,
  Inject,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QDRANT_CLIENT } from './qdrant.constants';

@Injectable()
export class QdrantService implements OnModuleInit {
  private readonly logger = new Logger(QdrantService.name);

  constructor(
    @Inject(QDRANT_CLIENT) private readonly client: QdrantClient,
  ) {}

  /**
   * Vérifie la connexion à Qdrant Cloud au démarrage du module.
   */
  async onModuleInit(): Promise<void> {
    try {
      const result = await this.client.getCollections();
      this.logger.log(
        `✅ Connected to Qdrant Cloud. Collections: [${result.collections.map((c) => c.name).join(', ') || 'none'}]`,
      );
    } catch (err: any) {
      this.logger.error(`❌ Failed to connect to Qdrant Cloud: ${err.message}`);
      throw err;
    }
  }

  /**
   * Crée une collection si elle n'existe pas encore.
   */
  async ensureCollection(
    collectionName: string,
    vectorSize: number,
  ): Promise<void> {
    const { collections } = await this.client.getCollections();
    const exists = collections.some((c) => c.name === collectionName);

    if (!exists) {
      await this.client.createCollection(collectionName, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
      this.logger.log(
        `Collection "${collectionName}" created (dim=${vectorSize}, distance=Cosine).`,
      );
    } else {
      this.logger.log(`Collection "${collectionName}" already exists.`);
    }

    // S'assurer que les index de payload nécessaires existent
    const indexedFields = ['city', 'state', 'transactionType', 'type'];
    for (const field of indexedFields) {
      try {
        await this.client.createPayloadIndex(collectionName, {
          field_name: field,
          field_schema: 'keyword',
        });
        this.logger.log(`Payload index for field "${field}" ensured.`);
      } catch (err: any) {
        // Ignorer si l'index existe déjà
        this.logger.debug(`Could not create payload index for "${field}": ${err.message}`);
      }
    }
  }

  /**
   * Insère ou met à jour des points dans une collection.
   */
  async upsertPoints(
    collectionName: string,
    points: { id: string | number; vector: number[]; payload?: Record<string, any> }[],
  ): Promise<void> {
    await this.client.upsert(collectionName, {
      wait: true,
      points: points.map((p) => ({
        id: p.id,
        vector: p.vector,
        payload: p.payload ?? {},
      })),
    });
    this.logger.log(`Upserted ${points.length} point(s) into "${collectionName}".`);
  }

  /**
   * Recherche les vecteurs les plus proches dans une collection.
   */
  async search(
    collectionName: string,
    queryVector: number[],
    limit = 5,
    filter?: Record<string, any>,
  ) {
    const results = await this.client.search(collectionName, {
      vector: queryVector,
      limit,
      with_payload: true,
      ...(filter ? { filter } : {}),
    });
    return results;
  }

  /**
   * Expose le client brut pour des usages avancés.
   */
  getClient(): QdrantClient {
    return this.client;
  }
}
