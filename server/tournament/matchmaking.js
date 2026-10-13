// ===== server/tournament/matchmaking.js =====
// Appariement intelligent des joueurs pour les tournois

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const elo = require('../game/elo');

// ===== APPARIEMENT ALÉATOIRE =====
function randomPairing(participants) {
    const shuffled = helpers.shuffleArray(participants);
    const pairs = [];

    for (let i = 0; i < shuffled.length; i += 2) {
        pairs.push({
            player1: shuffled[i],
            player2: shuffled[i + 1] || null
        });
    }

    return pairs;
}

// ===== APPARIEMENT PAR ELO (équilibré) =====
/**
 * Apparie les joueurs de niveaux proches
 * Évite les écarts trop importants
 */
function eloPairing(participants) {
    // Trier par ELO
    const sorted = [...participants].sort((a, b) => (b.elo || 1000) - (a.elo || 1000));

    const pairs = [];
    for (let i = 0; i < sorted.length; i += 2) {
        pairs.push({
            player1: sorted[i],
            player2: sorted[i + 1] || null
        });
    }

    return pairs;
}

// ===== APPARIEMENT PAR TÊTE DE SÉRIE =====
/**
 * Les meilleurs joueurs sont répartis pour ne pas se rencontrer trop tôt
 * Format standard des tournois (1er vs dernier, 2ème vs avant-dernier, etc.)
 */
function seededPairing(participants) {
    // Trier par ELO décroissant
    const sorted = [...participants].sort((a, b) => (b.elo || 1000) - (a.elo || 1000));

    const count = sorted.length;
    const pairs = [];

    // Appariement : 1er vs N, 2ème vs N-1, etc.
    for (let i = 0; i < count / 2; i++) {
        pairs.push({
            player1: sorted[i],
            player2: sorted[count - 1 - i]
        });
    }

    return pairs;
}

// ===== APPARIEMENT ÉVITANT LES REVANCHES =====
/**
 * Évite de refaire jouer deux joueurs qui se sont déjà affrontés
 * Utilise un historique des matchs
 */
function avoidRematchPairing(participants, previousMatches = []) {
    // Créer un set des paires déjà jouées
    const playedPairs = new Set();
    previousMatches.forEach(m => {
        if (m.player1 && m.player2) {
            const key1 = `${m.player1.id}_${m.player2.id}`;
            const key2 = `${m.player2.id}_${m.player1.id}`;
            playedPairs.add(key1);
            playedPairs.add(key2);
        }
    });

    // Essayer plusieurs mélanges
    let bestPairing = null;
    let bestScore = -1;

    for (let attempt = 0; attempt < 50; attempt++) {
        const shuffled = helpers.shuffleArray(participants);
        const pairs = [];
        let score = 0;

        for (let i = 0; i < shuffled.length; i += 2) {
            const p1 = shuffled[i];
            const p2 = shuffled[i + 1] || null;

            pairs.push({ player1: p1, player2: p2 });

            if (p2) {
                const key = `${p1.id}_${p2.id}`;
                if (!playedPairs.has(key)) {
                    score += 10;
                }
            }
        }

        if (score > bestScore) {
            bestScore = score;
            bestPairing = pairs;
        }

        // Si on a évité toutes les revanches, on arrête
        if (score === Math.floor(shuffled.length / 2) * 10) {
            break;
        }
    }

    return bestPairing;
}

// ===== APPARIEMENT COMPLET (fonction principale) =====
/**
 * @param {Array} participants - Liste des participants
 * @param {Object} options - { strategy, previousMatches, eloRange }
 */
function makePairing(participants, options = {}) {
    const {
        strategy = 'random', // random | elo | seeded | avoid_rematch
        previousMatches = [],
        eloRange = 400 // Écart max d'ELO pour strategy 'elo'
    } = options;

    if (participants.length < 2) {
        throw new Error('Il faut au moins 2 participants');
    }

    switch (strategy) {
        case 'elo':
            return eloPairing(participants, eloRange);
        case 'seeded':
            return seededPairing(participants);
        case 'avoid_rematch':
            return avoidRematchPairing(participants, previousMatches);
        case 'random':
        default:
            return randomPairing(participants);
    }
}

// ===== RÉPARTITION EN GROUPES (pour tournois à poules) =====
/**
 * Répartit les participants en groupes équilibrés
 */
