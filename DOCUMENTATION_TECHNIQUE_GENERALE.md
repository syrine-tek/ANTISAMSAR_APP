# 📘 Documentation Complète - Projet ANTISAMSAR

Ce document regroupe toutes les informations essentielles sur le fonctionnement technique de l'écosystème **ANTISAMSAR**, incluant le backend NestJS, le frontend Flutter et l'intégration entre les deux.

---

## 🏗️ Architecture Globale

L'application repose sur une architecture moderne de type **Client-Serveur** :
- **Frontend** : Développé avec **Flutter**, compatible Android et iOS.
- **Backend** : API REST développée avec **NestJS** (Node.js).
- **Base de données** : **MongoDB** (NoSQL) gérée via **Mongoose**.

---

## ⚙️ Backend (PFE-AntiSamsar-Backend)

Le backend gère la logique métier, l'authentification et le stockage des données.

### 🔌 Technologies & Services
- **Framework** : NestJS (TypeScript).
- **Base de données** : MongoDB (via `MongooseCoreModule`).
- **Authentification** : JWT (JSON Web Tokens) avec `Passport`.
- **Validation** : `class-validator` et `class-transformer`.
- **Mail** : Gestion des envois via `MailerModule`.

### 📂 Structure des Modules
- `auth/` : Inscription (`signup`), Connexion (`signin`), Mot de passe oublié.
- `users/` : Gestion des profils, rôles (User, Courtier, Agence) et statuts.
- `annonces/` : Création, modification et recherche d'annonces immobilières.
- `chat/` : Communication en temps réel via **WebSockets** (`ChatGateway`).
- `notifications/` : Gestion des alertes utilisateurs.

### 🔐 Logique de Sécurité (Auth)
1. **Mots de passe** : Hachés avec `bcrypt` (10 rounds).
2. **Validation par Rôle** :
   - `USER` : Validé automatiquement à l'inscription.
   - `AGENCE` / `COURTIER` : Statut `PENDING` (nécessite une validation admin).
3. **Double Token** : Utilisation d'un `AccessToken` (échéance courte) et d'un `RefreshToken`.

---

## 📱 Frontend (PFE-AntiSamsar-Frontend)

L'application mobile offre une interface fluide et réactive.

### 🧱 Configuration & API
- **Client API** : Centralisé dans `lib/core/api_client.dart`.
- **IP Config** : L'adresse IP du serveur est configurée dans `lib/core/api_config.dart`. Actuellement réglée sur l'IP locale pour les tests : `http://192.168.0.242:3000`.
- **Modèles** : Tous les objets (User, Annonce, AuthResponse) possèdent des méthodes `fromJson` et `toJson`.

### 🔄 Flux d'Authentification
1. **Sign Up** : Envoie les données à `/auth/signup`.
2. **Sign In** : Écran `SignInScreen` qui utilise le `AuthService` global.
3. **Persistence** : Le token JWT est stocké localement pour maintenir la session.

---

## 🚀 Guide de Démarrage Rapide

### 1. Démarrer le Backend
```powershell
cd PFE-AntiSamsar-Backend
npm install
npm run start:dev
```
*Note : Assurez-vous que MongoDB est lancé localement.*

### 2. Configurer le Frontend
- Ouvrez `lib/core/api_config.dart`.
- Vérifiez que l'IP correspond à celle de votre machine (actuellement `192.168.0.242`).

### 3. Lancer le Frontend
```powershell
cd PFE-AntiSamsar-Frontend
flutter pub get
flutter run
```

---

## ⚠️ Notes de Développement Importantes
- **CORS** : Le backend est configuré pour accepter les requêtes de toutes les origines (`origin: '*'`) pour faciliter le développement mobile.
- **JDK Android** : Le projet nécessite **Java 17** pour compiler (`org.gradle.java.home` dans `gradle.properties`).
- **Timeouts** : Une limite de **30 secondes** est configurée pour les requêtes API (`ApiConfig.requestTimeout`).

---
*Documentation générée le 07 Avril 2026 - Version 1.0*
