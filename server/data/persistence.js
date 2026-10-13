// ===== server/data/persistence.js =====
// Sauvegarde et chargement des données (JSON)

const fs = require('fs');
const path = require('path');
const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// ===== CHEMINS =====
const DATA_DIR = path.resolve(config.data.dir);
const REPLAYS_DIR = path.resolve(config.data.replaysDir);

// ===== INITIALISATION =====
function init() {
    // Créer le dossier data s'il n'existe pas
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        logger.info(`📁 Dossier data créé: ${DATA_DIR}`);
    }

    // Créer le dossier replays
    if (!fs.existsSync(REPLAYS_DIR)) {
        fs.mkdirSync(REPLAYS_DIR, { recursive: true });
        logger.info(`📁 Dossier replays créé: ${REPLAYS_DIR}`);
    }

    return { dataDir: DATA_DIR, replaysDir: REPLAYS_DIR };
}

// ===== LECTURE GÉNÉRIQUE =====
function readJSON(filePath, defaultValue = null) {
    try {
        const fullPath = path.resolve(filePath);

        if (!fs.existsSync(fullPath)) {
            return defaultValue;
        }

        const data = fs.readFileSync(fullPath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`❌ Erreur lecture ${filePath}:`, error.message);
        return defaultValue;
    }
}

