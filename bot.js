const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, ActivityType, SlashCommandBuilder, REST, Routes, MessageFlags } = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Charger les variables d'environnement
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;
const VERIFIED_ROLE_ID = process.env.VERIFIED_ROLE_ID || '0';
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '0';
const POLL_ROLE_IDS = process.env.POLL_ROLE_IDS || '0';

// Variables globales pour les sondages
const activePollTimers = new Map();
const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

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
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Créer un sondage interactif')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('La question du sondage')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('options')
                .setDescription('Les options séparées par des points-virgules (;) - Maximum 10')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('duree')
                .setDescription('Durée du sondage en minutes')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(10080)) // 7 jours max
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Type de vote')
                .setRequired(true)
                .addChoices(
                    { name: '🔘 Vote unique (un seul choix)', value: 'unique' },
                    { name: '☑️ Votes multiples (plusieurs choix possibles)', value: 'multiple' }
                )),
    new SlashCommandBuilder()
        .setName('poll-close')
        .setDescription('Fermer un sondage manuellement')
        .addStringOption(option =>
            option.setName('message_id')
                .setDescription('ID du message du sondage à fermer')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('poll-history')
        .setDescription('Afficher l\'historique des sondages')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Numéro de page (5 sondages par page)')
                .setRequired(false)
                .setMinValue(1))
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
 * Vérifie si un membre a les rôles requis pour créer des sondages
 */
function hasRequiredRole(member) {
    // Si POLL_ROLE_IDS est à '0', tout le monde peut créer des sondages
    if (POLL_ROLE_IDS === '0') return true;

    // Vérifier si c'est un admin
    if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    // Vérifier si le membre a l'un des rôles autorisés
    const allowedRoleIds = POLL_ROLE_IDS.split(',').map(id => id.trim());
    return allowedRoleIds.some(roleId => member.roles.cache.has(roleId));
}

/**
 * Formate le temps restant pour un sondage
 */
function formatTimeRemaining(endTime) {
    const now = Date.now();
    const remaining = endTime - now;

    if (remaining <= 0) return 'Terminé';

    const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
    const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

    if (days > 0) return `${days}j ${hours}h ${minutes}min`;
    if (hours > 0) return `${hours}h ${minutes}min`;
    return `${minutes}min`;
}

/**
 * Met à jour l'embed d'un sondage avec les votes actuels
 */
async function updatePollEmbed(message, pollData) {
    try {
        const totalVotes = Object.values(pollData.votes).reduce((sum, voters) => sum + voters.length, 0);

        // Créer la description avec les options et les votes
        let description = '';
        pollData.options.forEach((option, index) => {
            const voters = pollData.votes[index] || [];
            const percentage = totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0;

            description += `\n${numberEmojis[index]} **${option}**\n`;
            description += `└ ${voters.length} vote(s) (${percentage}%)\n`;

            // Afficher qui a voté (max 5 noms affichés)
            if (voters.length > 0) {
                const voterMentions = voters.slice(0, 5).map(userId => `<@${userId}>`).join(', ');
                const remaining = voters.length > 5 ? ` +${voters.length - 5}` : '';
                description += `   ${voterMentions}${remaining}\n`;
            }
        });

        const typeIcon = pollData.type === 'unique' ? '🔘' : '☑️';
        const typeText = pollData.type === 'unique' ? 'Vote unique' : 'Votes multiples';

        const embed = new EmbedBuilder()
            .setColor(0xFF9900)
            .setTitle(`📊 ${pollData.question}`)
            .setDescription(description)
            .addFields(
                { name: 'Type de vote', value: `${typeIcon} ${typeText}`, inline: true },
                { name: 'Temps restant', value: `⏱️ ${formatTimeRemaining(pollData.endsAt)}`, inline: true },
                { name: 'Total de votes', value: `${totalVotes}`, inline: true }
            )
            .setFooter({ text: 'Réagis avec les emojis pour voter !' })
            .setTimestamp(pollData.createdAt);

        await message.edit({ embeds: [embed] });
    } catch (error) {
        console.error('❌ Erreur lors de la mise à jour de l\'embed:', error);
    }
}

