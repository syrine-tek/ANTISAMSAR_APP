import { UserContextDto } from './user-context.dto';

export class RecommendationItemDto {
  annonceId: string;
  score: number;
  title: string;
  city: string;
  state: string;
  type: string;
  transactionType: string;
  price: number;
  surface: number;
  nbBedrooms: number;
  nbBathrooms: number;
  features: string[];
}

export class RagResponseDto {
  /** Top-K annonces avec scores */
  recommendations: RecommendationItemDto[];

  /** Réponse IA générée par AirLLM */
  aiResponse: string;

  /** Contexte utilisateur utilisé pour la personnalisation */
  userContext: UserContextDto;

  /** Métadonnées du pipeline */
  meta: {
    query: string;
    userId: string;
    topK: number;
    collectionUsed: string;
    processingTimeMs: number;
  };
}
