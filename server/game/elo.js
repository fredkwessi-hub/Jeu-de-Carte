// ===== server/game/elo.js =====
// Système de classement ELO

const config = require('../config');
const logger = require('../utils/logger');

// ===== CALCUL DU FACTEUR K =====
/**
 * Le facteur K détermine l'ampleur du changement de rating.
 * - K élevé : changements rapides (nouveaux joueurs)
 * - K faible : changements lents (joueurs expérimentés)
 */
function getKFactor(rating, gamesPlayed = 0) {
    // Nouveaux joueurs (< 30 parties) : K = 40 pour s'ajuster vite
    if (gamesPlayed < 30) return 40;
    // Joueurs confirmés (< 2400 ELO) : K = 32
    if (rating < 2400) return config.elo.kFactor;
    // Joueurs experts (>= 2400 ELO) : K = 16
    return 16;
}

// ===== PROBABILITÉ DE VICTOIRE ATTENDUE =====
/**
 * Formule ELO standard
 * Retourne une probabilité entre 0 et 1
 */
function getExpectedScore(ratingA, ratingB) {
    return 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
}

// ===== CALCUL ELO 1 vs 1 =====
function calculateElo1v1(winnerRating, loserRating, options = {}) {
    const { winnerGames = 0, loserGames = 0, draw = false } = options;

    const expectedWinner = getExpectedScore(winnerRating, loserRating);
    const expectedLoser = 1 - expectedWinner;

    const kWinner = getKFactor(winnerRating, winnerGames);
    const kLoser = getKFactor(loserRating, loserGames);

    let actualWinner = draw ? 0.5 : 1;
    let actualLoser = draw ? 0.5 : 0;

    const newWinnerRating = Math.round(winnerRating + kWinner * (actualWinner - expectedWinner));
    const newLoserRating = Math.round(loserRating + kLoser * (actualLoser - expectedLoser));

    // Appliquer les bornes
    const clampedWinner = clampRating(newWinnerRating);
    const clampedLoser = clampRating(newLoserRating);

    return {
        winner: {
            oldRating: winnerRating,
            newRating: clampedWinner,
            change: clampedWinner - winnerRating
        },
        loser: {
            oldRating: loserRating,
            newRating: clampedLoser,
            change: clampedLoser - loserRating
        }
    };
}

// ===== CALCUL ELO MULTI-JOUEURS =====
/**
 * Pour une partie à N joueurs, on traite chaque paire comme un duel.
 * Le joueur classé i bat tous les joueurs classés j > i.
 */
function calculateEloMulti(playerResults, options = {}) {
    const { gamesPlayed = {} } = options;

    // playerResults = [{ id, name, rating, rank }, ...]
    const changes = {};

    playerResults.forEach(p => {
        changes[p.id] = {
            id: p.id,
            name: p.name,
            oldRating: p.rating,
            newRating: p.rating,
            change: 0,
            opponents: 0
        };
    });

    // Pour chaque paire (i, j) où i a mieux joué que j
    for (let i = 0; i < playerResults.length; i++) {
        for (let j = i + 1; j < playerResults.length; j++) {
            const better = playerResults[i]; // Meilleur classement (rank plus petit)
            const worse = playerResults[j];

            const expectedBetter = getExpectedScore(better.rating, worse.rating);
            const expectedWorse = 1 - expectedBetter;

            const kBetter = getKFactor(better.rating, gamesPlayed[better.id] || 0);
            const kWorse = getKFactor(worse.rating, gamesPlayed[worse.id] || 0);

            const deltaBetter = kBetter * (1 - expectedBetter);
            const deltaWorse = kWorse * (0 - expectedWorse);

            changes[better.id].change += deltaBetter;
            changes[worse.id].change += deltaWorse;

            changes[better.id].opponents++;
            changes[worse.id].opponents++;
        }
    }

    // Moyenner les changements par le nombre d'opposants
    Object.keys(changes).forEach(id => {
        const c = changes[id];
        if (c.opponents > 0) {
            c.change = Math.round(c.change / c.opponents);
        }
        c.newRating = clampRating(c.oldRating + c.change);
        c.change = c.newRating - c.oldRating;
    });

    return changes;
}

