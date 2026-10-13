// ===== server/ai/botMemory.js =====
// Mémoire des bots : apprentissage des habitudes des joueurs

const config = require('../config');
const logger = require('../utils/logger');

// ===== STOCKAGE =====
const memories = new Map(); // botId -> Memory

// ===== STRUCTURE DE MÉMOIRE =====
function createMemory(botId) {
    return {
        botId,
        createdAt: new Date().toISOString(),

        // ===== STATISTIQUES DES ADVERSAIRES =====
        opponentStats: {
            // Format : { playerId: { favoriteSuit, favoriteColor, playStyle, ... } }
        },

        // ===== STATISTIQUES PAR COULEUR =====
        suitStats: {
            pique: { played: 0, opponentPlayed: 0, wins: 0 },
            carreau: { played: 0, opponentPlayed: 0, wins: 0 },
            coeur: { played: 0, opponentPlayed: 0, wins: 0 },
            trefle: { played: 0, opponentPlayed: 0, wins: 0 }
        },

        // ===== STATISTIQUES PAR CARTE =====
        cardStats: {
            // Format : { cardRank: { timesPlayed, timesWon } }
        },

        // ===== STATISTIQUES GÉNÉRALES =====
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,

        // ===== DERNIÈRE MISE À JOUR =====
        lastUpdate: new Date().toISOString()
    };
}

// ===== RÉCUPÉRATION =====
function getMemory(botId) {
    if (!memories.has(botId)) {
        memories.set(botId, createMemory(botId));
    }
    return memories.get(botId);
}

function getAllMemories() {
    return Array.from(memories.values());
}

// ===== ENREGISTRER UN COUP =====
function recordMove(botId, move) {
    const memory = getMemory(botId);

    // Mettre à jour les stats de couleur
    if (move.card && move.card.suit && memory.suitStats[move.card.suit]) {
        memory.suitStats[move.card.suit].played++;
    }

    // Mettre à jour les stats de carte
    if (move.card && move.card.rank) {
        if (!memory.cardStats[move.card.rank]) {
            memory.cardStats[move.card.rank] = { timesPlayed: 0, timesWon: 0 };
        }
        memory.cardStats[move.card.rank].timesPlayed++;
    }

    memory.lastUpdate = new Date().toISOString();
    return memory;
}

// ===== ENREGISTRER UNE OBSERVATION D'UN ADVERSAIRE =====
function recordOpponentMove(botId, opponentId, move) {
    const memory = getMemory(botId);

    if (!memory.opponentStats[opponentId]) {
        memory.opponentStats[opponentId] = {
            id: opponentId,
            gamesPlayed: 0,
            favoriteSuit: null,
            favoriteColor: null,
            suitCounts: { pique: 0, carreau: 0, coeur: 0, trefle: 0 },
            colorCounts: { red: 0, black: 0 },
            playStyle: 'unknown',
            specialCardsUsed: 0,
            jacksUsed: 0,
            jokersUsed: 0,
            sevensUsed: 0,
            acesUsed: 0,
            totalMoves: 0,
            lastSeen: new Date().toISOString()
        };
    }

    const stats = memory.opponentStats[opponentId];

    // Mettre à jour les compteurs
    if (move.card) {
        if (move.card.suit && stats.suitCounts[move.card.suit] !== undefined) {
            stats.suitCounts[move.card.suit]++;
        }
        if (move.card.color && stats.colorCounts[move.card.color] !== undefined) {
            stats.colorCounts[move.card.color]++;
        }

        if (move.card.type === 'joker') stats.jokersUsed++;
        if (move.card.rank === '7') stats.sevensUsed++;
        if (move.card.rank === 'A') stats.acesUsed++;
        if (move.card.rank === 'J') stats.jacksUsed++;
        if (['7', 'A', 'J', 'K'].includes(move.card.rank)) stats.specialCardsUsed++;
    }

    stats.totalMoves++;
    stats.lastSeen = new Date().toISOString();

    // Mettre à jour la couleur favorite
    let favoriteSuit = null;
    let maxSuitCount = 0;
    Object.keys(stats.suitCounts).forEach(suit => {
        if (stats.suitCounts[suit] > maxSuitCount) {
            maxSuitCount = stats.suitCounts[suit];
            favoriteSuit = suit;
        }
    });
    stats.favoriteSuit = favoriteSuit;

    // Mettre à jour la couleur favorite (rouge/noir)
    stats.favoriteColor = stats.colorCounts.red >= stats.colorCounts.black ? 'red' : 'black';

    // Déterminer le style de jeu
    if (stats.totalMoves > 10) {
        const specialRatio = stats.specialCardsUsed / stats.totalMoves;
        const jokerRatio = stats.jokersUsed / stats.totalMoves;

        if (specialRatio > 0.4 || jokerRatio > 0.15) {
            stats.playStyle = 'aggressive';
        } else if (specialRatio < 0.1) {
            stats.playStyle = 'defensive';
        } else {
            stats.playStyle = 'balanced';
        }
    }

    memory.lastUpdate = new Date().toISOString();
    return memory;
}

