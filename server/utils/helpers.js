// ===== server/utils/helpers.js =====
// Fonctions utilitaires diverses

const config = require('../config');

// ===== Génération d'identifiants =====
function generateId(prefix = 'id') {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 9);
    return `${prefix}_${timestamp}_${random}`;
}

function generateGameId() {
    return generateId('game');
}

function generateTournamentId() {
    return generateId('tourney');
}

function generateMatchId() {
    return generateId('match');
}

function generatePlayerId() {
    return generateId('player');
}

function generateRoomId() {
    return generateId('room');
}

// ===== Sécurité =====
function sanitizeString(str, maxLength = 200) {
    if (typeof str !== 'string') return '';
    return str
        .trim()
        .slice(0, maxLength)
        .replace(/[<>]/g, ''); // Retire les caractères dangereux
}

function isValidUsername(username) {
    if (typeof username !== 'string') return false;
    const len = username.trim().length;
    if (len < config.security.minUsernameLength) return false;
    if (len > config.security.maxUsernameLength) return false;
    // Lettres, chiffres, espaces, tirets, underscores, emojis
    return /^[\w\s\-À-ÿ\u{1F300}-\u{1FAFF}]{2,20}$/u.test(username.trim());
}

function isValidChatMessage(message) {
    if (typeof message !== 'string') return false;
    const len = message.trim().length;
    return len > 0 && len <= config.security.maxChatMessageLength;
}

// ===== Arrays & Objects =====
function shuffleArray(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function pickRandom(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function groupBy(array, key) {
    return array.reduce((acc, item) => {
        const group = item[key];
        if (!acc[group]) acc[group] = [];
        acc[group].push(item);
        return acc;
    }, {});
}

function uniqueBy(array, key) {
    const seen = new Set();
    return array.filter(item => {
        const value = item[key];
        if (seen.has(value)) return false;
        seen.add(value);
        return true;
    });
}

// ===== Temps =====
function now() {
    return new Date().toISOString();
}

function timeAgo(dateString) {
    const date = new Date(dateString);
    const seconds = Math.floor((new Date() - date) / 1000);

    if (seconds < 60) return 'à l\'instant';
    if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
    if (seconds < 604800) return `il y a ${Math.floor(seconds / 86400)} j`;
    return date.toLocaleDateString('fr-FR');
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

// ===== Fonctionnel =====
function debounce(fn, delay) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => fn.apply(this, args), delay);
    };
}

function throttle(fn, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// ===== Validation =====
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function isValidGameId(gameId) {
    return typeof gameId === 'string' && /^game_[a-z0-9_]+$/i.test(gameId);
}

function isValidTournamentId(tournamentId) {
    return typeof tournamentId === 'string' && /^tourney_[a-z0-9_]+$/i.test(tournamentId);
}

// ===== Retry =====
async function retry(fn, maxAttempts = 3, delay = 1000) {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxAttempts) throw error;
            await new Promise(resolve => setTimeout(resolve, delay * attempt));
        }
    }
}

// ===== Calculs =====
function percentage(value, total) {
    if (total === 0) return 0;
    return Math.round((value / total) * 100);
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

// ===== Export =====
module.exports = {
    // IDs
    generateId,
    generateGameId,
    generateTournamentId,
    generateMatchId,
    generatePlayerId,
    generateRoomId,

    // Sécurité
    sanitizeString,
    isValidUsername,
    isValidChatMessage,

    // Arrays & Objects
    shuffleArray,
    pickRandom,
    deepClone,
    groupBy,
    uniqueBy,

    // Temps
    now,
    timeAgo,
    formatDuration,

    // Fonctionnel
    debounce,
    throttle,

    // Validation
    isValidEmail,
    isValidGameId,
    isValidTournamentId,

    // Retry
    retry,

    // Calculs
    percentage,
    clamp
};