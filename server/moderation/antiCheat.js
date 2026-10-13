// ===== server/moderation/antiCheat.js =====
// Détection de triche et comportements suspects

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// ===== STOCKAGE =====
// playerId -> { playTimings: [], suspiciousEvents: [], score: 0 }
const playerProfiles = new Map();

// ===== SEUILS =====
const THRESHOLDS = {
    minPlayDelayMs: 300,        // Temps minimum entre deux coups
    maxPlayDelayMs: 60000,      // Temps maximum raisonnable
    maxActionsPerMinute: 30,    // Actions max par minute
    maxSuspicionScore: 100,     // Score au-delà duquel on kick
    suspiciousTimingRatio: 0.7  // Ratio de coups trop rapides pour être suspect
};

// ===== INITIALISATION DU PROFIL DE SURVEILLANCE =====
function getPlayerProfile(playerId) {
    if (!playerProfiles.has(playerId)) {
        playerProfiles.set(playerId, {
            playerId,
            playTimings: [],           // Timestamps des coups joués
            suspiciousEvents: [],      // Liste des événements suspects
            score: 0,                  // Score de suspicion cumulé
            totalActions: 0,           // Nombre total d'actions
            lastActionTime: 0,
            violations: {
                tooFast: 0,
                tooSlow: 0,
                invalidMoves: 0,
                invalidCards: 0,
                suspiciousPatterns: 0
            },
            createdAt: helpers.now()
        });
    }
    return playerProfiles.get(playerId);
}

// ===== VALIDATION D'UN COUP =====
/**
 * Vérifie qu'un coup est légitime
 * @returns {Boolean} true si légitime, false sinon
 */
function validatePlay(game, playerId, data) {
    try {
        const player = game.players.find(p => p.id === playerId);
        if (!player) {
            logSuspicious(playerId, 'player_not_found', { playerId });
            return false;
        }

        // Vérifier que c'est bien le tour du joueur
        const currentPlayer = game.players[game.currentPlayerIndex];
        if (currentPlayer.id !== playerId) {
            logSuspicious(playerId, 'not_your_turn', { expected: currentPlayer.id, actual: playerId });
            return false;
        }

        // Vérifier les données
        if (!data || !Array.isArray(data.cardIds)) {
            logSuspicious(playerId, 'invalid_data', { data });
            return false;
        }

        // Vérifier les timings
        const timingCheck = checkTiming(playerId);
        if (!timingCheck.valid) {
            logSuspicious(playerId, 'suspicious_timing', timingCheck);
            // On ne bloque pas forcément, mais on log
        }

        return true;
    } catch (error) {
        logger.error('Erreur validatePlay:', error);
        return false;
    }
}

// ===== VÉRIFICATION DES TIMINGS =====
function checkTiming(playerId) {
    const profile = getPlayerProfile(playerId);
    const now = Date.now();

    // Premier coup : initialiser
    if (profile.lastActionTime === 0) {
        profile.lastActionTime = now;
        profile.totalActions++;
        return { valid: true, reason: 'first_action' };
    }

    const delta = now - profile.lastActionTime;

    // Ajouter à l'historique (garder les 20 derniers)
    profile.playTimings.push(delta);
    if (profile.playTimings.length > 20) {
        profile.playTimings.shift();
    }

    profile.lastActionTime = now;
    profile.totalActions++;

    // Vérifier si trop rapide
    if (delta < THRESHOLDS.minPlayDelayMs) {
        profile.violations.tooFast++;
        profile.score += 5;
        return {
            valid: false,
            reason: 'too_fast',
            delta,
            threshold: THRESHOLDS.minPlayDelayMs
        };
    }

    // Vérifier si trop lent (peut indiquer un bot ou un script)
    if (delta > THRESHOLDS.maxPlayDelayMs && profile.totalActions > 3) {
        profile.violations.tooSlow++;
        // Moins grave, on ne pénalise pas trop
        return {
            valid: true,
            reason: 'too_slow',
            delta
        };
    }

    return { valid: true, delta };
}

// ===== VALIDATION D'UN MESSAGE DE CHAT =====
function validateChatMessage(playerId, message) {
    const profile = getPlayerProfile(playerId);

    // Vérifier la longueur
    if (typeof message !== 'string' || message.length === 0) {
        return { valid: false, reason: 'invalid_message' };
    }

    // Vérifier si le joueur envoie trop de messages
    const recentMessages = profile.playTimings.filter(t => Date.now() - t < 60000).length;

    if (recentMessages > THRESHOLDS.maxActionsPerMinute) {
        profile.violations.suspiciousPatterns++;
        profile.score += 10;
        logSuspicious(playerId, 'chat_spam', { count: recentMessages });
        return { valid: false, reason: 'spam' };
    }

    return { valid: true };
}

