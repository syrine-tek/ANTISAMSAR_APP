import { Module, Global } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';
import { QdrantService } from './qdrant.service';
import { QDRANT_CLIENT } from './qdrant.constants';

export { QDRANT_CLIENT } from './qdrant.constants';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: QDRANT_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): QdrantClient => {
        const url = configService.get<string>('QDRANT_URL');
        const apiKey = configService.get<string>('QDRANT_API_KEY');

        if (!url || !apiKey) {
          throw new Error(
            'Missing Qdrant configuration: QDRANT_URL and QDRANT_API_KEY must be set in .env',
          );
        }

        return new QdrantClient({ url, apiKey });
      },
    },
    QdrantService,
  ],
  exports: [QDRANT_CLIENT, QdrantService],
})
export class QdrantModule {}
