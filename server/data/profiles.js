// ===== server/data/profiles.js =====
// Gestion complète des profils joueurs

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// ===== STOCKAGE =====
const profiles = new Map(); // playerId -> Profile

// ===== CHARGEMENT INITIAL =====
function loadProfiles() {
    const filePath = path.resolve(config.data.profilesFile);

    try {
        if (!fs.existsSync(filePath)) {
            logger.info('📁 Aucun fichier de profils, création d\'un nouveau');
            saveProfiles();
            return 0;
        }

        const data = fs.readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(data);

        Object.keys(parsed).forEach(playerId => {
            profiles.set(playerId, parsed[playerId]);
        });

        logger.success(`✅ ${profiles.size} profils chargés depuis ${filePath}`);
        return profiles.size;
    } catch (error) {
        logger.error('❌ Erreur chargement profils:', error);
        return 0;
    }
}

// ===== SAUVEGARDE =====
function saveProfiles() {
    const filePath = path.resolve(config.data.profilesFile);

    try {
        // Créer le dossier si nécessaire
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const obj = {};
        profiles.forEach((profile, playerId) => {
            obj[playerId] = profile;
        });

        fs.writeFileSync(filePath, JSON.stringify(obj, null, 2), 'utf8');
        logger.debug(`💾 ${profiles.size} profils sauvegardés`);
        return true;
    } catch (error) {
        logger.error('❌ Erreur sauvegarde profils:', error);
        return false;
    }
}

// ===== CRÉATION DE PROFIL =====
function createProfile(playerId, data = {}) {
    if (profiles.has(playerId)) {
        return profiles.get(playerId);
    }

    const now = helpers.now();

    const profile = {
        // Identité
        id: playerId,
        username: data.username || `Joueur_${playerId.slice(-6)}`,
        avatar: data.avatar || 'default',
        bio: data.bio || '',
        country: data.country || null,
        createdAt: now,

        // Statistiques ELO
        elo: config.elo.initialRating,
        peakElo: config.elo.initialRating,
        level: 1,

        // Statistiques de jeu
        gamesPlayed: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        totalCardsPlayed: 0,
        totalGamesWon: 0,
        totalGamesLost: 0,
        longestWinStreak: 0,
        currentWinStreak: 0,
        longestLoseStreak: 0,
        currentLoseStreak: 0,

        // Statistiques avancées
        stats: {
            jokersPlayed: 0,
            sevensPlayed: 0,
            acesPlayed: 0,
            jacksPlayed: 0,
            kingsPlayed: 0,
            perfectGames: 0, // Parties gagnées sans piocher
            comebacks: 0     // Victoires après avoir été dernier
        },

        // Statistiques de tournois
        tournamentsPlayed: 0,
        tournamentsWon: 0,
        bestTournamentRank: null,

        // Succès débloqués
        achievements: [],

        // Statut
        isOnline: false,
        isBanned: false,
        banReason: null,
        isMuted: false,
        muteExpiresAt: null,

        // Préférences
        settings: {
            theme: 'dark',
            language: 'fr',
            soundEnabled: true,
            musicEnabled: true,
            notificationsEnabled: true,
            hapticEnabled: true,
            autoReady: false,
            chatVisible: true
        },

        // Social
        friendIds: [],
        blockedIds: [],

        // Historique
        lastSeen: now,
        lastGameAt: null,
        totalPlayTime: 0, // en ms

        // Récompenses
        coins: 0,
        gems: 0,
        xp: 0,
        xpToNextLevel: 100
    };

    profiles.set(playerId, profile);

    logger.player(`✨ Nouveau profil créé: ${profile.username}`, {
        playerId,
        elo: profile.elo
    });

    // Sauvegarder après création
    if (config.data.autoSave) {
        saveProfiles();
    }

    return profile;
}

// ===== RÉCUPÉRATION =====
function getProfile(playerId) {
    if (!profiles.has(playerId)) {
        return createProfile(playerId);
    }
    return profiles.get(playerId);
}

function getProfileByUsername(username) {
    for (const profile of profiles.values()) {
        if (profile.username.toLowerCase() === username.toLowerCase()) {
            return profile;
        }
    }
    return null;
}

function getAllProfiles() {
    return Array.from(profiles.values());
}

function getProfileCount() {
    return profiles.size;
}

