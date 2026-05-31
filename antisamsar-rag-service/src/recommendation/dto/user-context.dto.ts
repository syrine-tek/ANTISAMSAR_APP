/**
 * Contexte complet de l'utilisateur calculé à partir de son historique d'interactions.
 * Utilisé pour personnaliser le prompt RAG envoyé à AirLLM.
 */
export class UserContextDto {
  /** Top 5 villes les plus consultées */
  preferredCities: string[];

  /** Top 5 types de biens les plus consultés (VILLA, APPARTEMENT, etc.) */
  preferredTypes: string[];

  /** Moyenne des prix des annonces consultées (VIEW + LIKE) en TND */
  averageBudget: number;

  /** Top 10 équipements favoris (Piscine, Jardin, Parking, etc.) */
  favoriteFeatures: string[];

  /** 10 dernières requêtes de recherche de l'utilisateur */
  recentSearches: string[];

  /**
   * Score d'engagement par annonce.
   * Clé = annonceId, Valeur = somme des poids d'interaction
   * Ex: { "abc123": 15 } → favoris(5) + contact(10)
   */
  interactionScore: Record<string, number>;
}
