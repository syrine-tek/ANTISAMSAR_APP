import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AirLLMService } from './airllm.service';

@Module({
  imports: [ConfigModule],
  providers: [AirLLMService],
  exports: [AirLLMService],
})
export class AirLLMModule {}
