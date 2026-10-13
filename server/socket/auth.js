// ===== server/socket/auth.js =====
// Authentification et gestion des sessions joueurs

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const profiles = require('../data/profiles');

// ===== STOCKAGE EN MÉMOIRE =====
// socketId -> { playerId, username, avatar, connectedAt }
const sessions = new Map();

// playerId -> Set<socketId> (pour gérer les multi-onglets)
const playerSockets = new Map();

// ===== CRÉATION DE SESSION =====
function createSession(socket, data = {}) {
    const { playerId = null, username = null, avatar = 'default' } = data;

    // Si un playerId est fourni, on vérifie qu'il existe
    let profile = null;
    let finalPlayerId = playerId;

    if (playerId) {
        profile = profiles.getProfile(playerId);
    }

    // Si le profil n'existe pas, on en crée un nouveau
    if (!profile) {
        finalPlayerId = playerId || helpers.generatePlayerId();
        profile = profiles.createProfile(finalPlayerId, {
            username: username || `Joueur_${finalPlayerId.slice(-6)}`,
            avatar
        });
    }

    // Créer la session
    const session = {
        socketId: socket.id,
        playerId: finalPlayerId,
        username: profile.username,
        avatar: profile.avatar,
        elo: profile.elo,
        connectedAt: new Date().toISOString(),
        isGuest: !playerId
    };

    sessions.set(socket.id, session);

    // Associer le socket au joueur
    if (!playerSockets.has(finalPlayerId)) {
        playerSockets.set(finalPlayerId, new Set());
    }
    playerSockets.get(finalPlayerId).add(socket.id);

    // Attacher les infos au socket pour un accès rapide
    socket.playerId = finalPlayerId;
    socket.username = profile.username;
    socket.avatar = profile.avatar;

    logger.player(`Session créée: ${profile.username}`, {
        playerId: finalPlayerId,
        socketId: socket.id,
        isGuest: session.isGuest
    });

    return {
        playerId: finalPlayerId,
        username: profile.username,
        avatar: profile.avatar,
        elo: profile.elo,
        isGuest: session.isGuest
    };
}

// ===== RÉCUPÉRATION DE SESSION =====
function getSession(socketId) {
    return sessions.get(socketId) || null;
}

function getSessionBySocket(socket) {
    return sessions.get(socket.id) || null;
}

// ===== SUPPRESSION DE SESSION =====
function removeSession(socket) {
    const session = sessions.get(socket.id);
    if (!session) return null;

    // Retirer le socket du joueur
    const playerSocketsSet = playerSockets.get(session.playerId);
    if (playerSocketsSet) {
        playerSocketsSet.delete(socket.id);
        if (playerSocketsSet.size === 0) {
            playerSockets.delete(session.playerId);
        }
    }

    sessions.delete(socket.id);

    logger.player(`Session terminée: ${session.username}`, {
        playerId: session.playerId,
        socketId: socket.id
    });

    return session;
}

// ===== VÉRIFIER SI UN JOUEUR EST CONNECTÉ =====
function isPlayerConnected(playerId) {
    const sockets = playerSockets.get(playerId);
    return sockets && sockets.size > 0;
}

// ===== OBTENIR LES SOCKETS D'UN JOUEUR =====
function getPlayerSockets(playerId) {
    const sockets = playerSockets.get(playerId);
    return sockets ? Array.from(sockets) : [];
}

// ===== OBTENIR LE NOMBRE DE JOUEURS EN LIGNE =====
function getOnlineCount() {
    return playerSockets.size;
}

// ===== OBTENIR TOUS LES JOUEURS EN LIGNE =====
function getOnlinePlayers() {
    const players = [];
    playerSockets.forEach((sockets, playerId) => {
        const session = sessions.get(Array.from(sockets)[0]);
        if (session) {
            players.push({
                playerId: session.playerId,
                username: session.username,
                avatar: session.avatar,
                elo: session.elo
            });
        }
    });
    return players;
}

// ===== METTRE À JOUR UN PROFIL =====
function updateProfile(playerId, updates) {
    const profile = profiles.updateProfile(playerId, updates);
    if (!profile) return null;

    // Mettre à jour toutes les sessions actives de ce joueur
    const sockets = playerSockets.get(playerId);
    if (sockets) {
        sockets.forEach(socketId => {
            const session = sessions.get(socketId);
            if (session) {
                if (updates.username) session.username = updates.username;
                if (updates.avatar) session.avatar = updates.avatar;
                if (updates.elo !== undefined) session.elo = updates.elo;
            }
        });
    }

    return profile;
}

// ===== NETTOYER LES SESSIONS ORPHELINES =====
function cleanupOrphanSessions(io) {
    let cleaned = 0;
    sessions.forEach((session, socketId) => {
        if (!io.sockets.sockets.has(socketId)) {
            removeSession({ id: socketId });
            cleaned++;
        }
    });

    if (cleaned > 0) {
        logger.info(`${cleaned} sessions orphelines nettoyées`);
    }

    return cleaned;
}

// ===== STATISTIQUES =====
function getStats() {
    return {
        activeSessions: sessions.size,
        onlinePlayers: playerSockets.size,
        averageSocketsPerPlayer: playerSockets.size > 0
            ? (sessions.size / playerSockets.size).toFixed(2)
            : 0
    };
}

// ===== EXPORT =====
module.exports = {
    createSession,
    getSession,
    getSessionBySocket,
    removeSession,
    isPlayerConnected,
    getPlayerSockets,
    getOnlineCount,
    getOnlinePlayers,
    updateProfile,
    cleanupOrphanSessions,
    getStats,
    sessions,
    playerSockets
};