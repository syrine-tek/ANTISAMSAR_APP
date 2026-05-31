import { Injectable, Logger } from '@nestjs/common';
import { UserContextDto } from '../recommendation/dto/user-context.dto';
import { QdrantHitDto } from '../recommendation/dto/qdrant-hit.dto';

@Injectable()
export class PromptBuilderService {
  private readonly logger = new Logger(PromptBuilderService.name);

  /**
   * Construit un prompt RAG complet et enrichi pour AirLLM.
   * Inclut : règles système, profil utilisateur, scores d'engagement,
   * recherches récentes et top annonces Qdrant.
   */
  buildRagPrompt(
    query: string,
    hits: QdrantHitDto[],
    userCtx: UserContextDto,
  ): string {
    const systemRules   = this.buildSystemRules();
    const userProfile   = this.buildUserProfile(userCtx);
    const engagementCtx = this.buildEngagementContext(userCtx);
    const annoncesList  = this.buildAnnoncesList(hits, userCtx.interactionScore);
    const hasProfile    = this.hasUserProfile(userCtx);

    // Instruction finale adaptée : plus stricte si aucun profil disponible
    const finalInstruction = hasProfile
      ? `En te basant UNIQUEMENT sur les annonces ci-dessus et le profil utilisateur, rédige une recommandation personnalisée en français. Pour chaque annonce pertinente, explique pourquoi elle correspond à la recherche ET au profil (villes, types, budget, équipements). Priorise les annonces avec un score d'engagement élevé (★). Sois précis, professionnel et chaleureux. Maximum 400 mots.`
      : `Cet utilisateur n'a pas encore d'historique. Base-toi UNIQUEMENT sur les annonces ci-dessus pour répondre à la requête. N'invente AUCUNE préférence (ville, budget, type) qui ne serait pas explicitement mentionnée dans la requête. Présente les annonces les plus pertinentes par rapport à la recherche uniquement. Maximum 400 mots.`;

    const prompt = `${systemRules}

=== PROFIL UTILISATEUR ===
${userProfile}

=== HISTORIQUE D'ENGAGEMENT ===
${engagementCtx}

=== ANNONCES DISPONIBLES (Top ${hits.length} par similarité sémantique) ===
${annoncesList}

=== REQUÊTE UTILISATEUR ===
"${query}"

=== TA RÉPONSE ===
${finalInstruction}`;

    this.logger.log(
      `Prompt built — ${prompt.length} chars, ${hits.length} annonces, ` +
      `${Object.keys(userCtx.interactionScore).length} scored, hasProfile: ${hasProfile}`,
    );
    return prompt;
  }

  /**
   * Retourne true si l'utilisateur a au moins une donnée de profil exploitable.
   */
  private hasUserProfile(ctx: UserContextDto): boolean {
    return (
      ctx.preferredCities.length > 0 ||
      ctx.preferredTypes.length > 0 ||
      ctx.averageBudget > 0 ||
      ctx.favoriteFeatures.length > 0 ||
      ctx.recentSearches.length > 0 ||
      Object.keys(ctx.interactionScore).length > 0
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SECTIONS DU PROMPT
  // ══════════════════════════════════════════════════════════════════════════

  private buildSystemRules(): string {
    return `[SYSTÈME - RÈGLES STRICTES]
Tu es un conseiller immobilier expert spécialisé dans l'immobilier tunisien.

RÈGLES ABSOLUES :
1. Réponds TOUJOURS en français.
2. Base-toi UNIQUEMENT sur les annonces fournies — n'invente JAMAIS de données.
3. Explique POURQUOI chaque annonce recommandée correspond à la recherche et au profil.
4. Priorise les annonces avec un score d'engagement élevé (★).
5. Tiens compte de l'historique et du profil de l'utilisateur.
6. Si aucune annonce ne correspond parfaitement, dis-le honnêtement.
7. Ne mentionne pas de prix si non fourni.
8. Sois concis : maximum 400 mots.`;
  }

  /**
   * Section profil : villes, types, budget, équipements, recherches récentes.
   */
  private buildUserProfile(ctx: UserContextDto): string {
    const lines: string[] = [];

    if (ctx.preferredCities.length > 0)
      lines.push(`- Villes préférées       : ${ctx.preferredCities.join(', ')}`);

    if (ctx.preferredTypes.length > 0)
      lines.push(`- Types de biens préférés : ${ctx.preferredTypes.join(', ')}`);

    if (ctx.averageBudget > 0)
      lines.push(`- Budget moyen observé   : ${ctx.averageBudget.toLocaleString('fr-TN')} TND`);

    if (ctx.favoriteFeatures.length > 0)
      lines.push(`- Équipements favoris    : ${ctx.favoriteFeatures.join(', ')}`);

    if (ctx.recentSearches.length > 0)
      lines.push(`- Recherches récentes    : "${ctx.recentSearches.slice(0, 5).join('", "')}"`);

    return lines.length > 0
      ? lines.join('\n')
      : '- Nouvel utilisateur (pas d\'historique)';
  }

  /**
   * Section engagement : met en avant les annonces déjà vues/likées par l'utilisateur.
   */
  private buildEngagementContext(ctx: UserContextDto): string {
    const scores = ctx.interactionScore;
    const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (entries.length === 0) {
      return '- Aucun historique d\'engagement disponible.';
    }

    const lines = entries.map(([id, score]) => `- Annonce ${id} : ${score} pts d'engagement`);
    return lines.join('\n');
  }

  /**
   * Section annonces : liste formatée avec score de similarité et badge engagement.
   */
  private buildAnnoncesList(
    hits: QdrantHitDto[],
    interactionScore: Record<string, number>,
  ): string {
    if (hits.length === 0) return '- Aucune annonce trouvée pour cette recherche.';

    return hits
      .map((hit, idx) => {
        const p = hit.payload;
        const features: string[] = [];
        if (p.hasPiscine)  features.push('Piscine');
        if (p.hasJardin)   features.push('Jardin');
        if (p.hasParking)  features.push('Parking');
        if (p.hasBalcony)  features.push('Balcon');
        if (p.isFurnished) features.push('Meublé');

        // Score d'engagement de l'utilisateur sur cette annonce
        const engScore = interactionScore[String(p.annonceId)] ?? 0;
        const engBadge = engScore > 0 ? ` ★ Déjà consultée (${engScore} pts)` : '';

        const parts: string[] = [
          `[${idx + 1}] Similarité: ${(hit.score * 100).toFixed(1)}%${engBadge}`,
          `    Titre      : ${p.title || 'N/A'}`,
          `    Type       : ${p.type || 'N/A'} | Transaction : ${p.transactionType || 'N/A'}`,
          `    Ville      : ${p.city || 'N/A'}${p.state ? ', ' + p.state : ''}`,
          `    Prix       : ${p.price ? p.price.toLocaleString('fr-TN') + ' TND' : 'Non spécifié'}`,
          `    Surface    : ${p.surface ? p.surface + ' m²' : 'N/A'}`,
        ];

        if (p.nbBedrooms)    parts.push(`    Chambres   : ${p.nbBedrooms}`);
        if (p.nbBathrooms)   parts.push(`    SDB        : ${p.nbBathrooms}`);
        if (features.length) parts.push(`    Équipements: ${features.join(', ')}`);

        return parts.join('\n');
      })
      .join('\n\n');
  }
}
