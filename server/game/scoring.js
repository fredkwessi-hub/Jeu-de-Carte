// ===== server/game/scoring.js =====
// Calcul des scores en fin de manche et fin de partie

const config = require('../config');
const logger = require('../utils/logger');
const gameLogic = require('./gameLogic');

// ===== CALCUL DU SCORE D'UNE MAIN =====
/**
 * Calcule le score d'une main (points des cartes restantes)
 * Utilisé quand un joueur termine : les autres piochent des points
 */
function calculateHandScore(hand) {
    return hand.reduce((total, card) => total + (card.value || 0), 0);
}

// ===== CALCUL DES SCORES DE FIN DE MANCHE =====
/**
 * Quand un joueur termine, on calcule les points des autres
 * Le premier à finir ne prend pas de points
 */
function calculateRoundScores(game) {
    const scores = {};

    game.players.forEach(player => {
        // Le joueur qui a fini en premier ne prend pas de points
        if (player.rank === 1) {
            scores[player.id] = 0;
        } else {
            scores[player.id] = calculateHandScore(player.hand);
        }
    });

    return scores;
}

// ===== APPLIQUER LES SCORES DE FIN DE MANCHE =====
function applyRoundScores(game) {
    const roundScores = calculateRoundScores(game);

    game.players.forEach(player => {
        const roundScore = roundScores[player.id] || 0;
        player.totalScore += roundScore;
        player.lastRoundScore = roundScore;
    });

    // Ajouter au log
    const scoreList = game.players
        .map(p => `${p.name}: ${p.lastRoundScore} pts (total: ${p.totalScore})`)
        .join(' | ');

    return {
        roundScores,
        totals: game.players.map(p => ({
            id: p.id,
            name: p.name,
            roundScore: p.lastRoundScore,
            totalScore: p.totalScore
        }))
    };
}

// ===== VÉRIFIER SI UN JOUEUR A PERDU (mode points) =====
function checkLoserByScore(game) {
    if (game.settings.rules.scoring !== 'points') return null;

    const maxScore = config.scoring.maxPointsBeforeLosing;
    const loser = game.players.find(p => p.totalScore >= maxScore);

    if (loser) {
        logger.game(`💀 ${loser.name} a atteint ${loser.totalScore} points et perd la partie !`);
        return loser;
    }

    return null;
}

// ===== CALCUL DES POINTS DE VICTOIRE (mode normal) =====
function calculateVictoryPoints(game) {
    // En mode normal, on attribue des points de victoire selon le classement
    const points = {};

    game.finishedPlayers.forEach(player => {
        let victoryPoints = 0;

        if (player.rank === 1) victoryPoints = 10;      // Vainqueur
        else if (player.rank === 2) victoryPoints = 5;  // 2ème
        else if (player.rank === 3) victoryPoints = 2;  // 3ème
        else victoryPoints = 0;                          // Autres

        points[player.id] = victoryPoints;
    });

    return points;
}

// ===== CALCUL DES RÉCOMPENSES FINALES =====
function calculateFinalRewards(game) {
    const winner = game.finishedPlayers[0];
    const last = game.finishedPlayers[game.finishedPlayers.length - 1];

    if (!winner || !last) return null;

    return {
        winner: {
            id: winner.id,
            name: winner.name,
            points: 100,
            badge: '🥇'
        },
        second: game.finishedPlayers[1] ? {
            id: game.finishedPlayers[1].id,
            name: game.finishedPlayers[1].name,
            points: 50,
            badge: '🥈'
        } : null,
        third: game.finishedPlayers[2] ? {
            id: game.finishedPlayers[2].id,
            name: game.finishedPlayers[2].name,
            points: 25,
            badge: '🥉'
        } : null,
        last: {
            id: last.id,
            name: last.name,
            points: -50,
            badge: '💀'
        }
    };
}

// ===== STATISTIQUES D'UNE PARTIE =====
function getGameSummary(game) {
    const winner = game.finishedPlayers[0];
    const duration = game.startedAt
        ? Date.now() - new Date(game.startedAt).getTime()
        : 0;

    return {
        gameId: game.id,
        mode: game.settings.mode,
        duration,
        turnCount: game.turnCount,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            rank: p.rank,
            totalScore: p.totalScore,
            cardsLeft: p.hand.length,
            isBot: p.isBot
        })),
        winner: winner ? {
            id: winner.id,
            name: winner.name
        } : null,
        finishedAt: game.finishedAt
    };
}

// ===== SCORE ELO (délégué au module elo) =====
// Voir server/game/elo.js

// ===== EXPORT =====
module.exports = {
    calculateHandScore,
    calculateRoundScores,
    applyRoundScores,
    checkLoserByScore,
    calculateVictoryPoints,
    calculateFinalRewards,
    getGameSummary
};