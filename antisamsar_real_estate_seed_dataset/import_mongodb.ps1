param([string]$Uri = "mongodb://localhost:27017/antisamsar")
mongoimport --uri $Uri --collection utilisateurs --file users.json --mode upsert --upsertFields _id
mongoimport --uri $Uri --collection annonces --file annonces.json --mode upsert --upsertFields _id
mongoimport --uri $Uri --collection interactions --file interactions.json --mode upsert --upsertFields _id
mongoimport --uri $Uri --collection recommendations --file recommendations.json --mode upsert --upsertFields _id