// ===== LOG D'ÉVÉNEMENT SUSPECT =====
function logSuspicious(playerId, type, details = {}) {
    const profile = getPlayerProfile(playerId);

    const event = {
        type,
        details,
        timestamp: helpers.now(),
        score: profile.score
    };

    profile.suspiciousEvents.push(event);

    // Limiter la taille
    if (profile.suspiciousEvents.length > 50) {
        profile.suspiciousEvents.shift();
    }

    logger.warn(`🚨 Événement suspect: ${type}`, {
        playerId,
        details,
        score: profile.score
    });

    // Vérifier si le score dépasse le seuil
    if (profile.score >= THRESHOLDS.maxSuspicionScore) {
        logger.error(`🚫 Score de suspicion dépassé pour ${playerId}: ${profile.score}`);
        return { action: 'kick', reason: 'Suspicion élevée' };
    }

    return { action: 'log' };
}

// ===== SIGNALER UN COUP INVALIDE =====
function reportInvalidMove(playerId, reason, details = {}) {
    const profile = getPlayerProfile(playerId);

    profile.violations.invalidMoves++;
    profile.score += 3;

    logSuspicious(playerId, 'invalid_move', {
        reason,
        ...details
    });

    return profile.score;
}

// ===== SIGNALER UNE CARTE INVALIDE =====
function reportInvalidCard(playerId, card, details = {}) {
    const profile = getPlayerProfile(playerId);

    profile.violations.invalidCards++;
    profile.score += 5;

    logSuspicious(playerId, 'invalid_card', {
        card,
        ...details
    });

    return profile.score;
}

// ===== ANALYSE DES PATTERNS DE JEU =====
function analyzePlayPattern(playerId) {
    const profile = getPlayerProfile(playerId);

    if (profile.playTimings.length < 10) {
        return { suspicious: false, reason: 'not_enough_data' };
    }

    // Calculer la moyenne et l'écart-type des timings
    const timings = profile.playTimings;
    const mean = timings.reduce((a, b) => a + b, 0) / timings.length;
    const variance = timings.reduce((sum, t) => sum + Math.pow(t - mean, 2), 0) / timings.length;
    const stdDev = Math.sqrt(variance);

    // Un bot a souvent des timings très réguliers (faible écart-type)
    const coefficientOfVariation = stdDev / mean;

    if (coefficientOfVariation < 0.1 && timings.length >= 15) {
        profile.score += 20;
        logSuspicious(playerId, 'too_regular_timing', {
            mean: Math.round(mean),
            stdDev: Math.round(stdDev),
            cv: coefficientOfVariation.toFixed(3)
        });

        return {
            suspicious: true,
            reason: 'too_regular_timing',
            cv: coefficientOfVariation
        };
    }

    return { suspicious: false };
}

// ===== DÉTECTION DE BOT =====
function detectBot(playerId) {
    const profile = getPlayerProfile(playerId);

    // Critères :
    // 1. Timings trop réguliers
    // 2. Ratio de coups trop rapides élevé
    // 3. Aucune pause naturelle

    const tooFastRatio = profile.violations.tooFast / Math.max(profile.totalActions, 1);

    if (tooFastRatio > THRESHOLDS.suspiciousTimingRatio && profile.totalActions > 20) {
        profile.score += 15;
        logSuspicious(playerId, 'bot_detected_fast', { tooFastRatio });
        return { isBot: true, reason: 'too_fast_ratio' };
    }

    const pattern = analyzePlayPattern(playerId);
    if (pattern.suspicious) {
        return { isBot: true, reason: pattern.reason };
    }

    return { isBot: false };
}

// ===== SANCTIONS =====
function applySanction(playerId, sanction, duration = null) {
    const profile = getPlayerProfile(playerId);

    const sanctions = {
        warning: 0,
        mute: 30000,
        kick: 0,
        ban: 24 * 60 * 60 * 1000
    };

    const event = {
        type: 'sanction',
        sanction,
        duration: duration || sanctions[sanction],
        timestamp: helpers.now()
    };

    profile.suspiciousEvents.push(event);

    logger.warn(`⚖️ Sanction appliquée: ${sanction} à ${playerId}`, {
        duration: duration || sanctions[sanction],
        score: profile.score
    });

    return { success: true, sanction, appliedAt: helpers.now() };
}

