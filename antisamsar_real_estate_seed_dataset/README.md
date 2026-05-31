# AntiSamsar Seed Dataset

Dataset de test pour une plateforme immobilière intelligente.

## Contenu
- `users.json` : 50 utilisateurs au format JSON Lines MongoDB Extended JSON.
- `annonces.json` : 150 annonces immobilières avec attributs réels du projet et URLs d'images immobilières.
- `interactions.json` : 1200 interactions utilisateur.
- `recommendations.json` : recommandations pré-calculées pour tests.
- `*_array.json` : mêmes données en tableau JSON lisible.
- `import_mongodb.sh` et `import_mongodb.ps1` : import direct MongoDB.

## Import MongoDB
Linux/Mac:
```bash
bash import_mongodb.sh mongodb://localhost:27017/antisamsar
```
PowerShell:
```powershell
.\import_mongodb.ps1 "mongodb://localhost:27017/antisamsar"
```

## Note images
Les champs `images` contiennent des URLs publiques `images.unsplash.com` pour faciliter les tests frontend/mobile. Pour une production, remplace ces URLs par tes propres images ou par une intégration officielle d'un fournisseur d'images.

## Mot de passe de test
Tous les utilisateurs ont un hash bcrypt de démonstration. Adapte-le à ton backend si nécessaire.