// ===== BORNES DE RATING =====
function clampRating(rating) {
    return Math.min(
        Math.max(rating, config.elo.minRating),
        config.elo.maxRating
    );
}

// ===== NIVEAU À PARTIR DU RATING =====
function getLevelFromRating(rating) {
    if (rating < 800) return { level: 1, name: 'Débutant', emoji: '🌱' };
    if (rating < 1000) return { level: 2, name: 'Apprenti', emoji: '🌿' };
    if (rating < 1200) return { level: 3, name: 'Intermédiaire', emoji: '🌳' };
    if (rating < 1400) return { level: 4, name: 'Confirmé', emoji: '⭐' };
    if (rating < 1600) return { level: 5, name: 'Avancé', emoji: '🌟' };
    if (rating < 1800) return { level: 6, name: 'Expert', emoji: '💫' };
    if (rating < 2000) return { level: 7, name: 'Maître', emoji: '👑' };
    if (rating < 2200) return { level: 8, name: 'Grand Maître', emoji: '🏆' };
    if (rating < 2500) return { level: 9, name: 'Légende', emoji: '🔥' };
    return { level: 10, name: 'Mythique', emoji: '🌈' };
}

// ===== PROGRESSION VERS LE NIVEAU SUIVANT =====
function getProgressToNextLevel(rating) {
    const current = getLevelFromRating(rating);

    const thresholds = [0, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 3000];
    const currentThreshold = thresholds[current.level - 1];
    const nextThreshold = thresholds[current.level] || 3000;

    const progress = (rating - currentThreshold) / (nextThreshold - currentThreshold);

    return {
        current: current,
        next: current.level < 10 ? getLevelFromRating(nextThreshold) : null,
        progress: Math.min(Math.max(progress, 0), 1),
        pointsToNext: Math.max(nextThreshold - rating, 0)
    };
}

// ===== MISE À JOUR ELO APRÈS UNE PARTIE =====
function updateEloAfterGame(game, profiles) {
    const results = game.finishedPlayers.map(p => ({
        id: p.id,
        name: p.name,
        rating: profiles[p.id]?.elo || config.elo.initialRating,
        rank: p.rank
    }));

    if (results.length < 2) return null;

    const gamesPlayed = {};
    results.forEach(r => {
        gamesPlayed[r.id] = profiles[r.id]?.gamesPlayed || 0;
    });

    const changes = calculateEloMulti(results, { gamesPlayed });

    // Appliquer les changements aux profils
    Object.keys(changes).forEach(playerId => {
        const change = changes[playerId];
        if (profiles[playerId]) {
            profiles[playerId].elo = change.newRating;
            profiles[playerId].gamesPlayed = (profiles[playerId].gamesPlayed || 0) + 1;
        }
    });

    logger.info('📊 ELO mis à jour', {
        players: Object.values(changes).map(c => `${c.name}: ${c.oldRating} → ${c.newRating} (${c.change >= 0 ? '+' : ''}${c.change})`)
    });

    return changes;
}

// ===== STATISTIQUES ELO D'UN JOUEUR =====
function getPlayerEloStats(profile) {
    const rating = profile.elo || config.elo.initialRating;
    const level = getLevelFromRating(rating);
    const progress = getProgressToNextLevel(rating);

    return {
        rating,
        level: level.level,
        levelName: level.name,
        levelEmoji: level.emoji,
        progress: progress.progress,
        pointsToNext: progress.pointsToNext,
        nextLevel: progress.next ? {
            level: progress.next.level,
            name: progress.next.name,
            emoji: progress.next.emoji
        } : null,
        gamesPlayed: profile.gamesPlayed || 0,
        wins: profile.wins || 0,
        losses: profile.losses || 0,
        winRate: profile.gamesPlayed > 0
            ? Math.round((profile.wins / profile.gamesPlayed) * 100)
            : 0
    };
}

// ===== EXPORT =====
module.exports = {
    getKFactor,
    getExpectedScore,
    calculateElo1v1,
    calculateEloMulti,
    clampRating,
    getLevelFromRating,
    getProgressToNextLevel,
    updateEloAfterGame,
    getPlayerEloStats
};