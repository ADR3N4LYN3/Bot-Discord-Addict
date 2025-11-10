#!/bin/bash

# Script de démarrage du bot Discord

echo "🤖 Démarrage du bot Discord..."

# Vérifier si node_modules existe
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances..."
    npm install
fi

# Vérifier si .env existe
if [ ! -f ".env" ]; then
    echo "⚠️  Fichier .env non trouvé !"
    echo "📝 Création depuis .env.example..."
    cp .env.example .env
    echo "⚠️  Veuillez configurer votre .env avant de continuer"
    exit 1
fi

# Lancer le bot
echo "🚀 Lancement du bot..."
node bot.js