// ===== ENREGISTRER LA FIN D'UNE PARTIE =====
function recordGameResult(botId, result) {
    const memory = getMemory(botId);

    memory.totalGames++;

    if (result.won) {
        memory.totalWins++;
    } else {
        memory.totalLosses++;
    }

    // Mettre à jour les stats par couleur
    if (result.winningSuit && memory.suitStats[result.winningSuit]) {
        memory.suitStats[result.winningSuit].wins++;
    }

    // Mettre à jour les stats par carte
    if (result.winningCard && memory.cardStats[result.winningCard]) {
        memory.cardStats[result.winningCard].timesWon++;
    }

    memory.lastUpdate = new Date().toISOString();
    return memory;
}

// ===== PRÉDIRE LE COUP D'UN ADVERSAIRE =====
function predictOpponentMove(botId, opponentId) {
    const memory = getMemory(botId);
    const stats = memory.opponentStats[opponentId];

    if (!stats || stats.totalMoves < 5) {
        return null; // Pas assez de données
    }

    return {
        favoriteSuit: stats.favoriteSuit,
        favoriteColor: stats.favoriteColor,
        playStyle: stats.playStyle,
        likelyToPlaySpecial: stats.specialCardsUsed / stats.totalMoves > 0.3,
        likelyToPlayJoker: stats.jokersUsed / stats.totalMoves > 0.1,
        likelyToPlaySeven: stats.sevensUsed / stats.totalMoves > 0.15,
        likelyToPlayAce: stats.acesUsed / stats.totalMoves > 0.1
    };
}

// ===== OBTENIR LES STATISTIQUES D'UN ADVERSAIRE =====
function getOpponentStats(botId, opponentId) {
    const memory = getMemory(botId);
    return memory.opponentStats[opponentId] || null;
}

// ===== OBTENIR LE STYLE DE JEU D'UN ADVERSAIRE =====
function getOpponentPlayStyle(botId, opponentId) {
    const stats = getOpponentStats(botId, opponentId);
    return stats ? stats.playStyle : 'unknown';
}

// ===== RÉINITIALISER UNE MÉMOIRE =====
function resetMemory(botId) {
    memories.set(botId, createMemory(botId));
    logger.bot(`Mémoire réinitialisée pour ${botId}`);
}

// ===== NETTOYER LES VIEILLES MÉMOIRES =====
function cleanupOldMemories(maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 jours
    const now = Date.now();
    let cleaned = 0;

    memories.forEach((memory, botId) => {
        const lastUpdate = new Date(memory.lastUpdate).getTime();
        if (now - lastUpdate > maxAge) {
            memories.delete(botId);
            cleaned++;
        }
    });

    if (cleaned > 0) {
        logger.bot(`${cleaned} mémoires nettoyées`);
    }

    return cleaned;
}

// ===== STATISTIQUES GLOBALES =====
function getGlobalStats() {
    const all = getAllMemories();

    return {
        totalBots: all.length,
        totalGames: all.reduce((sum, m) => sum + m.totalGames, 0),
        totalWins: all.reduce((sum, m) => sum + m.totalWins, 0),
        totalLosses: all.reduce((sum, m) => sum + m.totalLosses, 0),
        averageWinRate: all.length > 0
            ? all.reduce((sum, m) => sum + (m.totalGames > 0 ? m.totalWins / m.totalGames : 0), 0) / all.length
            : 0
    };
}

// ===== EXPORT =====
module.exports = {
    createMemory,
    getMemory,
    getAllMemories,
    recordMove,
    recordOpponentMove,
    recordGameResult,
    predictOpponentMove,
    getOpponentStats,
    getOpponentPlayStyle,
    resetMemory,
    cleanupOldMemories,
    getGlobalStats
};