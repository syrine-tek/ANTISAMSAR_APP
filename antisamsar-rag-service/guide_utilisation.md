# Guide d'Utilisation : Système de Recommandation RAG Immobilier

Ce document explique comment utiliser, tester et intégrer le système de recommandation RAG (Retrieval-Augmented Generation) pour le projet **AntiSamsar**.

---

## 1. Architecture Globale

```
Flutter App
    │
    ▼
NestJS Backend (Port 3000)   ◄──── MongoDB (annonces + interactions)
    │                                        │
    ├─ EmbeddingService (Xenova)             │
    ├─ InteractionAnalysisService ◄──────────┘
    ├─ PromptBuilderService (anti-hallucination)
    │
    ▼
Qdrant Cloud (recherche vectorielle Top-8)
    │
    ▼
AirLLM Server (Port 8000) → réponse IA personnalisée
```

---

## 2. Comment démarrer le système en local ?

Deux serveurs doivent tourner en parallèle :

### A. Backend NestJS (Terminal 1)
```bash
npm run start:dev
```
Logs attendus :
- `✅ Connected to Qdrant Cloud. Collections: [annonces_vectors]`
- `Embedding model loaded successfully`
- `🚀 RAG Service running on http://localhost:3000`

### B. Serveur IA Python (Terminal 2)
```bash
uvicorn server_fixed.py:app --host 0.0.0.0 --port 8000
```
> **Note** : Ce serveur utilise **Phi-3-mini** pour le LLM, **Cross-Encoder** pour le reranking et **LAION-CLIP** pour l'analyse d'images.

> [!WARNING]
> Si vous voyez `EADDRINUSE: address already in use :::3000`, libérez le port avec :
> ```bash
> npx kill-port 3000
> ```

---

## 3. Endpoints disponibles

| Méthode | URL | Description |
|---|---|---|
| `POST` | `/recommendations/rag` | Pipeline RAG complet |
| `GET` | `/recommendations/user-context/:userId` | Debug du contexte utilisateur |
| `POST` | `/recommendations/generate-embeddings` | Génère les vecteurs dans MongoDB |
| `POST` | `/recommendations/sync-qdrant` | Synchronise MongoDB → Qdrant |
| `GET` | `/recommendations/embedding-status` | Statut des embeddings |

---

## 4. Tester le RAG (Postman)

**Requête principale :**
- **URL** : `http://localhost:3000/recommendations/rag`
- **Méthode** : `POST`
- **Body** :
```json
{
  "query": "appartement à louer à Monastir avec parking",
  "userId": "d6d7705392bc7af633328bea"
}
```

**Réponse complète attendue :**
```json
{
  "recommendations": [
    {
      "annonceId": "...",
      "score": 0.89,
      "title": "Appartement S+2 Monastir",
      "city": "Monastir",
      "price": 1200,
      "features": ["Parking", "Balcon"]
    }
  ],
  "aiResponse": "D'après votre profil et votre recherche...",
  "userContext": {
    "preferredCities": ["Hammamet"],
    "preferredTypes": ["VILLA"],
    "averageBudget": 780000,
    "favoriteFeatures": ["Parking", "Piscine"],
    "recentSearches": ["villa avec piscine à Hammamet", "grande villa Hammamet"],
    "interactionScore": {
      "287725adef82fa90cbac310b": 11,
      "897164982a557d2cb3f0bda7": 6
    }
  },
  "meta": {
    "query": "appartement à louer à Monastir avec parking",
    "userId": "d6d7705392bc7af633328bea",
    "topK": 8,
    "collectionUsed": "annonces_vectors",
    "processingTimeMs": 880
  }
}
```

> [!IMPORTANT]
> Le `userContext` reflète **l'historique réel** de l'utilisateur en base. Si un utilisateur a interagi avec des villas à Hammamet, son profil affichera Hammamet/VILLA même s'il cherche maintenant un appartement à Monastir. C'est un comportement **correct** — le système utilise l'historique pour personnaliser la réponse IA.

**Déboguer le contexte d'un utilisateur :**
- `GET http://localhost:3000/recommendations/user-context/d6d7705392bc7af633328bea`

---

## 5. Comment alimenter le système en données ?

### Étape 1 : Importer les données depuis les fichiers JSONL

Le dataset complet est disponible dans `antisamsar_complete_working_rag_dataset/` au format **JSONL** (une ligne JSON par document), prêt pour MongoDB Compass.

**Collections à importer :**

