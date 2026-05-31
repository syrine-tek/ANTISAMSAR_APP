export class QdrantHitDto {
  /** ID du point dans Qdrant (correspond à l'_id MongoDB de l'annonce) */
  id: string | number;

  /** Score de similarité cosine [0, 1] */
  score: number;

  /** Payload stocké dans Qdrant */
  payload: {
    annonceId?: string;
    title?: string;
    city?: string;
    state?: string;
    city_level?: string;
    type?: string;
    transactionType?: string;
    price?: number;
    surface?: number;
    nbBedrooms?: number;
    nbBathrooms?: number;
    hasPiscine?: boolean;
    hasJardin?: boolean;
    hasParking?: boolean;
    hasBalcony?: boolean;
    isFurnished?: boolean;
    textForEmbedding?: string;
    [key: string]: any;
  };
}
