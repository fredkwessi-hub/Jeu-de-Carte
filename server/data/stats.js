// ===== server/data/stats.js =====
// Statistiques agrégées et analytics

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const profiles = require('./profiles');

// ===== STOCKAGE =====
const matchHistory = []; // Historique des matchs
const dailyStats = new Map(); // date -> stats du jour

// ===== LIMITES =====
const MAX_HISTORY = 10000;

// ===== ENREGISTREMENT D'UN MATCH =====
function recordMatch(matchData) {
    const match = {
        id: helpers.generateId('match'),
        gameId: matchData.gameId,
        mode: matchData.mode || 'normal',
        playerCount: matchData.playerCount,
        duration: matchData.duration,
        turnCount: matchData.turnCount,
        finishedAt: helpers.now(),

        // Joueurs
        players: matchData.players.map(p => ({
            id: p.id,
            name: p.name,
            rank: p.rank,
            elo: p.elo,
            isBot: p.isBot,
            cardsLeft: p.cardsLeft,
            score: p.score
        })),

        // Vainqueur
        winner: matchData.players.find(p => p.rank === 1),

        // Carte centrale finale
        finalCenterCard: matchData.finalCenterCard,

        // Statistiques de la partie
        stats: {
            jokersPlayed: matchData.jokersPlayed || 0,
            sevensPlayed: matchData.sevensPlayed || 0,
            acesPlayed: matchData.acesPlayed || 0,
            jacksPlayed: matchData.jacksPlayed || 0,
            kingsPlayed: matchData.kingsPlayed || 0,
            totalDraws: matchData.totalDraws || 0,
            bankReshuffles: matchData.bankReshuffles || 0
        }
    };

    matchHistory.push(match);

    // Limiter la taille
    if (matchHistory.length > MAX_HISTORY) {
        matchHistory.shift();
    }

    // Mettre à jour les stats journalières
    updateDailyStats(match);

    // Mettre à jour les profils
    match.players.forEach(player => {
        if (player.isBot) return;

        const isWinner = player.rank === 1;
        const isLast = player.rank === match.playerCount;

        profiles.updateProfileAfterGame(player.id, {
            won: isWinner,
            newElo: player.elo,
            duration: match.duration,
            stats: {
                jokersPlayed: 0, // Sera incrémenté via les events
                cardsPlayed: 0
            }
        });
    });

    logger.info(`📊 Match enregistré: ${match.id}`, {
        winner: match.winner.name,
        playerCount: match.playerCount
    });

    return match;
}

// ===== STATS JOURNALIÈRES =====
function updateDailyStats(match) {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    if (!dailyStats.has(date)) {
        dailyStats.set(date, {
            date,
            matches: 0,
            players: new Set(),
            totalDuration: 0,
            totalTurns: 0,
            modes: { normal: 0, duel: 0, speed: 0, classic: 0, tournament: 0 }
        });
    }

    const stats = dailyStats.get(date);
    stats.matches++;
    stats.totalDuration += match.duration || 0;
    stats.totalTurns += match.turnCount || 0;
    stats.modes[match.mode] = (stats.modes[match.mode] || 0) + 1;

    match.players.forEach(p => {
        if (!p.isBot) stats.players.add(p.id);
    });
}

// ===== STATS D'UN JOUEUR =====
function getPlayerStats(playerId) {
    const playerMatches = matchHistory.filter(m =>
        m.players.some(p => p.id === playerId)
    );

    if (playerMatches.length === 0) {
        return {
            matchesPlayed: 0,
            wins: 0,
            winRate: 0,
            averageRank: 0,
            averageDuration: 0,
            favoriteMode: null,
            bestRank: null,
            worstRank: null
        };
    }

    const totalMatches = playerMatches.length;
    let totalRank = 0;
    let wins = 0;
    let totalDuration = 0;
    let bestRank = Infinity;
    let worstRank = 0;
    const modeCounts = {};

    playerMatches.forEach(match => {
        const player = match.players.find(p => p.id === playerId);
        if (!player) return;

        totalRank += player.rank;
        if (player.rank === 1) wins++;
        totalDuration += match.duration || 0;
        bestRank = Math.min(bestRank, player.rank);
        worstRank = Math.max(worstRank, player.rank);

        modeCounts[match.mode] = (modeCounts[match.mode] || 0) + 1;
    });

    // Trouver le mode favori
    let favoriteMode = null;
    let maxCount = 0;
    Object.keys(modeCounts).forEach(mode => {
        if (modeCounts[mode] > maxCount) {
            maxCount = modeCounts[mode];
            favoriteMode = mode;
        }
    });

    return {
        matchesPlayed: totalMatches,
        wins,
        losses: totalMatches - wins,
        winRate: Math.round((wins / totalMatches) * 100),
        averageRank: Math.round((totalRank / totalMatches) * 10) / 10,
        averageDuration: Math.round(totalDuration / totalMatches),
        favoriteMode,
        bestRank,
        worstRank,
        modeBreakdown: modeCounts
    };
}