/**
 * Ferme un sondage et affiche les résultats finaux
 */
async function closePoll(messageId, reason = 'automatique') {
    const pollData = config.active_polls[messageId];
    if (!pollData) return;

    try {
        const channel = await client.channels.fetch(pollData.channelId);
        const message = await channel.messages.fetch(messageId);

        // Calculer les résultats
        const totalVotes = Object.values(pollData.votes).reduce((sum, voters) => sum + voters.length, 0);
        let maxVotes = 0;
        let winners = [];

        pollData.options.forEach((option, index) => {
            const votes = (pollData.votes[index] || []).length;
            if (votes > maxVotes) {
                maxVotes = votes;
                winners = [option];
            } else if (votes === maxVotes && votes > 0) {
                winners.push(option);
            }
        });

        // Créer l'embed des résultats finaux
        let resultsDescription = '**Résultats finaux :**\n\n';
        pollData.options.forEach((option, index) => {
            const voters = pollData.votes[index] || [];
            const percentage = totalVotes > 0 ? Math.round((voters.length / totalVotes) * 100) : 0;
            const isWinner = winners.includes(option) && maxVotes > 0;

            resultsDescription += `${numberEmojis[index]} **${option}** ${isWinner ? '🏆' : ''}\n`;
            resultsDescription += `└ ${voters.length} vote(s) (${percentage}%)\n\n`;
        });

        if (maxVotes === 0) {
            resultsDescription += '\n❌ Aucun vote enregistré';
        } else if (winners.length === 1) {
            resultsDescription += `\n🏆 **Gagnant :** ${winners[0]} avec ${maxVotes} vote(s)`;
        } else {
            resultsDescription += `\n🏆 **Égalité entre :** ${winners.join(', ')} avec ${maxVotes} vote(s) chacun`;
        }

        const finalEmbed = new EmbedBuilder()
            .setColor(0x95A5A6)
            .setTitle(`🔒 ${pollData.question}`)
            .setDescription(resultsDescription)
            .addFields(
                { name: 'Total de votes', value: `${totalVotes}`, inline: true },
                { name: 'Fermeture', value: reason === 'automatique' ? '⏰ Automatique' : '🛑 Manuelle', inline: true }
            )
            .setFooter({ text: 'Sondage terminé' })
            .setTimestamp();

        await message.edit({ embeds: [finalEmbed] });

        // Retirer toutes les réactions
        await message.reactions.removeAll().catch(() => {});

        // Sauvegarder dans l'historique
        savePollToHistory({
            ...pollData,
            messageId,
            closedAt: Date.now(),
            totalVotes,
            winners,
            reason
        });

        // Logger
        await sendLog(message.guild, `📊 Sondage terminé (${reason}) : "${pollData.question}" - ${totalVotes} vote(s)`);

        // Supprimer du tableau des sondages actifs
        delete config.active_polls[messageId];
        saveConfig();

        // Annuler le timer s'il existe
        if (activePollTimers.has(messageId)) {
            clearTimeout(activePollTimers.get(messageId));
            activePollTimers.delete(messageId);
        }
    } catch (error) {
        console.error(`❌ Erreur lors de la fermeture du sondage ${messageId}:`, error);
    }
}

/**
 * Sauvegarde un sondage dans l'historique
 */
function savePollToHistory(pollData) {
    // Garder seulement les 20 derniers sondages
    config.poll_history.unshift(pollData);
    if (config.poll_history.length > 20) {
        config.poll_history = config.poll_history.slice(0, 20);
    }
    saveConfig();
}

/**
 * Enregistre les slash commands auprès de Discord
 */