function distributeIntoGroups(participants, groupCount) {
    const sorted = [...participants].sort((a, b) => (b.elo || 1000) - (a.elo || 1000));
    const groups = [];

    for (let i = 0; i < groupCount; i++) {
        groups.push([]);
    }

    // Répartir en serpentin (1er groupe 1, 2ème groupe 2, ..., puis inverse)
    let groupIndex = 0;
    let direction = 1;

    sorted.forEach(participant => {
        groups[groupIndex].push(participant);

        groupIndex += direction;
        if (groupIndex >= groupCount) {
            groupIndex = groupCount - 1;
            direction = -1;
        } else if (groupIndex < 0) {
            groupIndex = 0;
            direction = 1;
        }
    });

    return groups;
}

// ===== CALCUL DU NOMBRE DE MATCHS =====
function calculateTotalMatches(participantCount) {
    if (participantCount < 2) return 0;

    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(participantCount)));
    return nextPowerOf2 - 1;
}

// ===== TEMPS ESTIMÉ DU TOURNOI =====
function estimateTournamentDuration(participantCount, avgMatchDuration = 5 * 60 * 1000) {
    const totalRounds = Math.log2(participantCount);
    const avgMatchesPerRound = participantCount / 2;

    // Estimation : durée d'un match × nombre de rounds
    // (matchs joués en parallèle si possible)
    const estimatedMs = avgMatchDuration * totalRounds;

    return {
        estimatedMs,
        estimatedMinutes: Math.round(estimatedMs / 60000),
        totalRounds,
        avgMatchesPerRound
    };
}

// ===== PRIORITÉ DE MATCH =====
/**
 * Détermine la priorité d'un match (pour l'ordre de lancement)
 */
function getMatchPriority(match, tournament) {
    // Finale : priorité maximale
    const round = match.round;
    const totalRounds = tournament.totalRounds;

    // Plus on approche de la finale, plus la priorité est haute
    return totalRounds - round + 1;
}

// ===== TRIER LES MATCHS PAR PRIORITÉ =====
function sortMatchesByPriority(matches, tournament) {
    return [...matches].sort((a, b) => {
        const pA = getMatchPriority(a, tournament);
        const pB = getMatchPriority(b, tournament);
        if (pA !== pB) return pB - pA;
        return a.index - b.index;
    });
}

// ===== MATCHMAKING POUR PARTIE RAPIDE =====
/**
 * Trouve une partie en attente correspondant au joueur
 */
function findQuickMatch(player, waitingGames, options = {}) {
    const { maxEloDiff = 500 } = options;

    // Filtrer les parties en attente
    const candidates = waitingGames.filter(game => {
        // Pas complet
        if (game.players.length >= game.settings.maxPlayers) return false;
        // Mode compatible
        if (game.settings.mode === 'duel' && game.players.length >= 2) return false;
        // Écart d'ELO raisonnable
        const gameAvgElo = game.players.reduce((sum, p) => sum + (p.elo || 1000), 0) / game.players.length;
        if (Math.abs((player.elo || 1000) - gameAvgElo) > maxEloDiff) return false;
        return true;
    });

    if (candidates.length === 0) return null;

    // Trier par écart d'ELO croissant
    candidates.sort((a, b) => {
        const avgA = a.players.reduce((sum, p) => sum + (p.elo || 1000), 0) / a.players.length;
        const avgB = b.players.reduce((sum, p) => sum + (p.elo || 1000), 0) / b.players.length;
        return Math.abs((player.elo || 1000) - avgA) - Math.abs((player.elo || 1000) - avgB);
    });

    return candidates[0];
}

// ===== STATISTIQUES =====
function getPairingStats(pairs) {
    const withBot = pairs.filter(p => (p.player1 && p.player1.isBot) || (p.player2 && p.player2.isBot));
    const withBye = pairs.filter(p => !p.player1 || !p.player2);

    return {
        totalPairs: pairs.length,
        withBot: withBot.length,
        withBye: withBye.length,
        realMatches: pairs.length - withBye.length
    };
}

// ===== EXPORT =====
module.exports = {
    makePairing,
    randomPairing,
    eloPairing,
    seededPairing,
    avoidRematchPairing,
    distributeIntoGroups,
    calculateTotalMatches,
    estimateTournamentDuration,
    getMatchPriority,
    sortMatchesByPriority,
    findQuickMatch,
    getPairingStats
};