// ===== RÉINITIALISATION =====
function resetPlayerProfile(playerId) {
    playerProfiles.delete(playerId);
    logger.info(`♻️ Profil anti-triche réinitialisé: ${playerId}`);
}

// ===== NETTOYAGE =====
function cleanupOldProfiles(maxAgeHours = 24) {
    const now = Date.now();
    const maxAge = maxAgeHours * 60 * 60 * 1000;

    let cleaned = 0;
    playerProfiles.forEach((profile, playerId) => {
        const createdTime = new Date(profile.createdAt).getTime();

        // Si le profil a peu d'activité et est ancien
        if (profile.totalActions < 5 && now - createdTime > maxAge) {
            playerProfiles.delete(playerId);
            cleaned++;
        }

        // Si le score est redescendu à 0 et l'activité récente
        if (profile.score === 0 && now - profile.lastActionTime > maxAge) {
            playerProfiles.delete(playerId);
            cleaned++;
        }
    });

    if (cleaned > 0) {
        logger.info(`🧹 ${cleaned} profils anti-triche nettoyés`);
    }

    return cleaned;
}

// Nettoyage périodique
setInterval(cleanupOldProfiles, 60 * 60 * 1000); // Toutes les heures

// ===== STATISTIQUES =====
function getStats() {
    let totalSuspicionScore = 0;
    let highRiskCount = 0;
    let totalViolations = 0;

    playerProfiles.forEach(profile => {
        totalSuspicionScore += profile.score;
        if (profile.score >= 50) highRiskCount++;
        totalViolations +=
            profile.violations.tooFast +
            profile.violations.tooSlow +
            profile.violations.invalidMoves +
            profile.violations.invalidCards +
            profile.violations.suspiciousPatterns;
    });

    return {
        monitoredPlayers: playerProfiles.size,
        highRiskPlayers: highRiskCount,
        averageScore: playerProfiles.size > 0
            ? Math.round(totalSuspicionScore / playerProfiles.size)
            : 0,
        totalViolations,
        totalSuspiciousEvents: Array.from(playerProfiles.values())
            .reduce((sum, p) => sum + p.suspiciousEvents.length, 0)
    };
}

function getPlayerStats(playerId) {
    const profile = getPlayerProfile(playerId);
    return {
        playerId,
        score: profile.score,
        totalActions: profile.totalActions,
        violations: profile.violations,
        recentEvents: profile.suspiciousEvents.slice(-10),
        riskLevel: profile.score >= 50 ? 'high' : profile.score >= 20 ? 'medium' : 'low'
    };
}

// ===== DÉTECTION DE TRICHE AVANCÉE =====
/**
 * Vérifie qu'un joueur ne triche pas en modifiant ses requêtes
 */
function detectCheat(playerId, action, data) {
    const profile = getPlayerProfile(playerId);

    // Vérifier la cohérence des données
    if (action === 'playCards') {
        // Vérifier que le joueur envoie bien des IDs de cartes qu'il possède
        // (déjà fait côté serveur via la validation)

        // Vérifier qu'il n'y a pas d'injection
        if (!Array.isArray(data.cardIds) || data.cardIds.length > 10) {
            reportInvalidMove(playerId, 'invalid_card_count', { count: data.cardIds?.length });
            return { cheat: true, reason: 'invalid_card_count' };
        }
    }

    if (action === 'chat') {
        // Vérifier que le message n'est pas trop long
        if (data.message && data.message.length > config.security.maxChatMessageLength * 2) {
            reportInvalidMove(playerId, 'message_too_long', { length: data.message.length });
            return { cheat: true, reason: 'message_too_long' };
        }
    }

    return { cheat: false };
}

// ===== EXPORT =====
module.exports = {
    validatePlay,
    validateChatMessage,
    checkTiming,
    logSuspicious,
    reportInvalidMove,
    reportInvalidCard,
    analyzePlayPattern,
    detectBot,
    detectCheat,
    applySanction,
    resetPlayerProfile,
    cleanupOldProfiles,
    getStats,
    getPlayerStats,
    getPlayerProfile,
    THRESHOLDS,
    playerProfiles
};