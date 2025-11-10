# Bot Discord - Règlement avec validation

Bot Discord qui permet de poster le règlement du serveur et de suivre automatiquement les membres qui acceptent les règles en réagissant avec un emoji.

## Fonctionnalités

- Poste un règlement personnalisable avec un embed élégant
- Les utilisateurs doivent réagir avec un emoji pour valider
- **Logs automatiques sur un channel Discord** de qui a validé/retiré sa validation
- **Attribution de rôle optionnelle** (activable quand vous êtes prêt)
- **Statut personnalisé** du bot (ex: "🔍 Check les arrivées")
- Configuration sécurisée avec fichier `.env`

## Prérequis

- **Node.js 16.9.0+**
- Un compte Discord Developer avec un bot créé
- Les permissions administrateur sur votre serveur Discord

## Installation rapide

```bash
# Clonez le repository
git clone https://github.com/ADR3N4LYN3/Bot-Discord-Addict.git
cd Bot-Discord-Addict

# Copiez et configurez le .env
cp .env.example .env
nano .env  # Ajoutez votre token et IDs

# Installez les dépendances
npm install

# Lancez le bot
npm start
# OU
node bot.js
# OU (avec le script)
chmod +x start.sh
./start.sh
```

## Configuration détaillée

### 1. Créer le bot sur Discord Developer Portal

1. Allez sur https://discord.com/developers/applications
2. Cliquez sur "New Application"
3. Donnez un nom à votre bot et acceptez les conditions
4. Allez dans l'onglet "Bot"
5. Cliquez sur "Add Bot"
6. **Important**: Activez les "Privileged Gateway Intents":
   - SERVER MEMBERS INTENT
   - MESSAGE CONTENT INTENT
7. Copiez le token du bot (vous en aurez besoin plus tard)

### 2. Inviter le bot sur votre serveur

1. Dans le Developer Portal, allez dans l'onglet "OAuth2" > "URL Generator"
2. Sélectionnez les scopes suivants:
   - `bot`
   - `applications.commands`
