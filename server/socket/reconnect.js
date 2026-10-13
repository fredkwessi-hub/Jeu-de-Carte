// ===== server/socket/reconnect.js =====
// Gestion de la reconnexion des joueurs

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const gameManager = require('../game/gameManager');
const tournamentManager = require('../tournament/tournamentManager');

// ===== STOCKAGE DES DÉCONNEXIONS =====
// playerId -> { gameId, tournamentId, socketId, disconnectedAt, timeoutId }
const pendingReconnections = new Map();

// ===== ENREGISTRER UNE DÉCONNEXION =====
function registerDisconnection(playerId, data = {}) {
    const { gameId = null, tournamentId = null, socketId = null } = data;

    // Si une reconnexion est déjà en attente, on l'annule
    if (pendingReconnections.has(playerId)) {
        clearTimeout(pendingReconnections.get(playerId).timeoutId);
    }

    const entry = {
        playerId,
        gameId,
        tournamentId,
        socketId,
        disconnectedAt: Date.now(),
        timeoutId: null
    };

    // Programmer la suppression après le délai de reconnexion
    entry.timeoutId = setTimeout(() => {
        finalizeDisconnection(playerId);
    }, config.game.reconnectWindow);

    pendingReconnections.set(playerId, entry);

    logger.player(`Déconnexion enregistrée pour ${playerId}`, {
        gameId,
        tournamentId,
        window: config.game.reconnectWindow / 1000 + 's'
    });

    return entry;
}

// ===== TENTER UNE RECONNEXION =====
function tryReconnect(playerId, newSocket) {
    const entry = pendingReconnections.get(playerId);
    if (!entry) {
        return { success: false, reason: 'no_pending_reconnection' };
    }

    // Vérifier que le délai n'est pas dépassé
    const elapsed = Date.now() - entry.disconnectedAt;
    if (elapsed > config.game.reconnectWindow) {
        pendingReconnections.delete(playerId);
        return { success: false, reason: 'timeout_expired' };
    }

    // Annuler le timeout
    clearTimeout(entry.timeoutId);
    pendingReconnections.delete(playerId);

    // ===== RECONNEXION À UNE PARTIE =====
    if (entry.gameId) {
        const game = gameManager.getGame(entry.gameId);
        if (game) {
            const player = game.players.find(p => p.id === playerId);
            if (player && !player.isBot) {
                player.socketId = newSocket.id;
                player.isConnected = true;

                newSocket.join(entry.gameId);
                newSocket.playerId = playerId;

                logger.player(`Reconnexion à la partie ${entry.gameId}: ${player.name}`, {
                    elapsed: Math.round(elapsed / 1000) + 's'
                });

                return {
                    success: true,
                    type: 'game',
                    game,
                    player,
                    elapsed
                };
            }
        }
    }

    // ===== RECONNEXION À UN CHAMPIONNAT =====
    if (entry.tournamentId) {
        const tournament = tournamentManager.getTournament(entry.tournamentId);
        if (tournament) {
            const participant = tournament.participants.find(p => p.id === playerId);
            if (participant && !participant.isBot) {
                participant.isConnected = true;

                newSocket.join(entry.tournamentId);

                logger.tournament(`Reconnexion au championnat ${entry.tournamentId}: ${participant.name}`, {
                    elapsed: Math.round(elapsed / 1000) + 's'
                });

                return {
                    success: true,
                    type: 'tournament',
                    tournament,
                    participant,
                    elapsed
                };
            }
        }
    }

    return { success: false, reason: 'no_active_session' };
}

// ===== FINALISER UNE DÉCONNEXION (après le délai) =====
function finalizeDisconnection(playerId) {
    const entry = pendingReconnections.get(playerId);
    if (!entry) return;

    logger.player(`Délai de reconnexion expiré pour ${playerId}`, {
        gameId: entry.gameId,
        tournamentId: entry.tournamentId
    });

    // ===== QUITTER LA PARTIE =====
    if (entry.gameId) {
        const game = gameManager.getGame(entry.gameId);
        if (game) {
            const player = game.players.find(p => p.id === playerId);
            if (player) {
                // Marquer comme définitivement déconnecté
                player.isConnected = false;
                player.socketId = null;

                // Si la partie était en cours, on peut :
                // - Soit remplacer par un bot
                // - Soit terminer la partie
                if (game.status === 'playing') {
                    // Option 1 : remplacer par un bot
                    if (config.features.bots) {
                        player.isBot = true;
                        player.botDifficulty = 'medium';
                        player.botPersonality = 'balanced';
                        logger.bot(`Joueur ${player.name} remplacé par un bot dans ${entry.gameId}`);
                    }
                } else if (game.status === 'waiting') {
                    // Retirer complètement le joueur
                    gameManager.removePlayer(entry.gameId, playerId);
                }
            }
        }
    }

    // ===== QUITTER LE CHAMPIONNAT =====
    if (entry.tournamentId) {
        const tournament = tournamentManager.getTournament(entry.tournamentId);
        if (tournament) {
            const participant = tournament.participants.find(p => p.id === playerId);
            if (participant) {
                participant.isConnected = false;

                // Si le championnat est en cours, remplacer par un bot
                if (tournament.status === 'playing' && config.features.bots) {
                    participant.isBot = true;
                    participant.botDifficulty = 'medium';
                    logger.bot(`Participant ${participant.name} remplacé par un bot dans ${entry.tournamentId}`);
                } else if (tournament.status === 'lobby') {
                    // Retirer du lobby
                    tournamentManager.removeParticipant(entry.tournamentId, playerId);
                }
            }
        }
    }

    pendingReconnections.delete(playerId);
}

// ===== VÉRIFIER SI UNE RECONNEXION EST POSSIBLE =====
function hasPendingReconnection(playerId) {
    return pendingReconnections.has(playerId);
}

// ===== OBTENIR LES INFOS DE RECONNEXION =====
function getReconnectionInfo(playerId) {
    const entry = pendingReconnections.get(playerId);
    if (!entry) return null;

    return {
        gameId: entry.gameId,
        tournamentId: entry.tournamentId,
        elapsed: Date.now() - entry.disconnectedAt,
        remaining: Math.max(0, config.game.reconnectWindow - (Date.now() - entry.disconnectedAt))
    };
}

// ===== NETTOYER LES VIEILLES RECONNEXIONS =====
function cleanupOldReconnections() {
    const now = Date.now();
    let cleaned = 0;

    pendingReconnections.forEach((entry, playerId) => {
        if (now - entry.disconnectedAt > config.game.reconnectWindow * 2) {
            clearTimeout(entry.timeoutId);
            pendingReconnections.delete(playerId);
            cleaned++;
        }
    });

    if (cleaned > 0) {
        logger.info(`${cleaned} reconnexions expirées nettoyées`);
    }

    return cleaned;
}

// ===== EXPORT =====
module.exports = {
    registerDisconnection,
    tryReconnect,
    finalizeDisconnection,
    hasPendingReconnection,
    getReconnectionInfo,
    cleanupOldReconnections,
    pendingReconnections
};