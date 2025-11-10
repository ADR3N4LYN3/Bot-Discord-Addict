const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
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

// Définition des slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('reglement')
        .setDescription('Poste le règlement du serveur avec validation par réaction')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('information')
        .setDescription('Poste les informations importantes du serveur')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(command => command.toJSON());

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

/**
 * Enregistre les slash commands auprès de Discord
 */
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Enregistrement des slash commands...');

        // Enregistrer les commandes globalement (disponibles sur tous les serveurs)
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands }
        );

        console.log('✅ Slash commands enregistrées avec succès !');
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des slash commands:', error);
    }
}

// Événement : Bot prêt
client.once('clientReady', async () => {
    console.log(`${client.user.tag} est connecté et prêt !`);
    console.log(`ID du bot: ${client.user.id}`);
    console.log('------');

    // Enregistrer les slash commands
    await registerCommands();

    console.log('------');
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

// Événement : Interaction (slash command)
client.on('interactionCreate', async (interaction) => {
    // Vérifier que c'est une commande
    if (!interaction.isChatInputCommand()) return;

    // Commande /reglement
    if (interaction.commandName === 'reglement') {
        // Créer l'embed pour le règlement
        const embed = new EmbedBuilder()
            .setTitle('🎮 LES RÈGLES DU SERV')
            .setDescription('Yo ! Bienvenue chez nous. On est chill mais y\'a quand même quelques trucs à respecter :')
            .setColor(0x9B59B6)
            .addFields(
                {
                    name: '🚫 Pas de BEG',
                    value: 'On partage si on veut, demande pas à tout le monde. Tu cherches des ressources ? Demande gentiment, une fois.',
                    inline: false
                },
                {
                    name: '🛡️ Pas de SCAM',
                    value: 'Arnaques, liens douteux, fausses promesses... On veut pas de ça ici. Respect.',
                    inline: false
                },
                {
                    name: '😎 Full CHILL',
                    value: 'On est là pour passer du bon temps. Pas de drama, pas de prise de tête. On reste zen.',
                    inline: false
                },
                {
                    name: '🎯 ON EST ADULTES',
                    value: 'On sait se gérer, on a pas besoin d\'une grosse modération. Tu connais les limites, on compte sur toi.',
                    inline: false
                },
                {
                    name: '✨ C\'EST TOUT !',
                    value: `Simple non ? Si t'es ok avec ça, clique sur ${config.emoji} pour accéder au serveur !`,
                    inline: false
                }
            )
            .setFooter({ text: 'Bienvenue dans la communauté ✌️' });

        try {
            // Répondre à l'interaction de manière éphémère
            await interaction.reply({ content: '✅ Règlement posté !', flags: MessageFlags.Ephemeral });

            // Envoyer l'embed dans le channel
            const ruleMessage = await interaction.channel.send({ embeds: [embed] });

            // Ajouter la réaction
            await ruleMessage.react(config.emoji);

            // Sauvegarder l'ID du message dans la config
            config.rules_message_id = ruleMessage.id;
            config.rules_channel_id = interaction.channel.id;
            saveConfig();

            console.log(`Règlement posté ! ID du message: ${ruleMessage.id}`);
        } catch (error) {
            console.error('❌ Erreur lors de la publication du règlement:', error.message);
            await interaction.editReply({ content: '❌ Erreur lors de la publication du règlement.' });
        }
    }

    // Commande /information
    if (interaction.commandName === 'information') {
        // Créer l'embed pour les informations
        const embed = new EmbedBuilder()
            .setTitle('📌 Informations importantes concernant le serveur')
            .setColor(0x3498DB)
            .addFields(
                {
                    name: '🎁 Giveaway',
                    value: '**Pour créer :** utilise la commande /giveaway dans <#1437389780181581964>\n**Tu as gagné :** penses à dire merci et envoi ton pseudo stake dans le salon\n\n⚠️ Un giveaway t\'engage. Une fois lancé, tu dois récompenser le/les gagnants avec la somme annoncée, dans la monnaie de ton choix.',
                    inline: false
                },
                {
                    name: '🎟️ Ticket du vendredi',
                    value: 'Chaque vendredi, entre le coupon du jeudi et le weekly du samedi, une personne sera tirée au sort pour recevoir un dépôt allant de 50€ à 500€, selon l\'activité du serveur.',
                    inline: false
                },
                {
                    name: '🎰 Bonus Hunt',
                    value: 'On vous prête un compte pour farm un hunt.\nEn cas de profit, une roue de pourcentage 🎡 déterminera la part du gain qui te sera reversée.',
                    inline: false
                },
                {
                    name: '🏆 Tournois',
                    value: 'Plusieurs fois par mois, des tournois hors casino seront organisés :\n• Échecs ♟️\n• Gaming 🎮\n• IRL 🎯\n\nLes 3 premiers repartent avec des gains en crypto 💰',
                    inline: false
                }
            )
            .setFooter({ text: 'Bonne chance à tous ! 🍀' });

        try {
            // Répondre à l'interaction de manière éphémère
            await interaction.reply({ content: '✅ Informations postées !', flags: MessageFlags.Ephemeral });

            // Envoyer l'embed dans le channel
            const infoMessage = await interaction.channel.send({ embeds: [embed] });

            console.log(`Informations postées ! ID du message: ${infoMessage.id}`);
        } catch (error) {
            console.error('❌ Erreur lors de la publication des informations:', error.message);
            await interaction.editReply({ content: '❌ Erreur lors de la publication des informations.' });
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

    // Attribution de rôle (si configuré)
    if (VERIFIED_ROLE_ID === '0') {
        // Pas de rôle configuré, juste logger la validation
        await sendLog(guild, `✅ **${member}** a accepté le règlement`);
        console.log(`ℹ️ ${member.user.tag} a accepté le règlement (attribution de rôle désactivée)`);
        return;
    }

    // Vérifier que le membre n'a aucun autre rôle (seulement @everyone)
    const memberRoles = member.roles.cache.filter(r => r.id !== guild.id); // Exclure @everyone
    if (memberRoles.size > 0) {
        console.log(`ℹ️ ${member.user.tag} a déjà des rôles, attribution ignorée`);
        await sendLog(guild, `✅ **${member}** a accepté le règlement (a déjà des rôles)`);
        return;
    }

    // Récupérer le rôle à attribuer
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) {
        await sendLog(guild, `✅ **${member}** a accepté le règlement\n❌ Erreur: Le rôle avec l'ID ${VERIFIED_ROLE_ID} n'existe pas!`);
        return;
    }

    // Donner le rôle au membre
    try {
        await member.roles.add(role);
        await sendLog(guild, `✅ **${member}** a accepté le règlement et a reçu le rôle **${role.name}**`);
        console.log(`✅ ${member.user.tag} a validé le règlement et reçu le rôle ${role.name}`);
    } catch (error) {
        await sendLog(guild, `✅ **${member}** a accepté le règlement\n❌ Erreur: Pas la permission de donner le rôle`);
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

    // Retrait de rôle (si configuré)
    if (VERIFIED_ROLE_ID === '0') {
        // Pas de rôle configuré, juste logger le retrait
        await sendLog(guild, `❌ **${member}** a retiré son acceptation du règlement`);
        console.log(`ℹ️ ${member.user.tag} a retiré son acceptation (retrait de rôle désactivé)`);
        return;
    }

    // Récupérer le rôle à retirer
    const role = guild.roles.cache.get(VERIFIED_ROLE_ID);
    if (!role) {
        await sendLog(guild, `❌ **${member}** a retiré son acceptation du règlement`);
        return;
    }

    // Retirer le rôle au membre
    try {
        await member.roles.remove(role);
        await sendLog(guild, `❌ **${member}** a retiré son acceptation du règlement et le rôle **${role.name}** a été retiré`);
        console.log(`❌ ${member.user.tag} a retiré son acceptation et perdu le rôle ${role.name}`);
    } catch (error) {
        await sendLog(guild, `❌ **${member}** a retiré son acceptation du règlement\n❌ Erreur: Pas la permission de retirer le rôle`);
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