async function registerCommands() {
    const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

    try {
        console.log('🔄 Enregistrement des slash commands...');

        if (GUILD_ID) {
            // Mode Guild : les commandes apparaissent instantanément
            await rest.put(
                Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID),
                { body: commands }
            );
            console.log(`✅ Slash commands enregistrées avec succès pour le serveur ${GUILD_ID} !`);
        } else {
            // Mode Global : peut prendre jusqu'à 1 heure
            await rest.put(
                Routes.applicationCommands(CLIENT_ID),
                { body: commands }
            );
            console.log('✅ Slash commands enregistrées globalement (peut prendre jusqu\'à 1h) !');
        }
    } catch (error) {
        console.error('❌ Erreur lors de l\'enregistrement des slash commands:', error);
    }
}

// Événement : Bot prêt
client.once('clientReady', async () => {
    console.log(`${client.user.tag} est connecté et prêt !`);
    console.log(`ID du bot: ${client.user.id}`);
    console.log('------');
    console.log(`Actif sur ${client.guilds.cache.size} serveur(s)`);
    console.log('------');
    console.log(`Attribution de rôle: ${VERIFIED_ROLE_ID !== '0' ? '✅ Activée' : '❌ Désactivée'}`);
    console.log(`Logs Discord: ${LOG_CHANNEL_ID !== '0' ? '✅ Activés' : '❌ Désactivés'}`);
    console.log('------');

    // Restaurer les timers des sondages actifs
    const activePolls = Object.keys(config.active_polls || {});
    if (activePolls.length > 0) {
        console.log(`🔄 Restauration de ${activePolls.length} sondage(s) actif(s)...`);

        for (const messageId of activePolls) {
            const pollData = config.active_polls[messageId];
            const now = Date.now();
            const remaining = pollData.endsAt - now;

            if (remaining <= 0) {
                // Le sondage aurait dû être fermé
                console.log(`⏰ Fermeture du sondage expiré : "${pollData.question}"`);
                await closePoll(messageId, 'automatique');
            } else {
                // Recréer le timer
                const timer = setTimeout(() => {
                    closePoll(messageId, 'automatique');
                }, remaining);

                activePollTimers.set(messageId, timer);
                console.log(`✅ Timer restauré pour : "${pollData.question}" (${Math.round(remaining / 60000)} min restantes)`);
            }
        }

        console.log('------');
    }

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

    // Commande /poll
    if (interaction.commandName === 'poll') {
        // Vérifier les permissions
        if (!hasRequiredRole(interaction.member)) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas la permission de créer des sondages.',
                flags: MessageFlags.Ephemeral
            });
        }

        const question = interaction.options.getString('question');
        const optionsString = interaction.options.getString('options');
        const duration = interaction.options.getInteger('duree');
        const type = interaction.options.getString('type');

        // Parser les options
        const options = optionsString.split(';').map(opt => opt.trim()).filter(opt => opt.length > 0);

        // Valider le nombre d'options
        if (options.length < 2) {
            return interaction.reply({
                content: '❌ Il faut au moins 2 options pour créer un sondage.',
                flags: MessageFlags.Ephemeral
            });
        }

        if (options.length > 10) {
            return interaction.reply({
                content: '❌ Maximum 10 options autorisées.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            // Créer l'embed initial
            const now = Date.now();
            const endsAt = now + (duration * 60 * 1000);

            let description = '';
            options.forEach((option, index) => {
                description += `\n${numberEmojis[index]} **${option}**\n`;
                description += `└ 0 vote(s) (0%)\n`;
            });

            const typeIcon = type === 'unique' ? '🔘' : '☑️';
            const typeText = type === 'unique' ? 'Vote unique' : 'Votes multiples';

            const embed = new EmbedBuilder()
                .setColor(0xFF9900)
                .setTitle(`📊 ${question}`)
                .setDescription(description)
                .addFields(
                    { name: 'Type de vote', value: `${typeIcon} ${typeText}`, inline: true },
                    { name: 'Temps restant', value: `⏱️ ${formatTimeRemaining(endsAt)}`, inline: true },
                    { name: 'Total de votes', value: '0', inline: true }
                )
                .setFooter({ text: 'Réagis avec les emojis pour voter !' })
                .setTimestamp(now);

            // Répondre à l'interaction
            await interaction.reply({ content: '✅ Sondage créé avec succès !', flags: MessageFlags.Ephemeral });

            // Envoyer le sondage
            const pollMessage = await interaction.channel.send({ embeds: [embed] });

            // Ajouter les réactions
            for (let i = 0; i < options.length; i++) {
                await pollMessage.react(numberEmojis[i]);
            }

            // Créer les données du sondage
            const pollData = {
                messageId: pollMessage.id,
                channelId: interaction.channel.id,
                question,
                options,
                type,
                createdBy: interaction.user.id,
                createdAt: now,
                endsAt,
                votes: {}
            };

            // Initialiser les votes vides
            options.forEach((_, index) => {
                pollData.votes[index] = [];
            });

            // Sauvegarder dans la config
            config.active_polls[pollMessage.id] = pollData;
            saveConfig();

            // Créer un timer pour fermer automatiquement le sondage
            const timer = setTimeout(() => {
                closePoll(pollMessage.id, 'automatique');
            }, duration * 60 * 1000);

            activePollTimers.set(pollMessage.id, timer);

            // Logger
            await sendLog(interaction.guild, `📊 Nouveau sondage créé par **${interaction.user}** : "${question}" (${duration} min)`);

            console.log(`✅ Sondage créé : "${question}" - ID: ${pollMessage.id}`);
        } catch (error) {
            console.error('❌ Erreur lors de la création du sondage:', error);
            await interaction.editReply({ content: '❌ Erreur lors de la création du sondage.' });
        }
    }

    // Commande /poll-close
    if (interaction.commandName === 'poll-close') {
        const messageId = interaction.options.getString('message_id');

        // Vérifier que le sondage existe
        const pollData = config.active_polls[messageId];
        if (!pollData) {
            return interaction.reply({
                content: '❌ Aucun sondage actif trouvé avec cet ID.',
                flags: MessageFlags.Ephemeral
            });
        }

        // Vérifier les permissions (créateur du sondage ou admin)
        const isCreator = pollData.createdBy === interaction.user.id;
        const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

        if (!isCreator && !isAdmin) {
            return interaction.reply({
                content: '❌ Seul le créateur du sondage ou un administrateur peut le fermer.',
                flags: MessageFlags.Ephemeral
            });
        }

        try {
            await closePoll(messageId, 'manuelle');
            await interaction.reply({
                content: '✅ Le sondage a été fermé avec succès !',
                flags: MessageFlags.Ephemeral
            });
        } catch (error) {
            console.error('❌ Erreur lors de la fermeture du sondage:', error);
            await interaction.reply({
                content: '❌ Erreur lors de la fermeture du sondage.',
                flags: MessageFlags.Ephemeral
            });
        }
    }

    // Commande /poll-history
    if (interaction.commandName === 'poll-history') {
        const page = interaction.options.getInteger('page') || 1;
        const perPage = 5;

        if (config.poll_history.length === 0) {
            return interaction.reply({
                content: '📊 Aucun sondage dans l\'historique.',
                flags: MessageFlags.Ephemeral
            });
        }

        const totalPages = Math.ceil(config.poll_history.length / perPage);
        const startIndex = (page - 1) * perPage;
        const endIndex = startIndex + perPage;
        const pagePolls = config.poll_history.slice(startIndex, endIndex);

        if (pagePolls.length === 0) {
            return interaction.reply({
                content: `❌ La page ${page} n'existe pas. Il y a ${totalPages} page(s) au total.`,
                flags: MessageFlags.Ephemeral
            });
        }

        const embed = new EmbedBuilder()
            .setColor(0x3498DB)
            .setTitle('📊 Historique des sondages')
            .setFooter({ text: `Page ${page}/${totalPages} • Total: ${config.poll_history.length} sondage(s)` });

        pagePolls.forEach((poll, index) => {
            const pollNumber = startIndex + index + 1;
            const date = new Date(poll.closedAt).toLocaleString('fr-FR');
            const winnersText = poll.winners && poll.winners.length > 0
                ? `🏆 ${poll.winners.join(', ')}`
                : '❌ Aucun vote';

            embed.addFields({
                name: `${pollNumber}. ${poll.question}`,
                value: `**Votes:** ${poll.totalVotes} • **Date:** ${date}\n${winnersText}`,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
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

    // GESTION DES VOTES DE SONDAGES
    const pollData = config.active_polls[reaction.message.id];
    if (pollData) {
        // C'est un sondage actif
        const emojiName = reaction.emoji.name;
        const optionIndex = numberEmojis.indexOf(emojiName);

        // Vérifier que c'est un emoji valide pour ce sondage
        if (optionIndex === -1 || optionIndex >= pollData.options.length) {
            // Emoji non valide, le retirer
            await reaction.users.remove(user.id).catch(() => {});
            return;
        }

        // Si c'est un vote unique, retirer les autres réactions de cet utilisateur
        if (pollData.type === 'unique') {
            for (let i = 0; i < pollData.options.length; i++) {
                if (i !== optionIndex && pollData.votes[i].includes(user.id)) {
                    // Retirer le vote précédent
                    pollData.votes[i] = pollData.votes[i].filter(id => id !== user.id);

                    // Retirer la réaction visuellement
                    const oldReaction = reaction.message.reactions.cache.get(numberEmojis[i]);
                    if (oldReaction) {
                        await oldReaction.users.remove(user.id).catch(() => {});
                    }
                }
            }
        }

        // Ajouter le vote s'il n'existe pas déjà
        if (!pollData.votes[optionIndex].includes(user.id)) {
            pollData.votes[optionIndex].push(user.id);

            // Sauvegarder
            config.active_polls[reaction.message.id] = pollData;
            saveConfig();

            // Mettre à jour l'embed
            await updatePollEmbed(reaction.message, pollData);

            console.log(`✅ Vote enregistré : ${user.tag} -> Option ${optionIndex + 1} sur le sondage "${pollData.question}"`);
        }

        return;
    }

    // GESTION DU RÈGLEMENT (code existant)
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

    // GESTION DES VOTES DE SONDAGES
    const pollData = config.active_polls[reaction.message.id];
    if (pollData) {
        // C'est un sondage actif
        const emojiName = reaction.emoji.name;
        const optionIndex = numberEmojis.indexOf(emojiName);

        // Vérifier que c'est un emoji valide pour ce sondage
        if (optionIndex === -1 || optionIndex >= pollData.options.length) {
            return;
        }

        // Retirer le vote s'il existe
        if (pollData.votes[optionIndex].includes(user.id)) {
            pollData.votes[optionIndex] = pollData.votes[optionIndex].filter(id => id !== user.id);

            // Sauvegarder
            config.active_polls[reaction.message.id] = pollData;
            saveConfig();

            // Mettre à jour l'embed
            await updatePollEmbed(reaction.message, pollData);

            console.log(`❌ Vote retiré : ${user.tag} -> Option ${optionIndex + 1} sur le sondage "${pollData.question}"`);
        }

        return;
    }

    // GESTION DU RÈGLEMENT (code existant)
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

if (!CLIENT_ID) {
    console.error('❌ ERREUR: CLIENT_ID non trouvé dans le fichier .env');
    console.error('Veuillez ajouter l\'ID de votre bot dans le fichier .env');
    process.exit(1);
}

// Enregistrer les commandes puis se connecter
registerCommands().then(() => {
    client.login(DISCORD_TOKEN).catch(error => {
        console.error('❌ Erreur de connexion:', error.message);
        process.exit(1);
    });
}).catch(error => {
    console.error('❌ Erreur lors de l\'enregistrement des commandes:', error.message);
    process.exit(1);
});