// ===== STATS GLOBALES =====
function getGlobalStats() {
    if (matchHistory.length === 0) {
        return {
            totalMatches: 0,
            totalPlayers: 0,
            averageDuration: 0,
            averageTurns: 0,
            mostPlayedMode: null
        };
    }

    const uniquePlayers = new Set();
    let totalDuration = 0;
    let totalTurns = 0;
    const modeCounts = {};

    matchHistory.forEach(match => {
        match.players.forEach(p => {
            if (!p.isBot) uniquePlayers.add(p.id);
        });
        totalDuration += match.duration || 0;
        totalTurns += match.turnCount || 0;
        modeCounts[match.mode] = (modeCounts[match.mode] || 0) + 1;
    });

    let mostPlayedMode = null;
    let maxCount = 0;
    Object.keys(modeCounts).forEach(mode => {
        if (modeCounts[mode] > maxCount) {
            maxCount = modeCounts[mode];
            mostPlayedMode = mode;
        }
    });

    return {
        totalMatches: matchHistory.length,
        totalPlayers: uniquePlayers.size,
        averageDuration: Math.round(totalDuration / matchHistory.length),
        averageTurns: Math.round(totalTurns / matchHistory.length),
        mostPlayedMode,
        modeBreakdown: modeCounts
    };
}

// ===== STATS PAR CARTE =====
function getCardStats() {
    let jokersPlayed = 0;
    let sevensPlayed = 0;
    let acesPlayed = 0;
    let jacksPlayed = 0;
    let kingsPlayed = 0;

    matchHistory.forEach(match => {
        jokersPlayed += match.stats.jokersPlayed || 0;
        sevensPlayed += match.stats.sevensPlayed || 0;
        acesPlayed += match.stats.acesPlayed || 0;
        jacksPlayed += match.stats.jacksPlayed || 0;
        kingsPlayed += match.stats.kingsPlayed || 0;
    });

    return {
        jokersPlayed,
        sevensPlayed,
        acesPlayed,
        jacksPlayed,
        kingsPlayed,
        total: jokersPlayed + sevensPlayed + acesPlayed + jacksPlayed + kingsPlayed
    };
}

// ===== HISTORIQUE D'UN JOUEUR =====
function getMatchHistory(playerId, limit = 20) {
    return matchHistory
        .filter(m => m.players.some(p => p.id === playerId))
        .slice(-limit)
        .reverse()
        .map(match => {
            const player = match.players.find(p => p.id === playerId);
            return {
                matchId: match.id,
                gameId: match.gameId,
                mode: match.mode,
                date: match.finishedAt,
                duration: match.duration,
                rank: player ? player.rank : null,
                playerCount: match.playerCount,
                won: player && player.rank === 1,
                eloChange: player ? player.eloChange : null,
                winner: match.winner ? {
                    id: match.winner.id,
                    name: match.winner.name
                } : null
            };
        });
}

// ===== HISTORIQUE D'UN JOUEUR CONTRE UN AUTRE =====
function getHeadToHead(player1Id, player2Id) {
    const matches = matchHistory.filter(m =>
        m.players.some(p => p.id === player1Id) &&
        m.players.some(p => p.id === player2Id)
    );

    let player1Wins = 0;
    let player2Wins = 0;

    matches.forEach(match => {
        const p1 = match.players.find(p => p.id === player1Id);
        const p2 = match.players.find(p => p.id === player2Id);
        if (!p1 || !p2) return;

        if (p1.rank < p2.rank) player1Wins++;
        else if (p2.rank < p1.rank) player2Wins++;
    });

    return {
        totalMatches: matches.length,
        player1Wins,
        player2Wins,
        draws: matches.length - player1Wins - player2Wins,
        recentMatches: matches.slice(-5).reverse()
    };
}

// ===== TOP JOUEURS =====
function getTopPlayers(criteria = 'elo', limit = 10) {
    return profiles.getLeaderboard(limit);
}