// ===== MISE À JOUR =====
function updateProfile(playerId, updates) {
    const profile = getProfile(playerId);
    if (!profile) return null;

    // Mettre à jour les champs autorisés
    const allowedFields = [
        'username', 'avatar', 'bio', 'country', 'settings'
    ];

    allowedFields.forEach(field => {
        if (updates[field] !== undefined) {
            if (field === 'username') {
                profile.username = helpers.sanitizeString(updates.username, 20);
            } else if (field === 'settings') {
                profile.settings = { ...profile.settings, ...updates.settings };
            } else {
                profile[field] = updates[field];
            }
        }
    });

    profile.updatedAt = helpers.now();

    // Sauvegarder
    if (config.data.autoSave) {
        saveProfiles();
    }

    return profile;
}

function saveProfile(playerId) {
    const profile = profiles.get(playerId);
    if (!profile) return false;

    if (config.data.autoSave) {
        saveProfiles();
    }
    return true;
}

// ===== MISE À JOUR POST-PARTIE =====
function updateProfileAfterGame(playerId, result) {
    const profile = getProfile(playerId);

    profile.gamesPlayed++;
    profile.lastGameAt = helpers.now();

    if (result.won) {
        profile.wins++;
        profile.totalGamesWon++;
        profile.currentWinStreak++;
        profile.currentLoseStreak = 0;

        if (profile.currentWinStreak > profile.longestWinStreak) {
            profile.longestWinStreak = profile.currentWinStreak;
        }
    } else {
        profile.losses++;
        profile.totalGamesLost++;
        profile.currentLoseStreak++;
        profile.currentWinStreak = 0;

        if (profile.currentLoseStreak > profile.longestLoseStreak) {
            profile.longestLoseStreak = profile.currentLoseStreak;
        }
    }

    // Recalculer le win rate
    profile.winRate = profile.gamesPlayed > 0
        ? Math.round((profile.wins / profile.gamesPlayed) * 100)
        : 0;

    // Mettre à jour l'ELO si fourni
    if (result.newElo !== undefined) {
        profile.elo = result.newElo;
        if (profile.elo > profile.peakElo) {
            profile.peakElo = profile.elo;
        }
    }

    // Mettre à jour le niveau
    profile.level = calculateLevel(profile.elo);

    // Statistiques avancées
    if (result.stats) {
        if (result.stats.jokersPlayed) profile.stats.jokersPlayed += result.stats.jokersPlayed;
        if (result.stats.sevensPlayed) profile.stats.sevensPlayed += result.stats.sevensPlayed;
        if (result.stats.acesPlayed) profile.stats.acesPlayed += result.stats.acesPlayed;
        if (result.stats.jacksPlayed) profile.stats.jacksPlayed += result.stats.jacksPlayed;
        if (result.stats.kingsPlayed) profile.stats.kingsPlayed += result.stats.kingsPlayed;
        if (result.stats.cardsPlayed) profile.totalCardsPlayed += result.stats.cardsPlayed;
        if (result.stats.perfectGame) profile.stats.perfectGames++;
        if (result.stats.comeback) profile.stats.comebacks++;
    }

    // Durée de jeu
    if (result.duration) {
        profile.totalPlayTime += result.duration;
    }

    profile.lastSeen = helpers.now();

    // Vérifier les succès
    checkAchievements(profile);

    // Sauvegarder
    if (config.data.autoSave) {
        saveProfiles();
    }

    return profile;
}

// ===== NIVEAU =====
function calculateLevel(rating) {
    const thresholds = [0, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500];
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (rating >= thresholds[i]) return i + 1;
    }
    return 1;
}

