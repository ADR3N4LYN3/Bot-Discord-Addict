const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Charger les variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '0';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '0';

// Charger la configuration non-sensible
let config;
try {
    const configData = fs.readFileSync('./config.json', 'utf8');
    config = JSON.parse(configData);
} catch (error) {
    console.error('❌ Erreur lors du chargement de config.json:', error.message);
    process.exit(1);
}

// Créer le client Discord
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers
    ]
});

/**
 * Envoie un message dans le channel de logs si configuré
 */
async function sendLog(guild, message) {
    if (LOG_CHANNEL_ID === '0') {
        // Pas de channel de logs configuré, afficher dans la console
        console.log(message);
        return;
    }

    const logChannel = guild.channels.cache.get(LOG_CHANNEL_ID);
    if (!logChannel) {
        console.log(`⚠️ Channel de logs non trouvé (ID: ${LOG_CHANNEL_ID})`);
        console.log(message);
        return;
    }

    try {
        await logChannel.send(message);
        console.log(message); // Afficher aussi dans la console
    } catch (error) {
        console.log(`⚠️ Erreur lors de l'envoi du log: ${error.message}`);
        console.log(message);
    }
}

/**
 * Sauvegarde la configuration dans config.json
 */
function saveConfig() {
    try {
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4), 'utf8');
    } catch (error) {
        console.error('❌ Erreur lors de la sauvegarde de config.json:', error.message);
    }
}

// Événement : Bot prêt
client.once('clientReady', () => {
    console.log(`${client.user.tag} est connecté et prêt !`);
    console.log(`ID du bot: ${client.user.id}`);
    console.log('------');
    console.log(`/reglement enregistré sur`);
    console.log(`Actif sur ${client.guilds.cache.size} serveur(s)`);
    console.log('------');
    console.log(`Attribution de rôle: ${VERIFIED_ROLE_ID !== '0' ? '✅ Activée' : '❌ Désactivée'}`);
    console.log(`Logs Discord: ${LOG_CHANNEL_ID !== '0' ? '✅ Activés' : '❌ Désactivés'}`);
    console.log('------');

    // Définir l'activité/statut du bot
    client.user.setPresence({
        activities: [{
            name: '🔍 Check les arrivées',
            type: ActivityType.Custom
        }],
        status: 'online' // online, idle, dnd, invisible
    });
});

// Événement : Message reçu
client.on('messageCreate', async (message) => {
    // Ignorer les messages du bot
    if (message.author.bot) return;

    // Vérifier si c'est la commande !reglement
    if (message.content === '!reglement') {
        // Vérifier les permissions administrateur
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
            return message.reply('❌ Vous devez être administrateur pour utiliser cette commande.');
        }

        // Créer l'embed pour le règlement
        const embed = new EmbedBuilder()
            .setTitle('📜 RÈGLEMENT DU SERVEUR')
            .setDescription('Veuillez lire attentivement le règlement ci-dessous :')
            .setColor(0x0099FF)
            .addFields(
                {
                    name: '1️⃣ Respect',
                    value: 'Respectez tous les membres du serveur. Aucun harcèlement, insulte ou discrimination ne sera toléré.',
                    inline: false
                },
                {
                    name: '2️⃣ Langage',
                    value: 'Utilisez un langage approprié. Le spam et les messages en majuscules sont interdits.',
                    inline: false
                },
                {
                    name: '3️⃣ Contenu',
                    value: "Aucun contenu NSFW, illégal ou offensant n'est autorisé sur ce serveur.",
                    inline: false
                },
                {
                    name: '4️⃣ Publicité',
                    value: "La publicité non sollicitée pour d'autres serveurs Discord ou services est interdite.",
                    inline: false
                },
                {
                    name: '5️⃣ Salons',
                    value: 'Utilisez les salons appropriés pour vos discussions.',
                    inline: false
                },
                {
                    name: '✅ Validation',
                    value: `Pour accepter le règlement et accéder au serveur, réagissez avec ${config.emoji} ci-dessous.`,
                    inline: false
                }
            )
            .setFooter({ text: 'Merci de faire partie de notre communauté !' });

        try {
            // Supprimer le message de commande
            await message.delete();

            // Envoyer l'embed
            const ruleMessage = await message.channel.send({ embeds: [embed] });

            // Ajouter la réaction
            await ruleMessage.react(config.emoji);

            // Sauvegarder l'ID du message dans la config
            config.rules_message_id = ruleMessage.id;
            config.rules_channel_id = message.channel.id;
            saveConfig();

            console.log(`Règlement posté ! ID du message: ${ruleMessage.id}`);
        } catch (error) {
            console.error('❌ Erreur lors de la publication du règlement:', error.message);
        }
    }
});