| Fichier | Collection MongoDB |
|---|---|
| `interactions.jsonl` | `interactions` |
| `utilisateurs.jsonl` | `utilisateurs` |

> [!TIP]
> Dans MongoDB Compass → collection → `ADD DATA` → `Import JSON or CSV file` → sélectionner le fichier `.jsonl`

**UserIds de test disponibles dans le dataset :**

| userId | Nom | Profil dominant |
|---|---|---|
| `d6d7705392bc7af633328bea` | Fares Mansouri | VILLA / Hammamet |
| `3d58ce20fe802793e0b22190` | Yasmine Bouzid | APPARTEMENT / Sousse |
| `134ad24e99806ca111197065` | Ons Hamdi | MAISON / Djerba |
| `24b299d767a979b1ef4b2e63` | Ines Ben Amor | BUREAU / Tunis |
| `39201609d9803efb38f41f44` | Maher Belhadj | VILLA / La Marsa |
| `681be464db0d3e823c3496d9` | Karim Belhadj | BUREAU / Tunis |

### Étape 2 : Insérer des annonces dans MongoDB
Collection : `annonces`

```json
{
  "title": "Superbe Villa Moderne avec Piscine",
  "price": 700000,
  "type": "VILLA",
  "city": "Hammamet",
  "state": "Nabeul",
  "transactionType": "Vente",
  "surface": 250,
  "nbBedrooms": 4,
  "nbBathrooms": 2,
  "hasPiscine": true,
  "hasJardin": true,
  "hasParking": true,
  "hasBalcony": false,
  "isFurnished": false
}
```

### Étape 3 : Générer les Embeddings (si nouvelles annonces)
- **URL** : `POST http://localhost:3000/recommendations/generate-embeddings`
- À appeler uniquement pour les nouvelles annonces sans vecteurs.

### Étape 4 : Synchroniser vers Qdrant ⚠️ Important !
- **URL** : `POST http://localhost:3000/recommendations/sync-qdrant`

> [!IMPORTANT]
> À appeler **à chaque fois** que vous insérez de nouvelles annonces depuis Compass !

Vérification : `GET http://localhost:3000/recommendations/embedding-status`

### Étape 5 : Enregistrer des interactions utilisateur

Collection : `interactions` — Format du nouveau dataset (avec `metadata`) :

```json
{
  "userId": "d6d7705392bc7af633328bea",
  "annonceId": "287725adef82fa90cbac310b",
  "type": "CONTACT_OWNER",
  "duration": 0,
  "searchQuery": "villa avec piscine à Hammamet",
  "metadata": {
    "deviceType": "desktop",
    "source": "map",
    "searchQuery": "grande villa Hammamet"
  },
  "annonceSnapshot": {
    "city": "Hammamet",
    "governorate": "Nabeul",
    "state": "Nabeul",
    "type": "VILLA",
    "price": 672590,
    "features": ["Parking"]
  },
  "createdAt": { "$date": "2026-04-02T00:51:31.662Z" }
}
```

**Types d'interactions et leurs poids :**

| Type | Poids | Description |
|---|---|---|
| `VIEW` | 1 | L'utilisateur a vu l'annonce |
| `CLICK` | 2 | L'utilisateur a cliqué |
| `LIKE` | 3 | L'utilisateur a aimé |
| `FAVORITE` | 5 | L'utilisateur a mis en favori |
| `SHARE` | 2 | L'utilisateur a partagé |
| `SEARCH` | 1 | L'utilisateur a fait une recherche |
| `CONTACT_OWNER` | 10 | L'utilisateur a contacté le propriétaire |
| `VISIT_TIME` | 1 | Temps de visite enregistré |

> [!TIP]
> Plus l'utilisateur a des interactions CONTACT_OWNER(10) et FAVORITE(5), plus son `interactionScore` sera élevé et plus l'IA priorisera ces annonces avec le badge ★.

---

## 6. Structure du champ `metadata` dans les interactions

Le champ `metadata` est un objet libre ajouté récemment pour stocker des informations contextuelles supplémentaires par interaction.

```json
"metadata": {
  "deviceType": "mobile",      // "desktop" | "tablet" | "mobile"
  "source": "recommendation",  // "search_results" | "map" | "homepage" | "profile" | "recommendation"
  "searchQuery": "villa luxe Hammamet"  // requête utilisée dans cette interaction
}
```

### Priorité de lecture du `searchQuery` pour `recentSearches`

Le service lit le champ de recherche dans cet ordre de priorité :