3. Sélectionnez les permissions suivantes:
   - Manage Roles (si vous voulez activer l'attribution de rôle)
   - Send Messages
   - Embed Links
   - Read Message History
   - Add Reactions
   - Use External Emojis
4. Copiez l'URL générée et ouvrez-la dans votre navigateur
5. Sélectionnez votre serveur et autorisez le bot

### 3. Créer un channel de logs (recommandé)

1. Sur votre serveur Discord, créez un nouveau salon textuel (par exemple `#bot-logs`)
2. Faites un clic droit sur le salon > "Copier l'identifiant du salon"
   - Si vous ne voyez pas cette option, activez le "Mode développeur" dans Paramètres utilisateur > Avancés
3. Gardez cet ID pour la configuration

### 4. (Optionnel) Créer le rôle "Vérifié"

Si vous voulez activer l'attribution automatique de rôle plus tard :

1. Sur votre serveur Discord, allez dans les paramètres du serveur
2. Allez dans "Rôles"
3. Créez un nouveau rôle (par exemple "Membre Vérifié")
4. **Important**: Placez le rôle du bot AU-DESSUS du rôle "Vérifié" dans la hiérarchie
5. Faites un clic droit sur le rôle et "Copier l'identifiant"

### 5. Configuration du fichier .env

Éditez `.env` avec vos informations:

```env
# Token du bot Discord (OBLIGATOIRE)
DISCORD_TOKEN=votre_token_ici

# ID du rôle à attribuer (0 = désactivé)
VERIFIED_ROLE_ID=0

# ID du channel Discord pour les logs de validation (0 = logs en console uniquement)
LOG_CHANNEL_ID=123456789012345678
```

**Configuration minimale** (pour commencer) :
- `DISCORD_TOKEN`: Mettez votre token
- `LOG_CHANNEL_ID`: Mettez l'ID de votre channel de logs
- `VERIFIED_ROLE_ID`: Laissez à `0` pour commencer

## Utilisation

### Lancer le bot

```bash
npm start
# OU
node bot.js
```

Vous devriez voir:
```
NomDuBot#1234 est connecté et prêt !
ID du bot: 123456789012345678
------
Attribution de rôle: ❌ Désactivée
Logs Discord: ✅ Activés
------
```

Le bot apparaîtra en ligne avec le statut **"🔍 Check les arrivées"**.

### Poster le règlement

1. Dans le salon #règlement (ou autre) de votre serveur, tapez:
```
!reglement
```

2. Le bot va:
   - Poster le règlement dans un embed élégant
   - Ajouter automatiquement la réaction ✅
   - Sauvegarder l'ID du message

### Fonctionnement automatique

Une fois le règlement posté:
- Quand un utilisateur réagit avec ✅, le bot poste dans le channel de logs
- Quand un utilisateur retire sa réaction, le bot poste aussi dans les logs
- Si l'attribution de rôle est activée, le bot donne/retire le rôle automatiquement

## Personnalisation

### Modifier le statut du bot

Dans [bot.js](bot.js), ligne ~76 :

```javascript
client.user.setPresence({
    activities: [{
        name: '🔍 Check les arrivées',  // Changez ici
        type: ActivityType.Custom
    }],
    status: 'online' // online, idle, dnd, invisible
});
```

Types d'activité disponibles:
- `ActivityType.Playing` → "Joue à ..."
- `ActivityType.Streaming` → "Diffuse ..."
- `ActivityType.Listening` → "Écoute ..."
- `ActivityType.Watching` → "Regarde ..."
- `ActivityType.Custom` → Texte personnalisé
- `ActivityType.Competing` → "En compétition dans ..."

### Modifier le règlement

Éditez le fichier [bot.js](bot.js) dans la fonction qui crée l'embed :

```javascript
.addFields({
    name: '1️⃣ Votre règle',
    value: 'Description de votre règle',
    inline: false
})
```

### Modifier l'emoji de validation

Changez l'emoji dans [config.json](config.json):

```json
{
    "emoji": "🎉"
}
```

### Activer l'attribution de rôle

Quand vous êtes prêt :

1. Créez le rôle "Vérifié" sur votre serveur (voir étape 4)
2. Copiez l'ID du rôle
3. Modifiez le fichier `.env`:
```env
VERIFIED_ROLE_ID=123456789012345678
```
4. Redémarrez le bot

Le bot affichera alors:
```
Attribution de rôle: ✅ Activée
```

### Configurer les permissions du serveur

Pour que seuls les membres vérifiés puissent voir les salons:

1. Pour chaque salon que vous voulez protéger:
   - Clic droit > Modifier le salon > Permissions
   - Cliquez sur @everyone
   - Désactivez "Voir le salon"
   - Cliquez sur le + et ajoutez le rôle "Vérifié"
   - Activez "Voir le salon" pour ce rôle

2. Créez un salon #règlement accessible à @everyone où le bot postera le règlement

## Dépannage

### Le bot ne démarre pas
- Vérifiez que le fichier `.env` existe et contient votre token
- Vérifiez que vous avez installé les dépendances: `npm install`
- Vérifiez que Node.js 16.9+ est installé: `node --version`

### Le bot ne répond pas
- Vérifiez que le bot est bien en ligne sur Discord
- Vérifiez que les intents sont activés dans le Developer Portal
- Vérifiez que le token est correct dans `.env`

### Les logs ne s'affichent pas sur Discord
- Vérifiez que l'ID du channel de logs est correct
- Vérifiez que le bot a la permission d'envoyer des messages dans ce channel
- Si `LOG_CHANNEL_ID=0`, les logs s'affichent uniquement dans la console

### Le rôle n'est pas attribué
- Vérifiez que `VERIFIED_ROLE_ID` n'est pas à `0`
- Vérifiez que l'ID du rôle est correct
- Vérifiez que le rôle du bot est AU-DESSUS du rôle à attribuer
- Vérifiez les permissions du bot

## Structure du projet

```
Bot-Discord-Addict/
│
├── bot.js                 # Code principal du bot
├── package.json           # Dépendances Node.js
├── start.sh               # Script de démarrage automatique
├── config.json            # Configuration non-sensible (emoji, message IDs)
├── .env                   # Secrets (token, IDs) - NE PAS COMMIT
├── .env.example           # Template pour .env
├── .gitignore             # Fichiers à ignorer par Git
└── README.md              # Documentation
```

## Commandes disponibles

| Commande | Description | Permission requise |
|----------|-------------|-------------------|
| `!reglement` | Poste le message du règlement | Administrateur |

## Déploiement sur VPS

Pour déployer le bot sur un VPS (Debian/Ubuntu) :

```bash
# 1. Installer Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 2. Cloner le repository
git clone https://github.com/ADR3N4LYN3/Bot-Discord-Addict.git
cd Bot-Discord-Addict

# 3. Créer et configurer le .env
cp .env.example .env
nano .env  # Ajoutez votre token et IDs

# 4. Installer et lancer
npm install
node bot.js

# 5. Pour garder le bot actif (avec screen)
screen -S discord-bot
node bot.js
# Ctrl+A puis D pour détacher

# Pour revenir à la session
screen -r discord-bot
```

### Mettre à jour le bot sur le VPS

```bash
cd Bot-Discord-Addict
git pull
npm install  # Au cas où il y aurait de nouvelles dépendances
# Redémarrez le bot
```

## Avec systemd (service automatique)

Pour que le bot démarre automatiquement au démarrage du VPS :

Créez `/etc/systemd/system/discord-bot.service`:

```ini
[Unit]
Description=Bot Discord Règlement
After=network.target

[Service]
Type=simple
User=votre_user
WorkingDirectory=/home/votre_user/bot/Bot-Discord-Addict
ExecStart=/usr/bin/node bot.js
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Puis :
```bash
sudo systemctl daemon-reload
sudo systemctl enable discord-bot
sudo systemctl start discord-bot
sudo systemctl status discord-bot

# Pour voir les logs
sudo journalctl -u discord-bot -f
```

## Sécurité

- Ne partagez JAMAIS votre token de bot
- Le fichier `.env` est dans `.gitignore` pour éviter de le partager par accident
- Utilisez `.env.example` comme modèle pour les autres développeurs
- Sur le VPS, créez le `.env` manuellement, ne le clonez jamais depuis Git

## Technologies utilisées

- **Node.js** v16.9.0+
- **discord.js** v14
- **dotenv** pour la gestion des variables d'environnement

## Améliorations futures possibles

- Slash commands (/)
- Système de rôles multiples
- Commande pour modifier le règlement sans toucher au code
- Support de plusieurs langues
- Statistiques d'acceptation du règlement
- Interface web pour la configuration
- Système de backup automatique

## Support

Si vous rencontrez des problèmes, vérifiez:
1. Que Node.js 16.9+ est installé: `node --version`
2. Que les dépendances sont installées: `npm install`
3. Que le fichier `.env` existe et est correctement configuré
4. Que les permissions Discord sont bien configurées
5. Que les intents sont activés dans le Developer Portal

## Licence

Ce projet est libre d'utilisation. N'hésitez pas à le modifier selon vos besoins !

## Auteur

**ADR3N4LYN3** - [GitHub](https://github.com/ADR3N4LYN3)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
