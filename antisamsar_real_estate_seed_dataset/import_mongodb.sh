#!/usr/bin/env bash
URI=${1:-mongodb://localhost:27017/antisamsar}
mongoimport --uri "$URI" --collection users --file users.json --mode upsert --upsertFields _id
mongoimport --uri "$URI" --collection annonces --file annonces.json --mode upsert --upsertFields _id
mongoimport --uri "$URI" --collection interactions --file interactions.json --mode upsert --upsertFields _id
mongoimport --uri "$URI" --collection recommendations --file recommendations.json --mode upsert --upsertFields _id
