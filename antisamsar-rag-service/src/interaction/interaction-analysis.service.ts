import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Interaction, InteractionDocument, INTERACTION_WEIGHTS } from '../schemas/interaction.schema';
import { UserContextDto } from '../recommendation/dto/user-context.dto';

@Injectable()
export class InteractionAnalysisService {
  private readonly logger = new Logger(InteractionAnalysisService.name);

  // ─── Limites de résultats retournés ───────────────────────────────────────
  private readonly MAX_CITIES = 5;
  private readonly MAX_TYPES = 5;
  private readonly MAX_FEATURES = 10;
  private readonly MAX_SEARCHES = 10;
  private readonly MAX_INTERACTIONS_FETCH = 500; // limite MongoDB pour perf

  constructor(
    @InjectModel(Interaction.name)
    private readonly interactionModel: Model<InteractionDocument>,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // MÉTHODE PRINCIPALE : analyzeUserInteractions
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Analyse complète de l'historique d'un utilisateur via aggregation MongoDB.
   * Construit un UserContextDto enrichi avec le score d'engagement par annonce.
   */
  async analyzeUserInteractions(userId: string): Promise<UserContextDto> {
    this.logger.log(`Analyzing interactions for userId: ${userId}`);

    try {
      // Appels en parallèle pour maximiser les performances
      const [
        cityData,
        typeData,
        budgetData,
        featureData,
        searchData,
        scoreData,
      ] = await Promise.all([
        this.aggregatePreferredCities(userId),
        this.aggregatePreferredTypes(userId),
        this.aggregateAverageBudget(userId),
        this.aggregateFavoriteFeatures(userId),
        this.aggregateRecentSearches(userId),
        this.aggregateInteractionScore(userId),
      ]);

      const ctx: UserContextDto = {
        preferredCities:    cityData,
        preferredTypes:     typeData,
        averageBudget:      budgetData,
        favoriteFeatures:   featureData,
        recentSearches:     searchData,
        interactionScore:   scoreData,
      };

      this.logger.log(
        `Context built — cities: ${cityData.length}, types: ${typeData.length}, ` +
        `budget: ${budgetData} TND, features: ${featureData.length}, ` +
        `searches: ${searchData.length}, scored annonces: ${Object.keys(scoreData).length}`,
      );

      return ctx;
    } catch (error: any) {
      this.logger.error(`Failed to analyze interactions: ${error.message}`);
      return this.emptyContext();
    }
  }

  /**
   * Alias rétrocompatible — appelle analyzeUserInteractions.
   */
  async buildUserContext(userId: string): Promise<UserContextDto> {
    return this.analyzeUserInteractions(userId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AGGREGATIONS MONGODB
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Top N villes les plus fréquentes dans les snapshots d'interaction.
   */
  private async aggregatePreferredCities(userId: string): Promise<string[]> {
    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          'annonceSnapshot.city': { $exists: true, $nin: [null, ''] },
        },
      },
      { $group: { _id: '$annonceSnapshot.city', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: this.MAX_CITIES },
    ]);

    return result.map((r) => r._id).filter(Boolean);
  }

  /**
   * Top N types de biens les plus consultés (VILLA, APPARTEMENT, etc.).
   */
  private async aggregatePreferredTypes(userId: string): Promise<string[]> {
    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          'annonceSnapshot.type': { $exists: true, $nin: [null, ''] },
        },
      },
      { $group: { _id: '$annonceSnapshot.type', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: this.MAX_TYPES },
    ]);

    return result.map((r) => r._id).filter(Boolean);
  }

  /**
   * Moyenne des prix des annonces avec lesquelles l'utilisateur a eu une interaction
   * de type VIEW, CLICK, LIKE ou FAVORITE (signaux d'intérêt fort).
   */
  private async aggregateAverageBudget(userId: string): Promise<number> {
    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          type: { $in: ['VIEW', 'CLICK', 'LIKE', 'FAVORITE'] },
          'annonceSnapshot.price': { $exists: true, $gt: 0 },
        },
      },
      {
        $group: {
          _id: null,
          avgPrice: { $avg: '$annonceSnapshot.price' },
        },
      },
    ]);

    if (!result.length || !result[0].avgPrice) return 0;
    return Math.round(result[0].avgPrice);
  }

  /**
   * Top N équipements préférés extraits des snapshots (Piscine, Jardin, etc.).
   */
  private async aggregateFavoriteFeatures(userId: string): Promise<string[]> {
    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          'annonceSnapshot.features': { $exists: true, $not: { $size: 0 } },
        },
      },
      // Déplie le tableau features pour compter chaque équipement individuellement
      { $unwind: '$annonceSnapshot.features' },
      {
        $match: {
          'annonceSnapshot.features': {
            $in: ['Piscine', 'Jardin', 'Parking', 'Balcon', 'Meublé', 'Ascenseur'],
          },
        },
      },
      { $group: { _id: '$annonceSnapshot.features', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: this.MAX_FEATURES },
    ]);

    return result.map((r) => r._id).filter(Boolean);
  }

  /**
   * 10 dernières requêtes de recherche de l'utilisateur (type SEARCH).
   * Utilise le champ `searchQuery` du document d'interaction.
   */
  private async aggregateRecentSearches(userId: string): Promise<string[]> {
    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          type: 'SEARCH',
          $or: [
            { 'metadata.searchQuery': { $exists: true, $nin: [null, ''] } },  // nouveau format
            { searchQuery: { $exists: true, $nin: [null, ''] } },              // legacy
            { query: { $exists: true, $nin: [null, ''] } },                   // rétrocompatibilité
          ],
        },
      },
      { $sort: { createdAt: -1 } },
      { $limit: this.MAX_SEARCHES },
      {
        $project: {
          _id: 0,
          // Priorité : metadata.searchQuery → searchQuery → query
          text: {
            $ifNull: [
              '$metadata.searchQuery',
              { $ifNull: ['$searchQuery', '$query'] },
            ],
          },
        },
      },
    ]);

    return result.map((r) => r.text).filter(Boolean);
  }

  /**
   * Score d'engagement par annonce.
   * Formule : Σ(poids_type) pour chaque interaction sur l'annonce.
   * Ex : VIEW(1) + FAVORITE(5) + CONTACT_OWNER(10) = 16 points
   */
  private async aggregateInteractionScore(
    userId: string,
  ): Promise<Record<string, number>> {
    // Construire la projection de poids avec $switch
    const branchCases = Object.entries(INTERACTION_WEIGHTS).map(([type, weight]) => ({
      case: { $eq: ['$type', type] },
      then: weight,
    }));

    const result = await this.interactionModel.aggregate([
      {
        $match: {
          userId,
          annonceId: { $exists: true, $ne: null },
          type: { $in: Object.keys(INTERACTION_WEIGHTS) },
        },
      },
      {
        $addFields: {
          weight: {
            $switch: {
              branches: branchCases,
              default: 0,
            },
          },
        },
      },
      {
        $group: {
          _id: '$annonceId',
          totalScore: { $sum: '$weight' },
        },
      },
      { $sort: { totalScore: -1 } },
    ]);

    // Convertir en Record<annonceId, score>
    return result.reduce(
      (acc, r) => {
        if (r._id) acc[r._id] = r.totalScore;
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // HELPERS PRIVÉS
  // ══════════════════════════════════════════════════════════════════════════

  private emptyContext(): UserContextDto {
    return {
      preferredCities: [],
      preferredTypes: [],
      averageBudget: 0,
      favoriteFeatures: [],
      recentSearches: [],
      interactionScore: {},
    };
  }
}
