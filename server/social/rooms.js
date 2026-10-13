// ===== server/social/rooms.js =====
// Salles publiques et gestion des lobbies

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// ===== STOCKAGE =====
const rooms = new Map(); // roomId -> Room

// ===== CRÉATION DE SALLE =====
function createRoom(host, settings = {}) {
    const roomId = helpers.generateRoomId();

    const room = {
        id: roomId,
        hostId: host.id,
        hostName: host.name,
        hostAvatar: host.avatar,

        name: settings.name || `Salle de ${host.name}`,
        description: settings.description || 'Bienvenue dans ma salle !',

        // Configuration
        isPublic: settings.isPublic !== false,
        password: settings.password || null, // null = pas de mot de passe
        maxPlayers: settings.maxPlayers || config.game.maxPlayersPerGame,
        mode: settings.mode || 'normal',

        // Règles
        rules: {
            stacking: settings.rules?.stacking !== false,
            reverse: settings.rules?.reverse !== false,
            drawAndPlay: settings.rules?.drawAndPlay === true,
            scoring: settings.rules?.scoring || 'standard'
        },

        // Joueurs
        players: [{
            id: host.id,
            socketId: host.socketId,
            name: host.name,
            avatar: host.avatar,
            elo: host.elo || config.elo.initialRating,
            isBot: false,
            isReady: false,
            isHost: true,
            joinedAt: helpers.now()
        }],

        // Spectateurs
        spectators: [],

        // État
        status: 'waiting', // waiting, playing, finished
        gameId: null, // ID de la partie en cours

        // Métadonnées
        createdAt: helpers.now(),
        updatedAt: helpers.now()
    };

    rooms.set(roomId, room);

    logger.info(`🏠 Salle créée: ${roomId} par ${host.name}`);

    return room;
}

// ===== RÉCUPÉRATION =====
function getRoom(roomId) {
    return rooms.get(roomId) || null;
}

function getAllRooms() {
    return Array.from(rooms.values());
}

function getPublicRooms() {
    return Array.from(rooms.values())
        .filter(r => r.isPublic && r.status === 'waiting')
        .map(r => serializeRoomLight(r));
}

function getActiveRooms() {
    return Array.from(rooms.values()).filter(r => r.status === 'playing');
}

// ===== REJOINDRE UNE SALLE =====
function joinRoom(roomId, player, password = null) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };
    if (room.status !== 'waiting') return { error: 'La partie a déjà commencé' };
    if (room.players.length >= room.maxPlayers) return { error: 'Salle complète' };
    if (room.players.find(p => p.id === player.id)) {
        return { error: 'Vous êtes déjà dans cette salle' };
    }

    // Vérifier mot de passe
    if (room.password && room.password !== password) {
        return { error: 'Mot de passe incorrect', requiresPassword: true };
    }

    const newPlayer = {
        id: player.id,
        socketId: player.socketId,
        name: player.name,
        avatar: player.avatar,
        elo: player.elo || config.elo.initialRating,
        isBot: false,
        isReady: false,
        isHost: false,
        joinedAt: helpers.now()
    };

    room.players.push(newPlayer);
    room.updatedAt = helpers.now();

    logger.info(`🏠 ${player.name} a rejoint la salle ${roomId}`);

    return { success: true, room, player: newPlayer };
}

// ===== QUITTER UNE SALLE =====
function leaveRoom(roomId, playerId) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };

    const index = room.players.findIndex(p => p.id === playerId);
    if (index === -1) return { error: 'Joueur introuvable' };

    const player = room.players[index];
    room.players.splice(index, 1);
    room.updatedAt = helpers.now();

    logger.info(`🏠 ${player.name} a quitté la salle ${roomId}`);

    // Si l'hôte part, transférer ou supprimer
    if (player.isHost) {
        if (room.players.length > 0) {
            // Transférer l'hôte au joueur suivant
            room.players[0].isHost = true;
            room.hostId = room.players[0].id;
            room.hostName = room.players[0].name;
            room.hostAvatar = room.players[0].avatar;
            logger.info(`🏠 Nouvel hôte de ${roomId}: ${room.hostName}`);
        } else {
            // Supprimer la salle
            rooms.delete(roomId);
            logger.info(`🏠 Salle ${roomId} supprimée (vide)`);
            return { success: true, deleted: true };
        }
    }

    return { success: true, room };
}

