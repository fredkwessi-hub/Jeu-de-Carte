// ===== server/game/gameManager.js =====
// Gestion des parties actives

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const gameLogic = require('./gameLogic');

// ===== STOCKAGE =====
const games = new Map(); // gameId -> GameState

// ===== CRÉATION DE PARTIE =====
function createGame(hostPlayer, settings = {}) {
    const gameId = helpers.generateGameId();

    const game = {
        id: gameId,
        hostId: hostPlayer.id,

        // Configuration
        settings: {
            maxPlayers: settings.maxPlayers || config.game.maxPlayersPerGame,
            mode: settings.mode || 'normal', // 'normal', 'duel', 'speed', 'classic'
            rules: {
                stacking: settings.rules?.stacking !== false,
                reverse: settings.rules?.reverse !== false,
                drawAndPlay: settings.rules?.drawAndPlay === true,
                scoring: settings.rules?.scoring || 'standard', // 'standard' ou 'points'
                timeLimit: settings.rules?.timeLimit || 0 // 0 = pas de limite
            },
            theme: settings.theme || 'dark'
        },

        // Joueurs
        players: [{
            id: hostPlayer.id,
            socketId: hostPlayer.socketId,
            name: hostPlayer.name,
            avatar: hostPlayer.avatar || 'default',
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: false,
            botDifficulty: null,
            botPersonality: null,
            rank: null,
            score: 0,
            elo: hostPlayer.elo || config.elo.initialRating,
            totalScore: 0
        }],

        // État de la partie
        status: 'waiting', // waiting, starting, playing, paused, finished
        bank: [],
        pile: [],
        centerCard: null,

        // Tour actuel
        currentPlayerIndex: 0,
        direction: 1, // 1 = horaire, -1 = anti-horaire
        turnCount: 0,

        // Contraintes
        imposedSuit: null,   // Couleur imposée par un J (pique, carreau, coeur, trefle)
        imposedColor: null,  // Couleur imposée par un Joker (red, black)
        pendingDraw: 0,      // Cartes à piocher (attaque 7/Joker)
        pendingDrawFrom: null, // Joueur ayant initié l'attaque
        skipNext: false,     // Si un As a été joué
        reverseNext: false,  // Si un Roi a été joué

        // Historique
        finishedPlayers: [],
        log: [],
        chat: [],
        replay: [], // Enregistrement de tous les coups pour replay

        // Timers
        botTimeout: null,
        turnTimeout: null,
        turnStartTime: null,

        // Spectateurs
        spectators: [],

        // Métadonnées
        createdAt: helpers.now(),
        startedAt: null,
        finishedAt: null
    };

    games.set(gameId, game);
    logger.game(`Partie créée: ${gameId}`, { host: hostPlayer.name, mode: game.settings.mode });

    return game;
}

// ===== RÉCUPÉRATION =====
function getGame(gameId) {
    return games.get(gameId) || null;
}

function getAllGames() {
    return Array.from(games.values());
}

function getActiveGames() {
    return Array.from(games.values()).filter(g => g.status === 'playing');
}

function getWaitingGames() {
    return Array.from(games.values()).filter(g => g.status === 'waiting');
}

// ===== AJOUT DE JOUEUR =====
function addPlayer(gameId, player) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.status !== 'waiting') return { error: 'La partie a déjà commencé' };
    if (game.players.length >= game.settings.maxPlayers) return { error: 'Partie complète' };

    // Vérifier si le joueur est déjà dans la partie
    if (game.players.find(p => p.id === player.id)) {
        return { error: 'Vous êtes déjà dans cette partie' };
    }

    const newPlayer = {
        id: player.id,
        socketId: player.socketId,
        name: player.name,
        avatar: player.avatar || 'default',
        hand: [],
        isActive: true,
        isConnected: true,
        isBot: false,
        botDifficulty: null,
        botPersonality: null,
        rank: null,
        score: 0,
        elo: player.elo || config.elo.initialRating,
        totalScore: 0
    };

    game.players.push(newPlayer);
    logger.player(`${player.name} a rejoint ${gameId}`, { total: game.players.length });

    return { success: true, game, player: newPlayer };
}