```
1. metadata.searchQuery   ← format nouveau (prioritaire)
2. searchQuery            ← champ direct legacy
3. query                  ← très ancien format (rétrocompatibilité)
```

Cela permet de supporter les anciens documents sans migration.

---

## 7. Logique anti-hallucination du Prompt IA

Le `PromptBuilderService` adapte automatiquement les instructions envoyées à AirLLM selon le profil de l'utilisateur :

### Cas 1 — Utilisateur avec historique (`hasProfile = true`)

Le prompt indique au LLM de :
- Croiser la requête ET le profil utilisateur (villes, types, budget, équipements)
- Prioriser les annonces avec un badge ★ (déjà consultées)
- Expliquer la correspondance avec le profil

### Cas 2 — Nouvel utilisateur (`hasProfile = false`)

Le prompt est **plus strict** et interdit explicitement au LLM d'inventer des préférences :
> *"N'invente AUCUNE préférence (ville, budget, type) qui ne serait pas explicitement mentionnée dans la requête."*

`hasProfile` est `true` dès qu'au moins un des champs suivants est non vide :
- `preferredCities`, `preferredTypes`, `favoriteFeatures`, `recentSearches`, `interactionScore`
- ou `averageBudget > 0`

---

## 8. Comment fonctionne le UserContext ? (Détails techniques)

Le `InteractionAnalysisService` exécute **6 agrégations MongoDB en parallèle** pour construire le contexte :

1. **preferredCities** → `$group` sur `annonceSnapshot.city`, tri par fréquence, Top 5
2. **preferredTypes** → `$group` sur `annonceSnapshot.type`, tri par fréquence, Top 5
3. **averageBudget** → `$avg` sur `annonceSnapshot.price` (VIEW + CLICK + LIKE + FAVORITE uniquement)
4. **favoriteFeatures** → `$unwind` sur features + `$group`, Top 10 (Piscine, Jardin, Parking, Balcon, Meublé, Ascenseur)
5. **recentSearches** → filtre `type=SEARCH`, lit `metadata.searchQuery` en priorité, Top 10
6. **interactionScore** → `$switch` avec les poids, `$group` par `annonceId`, somme des poids

> [!NOTE]
> Le `userContext` reflète **l'historique passé** de l'utilisateur, pas sa requête actuelle. Un utilisateur ayant historiquement consulté des villas à Hammamet gardera ce profil même s'il cherche aujourd'hui un appartement. L'IA utilise ce profil pour enrichir la réponse, sans ignorer la requête courante.

Le prompt RAG envoyé à AirLLM inclut :
- Le profil complet de l'utilisateur (ou "Nouvel utilisateur" si vide)
- La section **Historique d'engagement** avec les scores par annonce
- Un badge ★ sur les annonces déjà consultées
- Des instructions adaptées au profil (avec ou sans historique)

---

## 9. Filtrage Géographique et Typologique Dynamique

Le moteur RAG extrait de manière intelligente et dynamique des filtres stricts à partir de la requête utilisateur :

1. **Localisation (Ville / Région)** : Les villes et gouvernorats uniques sont extraits de MongoDB au démarrage et comparés à la requête utilisateur (ex. *"Sousse"*).
2. **Type de Transaction** : Détecte s'il s'agit d'une `Location` ou d'une `Vente`.
3. **Type de Bien** : Détecte `APPARTEMENT` ou `VILLA`.

### Indexation & Fallback Progressif

- **Index de Payload automatiques** : Le serveur NestJS crée automatiquement les index de payload nécessaires dans Qdrant Cloud (`city`, `state`, `transactionType`, `type`) pour assurer des requêtes de filtrage ultra-rapides et sans erreur.
- **Fallback Progressif** :
  - **Niveau 1 (Strict)** : Recherche avec tous les filtres extraits.
  - **Niveau 2 (Localisation Seule)** : Si 0 résultat, les filtres de type de bien et de transaction sont ignorés pour ne conserver que la localisation.
  - **Niveau 3 (Sans Filtre)** : Si toujours aucun résultat, le système effectue une recherche vectorielle brute sans filtre.

---

## 10. Comment activer le VRAI modèle AirLLM ?

Quand vous êtes prêt (carte graphique requise) :

1. Ouvrez `server.py`
2. Décommentez `from airllm import AutoModel`
3. Décommentez `model = AutoModel.from_pretrained(...)`
4. Commentez la section **LOGIQUE MOCK**
5. Décommentez la section **LOGIQUE AIRLLM RÉELLE**
6. Relancez `uvicorn server:app --host 0.0.0.0 --port 8000`