// ===== ÉCRITURE GÉNÉRIQUE =====
function writeJSON(filePath, data, options = {}) {
    const { pretty = true, createDir = true } = options;

    try {
        const fullPath = path.resolve(filePath);
        const dir = path.dirname(fullPath);

        // Créer le dossier si nécessaire
        if (createDir && !fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        const content = pretty
            ? JSON.stringify(data, null, 2)
            : JSON.stringify(data);

        fs.writeFileSync(fullPath, content, 'utf8');
        return true;
    } catch (error) {
        logger.error(`❌ Erreur écriture ${filePath}:`, error.message);
        return false;
    }
}

// ===== APPEND À UN FICHIER JSON (tableau) =====
function appendToJSON(filePath, item) {
    try {
        let array = readJSON(filePath, []);

        if (!Array.isArray(array)) {
            array = [];
        }

        array.push(item);

        // Limiter la taille si configuré
        if (config.limits.maxHistorySize && array.length > config.limits.maxHistorySize) {
            array = array.slice(-config.limits.maxHistorySize);
        }

        return writeJSON(filePath, array);
    } catch (error) {
        logger.error(`❌ Erreur append ${filePath}:`, error.message);
        return false;
    }
}

// ===== SUPPRESSION =====
function deleteFile(filePath) {
    try {
        const fullPath = path.resolve(filePath);
        if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    } catch (error) {
        logger.error(`❌ Erreur suppression ${filePath}:`, error.message);
        return false;
    }
}

// ===== LISTE DES FICHIERS =====
function listFiles(dirPath, extension = null) {
    try {
        const fullPath = path.resolve(dirPath);

        if (!fs.existsSync(fullPath)) {
            return [];
        }

        let files = fs.readdirSync(fullPath);

        if (extension) {
            files = files.filter(f => f.endsWith(extension));
        }

        return files;
    } catch (error) {
        logger.error(`❌ Erreur listage ${dirPath}:`, error.message);
        return [];
    }
}

// ===== SAUVEGARDE DES PARTIES (REPLAYS) =====
function saveReplay(gameId, replayData) {
    const fileName = `${gameId}.json`;
    const filePath = path.join(REPLAYS_DIR, fileName);

    const replay = {
        gameId,
        savedAt: helpers.now(),
        ...replayData
    };

    const success = writeJSON(filePath, replay, { createDir: false });

    if (success) {
        logger.info(`🎬 Replay sauvegardé: ${fileName}`);
    }

    return success;
}

function loadReplay(gameId) {
    const fileName = `${gameId}.json`;
    const filePath = path.join(REPLAYS_DIR, fileName);
    return readJSON(filePath);
}

function listReplays() {
    return listFiles(REPLAYS_DIR, '.json').map(f => f.replace('.json', ''));
}

function deleteReplay(gameId) {
    const fileName = `${gameId}.json`;
    const filePath = path.join(REPLAYS_DIR, fileName);
    return deleteFile(filePath);
}

// ===== SAUVEGARDE DU CHAT =====
function saveChat(gameId, messages) {
    const filePath = path.join(DATA_DIR, 'chats', `${gameId}.json`);
    return writeJSON(filePath, {
        gameId,
        messages,
        savedAt: helpers.now()
    });
}

// ===== HISTORIQUE DES MATCHS =====
function saveMatchHistory(match) {
    return appendToJSON(config.data.matchesFile, match);
}

function loadMatchHistory() {
    return readJSON(config.data.matchesFile, []);
}

// ===== HISTORIQUE DES TOURNOIS =====
function saveTournamentHistory(tournament) {
    return appendToJSON(config.data.tournamentsFile, {
        id: tournament.id,
        winner: tournament.winner,
        finalRanking: tournament.finalRanking,
        participants: tournament.participants.map(p => ({
            id: p.id,
            name: p.name,
            isBot: p.isBot
        })),
        matchHistory: tournament.matchHistory,
        startedAt: tournament.startedAt,
        finishedAt: tournament.finishedAt
    });
}

function loadTournamentHistory() {
    return readJSON(config.data.tournamentsFile, []);
}

// ===== AMIS =====
function saveFriendships(friendships) {
    return writeJSON(config.data.friendsFile, friendships);
}

function loadFriendships() {
    return readJSON(config.data.friendsFile, {});
}

// ===== BACKUP =====
function createBackup() {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupDir = path.join(DATA_DIR, 'backups', timestamp);

    try {
        if (!fs.existsSync(backupDir)) {
            fs.mkdirSync(backupDir, { recursive: true });
        }

        // Copier les fichiers de données principaux
        const filesToBackup = [
            config.data.profilesFile,
            config.data.matchesFile,
            config.data.tournamentsFile,
            config.data.friendsFile
        ];

        filesToBackup.forEach(file => {
            const fullPath = path.resolve(file);
            if (fs.existsSync(fullPath)) {
                const fileName = path.basename(file);
                const dest = path.join(backupDir, fileName);
                fs.copyFileSync(fullPath, dest);
            }
        });

        logger.success(`💾 Backup créé: ${backupDir}`);
        return backupDir;
    } catch (error) {
        logger.error('❌ Erreur backup:', error.message);
        return null;
    }
}

function listBackups() {
    const backupDir = path.join(DATA_DIR, 'backups');
    return listFiles(backupDir).sort().reverse();
}

function restoreBackup(backupName) {
    const backupDir = path.join(DATA_DIR, 'backups', backupName);

    try {
        if (!fs.existsSync(backupDir)) {
            return { success: false, reason: 'Backup introuvable' };
        }

        const files = fs.readdirSync(backupDir);

        files.forEach(file => {
            const src = path.join(backupDir, file);
            const dest = path.join(DATA_DIR, file);
            fs.copyFileSync(src, dest);
        });

        logger.success(`♻️ Backup restauré: ${backupName}`);
        return { success: true, files };
    } catch (error) {
        logger.error('❌ Erreur restauration:', error.message);
        return { success: false, reason: error.message };
    }
}

// ===== STATS DE STOCKAGE =====
function getStorageStats() {
    const stats = {
        dataDir: DATA_DIR,
        replaysDir: REPLAYS_DIR,
        files: []
    };

    try {
        const files = fs.readdirSync(DATA_DIR);

        files.forEach(file => {
            const filePath = path.join(DATA_DIR, file);
            const stat = fs.statSync(filePath);

            if (stat.isFile()) {
                stats.files.push({
                    name: file,
                    size: stat.size,
                    sizeFormatted: formatBytes(stat.size),
                    modifiedAt: stat.mtime
                });
            }
        });

        // Total
        stats.totalSize = stats.files.reduce((sum, f) => sum + f.size, 0);
        stats.totalSizeFormatted = formatBytes(stats.totalSize);

        // Replays
        const replays = listFiles(REPLAYS_DIR, '.json');
        stats.replayCount = replays.length;
        stats.replaysSize = replays.reduce((sum, r) => {
            const stat = fs.statSync(path.join(REPLAYS_DIR, r));
            return sum + stat.size;
        }, 0);
        stats.replaysSizeFormatted = formatBytes(stats.replaysSize);
    } catch (error) {
        logger.error('Erreur stats stockage:', error);
    }

    return stats;
}

function formatBytes(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

// ===== NETTOYAGE =====
function cleanupOldBackups(maxAgeDays = 30) {
    const backupDir = path.join(DATA_DIR, 'backups');

    try {
        if (!fs.existsSync(backupDir)) return 0;

        const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
        let cleaned = 0;

        const backups = fs.readdirSync(backupDir);
        backups.forEach(backup => {
            const backupPath = path.join(backupDir, backup);
            const stat = fs.statSync(backupPath);

            if (stat.isDirectory() && stat.mtimeMs < cutoff) {
                fs.rmSync(backupPath, { recursive: true });
                cleaned++;
            }
        });

        if (cleaned > 0) {
            logger.info(`🧹 ${cleaned} anciens backups supprimés`);
        }

        return cleaned;
    } catch (error) {
        logger.error('Erreur nettoyage backups:', error);
        return 0;
    }
}

// ===== SAUVEGARDE COMPLÈTE =====
function saveAll() {
    try {
        logger.info('💾 Sauvegarde complète...');

        // Les modules profiles, stats, etc. gèrent leur propre sauvegarde
        // Ici on peut faire un backup complet

        const backupPath = createBackup();

        return {
            success: true,
            backupPath,
            timestamp: helpers.now()
        };
    } catch (error) {
        logger.error('❌ Erreur sauvegarde complète:', error);
        return { success: false, reason: error.message };
    }
}

// ===== CHARGEMENT COMPLET =====
function loadAll() {
    try {
        logger.info('📂 Chargement des données...');

        const profiles = require('./profiles');

        return {
            profiles: profiles.getProfileCount(),
            success: true
        };
    } catch (error) {
        logger.error('❌ Erreur chargement:', error);
        return { success: false, reason: error.message };
    }
}

// ===== INITIALISATION AU CHARGEMENT =====
init();

// ===== EXPORT =====
module.exports = {
    // Init
    init,

    // JSON générique
    readJSON,
    writeJSON,
    appendToJSON,
    deleteFile,
    listFiles,

    // Replays
    saveReplay,
    loadReplay,
    listReplays,
    deleteReplay,

    // Chat
    saveChat,

    // Historique
    saveMatchHistory,
    loadMatchHistory,
    saveTournamentHistory,
    loadTournamentHistory,

    // Amis
    saveFriendships,
    loadFriendships,

    // Backup
    createBackup,
    listBackups,
    restoreBackup,
    cleanupOldBackups,

    // Stats
    getStorageStats,
    formatBytes,

    // Global
    saveAll,
    loadAll,

    // Chemins
    DATA_DIR,
    REPLAYS_DIR
};