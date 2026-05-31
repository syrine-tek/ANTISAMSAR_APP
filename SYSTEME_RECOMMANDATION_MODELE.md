# Système de Recommandation AntiSamsar : Guide du Modèle (De Zéro à l'Expert)

Ce document décrit en détail la conception, les technologies et la méthodologie de travail du système de recommandation hybride d'AntiSamsar. Il est destiné aux développeurs et data scientists souhaitant comprendre le fonctionnement interne du modèle.

---

## 1. Vision et Objectif

Le système de recommandation d'AntiSamsar vise à résoudre le problème du "froid" dans l'immobilier : comment aider un utilisateur à trouver le bien idéal parmi des milliers d'annonces, tout en personnalisant son expérience sans qu'il ait besoin de remplir de longs formulaires.

**Approche :** Utiliser les interactions passées (clics, favoris, recherches) pour construire un profil dynamique et l'injecter dans un pipeline RAG (Retrieval-Augmented Generation).

---

## 2. Pile Technologique (Tech Stack)

Le système est construit sur deux piliers principaux :

### Backend Orchestrateur (NestJS / TypeScript)
- **Node.js**: Environnement d'exécution.
- **Mongoose**: Gestion des interactions et des données structurées.
- **Qdrant Cloud**: Base de données vectorielle (Vector DB) pour la recherche sémantique.
- **@xenova/transformers**: Inférence locale d'embeddings BERT (`all-MiniLM-L6-v2`) pour transformer le texte en vecteurs de 768 dimensions sans quitter le serveur Node.js.
- **Node-Cache**: Pour la performance (TTL 5 min).

### Moteur d'Intelligence (Python / FastAPI)
- **Phi-3 Mini**: Modèle de langage (LLM) de Microsoft (3.8B paramètres) pour la génération de texte explicatif.
- **CLIP**: Modèle multimodal pour l'analyse d'images (Computer Vision).
- **CrossEncoder**: Modèle de reranking (`ms-marco-MiniLM-L-6-v2`) pour valider la pertinence sémantique.
- **PyTorch**: Framework d'apprentissage profond pour l'inférence optimisée.

---

## 3. Méthodologie de Travail (Work Method)

Le développement du système suit une approche en 5 phases :

### Phase 1 : Collecte de Données & Signalisation (Tracking)
Chaque action utilisateur est capturée avec un snapshot de l'annonce visée. Cela permet de garder une trace des préférences même si l'annonce est supprimée plus tard.
- **Interaction Vector** : Un dictionnaire `{ annonce_id: score_engagement }`.

### Phase 2 : Indexation Vectorielle & Multimodale
Lorsqu'une annonce est créée :
1. Son texte est normalisé et vectorisé par Xenova.
2. Ses images sont envoyées au service Python pour extraction de tags via CLIP.
3. Les vecteurs + tags sont stockés dans Qdrant Cloud.

### Phase 3 : Recherche Hybride (Retrieval)
Lorsqu'une recherche est lancée :
1. La requête est convertie en vecteur.
2. Une recherche vectorielle Top-30 est effectuée.
3. Des filtres stricts (ville, type) et géographiques (Proximité GPS) sont appliqués pour éliminer le bruit.

### Phase 4 : Scoring & Reranking (Ranking)
C'est le cœur algorithmique. On calcule le `finalScoreV2` :
- $S = 0.35 \times \text{Semantique} + 0.25 \times \text{Rerank} + 0.20 \times \text{Geolocalisation} + 0.10 \times \text{Collab} + 0.10 \times \text{User}$
Le Top-8 est sélectionné pour l'étape finale.

### Phase 5 : Génération Explicative (Augmentation)
Le LLM reçoit un context "blindé" :
- Profil utilisateur (Villes préférées, budget moyen).
- Top-8 annonces avec leurs caractéristiques.
- Instructions strictes : "Explique pourquoi ces biens correspondent, n'invente rien".

---

## 4. Analyse du Comportement (Interactions)

Le système utilise une pondération ascendante pour quantifier l'intérêt :

| Action | Poids | Signification |
|---|---|---|
| **VIEW** | 1 | Intérêt passif simple |
| **CLICK** | 2 | Intérêt actif (ouverture) |
| **LIKE** | 3 | Intérêt positif |
| **FAVORITE** | 5 | Intérêt fort (mémorisation) |
| **CONTACT** | 10 | Intention d'achat/location réelle |

Ces poids alimentent les agrégations MongoDB pour calculer le `averageBudget` et les `favoriteFeatures` de l'utilisateur.

---

## 5. Gestion des Hallucinations (Sécurité)

Pour garantir que l'IA ne propose pas de fausses informations :
1. **Source de Vérité Unique** : Seules les données issues de Qdrant/MongoDB sont fournies au LLM.
2. **Template-Driven** : Le prompt utilise des structures fixes que le LLM doit remplir.
3. **Check de Profil** : Si l'utilisateur n'a pas assez d'historique ( < 3 interactions), le système bascule automatiquement en mode "Generic Recommendation" pour éviter que l'IA n'extrapole des goûts inexistants.

---

## 6. Maintenance et Évolutions

- **Synchronisation** : Un endpoint `/recommendations/sync-qdrant` permet de forcer la mise à jour des vecteurs.
- **Debug** : L'API `/recommendations/user-context/:userId` permet de visualiser en temps réel le profil "mathématique" calculé par le système.
