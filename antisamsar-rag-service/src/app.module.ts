import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EmbeddingModule } from './embedding/embedding.module';
import { RecommendationModule } from './recommendation/recommendation.module';
import { InteractionModule } from './interaction/interaction.module';
import { LlmModule } from './llm/llm.module';
import { PromptBuilderModule } from './prompt-builder/prompt-builder.module';
import { QdrantModule } from './qdrant/qdrant.module';
import { AirLLMModule } from './airllm/airllm.module';

@Module({
  imports: [
    // Load .env globally
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // Connect to MongoDB using .env variable
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        uri: configService.get<string>('MONGO_URI'),
      }),
      inject: [ConfigService],
    }),

    // Qdrant Cloud — Global provider (injecté partout sans re-import)
    QdrantModule,

    // AirLLM HTTP client
    AirLLMModule,

    EmbeddingModule,

    RecommendationModule,

    InteractionModule,

    LlmModule,

    PromptBuilderModule,
  ],
})
export class AppModule {}
