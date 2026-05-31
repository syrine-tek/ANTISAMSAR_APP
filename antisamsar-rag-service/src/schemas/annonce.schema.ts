import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type AnnonceDocument = Annonce & Document;

@Schema({ collection: 'annonces' })
export class Annonce {
  @Prop()
  title: string;

  @Prop()
  description: string;

  @Prop()
  price: number;

  @Prop()
  type: string;

  @Prop()
  city: string;

  @Prop()
  state: string;

  @Prop()
  city_level: string;

  @Prop()
  transactionType: string;

  @Prop()
  surface: number;

  @Prop()
  nbBedrooms: number;

  @Prop()
  nbBathrooms: number;

  @Prop()
  hasPiscine: boolean;

  @Prop()
  hasJardin: boolean;

  @Prop()
  hasParking: boolean;

  @Prop()
  hasBalcony: boolean;

  @Prop()
  isFurnished: boolean;

  @Prop()
  textForEmbedding: string;

  @Prop({ type: [Number] })
  embedding: number[];
}

export const AnnonceSchema = SchemaFactory.createForClass(Annonce);
