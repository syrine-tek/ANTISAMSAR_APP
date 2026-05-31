import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type InteractionDocument = Interaction & Document;

/**
 * Types d'interactions supportés avec leurs poids de score respectifs.
 * VIEW(1) → CLICK(2) → LIKE(3) → FAVORITE(5) → CONTACT_OWNER(10)
 */
export type InteractionType =
  | 'VIEW'
  | 'CLICK'
  | 'FAVORITE'
  | 'LIKE'
  | 'SHARE'
  | 'SEARCH'
  | 'CONTACT_OWNER'
  | 'VISIT_TIME';

export const INTERACTION_TYPES: InteractionType[] = [
  'VIEW',
  'CLICK',
  'FAVORITE',
  'LIKE',
  'SHARE',
  'SEARCH',
  'CONTACT_OWNER',
  'VISIT_TIME',
];

/** Poids d'engagement par type d'interaction (utilisé pour interactionScore) */
export const INTERACTION_WEIGHTS: Record<string, number> = {
  VIEW: 1,
  CLICK: 2,
  LIKE: 3,
  FAVORITE: 5,
  SHARE: 2,
  SEARCH: 1,
  CONTACT_OWNER: 10,
  VISIT_TIME: 1,
};

@Schema({ collection: 'interactions', timestamps: true })
export class Interaction {
  @Prop({ required: true, index: true })
  userId: string;

  /** ID de l'annonce concernée (optionnel pour type=SEARCH) */
  @Prop({ index: true })
  annonceId?: string;

  /** Type d'interaction */
  @Prop({ required: true, enum: INTERACTION_TYPES, index: true })
  type: InteractionType;

  /** Durée de consultation en secondes (pour VIEW / VISIT_TIME) */
  @Prop()
  duration?: number;

  /** Texte de la recherche tapée par l'utilisateur (pour SEARCH) — champ legacy */
  @Prop()
  searchQuery?: string;

  /**
   * Métadonnées libres associées à l'interaction.
   * Ex : { searchQuery: "villa avec piscine", filters: { ... } }
   */
  @Prop({ type: Object })
  metadata?: {
    searchQuery?: string;
    [key: string]: any;
  };

  /** Snapshot de l'annonce au moment de l'interaction */
  @Prop({ type: Object })
  annonceSnapshot?: {
    title?: string;
    city?: string;
    type?: string;
    price?: number;
    features?: string[];
  };

  // Champs automatiques via timestamps: true
  createdAt?: Date;
  updatedAt?: Date;
}

export const InteractionSchema = SchemaFactory.createForClass(Interaction);

// Index composé pour les requêtes fréquentes d'analyse
InteractionSchema.index({ userId: 1, createdAt: -1 });
InteractionSchema.index({ userId: 1, type: 1 });
