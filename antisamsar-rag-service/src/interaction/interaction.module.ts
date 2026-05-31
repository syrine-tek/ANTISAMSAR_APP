import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Interaction, InteractionSchema } from '../schemas/interaction.schema';
import { InteractionAnalysisService } from './interaction-analysis.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Interaction.name, schema: InteractionSchema },
    ]),
  ],
  providers: [InteractionAnalysisService],
  exports: [InteractionAnalysisService],
})
export class InteractionModule {}