// ===== SUCCÈS =====
const ACHIEVEMENTS = {
    first_win: { id: 'first_win', name: 'Première victoire', emoji: '🥇', description: 'Gagner sa première partie' },
    ten_wins: { id: 'ten_wins', name: 'Dix sur dix', emoji: '🔟', description: 'Gagner 10 parties' },
    hundred_wins: { id: 'hundred_wins', name: 'Centurion', emoji: '💯', description: 'Gagner 100 parties' },
    streak_5: { id: 'streak_5', name: 'En feu', emoji: '🔥', description: '5 victoires consécutives' },
    streak_10: { id: 'streak_10', name: 'Invincible', emoji: '⚡', description: '10 victoires consécutives' },
    perfect_game: { id: 'perfect_game', name: 'Sans faute', emoji: '✨', description: 'Gagner sans piocher' },
    comeback: { id: 'comeback', name: 'Phénix', emoji: '🦅', description: 'Gagner après avoir été dernier' },
    tournament_win: { id: 'tournament_win', name: 'Champion', emoji: '🏆', description: 'Remporter un tournoi' },
    joker_master: { id: 'joker_master', name: 'Maître du Joker', emoji: '🃏', description: 'Jouer 100 Jokers' },
    seven_master: { id: 'seven_master', name: 'Roi du 7', emoji: '7️⃣', description: 'Jouer 100 Sept' },
    ace_master: { id: 'ace_master', name: 'As de la manche', emoji: '🅰️', description: 'Jouer 100 As' },
    level_5: { id: 'level_5', name: 'Confirmé', emoji: '⭐', description: 'Atteindre le niveau 5' },
    level_8: { id: 'level_8', name: 'Grand Maître', emoji: '👑', description: 'Atteindre le niveau 8' },
    level_10: { id: 'level_10', name: 'Légende', emoji: '🌟', description: 'Atteindre le niveau 10' }
};

function checkAchievements(profile) {
    const unlocked = [];

    const unlock = (id) => {
        if (!profile.achievements.includes(id)) {
            profile.achievements.push(id);
            unlocked.push(ACHIEVEMENTS[id]);
            logger.success(`🏆 Succès débloqué: ${profile.username} - ${ACHIEVEMENTS[id].name}`);
        }
    };

    if (profile.wins >= 1) unlock('first_win');
    if (profile.wins >= 10) unlock('ten_wins');
    if (profile.wins >= 100) unlock('hundred_wins');
    if (profile.longestWinStreak >= 5) unlock('streak_5');
    if (profile.longestWinStreak >= 10) unlock('streak_10');
    if (profile.stats.perfectGames >= 1) unlock('perfect_game');
    if (profile.stats.comebacks >= 1) unlock('comeback');
    if (profile.tournamentsWon >= 1) unlock('tournament_win');
    if (profile.stats.jokersPlayed >= 100) unlock('joker_master');
    if (profile.stats.sevensPlayed >= 100) unlock('seven_master');
    if (profile.stats.acesPlayed >= 100) unlock('ace_master');
    if (profile.level >= 5) unlock('level_5');
    if (profile.level >= 8) unlock('level_8');
    if (profile.level >= 10) unlock('level_10');

    return unlocked;
}

function getAchievements(playerId) {
    const profile = getProfile(playerId);
    return profile.achievements.map(id => ACHIEVEMENTS[id]).filter(Boolean);
}

function getAllAchievements() {
    return Object.values(ACHIEVEMENTS);
}

// ===== STATUT EN LIGNE =====
function setOnline(playerId, isOnline) {
    const profile = getProfile(playerId);
    if (!profile) return;

    profile.isOnline = isOnline;
    profile.lastSeen = helpers.now();

    if (!config.data.autoSave) return;
    // Sauvegarder avec debounce pour éviter trop d'écritures
}

// ===== BAN / MUTE =====
function banPlayer(playerId, reason = 'Comportement inapproprié') {
    const profile = getProfile(playerId);
    if (!profile) return false;

    profile.isBanned = true;
    profile.banReason = reason;
    profile.bannedAt = helpers.now();

    logger.warn(`🚫 ${profile.username} banni: ${reason}`);

    saveProfile(playerId);
    return true;
}

function unbanPlayer(playerId) {
    const profile = getProfile(playerId);
    if (!profile) return false;

    profile.isBanned = false;
    profile.banReason = null;
    profile.bannedAt = null;

    logger.info(`✅ ${profile.username} débanni`);

    saveProfile(playerId);
    return true;
}

function mutePlayer(playerId, durationMs, reason = 'Comportement inapproprié') {
    const profile = getProfile(playerId);
    if (!profile) return false;

    profile.isMuted = true;
    profile.muteExpiresAt = new Date(Date.now() + durationMs).toISOString();

    logger.warn(`🔇 ${profile.username} mute pour ${durationMs / 1000}s`);

    saveProfile(playerId);
    return true;
}

function unmutePlayer(playerId) {
    const profile = getProfile(playerId);
    if (!profile) return false;

    profile.isMuted = false;
    profile.muteExpiresAt = null;

    saveProfile(playerId);
    return true;
}