// ===== BOT =====
function addBot(roomId, botInfo = {}) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };
    if (room.status !== 'waiting') return { error: 'Déjà commencé' };
    if (room.players.length >= room.maxPlayers) return { error: 'Salle complète' };

    const existingNames = room.players.map(p => p.name);
    const botName = botInfo.name || generateBotName(existingNames);

    const bot = {
        id: helpers.generateId('bot'),
        socketId: null,
        name: botName,
        avatar: 'bot',
        elo: config.elo.initialRating,
        isBot: true,
        botDifficulty: botInfo.difficulty || 'medium',
        botPersonality: botInfo.personality || 'balanced',
        isReady: true,
        isHost: false,
        joinedAt: helpers.now()
    };

    room.players.push(bot);
    room.updatedAt = helpers.now();

    logger.info(`🏠 Bot ${botName} ajouté à la salle ${roomId}`);

    return { success: true, room, bot };
}

function removeBot(roomId, botId) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };

    room.players = room.players.filter(p => p.id !== botId);
    room.updatedAt = helpers.now();

    return { success: true, room };
}

// ===== READY =====
function setPlayerReady(roomId, playerId, isReady) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };

    const player = room.players.find(p => p.id === playerId);
    if (!player) return { error: 'Joueur introuvable' };

    player.isReady = isReady;
    room.updatedAt = helpers.now();

    return { success: true, room };
}

function isEveryoneReady(roomId) {
    const room = rooms.get(roomId);
    if (!room) return false;

    // L'hôte est toujours considéré comme prêt
    return room.players.every(p => p.isReady || p.isHost);
}

// ===== CHAT DE SALLE =====
function addRoomMessage(roomId, player, message) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };

    if (!room.chat) room.chat = [];

    const chatMessage = {
        id: helpers.generateId('rmsg'),
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        message: helpers.sanitizeString(message, 200),
        timestamp: helpers.now()
    };

    room.chat.push(chatMessage);

    if (room.chat.length > 100) {
        room.chat.shift();
    }

    return { success: true, message: chatMessage };
}

function getRoomChat(roomId, limit = 50) {
    const room = rooms.get(roomId);
    if (!room || !room.chat) return [];
    return room.chat.slice(-limit);
}

// ===== LANCEMENT DE PARTIE =====
function startRoomGame(roomId, gameManager) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };
    if (room.status !== 'waiting') return { error: 'Déjà commencé' };
    if (room.players.length < config.game.minPlayersPerGame) {
        return { error: 'Pas assez de joueurs' };
    }
    if (!isEveryoneReady(roomId)) {
        return { error: 'Tous les joueurs ne sont pas prêts' };
    }

    // Créer la partie
    const host = room.players.find(p => p.isHost);
    const game = gameManager.createGame(
        { id: host.id, socketId: host.socketId, name: host.name, avatar: host.avatar },
        {
            maxPlayers: room.maxPlayers,
            mode: room.mode,
            rules: room.rules
        }
    );

    // Ajouter les autres joueurs
    room.players.forEach(p => {
        if (p.id === host.id) return;
        gameManager.addPlayer(game.id, {
            id: p.id,
            socketId: p.socketId,
            name: p.name,
            avatar: p.avatar,
            elo: p.elo
        });

        // Si c'est un bot
        if (p.isBot) {
            const gamePlayer = game.players.find(gp => gp.id === p.id);
            if (gamePlayer) {
                gamePlayer.isBot = true;
                gamePlayer.botDifficulty = p.botDifficulty || 'medium';
                gamePlayer.botPersonality = p.botPersonality || 'balanced';
            }
        }
    });

    room.status = 'playing';
    room.gameId = game.id;
    room.updatedAt = helpers.now();

    logger.info(`🏠 Partie lancée depuis la salle ${roomId}: ${game.id}`);

    return { success: true, room, game };
}

// ===== FIN DE PARTIE =====
function endRoomGame(roomId) {
    const room = rooms.get(roomId);
    if (!room) return;

    room.status = 'waiting';
    room.gameId = null;
    room.updatedAt = helpers.now();

    // Réinitialiser les statuts ready
    room.players.forEach(p => {
        p.isReady = false;
    });

    logger.info(`🏠 Partie terminée dans la salle ${roomId}`);
}

