import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { RecommendationService } from './recommendation.service';
import { InteractionAnalysisService } from '../interaction/interaction-analysis.service';
import { RagQueryDto } from './dto/rag-query.dto';
import { RagResponseDto } from './dto/rag-response.dto';

@Controller('recommendations')
export class RecommendationController {
  constructor(
    private readonly recommendationService: RecommendationService,
    private readonly interactionAnalysisService: InteractionAnalysisService,
  ) {}

  /**
   * POST /recommendations/rag
   * Pipeline RAG complet : embedding → Qdrant Top-8 → User Context → AirLLM
   *
   * Body: { query: string, userId: string }
   */
  @Post('rag')
  @HttpCode(HttpStatus.OK)
  async ragRecommend(@Body() dto: RagQueryDto): Promise<RagResponseDto> {
    return this.recommendationService.ragRecommend(dto);
  }

  /**
   * GET /recommendations/user-context/:userId
   * Retourne le UserContext calculé pour un utilisateur — utile pour debug Postman.
   */
  @Get('user-context/:userId')
  async getUserContext(@Param('userId') userId: string) {
    return this.interactionAnalysisService.analyzeUserInteractions(userId);
  }

  /**
   * POST /recommendations/generate-embeddings
   * Génère les embeddings pour toutes les annonces sans embedding valide dans MongoDB.
   */
  @Post('generate-embeddings')
  async generateEmbeddings() {
    return this.recommendationService.generateEmbeddingsForAllListings();
  }

  /**
   * POST /recommendations/sync-qdrant
   * Synchronise les embeddings depuis MongoDB vers Qdrant Cloud.
   * À appeler après chaque insertion de nouvelles annonces.
   */
  @Post('sync-qdrant')
  async syncToQdrant() {
    return this.recommendationService.syncMongoToQdrant();
  }

  /**
   * GET /recommendations/embedding-status
   * Statut des embeddings dans MongoDB.
   */
  @Get('embedding-status')
  async getEmbeddingStatus() {
    return this.recommendationService.getEmbeddingStatus();
  }
}