function isMuted(playerId) {
    const profile = getProfile(playerId);
    if (!profile) return false;
    if (!profile.isMuted) return false;

    if (profile.muteExpiresAt && new Date(profile.muteExpiresAt) < new Date()) {
        unmutePlayer(playerId);
        return false;
    }

    return true;
}

// ===== CLASSEMENT =====
function getLeaderboard(limit = 100) {
    const all = getAllProfiles()
        .filter(p => p.gamesPlayed >= 5) // Minimum 5 parties
        .sort((a, b) => b.elo - a.elo)
        .slice(0, limit)
        .map((p, index) => ({
            rank: index + 1,
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            elo: p.elo,
            level: p.level,
            wins: p.wins,
            losses: p.losses,
            winRate: p.winRate,
            gamesPlayed: p.gamesPlayed
        }));

    return all;
}

function getPlayerRank(playerId) {
    const leaderboard = getLeaderboard(10000);
    const index = leaderboard.findIndex(p => p.id === playerId);
    return index >= 0 ? index + 1 : null;
}

// ===== RECHERCHE =====
function searchProfiles(query, limit = 20) {
    const q = query.toLowerCase();
    return getAllProfiles()
        .filter(p => p.username.toLowerCase().includes(q))
        .slice(0, limit)
        .map(p => ({
            id: p.id,
            username: p.username,
            avatar: p.avatar,
            elo: p.elo,
            level: p.level,
            isOnline: p.isOnline
        }));
}

// ===== NETTOYAGE =====
function cleanupInactiveProfiles(maxAgeDays = 365) {
    const now = Date.now();
    const maxAge = maxAgeDays * 24 * 60 * 60 * 1000;

    let deleted = 0;
    profiles.forEach((profile, playerId) => {
        const lastSeen = new Date(profile.lastSeen).getTime();

        // Ne supprimer que les profils jamais utilisés depuis très longtemps
        if (profile.gamesPlayed === 0 && now - lastSeen > maxAge) {
            profiles.delete(playerId);
            deleted++;
        }
    });

    if (deleted > 0) {
        logger.info(`🧹 ${deleted} profils inactifs supprimés`);
        saveProfiles();
    }

    return deleted;
}

// ===== STATISTIQUES GLOBALES =====
function getGlobalStats() {
    const all = getAllProfiles();

    if (all.length === 0) {
        return {
            totalPlayers: 0,
            totalGames: 0,
            averageElo: 0,
            averageWinRate: 0
        };
    }

    const totalGames = all.reduce((sum, p) => sum + p.gamesPlayed, 0);
    const totalElo = all.reduce((sum, p) => sum + p.elo, 0);
    const totalWinRate = all.reduce((sum, p) => sum + p.winRate, 0);

    return {
        totalPlayers: all.length,
        totalGames: totalGames / 2, // Divisé par 2 car chaque partie compte pour plusieurs joueurs
        averageElo: Math.round(totalElo / all.length),
        averageWinRate: Math.round(totalWinRate / all.length),
        onlinePlayers: all.filter(p => p.isOnline).length,
        bannedPlayers: all.filter(p => p.isBanned).length
    };
}

// ===== CHARGEMENT INITIAL =====
loadProfiles();

// ===== SAUVEGARDE PÉRIODIQUE =====
if (config.data.autoSave) {
    setInterval(() => {
        saveProfiles();
    }, config.data.saveInterval);
}

// Nettoyage au shutdown
process.on('SIGINT', () => {
    logger.info('💾 Sauvegarde des profils avant arrêt...');
    saveProfiles();
    process.exit(0);
});

// ===== EXPORT =====
module.exports = {
    // Chargement / sauvegarde
    loadProfiles,
    saveProfiles,

    // CRUD
    createProfile,
    getProfile,
    getProfileByUsername,
    getAllProfiles,
    getProfileCount,
    updateProfile,
    saveProfile,
    updateProfileAfterGame,

    // Niveau
    calculateLevel,

    // Succès
    ACHIEVEMENTS,
    checkAchievements,
    getAchievements,
    getAllAchievements,

    // Statut
    setOnline,

    // Modération
    banPlayer,
    unbanPlayer,
    mutePlayer,
    unmutePlayer,
    isMuted,

    // Classement
    getLeaderboard,
    getPlayerRank,

    // Recherche
    searchProfiles,

    // Nettoyage
    cleanupInactiveProfiles,

    // Statistiques
    getGlobalStats,

    // Storage (debug)
    profiles
};