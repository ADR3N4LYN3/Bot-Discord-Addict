import discord
from discord.ext import commands
import json
import os
from dotenv import load_dotenv

# Charger les variables d'environnement
load_dotenv()

# Récupérer les secrets depuis .env
DISCORD_TOKEN = os.getenv('DISCORD_TOKEN')
VERIFIED_ROLE_ID = int(os.getenv('VERIFIED_ROLE_ID', 0))
LOG_CHANNEL_ID = int(os.getenv('LOG_CHANNEL_ID', 0))

# Charger la configuration non-sensible
with open('config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

# Configuration des intents
intents = discord.Intents.default()
intents.message_content = True
intents.reactions = True
intents.members = True
intents.guilds = True

# Créer le bot
bot = commands.Bot(command_prefix='!', intents=intents)


async def send_log(guild, message):
    """Envoie un message dans le channel de logs si configuré"""
    if LOG_CHANNEL_ID == 0:
        # Pas de channel de logs configuré, afficher dans la console
        print(message)
        return

    log_channel = guild.get_channel(LOG_CHANNEL_ID)
    if log_channel is None:
        print(f"⚠️ Channel de logs non trouvé (ID: {LOG_CHANNEL_ID})")
        print(message)
        return

    try:
        await log_channel.send(message)
        print(message)  # Afficher aussi dans la console
    except discord.Forbidden:
        print(f"⚠️ Pas la permission d'envoyer dans le channel de logs")
        print(message)
    except Exception as e:
        print(f"⚠️ Erreur lors de l'envoi du log: {e}")
        print(message)


@bot.event
async def on_ready():
    print(f'{bot.user} est connecté et prêt !')
    print(f'ID du bot: {bot.user.id}')
    print('------')
    print(f'Attribution de rôle: {"✅ Activée" if VERIFIED_ROLE_ID != 0 else "❌ Désactivée"}')
    print(f'Logs Discord: {"✅ Activés" if LOG_CHANNEL_ID != 0 else "❌ Désactivés"}')
    print('------')


@bot.command(name='reglement')
@commands.has_permissions(administrator=True)
async def post_rules(ctx):
    """Commande pour poster le règlement (réservée aux administrateurs)"""

    # Créer l'embed pour le règlement
    embed = discord.Embed(
        title="📜 RÈGLEMENT DU SERVEUR",
        description="Veuillez lire attentivement le règlement ci-dessous :",
        color=discord.Color.blue()
    )

    # Ajouter les règles
    embed.add_field(
        name="1️⃣ Respect",
        value="Respectez tous les membres du serveur. Aucun harcèlement, insulte ou discrimination ne sera toléré.",
        inline=False
    )

    embed.add_field(
        name="2️⃣ Langage",
        value="Utilisez un langage approprié. Le spam et les messages en majuscules sont interdits.",
        inline=False
    )

    embed.add_field(
        name="3️⃣ Contenu",
        value="Aucun contenu NSFW, illégal ou offensant n'est autorisé sur ce serveur.",
        inline=False
    )

    embed.add_field(
        name="4️⃣ Publicité",
        value="La publicité non sollicitée pour d'autres serveurs Discord ou services est interdite.",
        inline=False
    )

    embed.add_field(
        name="5️⃣ Salons",
        value="Utilisez les salons appropriés pour vos discussions.",
        inline=False
    )

    embed.add_field(
        name="✅ Validation",
        value=f"Pour accepter le règlement et accéder au serveur, réagissez avec {config['emoji']} ci-dessous.",
        inline=False
    )

    embed.set_footer(text="Merci de faire partie de notre communauté !")

    # Supprimer le message de commande
    await ctx.message.delete()

    # Envoyer l'embed et ajouter la réaction
    message = await ctx.send(embed=embed)
    await message.add_reaction(config['emoji'])

    # Sauvegarder l'ID du message dans la config
    config['rules_message_id'] = message.id
    config['rules_channel_id'] = ctx.channel.id
    with open('config.json', 'w', encoding='utf-8') as f:
        json.dump(config, f, indent=4, ensure_ascii=False)

    print(f"Règlement posté ! ID du message: {message.id}")


@bot.event
async def on_raw_reaction_add(payload):
    """Détecte quand quelqu'un ajoute une réaction"""

    # Ignorer les réactions du bot lui-même
    if payload.user_id == bot.user.id:
        return

    # Vérifier si c'est le message du règlement
    if payload.message_id != config.get('rules_message_id'):
        return

    # Vérifier si c'est le bon emoji
    if str(payload.emoji) != config['emoji']:
        return

    # Récupérer le serveur et le membre
    guild = bot.get_guild(payload.guild_id)
    if guild is None:
        return

    member = guild.get_member(payload.user_id)
    if member is None:
        return

    # Logger la validation
    await send_log(guild, f"✅ **{member.mention}** ({member.name}) a accepté le règlement")

    # Attribution de rôle (si configuré)
    if VERIFIED_ROLE_ID == 0:
        print(f"ℹ️ Attribution de rôle désactivée pour {member.name}")
        return

    # Récupérer le rôle à attribuer
    role = guild.get_role(VERIFIED_ROLE_ID)
    if role is None:
        error_msg = f"❌ Erreur: Le rôle avec l'ID {VERIFIED_ROLE_ID} n'existe pas!"
        await send_log(guild, error_msg)
        return

    # Donner le rôle au membre
    try:
        await member.add_roles(role)
        await send_log(guild, f"🎭 Rôle **{role.name}** attribué à {member.mention}")
    except discord.Forbidden:
        error_msg = f"❌ Erreur: Pas la permission de donner le rôle à {member.mention}"
        await send_log(guild, error_msg)
    except Exception as e:
        error_msg = f"❌ Erreur lors de l'attribution du rôle à {member.mention}: {e}"
        await send_log(guild, error_msg)


@bot.event
async def on_raw_reaction_remove(payload):
    """Détecte quand quelqu'un retire une réaction"""

    # Vérifier si c'est le message du règlement
    if payload.message_id != config.get('rules_message_id'):
        return

    # Vérifier si c'est le bon emoji
    if str(payload.emoji) != config['emoji']:
        return

    # Récupérer le serveur et le membre
    guild = bot.get_guild(payload.guild_id)
    if guild is None:
        return

    member = guild.get_member(payload.user_id)
    if member is None:
        return

    # Logger le retrait de validation
    await send_log(guild, f"❌ **{member.mention}** ({member.name}) a retiré son acceptation du règlement")

    # Retrait de rôle (si configuré)
    if VERIFIED_ROLE_ID == 0:
        print(f"ℹ️ Retrait de rôle désactivé pour {member.name}")
        return

    # Récupérer le rôle à retirer
    role = guild.get_role(VERIFIED_ROLE_ID)
    if role is None:
        return

    # Retirer le rôle au membre
    try:
        await member.remove_roles(role)
        await send_log(guild, f"🎭 Rôle **{role.name}** retiré à {member.mention}")
    except discord.Forbidden:
        error_msg = f"❌ Erreur: Pas la permission de retirer le rôle à {member.mention}"
        await send_log(guild, error_msg)
    except Exception as e:
        error_msg = f"❌ Erreur lors du retrait du rôle à {member.mention}: {e}"
        await send_log(guild, error_msg)


# Lancer le bot
if __name__ == "__main__":
    if not DISCORD_TOKEN:
        print("❌ ERREUR: DISCORD_TOKEN non trouvé dans le fichier .env")
        print("Veuillez créer un fichier .env avec votre token Discord")
        exit(1)

    bot.run(DISCORD_TOKEN)
