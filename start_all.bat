@echo off
echo 🚀 Demarrage d'AntiSamsar...

cd PFE-AntiSamsar-Backend

echo 🔍 Verification de MongoDB...
start /B mongod --dbpath .mongodb-data --logpath .mongodb-log/mongod.log

echo ⏳ Attente de 5 secondes pour MongoDB...
timeout /t 5 /nobreak > nul

echo 🔨 Nettoyage du port 3000...
node clean-port.js

echo 📦 Lancement du Backend...
start npm run start:dev

echo ✅ Backend lance ! Vous pouvez maintenant lancer le Frontend.
pause