// ===== CONFIGURATION =====
function updateRoomSettings(roomId, playerId, settings) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };
    if (room.hostId !== playerId) return { error: 'Seul l\'hôte peut modifier' };

    if (settings.name) room.name = helpers.sanitizeString(settings.name, 50);
    if (settings.description) room.description = helpers.sanitizeString(settings.description, 200);
    if (settings.isPublic !== undefined) room.isPublic = settings.isPublic;
    if (settings.password !== undefined) room.password = settings.password;
    if (settings.maxPlayers) room.maxPlayers = settings.maxPlayers;
    if (settings.mode) room.mode = settings.mode;
    if (settings.rules) room.rules = { ...room.rules, ...settings.rules };

    room.updatedAt = helpers.now();

    return { success: true, room };
}

// ===== INVITATION =====
function invitePlayer(roomId, playerId, guestId) {
    const room = rooms.get(roomId);
    if (!room) return { error: 'Salle introuvable' };
    if (room.hostId !== playerId && !room.players.find(p => p.id === playerId)) {
        return { error: 'Vous n\'êtes pas dans la salle' };
    }

    return {
        success: true,
        invitation: {
            roomId,
            roomName: room.name,
            fromPlayerId: playerId,
            toPlayerId: guestId,
            sentAt: helpers.now()
        }
    };
}

// ===== SÉRIALISATION =====
function serializeRoom(room) {
    return {
        id: room.id,
        hostId: room.hostId,
        hostName: room.hostName,
        hostAvatar: room.hostAvatar,
        name: room.name,
        description: room.description,
        isPublic: room.isPublic,
        hasPassword: !!room.password,
        maxPlayers: room.maxPlayers,
        mode: room.mode,
        rules: room.rules,
        status: room.status,
        gameId: room.gameId,
        players: room.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            elo: p.elo,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty,
            isReady: p.isReady,
            isHost: p.isHost,
            joinedAt: p.joinedAt
        })),
        chat: (room.chat || []).slice(-30),
        createdAt: room.createdAt
    };
}

function serializeRoomLight(room) {
    return {
        id: room.id,
        name: room.name,
        hostName: room.hostName,
        hostAvatar: room.hostAvatar,
        playerCount: room.players.length,
        maxPlayers: room.maxPlayers,
        mode: room.mode,
        hasPassword: !!room.password,
        status: room.status,
        createdAt: room.createdAt
    };
}

// ===== NETTOYAGE =====
function cleanupInactiveRooms() {
    const now = Date.now();
    const timeout = 30 * 60 * 1000; // 30 minutes

    let deleted = 0;
    rooms.forEach((room, roomId) => {
        // Supprimer les salles vides ou inactives
        if (room.players.length === 0) {
            rooms.delete(roomId);
            deleted++;
            return;
        }

        const lastUpdate = new Date(room.updatedAt).getTime();
        if (now - lastUpdate > timeout && room.status === 'waiting') {
            rooms.delete(roomId);
            deleted++;
        }
    });

    if (deleted > 0) {
        logger.info(`🏠 ${deleted} salles inactives supprimées`);
    }

    return deleted;
}

// Nettoyage périodique
setInterval(cleanupInactiveRooms, 10 * 60 * 1000);

// ===== STATISTIQUES =====
function getStats() {
    const all = getAllRooms();
    return {
        total: all.length,
        waiting: all.filter(r => r.status === 'waiting').length,
        playing: all.filter(r => r.status === 'playing').length,
        public: all.filter(r => r.isPublic).length,
        private: all.filter(r => !r.isPublic).length,
        totalPlayers: all.reduce((sum, r) => sum + r.players.length, 0)
    };
}

// ===== NOM DE BOT =====
const BOT_NAMES = [
    '🤖 Robo', '🎩 Alfred', '🧠 Einstein', '🎯 Sniper', '🦊 Renard',
    '🐺 Loup', '🦉 Hibou', '🐉 Dragon', '👾 Pixel', '🎲 Lucky'
];

function generateBotName(existingNames = []) {
    const available = BOT_NAMES.filter(n => !existingNames.includes(n));
    if (available.length === 0) {
        return `🤖 Bot ${Math.floor(Math.random() * 10000)}`;
    }
    return helpers.pickRandom(available);
}

// ===== EXPORT =====
module.exports = {
    createRoom,
    getRoom,
    getAllRooms,
    getPublicRooms,
    getActiveRooms,
    joinRoom,
    leaveRoom,
    addBot,
    removeBot,
    setPlayerReady,
    isEveryoneReady,
    addRoomMessage,
    getRoomChat,
    startRoomGame,
    endRoomGame,
    updateRoomSettings,
    invitePlayer,
    serializeRoom,
    serializeRoomLight,
    cleanupInactiveRooms,
    getStats,
    generateBotName,
    rooms
};