// ===== AJOUT DE BOT =====
function addBot(gameId, botInfo = {}) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.status !== 'waiting') return { error: 'La partie a déjà commencé' };
    if (game.players.length >= game.settings.maxPlayers) return { error: 'Partie complète' };

    const existingNames = game.players.map(p => p.name);
    const botName = botInfo.name || generateBotName(existingNames);
    const botId = helpers.generateId('bot');

    const bot = {
        id: botId,
        socketId: null,
        name: botName,
        avatar: botInfo.avatar || 'bot',
        hand: [],
        isActive: true,
        isConnected: true,
        isBot: true,
        botDifficulty: botInfo.difficulty || 'medium',
        botPersonality: botInfo.personality || 'balanced',
        rank: null,
        score: 0,
        elo: config.elo.initialRating,
        totalScore: 0
    };

    game.players.push(bot);
    logger.bot(`Bot ${botName} ajouté à ${gameId}`, { difficulty: bot.botDifficulty, personality: bot.botPersonality });

    return { success: true, game, player: bot };
}

// ===== RETRAIT DE JOUEUR =====
function removePlayer(gameId, playerId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };

    const playerIndex = game.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) return { error: 'Joueur introuvable' };

    const player = game.players[playerIndex];
    game.players.splice(playerIndex, 1);

    logger.player(`${player.name} a quitté ${gameId}`);

    // Si la partie était en cours, ajuster l'index du joueur courant
    if (game.status === 'playing') {
        if (game.currentPlayerIndex >= game.players.length) {
            game.currentPlayerIndex = 0;
        }
        // Vérifier si la partie peut continuer
        if (game.players.filter(p => p.isActive).length < 2) {
            game.status = 'finished';
            logger.game(`Partie ${gameId} terminée (pas assez de joueurs)`);
        }
    }

    // Si la partie était en attente et vide, la supprimer
    if (game.status === 'waiting' && game.players.length === 0) {
        games.delete(gameId);
        logger.game(`Partie ${gameId} supprimée (vide)`);
    }

    return { success: true, game };
}

// ===== DÉMARRAGE DE PARTIE =====
function startGame(gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.status !== 'waiting') return { error: 'La partie a déjà commencé' };
    if (game.players.length < config.game.minPlayersPerGame) {
        return { error: `Il faut au moins ${config.game.minPlayersPerGame} joueurs` };
    }

    // Créer et mélanger le deck
    const deck = gameLogic.createDeck({
        includeJokers: true,
        deckCount: game.players.length > 4 ? 2 : 1
    });

    // Distribuer
    const { hands, bank } = gameLogic.distributeCards(
        deck,
        game.players.length,
        config.game.cardsPerPlayer
    );

    // Assigner les mains
    game.players.forEach((player, i) => {
        player.hand = gameLogic.sortHand(hands[i]);
        player.rank = null;
        player.score = 0;
    });

    // Tirer la carte centrale
    const { centerCard, newBank } = gameLogic.drawCenterCard(bank);

    // Initialiser l'état
    game.bank = newBank;
    game.centerCard = centerCard;
    game.pile = [centerCard];
    game.status = 'playing';
    game.currentPlayerIndex = 0;
    game.direction = 1;
    game.turnCount = 0;
    game.imposedSuit = null;
    game.imposedColor = null;
    game.pendingDraw = 0;
    game.pendingDrawFrom = null;
    game.skipNext = false;
    game.reverseNext = false;
    game.finishedPlayers = [];
    game.log = [];
    game.replay = [];
    game.startedAt = helpers.now();
    game.turnStartTime = Date.now();

    addLog(game, `🎮 La partie commence ! Carte centrale : ${formatCard(centerCard)}`);

    // Enregistrer le coup initial pour le replay
    game.replay.push({
        type: 'start',
        centerCard: centerCard,
        timestamp: Date.now()
    });

    logger.game(`Partie ${gameId} démarrée`, {
        players: game.players.length,
        centerCard: formatCard(centerCard)
    });

    return { success: true, game };
}

// ===== FIN DE PARTIE =====
function endGame(gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };

    game.status = 'finished';
    game.finishedAt = helpers.now();

    logger.game(`Partie ${gameId} terminée`, {
        winner: game.finishedPlayers[0]?.name,
        duration: game.startedAt ? Date.now() - new Date(game.startedAt).getTime() : 0
    });

    return { success: true, game };
}

