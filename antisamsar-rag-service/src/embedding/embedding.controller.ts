import { Controller, Post, Body } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

@Controller('embedding')
export class EmbeddingController {
  constructor(private readonly embeddingService: EmbeddingService) {}

  @Post('generate')
  async generateEmbedding(@Body() annonce: any) {
    const textForEmbedding = this.embeddingService.buildTextForEmbedding(annonce);
    const embedding = await this.embeddingService.generateEmbedding(textForEmbedding);
    
    return {
      textForEmbedding,
      dimensions: embedding.length,
      embeddingPreview: embedding.slice(0, 5),
    };
  }
}
