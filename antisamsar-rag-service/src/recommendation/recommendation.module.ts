import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { RecommendationService } from './recommendation.service';
import { RecommendationController } from './recommendation.controller';
import { EmbeddingModule } from '../embedding/embedding.module';
import { InteractionModule } from '../interaction/interaction.module';
import { PromptBuilderModule } from '../prompt-builder/prompt-builder.module';
import { AirLLMModule } from '../airllm/airllm.module';
import { Annonce, AnnonceSchema } from '../schemas/annonce.schema';

@Module({
  imports: [
    MongooseModule.forFeature([{ name: Annonce.name, schema: AnnonceSchema }]),
    EmbeddingModule,
    InteractionModule,
    PromptBuilderModule,
    AirLLMModule,
  ],
  providers: [RecommendationService],
  controllers: [RecommendationController],
})
export class RecommendationModule {}
