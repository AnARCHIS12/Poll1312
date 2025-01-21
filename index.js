const { Client } = require('revolt.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client();
const PREFIX = '1312';
const SAVE_FILE = path.join(__dirname, 'polls.json');

// Structure pour stocker les sondages en mémoire
class Poll {
    constructor(question, options, authorId, channelId) {
        this.id = Date.now().toString();
        this.question = question;
        this.options = options;
        this.votes = new Map();
        this.authorId = authorId;
        this.channelId = channelId;
        this.createdAt = new Date();
    }

    addVote(userId, optionIndex) {
        this.votes.set(userId, optionIndex);
        savePollsToFile(); // Sauvegarder après chaque vote
    }

    getResults() {
        const results = new Array(this.options.length).fill(0);
        for (const optionIndex of this.votes.values()) {
            results[optionIndex]++;
        }
        return results;
    }

    // Pour la sérialisation
    toJSON() {
        return {
            id: this.id,
            question: this.question,
            options: this.options,
            votes: Array.from(this.votes.entries()),
            authorId: this.authorId,
            channelId: this.channelId,
            createdAt: this.createdAt
        };
    }

    // Pour la désérialisation
    static fromJSON(data) {
        const poll = new Poll(data.question, data.options, data.authorId, data.channelId);
        poll.id = data.id;
        poll.createdAt = new Date(data.createdAt);
        poll.votes = new Map(data.votes);
        return poll;
    }
}

// Stockage des sondages en mémoire
const polls = new Map();

// Fonction pour sauvegarder les sondages dans un fichier
function savePollsToFile() {
    try {
        const pollsData = Array.from(polls.values()).map(poll => poll.toJSON());
        fs.writeFileSync(SAVE_FILE, JSON.stringify(pollsData, null, 2));
        console.log('Sondages sauvegardés avec succès');
    } catch (error) {
        console.error('Erreur lors de la sauvegarde des sondages:', error);
    }
}

// Fonction pour charger les sondages depuis le fichier
function loadPollsFromFile() {
    try {
        if (fs.existsSync(SAVE_FILE)) {
            const data = fs.readFileSync(SAVE_FILE, 'utf8');
            const pollsData = JSON.parse(data);
            polls.clear();
            pollsData.forEach(pollData => {
                const poll = Poll.fromJSON(pollData);
                polls.set(poll.id, poll);
            });
            console.log('Sondages chargés avec succès');
        }
    } catch (error) {
        console.error('Erreur lors du chargement des sondages:', error);
    }
}

client.on('ready', () => {
    console.log(`Connecté en tant que ${client.user.username}!`);
    loadPollsFromFile(); // Charger les sondages au démarrage
    
    // Définir le statut du bot
    client.api.patch("/users/@me", {
        status: {
            text: `${PREFIX}help | Sondages`,
            presence: "Online"
        }
    }).then(() => {
        console.log('Statut du bot mis à jour avec succès');
    }).catch(error => {
        console.error('Erreur lors de la mise à jour du statut:', error);
    });
});

client.on('message', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    const args = message.content.slice(PREFIX.length).trim().split(' ');
    const command = args.shift().toLowerCase();

    if (command === 'sondage') {
        const pollContent = args.join(' ').split('|');
        if (pollContent.length < 3) {
            const errorEmbed = {
                title: "❌ Erreur - Format incorrect",
                description: `Usage: ${PREFIX}sondage Question | Option 1 | Option 2 | [Option 3] ...\n` +
                           `*Exemple: ${PREFIX}sondage Meilleur manga ? | One Piece | Naruto | Dragon Ball*`,
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
            return;
        }

        const question = pollContent[0].trim();
        const options = pollContent.slice(1).map(opt => opt.trim());

        try {
            const poll = new Poll(
                question, 
                options, 
                message.author._id, 
                message.channel._id
            );
            polls.set(poll.id, poll);
            savePollsToFile(); // Sauvegarder après création d'un sondage

            const optionsText = options.map((option, index) => `${index + 1}️⃣ ${option}`).join('\n');
            const pollEmbed = {
                title: "❓ " + question.toUpperCase(),
                description: `${optionsText}\n\nRépondez avec \`${PREFIX}vote ${poll.id} <numéro de l'option>\` pour voter!`,
                colour: "#ff0000",
                footer: {
                    text: `ID du sondage: ${poll.id}`
                }
            };

            await message.channel.sendMessage({ embeds: [pollEmbed] });
        } catch (error) {
            console.error('Erreur création sondage:', error);
            const errorEmbed = {
                title: "❌ Erreur",
                description: "Une erreur est survenue lors de la création du sondage.",
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
        }
    }

    if (command === 'vote') {
        if (args.length !== 2) {
            const errorEmbed = {
                title: "❌ Erreur - Format incorrect",
                description: `Usage: ${PREFIX}vote <id du sondage> <numéro de l'option>`,
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
            return;
        }

        const [pollId, optionStr] = args;
        const optionIndex = parseInt(optionStr) - 1;

        try {
            const poll = polls.get(pollId);
            if (!poll) {
                const errorEmbed = {
                    title: "❌ Erreur",
                    description: "Ce sondage n'existe pas ou est terminé.",
                    colour: "#ff0000"
                };
                await message.channel.sendMessage({ embeds: [errorEmbed] });
                return;
            }

            if (poll.channelId !== message.channel._id) {
                const errorEmbed = {
                    title: "❌ Erreur",
                    description: "Ce sondage appartient à un autre canal.",
                    colour: "#ff0000"
                };
                await message.channel.sendMessage({ embeds: [errorEmbed] });
                return;
            }

            if (optionIndex < 0 || optionIndex >= poll.options.length) {
                const errorEmbed = {
                    title: "❌ Erreur",
                    description: "Option invalide!",
                    colour: "#ff0000"
                };
                await message.channel.sendMessage({ embeds: [errorEmbed] });
                return;
            }

            poll.addVote(message.author._id, optionIndex);
            const results = poll.getResults();

            const resultText = poll.options.map((option, index) => {
                const votes = results[index];
                const percentage = (votes / poll.votes.size) * 100 || 0;
                return `${index + 1}️⃣ ${option}: ${votes} votes (${percentage.toFixed(1)}%)`;
            }).join('\n');

            const resultEmbed = {
                title: "❓ " + poll.question.toUpperCase(),
                description: resultText,
                colour: "#ff0000",
                footer: {
                    text: `Total des votes: ${poll.votes.size}`
                }
            };

            await message.channel.sendMessage({ embeds: [resultEmbed] });
        } catch (error) {
            console.error('Erreur vote:', error);
            const errorEmbed = {
                title: "❌ Erreur",
                description: "Une erreur est survenue lors du vote.",
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
        }
    }

    if (command === 'liste') {
        try {
            const channelPolls = Array.from(polls.values())
                .filter(poll => poll.channelId === message.channel._id)
                .sort((a, b) => b.createdAt - a.createdAt)
                .slice(0, 5);

            if (channelPolls.length === 0) {
                const emptyEmbed = {
                    title: "📊 Liste des sondages",
                    description: "Aucun sondage actif dans ce canal.",
                    colour: "#ff0000"
                };
                await message.channel.sendMessage({ embeds: [emptyEmbed] });
                return;
            }

            const pollsList = channelPolls.map(poll => {
                const votes = poll.votes.size;
                return `**ID:** ${poll.id}\n` +
                       `**❓ Question:** ${poll.question.toUpperCase()}\n` +
                       `**Options:** ${poll.options.join(', ')}\n` +
                       `**Votes:** ${votes}\n`;
            }).join('\n');

            const listEmbed = {
                title: "📊 Liste des sondages actifs",
                description: pollsList,
                colour: "#ff0000",
                footer: {
                    text: `${channelPolls.length} sondage(s) actif(s)`
                }
            };

            await message.channel.sendMessage({ embeds: [listEmbed] });
        } catch (error) {
            console.error('Erreur liste:', error);
            const errorEmbed = {
                title: "❌ Erreur",
                description: "Une erreur est survenue lors de la récupération des sondages.",
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
        }
    }

    if (command === 'help') {
        try {
            const embed = {
                title: "📊 Bot de Sondages - Aide",
                description: `Bot de sondages interactifs pour prendre des décisions collectives et organiser des événements. Créez des sondages personnalisés, votez et suivez les résultats en temps réel.

**Commandes disponibles:**
\`${PREFIX}sondage Question | Option 1 | Option 2 | [Option 3] ...\`
→ Crée un nouveau sondage avec une question et plusieurs options.
*Exemple: ${PREFIX}sondage Meilleur manga ? | One Piece | Naruto | Dragon Ball*

\`${PREFIX}vote <id du sondage> <numéro de l'option>\`
→ Vote pour une option dans un sondage existant.
*Exemple: ${PREFIX}vote 1234567890 2*

\`${PREFIX}liste\`
→ Affiche les 5 derniers sondages actifs dans ce canal.

\`${PREFIX}clear\`
→ Efface tous les sondages du serveur actuel.

**Remarques:**
• Un seul vote par personne (vous pouvez changer votre vote)
• Les sondages sont stockés en mémoire
• Les résultats sont affichés en temps réel avec pourcentages
• Les sondages sont spécifiques à chaque canal`,
                colour: "#ff0000",
                icon_url: client.user.avatarURL
            };

            await message.channel.sendMessage({ embeds: [embed] });
        } catch (error) {
            console.error('Erreur help:', error);
            const errorEmbed = {
                title: "❌ Erreur",
                description: "Une erreur est survenue lors de l'affichage de l'aide.",
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
        }
        return;
    }

    if (command === 'clear') {
        try {
            // Récupérer le serveur actuel
            const serverId = message.channel.server?._id;
            if (!serverId) {
                const errorEmbed = {
                    title: "❌ Erreur",
                    description: "Cette commande ne peut être utilisée que sur un serveur.",
                    colour: "#ff0000"
                };
                await message.channel.sendMessage({ embeds: [errorEmbed] });
                return;
            }

            // Compter les sondages à supprimer
            let deletedCount = 0;
            for (const [pollId, poll] of polls.entries()) {
                const pollServerId = message.channel.server._id;
                if (poll.channelId && message.channel.server.channels.find(c => c._id === poll.channelId)) {
                    polls.delete(pollId);
                    deletedCount++;
                }
            }

            // Sauvegarder les changements
            savePollsToFile();

            const successEmbed = {
                title: "🗑️ Sondages effacés",
                description: `${deletedCount} sondage(s) ont été effacés de ce serveur.`,
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Erreur clear:', error);
            const errorEmbed = {
                title: "❌ Erreur",
                description: "Une erreur est survenue lors de l'effacement des sondages.",
                colour: "#ff0000"
            };
            await message.channel.sendMessage({ embeds: [errorEmbed] });
        }
    }
});

// Connexion du bot avec le token
client.loginBot(process.env.REVOLT_TOKEN);