function getTopWinners(limit = 10) {
    return profiles.getAllProfiles()
        .filter(p => p.gamesPlayed >= 5)
        .sort((a, b) => b.wins - a.wins)
        .slice(0, limit)
        .map((p, i) => ({
            rank: i + 1,
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            wins: p.wins,
            winRate: p.winRate
        }));
}

function getTopStreaks(limit = 10) {
    return profiles.getAllProfiles()
        .filter(p => p.longestWinStreak >= 3)
        .sort((a, b) => b.longestWinStreak - a.longestWinStreak)
        .slice(0, limit)
        .map((p, i) => ({
            rank: i + 1,
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            streak: p.longestWinStreak
        }));
}

// ===== STATS PAR JOUR =====
function getDailyStats(days = 7) {
    const result = [];
    const now = new Date();

    for (let i = days - 1; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];

        const stats = dailyStats.get(dateStr);
        if (stats) {
            result.push({
                date: dateStr,
                matches: stats.matches,
                players: stats.players.size,
                averageDuration: stats.matches > 0 ? Math.round(stats.totalDuration / stats.matches) : 0,
                modes: stats.modes
            });
        } else {
            result.push({
                date: dateStr,
                matches: 0,
                players: 0,
                averageDuration: 0,
                modes: {}
            });
        }
    }

    return result;
}

// ===== STATS HEBDOMADAIRES =====
function getWeeklyStats() {
    return getDailyStats(7);
}

function getMonthlyStats() {
    return getDailyStats(30);
}

// ===== ANALYSE DE TENDANCE =====
function getTrends() {
    const weekly = getDailyStats(7);
    const previous = getDailyStats(14).slice(0, 7);

    const currentMatches = weekly.reduce((sum, d) => sum + d.matches, 0);
    const previousMatches = previous.reduce((sum, d) => sum + d.matches, 0);

    const currentPlayers = weekly.reduce((sum, d) => sum + d.players, 0);
    const previousPlayers = previous.reduce((sum, d) => sum + d.players, 0);

    return {
        matches: {
            current: currentMatches,
            previous: previousMatches,
            trend: previousMatches > 0
                ? Math.round(((currentMatches - previousMatches) / previousMatches) * 100)
                : 0
        },
        players: {
            current: currentPlayers,
            previous: previousPlayers,
            trend: previousPlayers > 0
                ? Math.round(((currentPlayers - previousPlayers) / previousPlayers) * 100)
                : 0
        }
    };
}

// ===== ANALYSE D'UN JOUEUR =====
function analyzePlayer(playerId) {
    const stats = getPlayerStats(playerId);
    const history = getMatchHistory(playerId, 20);

    // Calculer la tendance (amélioration/déclin)
    let trend = 0;
    if (history.length >= 5) {
        const recent = history.slice(0, 5);
        const older = history.slice(5, 10);

        const recentAvg = recent.reduce((sum, m) => sum + (m.rank || 0), 0) / recent.length;
        const olderAvg = older.reduce((sum, m) => sum + (m.rank || 0), 0) / older.length;

        if (olderAvg > 0) {
            trend = Math.round(((olderAvg - recentAvg) / olderAvg) * 100);
        }
    }

    return {
        ...stats,
        trend,
        analysis: trend > 10 ? 'improving' : trend < -10 ? 'declining' : 'stable'
    };
}

// ===== NETTOYAGE =====
function cleanupOldStats(maxAgeDays = 90) {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);

    let cleaned = 0;
    for (let i = matchHistory.length - 1; i >= 0; i--) {
        const matchTime = new Date(matchHistory[i].finishedAt).getTime();
        if (matchTime < cutoff) {
            matchHistory.splice(i, 1);
            cleaned++;
        }
    }

    // Nettoyer les stats journalières  const dateCutoff = new Date(cutoff).toISOString().split('T')[0];
    dailyStats.forEach((stats, date) => {
        if (date < dateCutoff) {
            dailyStats.delete(date);
        }
    });

    if (cleaned > 0) {
        logger.info(`📊 ${cleaned} anciens matchs supprimés`);
    }

    return cleaned;
}

// ===== EXPORT =====
module.exports = {
    recordMatch,
    updateDailyStats,
    getPlayerStats,
    getGlobalStats,
    getCardStats,
    getMatchHistory,
    getHeadToHead,
    getTopPlayers,
    getTopWinners,
    getTopStreaks,
    getDailyStats,
    getWeeklyStats,
    getMonthlyStats,
    getTrends,
    analyzePlayer,
    cleanupOldStats,
    matchHistory,
    dailyStats
};