// Événement : Réaction ajoutée
client.on('messageReactionAdd', async (reaction, user) => {
    // Ignorer les réactions du bot
    if (user.bot) return;

    // Si la réaction est partielle, la récupérer
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('❌ Erreur lors de la récupération de la réaction:', error);
            return;
        }
    }

    // Vérifier si c'est le message du règlement
    if (reaction.message.id !== config.rules_message_id) return;

    // Vérifier si c'est le bon emoji
    if (reaction.emoji.name !== config.emoji) return;

    const guild = reaction.message.guild;
    const member = guild.members.cache.get(user.id);

    if (!member) return;

    // Logger la validation
    await sendLog(guild, `✅ **${member}** (${member.user.tag}) a accepté le règlement`);

    // Attribution de rôle (si configuré)
    if (VERIFIED_ROLE_ID === '0') {
        console.log(`ℹ️ Attribution de rôle désactivée pour ${member.user.tag}`);
        return;
    }

    // Récupérer le rôle à attribuer
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) {
        const errorMsg = `❌ Erreur: Le rôle avec l'ID ${VERIFIED_ROLE_ID} n'existe pas!`;
        await sendLog(guild, errorMsg);
        return;
    }

    // Donner le rôle au membre
    try {
        await member.roles.add(role);
        await sendLog(guild, `🎭 Rôle **${role.name}** attribué à ${member}`);
    } catch (error) {
        const errorMsg = `❌ Erreur: Pas la permission de donner le rôle à ${member}`;
        await sendLog(guild, errorMsg);
        console.error(error);
    }
});

// Événement : Réaction retirée
client.on('messageReactionRemove', async (reaction, user) => {
    // Ignorer les réactions du bot
    if (user.bot) return;

    // Si la réaction est partielle, la récupérer
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('❌ Erreur lors de la récupération de la réaction:', error);
            return;
        }
    }

    // Vérifier si c'est le message du règlement
    if (reaction.message.id !== config.rules_message_id) return;

    // Vérifier si c'est le bon emoji
    if (reaction.emoji.name !== config.emoji) return;

    const guild = reaction.message.guild;
    const member = guild.members.cache.get(user.id);

    if (!member) return;

    // Logger le retrait de validation
    await sendLog(guild, `❌ **${member}** (${member.user.tag}) a retiré son acceptation du règlement`);

    // Retrait de rôle (si configuré)
    if (VERIFIED_ROLE_ID === '0') {
        console.log(`ℹ️ Retrait de rôle désactivé pour ${member.user.tag}`);
        return;
    }

    // Récupérer le rôle à retirer
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) return;

    // Retirer le rôle au membre
    try {
        await member.roles.remove(role);
        await sendLog(guild, `🎭 Rôle **${role.name}** retiré à ${member}`);
    } catch (error) {
        const errorMsg = `❌ Erreur: Pas la permission de retirer le rôle à ${member}`;
        await sendLog(guild, errorMsg);
        console.error(error);
    }
});

// Gestion des erreurs
client.on('error', error => {
    console.error('❌ Erreur du client Discord:', error);
});

process.on('unhandledRejection', error => {
    console.error('❌ Erreur non gérée:', error);
});

// Connexion du bot
if (!DISCORD_TOKEN) {
    console.error('❌ ERREUR: DISCORD_TOKEN non trouvé dans le fichier .env');
    console.error('Veuillez créer un fichier .env avec votre token Discord');
    process.exit(1);
}

client.login(DISCORD_TOKEN).catch(error => {
    console.error('❌ Erreur de connexion:', error.message);
    process.exit(1);
});