// ===== SUPPRESSION =====
function deleteGame(gameId) {
    const game = games.get(gameId);
    if (!game) return false;

    // Nettoyer les timers
    if (game.botTimeout) clearTimeout(game.botTimeout);
    if (game.turnTimeout) clearTimeout(game.turnTimeout);

    games.delete(gameId);
    logger.game(`Partie ${gameId} supprimée`);
    return true;
}

// ===== AJOUT DE SPECTATEUR =====
function addSpectator(gameId, socketId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.spectators.length >= config.limits.maxSpectatorsPerGame) {
        return { error: 'Trop de spectateurs' };
    }
    if (!game.spectators.includes(socketId)) {
        game.spectators.push(socketId);
    }
    return { success: true };
}

function removeSpectator(gameId, socketId) {
    const game = games.get(gameId);
    if (!game) return;
    game.spectators = game.spectators.filter(id => id !== socketId);
}

// ===== LOG =====
function addLog(game, message) {
    game.log.push({
        time: helpers.now(),
        message
    });
    if (game.log.length > 100) game.log.shift();
}

// ===== CHAT =====
function addChatMessage(gameId, playerId, message) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };

    const player = game.players.find(p => p.id === playerId);
    if (!player) return { error: 'Joueur introuvable' };

    const sanitized = helpers.sanitizeString(message, config.security.maxChatMessageLength);
    if (!sanitized) return { error: 'Message vide' };

    const chatMessage = {
        id: helpers.generateId('msg'),
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        message: sanitized,
        timestamp: helpers.now()
    };

    game.chat.push(chatMessage);
    if (game.chat.length > config.limits.maxChatHistoryPerGame) {
        game.chat.shift();
    }

    return { success: true, message: chatMessage };
}

// ===== FORMATAGE DE CARTE =====
function formatCard(card) {
    if (!card) return '?';
    if (card.type === 'joker') return `🃏 Joker ${card.jokerColor}`;
    return `${card.rank}${card.symbol}`;
}

// ===== NOMS DE BOTS =====
const BOT_NAMES = [
    '🤖 Robo', '🎩 Alfred', '🧠 Einstein', '🎯 Sniper', '🦊 Renard',
    '🐺 Loup', '🦉 Hibou', '🐉 Dragon', '👾 Pixel', '🎲 Lucky',
    '🎪 Magic', '⚡ Flash', '🌟 Star', '🔥 Blaze', '❄️ Frost',
    '🌊 Wave', '🌪️ Storm', '🌙 Luna', '☀️ Solar', '⚔️ Blade'
];

function generateBotName(existingNames = []) {
    const available = BOT_NAMES.filter(n => !existingNames.includes(n));
    if (available.length === 0) {
        return `🤖 Bot ${Math.floor(Math.random() * 10000)}`;
    }
    return helpers.pickRandom(available);
}

// ===== STATISTIQUES =====
function getGameStats(gameId) {
    const game = games.get(gameId);
    if (!game) return null;

    return {
        id: game.id,
        status: game.status,
        playerCount: game.players.length,
        mode: game.settings.mode,
        duration: game.startedAt ? Date.now() - new Date(game.startedAt).getTime() : 0,
        turnCount: game.turnCount,
        pileCount: game.pile.length,
        bankCount: game.bank.length,
        finishedPlayers: game.finishedPlayers
    };
}

// ===== NETTOYAGE (parties abandonnées) =====
function cleanupInactiveGames() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes

    let deleted = 0;
    games.forEach((game, gameId) => {
        // Supprimer les parties en attente trop anciennes
        if (game.status === 'waiting') {
            const createdAt = new Date(game.createdAt).getTime();
            if (now - createdAt > timeout) {
                deleteGame(gameId);
                deleted++;
            }
        }
    });

    if (deleted > 0) {
        logger.info(`${deleted} parties inactives supprimées`);
    }

    return deleted;
}

// ===== LANCER LE NETTOYAGE PÉRIODIQUE =====
setInterval(cleanupInactiveGames, 5 * 60 * 1000); // Toutes les 5 min

// ===== EXPORT =====
module.exports = {
    createGame,
    getGame,
    getAllGames,
    getActiveGames,
    getWaitingGames,
    addPlayer,
    addBot,
    removePlayer,
    startGame,
    endGame,
    deleteGame,
    addSpectator,
    removeSpectator,
    addLog,
    addChatMessage,
    formatCard,
    generateBotName,
    getGameStats,
    cleanupInactiveGames,
    BOT_NAMES
};