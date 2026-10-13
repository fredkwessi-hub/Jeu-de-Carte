// ===== server/moderation/filter.js =====
// Filtre de chat : mots interdits, spam, liens, etc.

const config = require('../config');
const logger = require('../utils/logger');

// ===== LISTES DE MOTS =====
// Note : liste basique. En production, on utiliserait une API externe (Perspective API, etc.)
const BANNED_WORDS = [
    // Insultes françaises (échantillon)
    'connard', 'connasse', 'salaud', 'salope', 'pute', 'putain',
    'enculé', 'encule', 'enculer', 'bâtard', 'batard', 'abruti',
    'crétin', 'cretin', 'idiot', 'imbécile', 'imbecile', 'débile',
    'debile', 'nique', 'niquer', 'foutre', 'merde', 'chier',
    // Insultes anglaises (échantillon)
    'fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard',
    'dick', 'pussy', 'cunt', 'whore', 'slut',
    // Racisme / haine (échantillon)
    'nazi', 'hitler', 'raciste', 'racist',
    // Autres
    'suicide', 'kys', 'kill yourself'
];

// Regex pour les liens suspects
const URL_REGEX = /(https?:\/\/[^\s]+)|(www\.[^\s]+)|([a-z0-9-]+\.(com|fr|net|org|io|gg|tv|xyz|ru|cn|tk)[^\s]*)/gi;

// Regex pour les tentatives de contournement
const LEET_SPEAK_MAP = {
    '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's',
    '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i'
};

// Regex de caractères répétés (spam visuel)
const REPEATED_CHARS_REGEX = /(.)\1{5,}/g;

// Regex de caractères spéciaux en masse
const SPECIAL_CHARS_REGEX = /[!@#$%^&*()_+=\[\]{};:'"\\|,.<>\/?~`]{10,}/g;

// ===== CONVERSION LEET SPEAK =====
function normalizeLeetSpeak(text) {
    let normalized = text.toLowerCase();

    Object.keys(LEET_SPEAK_MAP).forEach(char => {
        const regex = new RegExp(char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        normalized = normalized.replace(regex, LEET_SPEAK_MAP[char]);
    });

    return normalized;
}

// ===== SUPPRESSION DES ACCENTS =====
function removeAccents(text) {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ===== NORMALISATION COMPLÈTE =====
function normalizeText(text) {
    let normalized = text.toLowerCase();
    normalized = removeAccents(normalized);
    normalized = normalizeLeetSpeak(normalized);
    normalized = normalized.replace(/[^\w\s]/g, ' '); // Remplace la ponctuation par des espaces
    normalized = normalized.replace(/\s+/g, ' '); // Réduit les espaces multiples
    return normalized.trim();
}

// ===== VÉRIFIER LES MOTS INTERDITS =====
function containsBannedWord(text) {
    const normalized = normalizeText(text);

    for (const word of BANNED_WORDS) {
        const normalizedWord = normalizeText(word);

        // Vérifier avec word boundary
        const regex = new RegExp(`\\b${normalizedWord}\\b`, 'i');
        if (regex.test(normalized)) {
            return { found: true, word };
        }
    }

    return { found: false };
}

// ===== VÉRIFIER LES LIENS =====
function containsUrl(text) {
    const matches = text.match(URL_REGEX);
    if (matches && matches.length > 0) {
        return { found: true, urls: matches };
    }
    return { found: false };
}

// ===== VÉRIFIER LE SPAM VISUEL =====
function containsRepeatedChars(text) {
    const matches = text.match(REPEATED_CHARS_REGEX);
    if (matches) {
        return { found: true, matches };
    }
    return { found: false };
}

function containsSpecialCharSpam(text) {
    const matches = text.match(SPECIAL_CHARS_REGEX);
    if (matches) {
        return { found: true, matches };
    }
    return { found: false };
}

// ===== VÉRIFIER LE MAJUSCULE ABUSIF =====
function isAllCaps(text) {
    if (text.length < 5) return false;
    const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length < 5) return false;
    return letters === letters.toUpperCase();
}

function isExcessiveCaps(text) {
    if (text.length < 10) return false;
    const letters = text.replace(/[^a-zA-ZÀ-ÿ]/g, '');
    if (letters.length < 10) return false;
    const upperCount = (letters.match(/[A-ZÀ-Ý]/g) || []).length;
    return (upperCount / letters.length) > 0.7;
}

// ===== VÉRIFIER LES CARACTÈRES INVISIBLES =====
function containsInvisibleChars(text) {
    // Zero-width, BOM, etc.
    return /[\u200B-\u200D\u2060\uFEFF]/.test(text);
}

// ===== DÉTECTION DE LANGUE SIMPLIFIÉE =====
function detectLanguage(text) {
    // Détection très simplifiée
    const frenchWords = ['le', 'la', 'les', 'un', 'une', 'des', 'et', 'ou', 'mais', 'donc', 'car'];
    const englishWords = ['the', 'and', 'or', 'but', 'so', 'a', 'an'];

    const words = text.toLowerCase().split(/\s+/);
    let frenchScore = 0;
    let englishScore = 0;

    words.forEach(word => {
        if (frenchWords.includes(word)) frenchScore++;
        if (englishWords.includes(word)) englishScore++;
    });

    if (frenchScore > englishScore) return 'fr';
    if (englishScore > frenchScore) return 'en';
    return 'unknown';
}

// ===== FILTRE PRINCIPAL =====
/**
 * Filtre un message de chat
 * @param {String} message - Le message à filtrer
 * @param {Object} options - Options de filtrage
 * @returns {Object} { allowed, message?, reason? }
 */
function filterMessage(message, options = {}) {
    const {
        allowUrls = false,
        allowCaps = false,
        strictMode = false,
        maxLength = config.security.maxChatMessageLength
    } = options;

    // Vérifier le type
    if (typeof message !== 'string') {
        return { allowed: false, reason: 'Message invalide' };
    }

    // Trim
    let cleanMessage = message.trim();

    // Vérifier la longueur
    if (cleanMessage.length === 0) {
        return { allowed: false, reason: 'Message vide' };
    }

    if (cleanMessage.length > maxLength) {
        return { allowed: false, reason: `Message trop long (max ${maxLength} caractères)` };
    }

    // Caractères invisibles
    if (containsInvisibleChars(cleanMessage)) {
        return { allowed: false, reason: 'Caractères invalides détectés' };
    }

    // Mots interdits
    const bannedCheck = containsBannedWord(cleanMessage);
    if (bannedCheck.found) {
        logger.warn(`🚫 Mot interdit détecté: "${bannedCheck.word}"`);
        return { allowed: false, reason: 'Langage inapproprié détecté' };
    }

    // URLs
    if (!allowUrls) {
        const urlCheck = containsUrl(cleanMessage);
        if (urlCheck.found) {
            return { allowed: false, reason: 'Les liens ne sont pas autorisés' };
        }
    }

    // Spam de caractères
    if (containsRepeatedChars(cleanMessage)) {
        cleanMessage = cleanMessage.replace(REPEATED_CHARS_REGEX, '$1$1$1');
    }

    if (containsSpecialCharSpam(cleanMessage)) {
        return { allowed: false, reason: 'Trop de caractères spéciaux' };
    }

    // Majuscules
    if (!allowCaps && isExcessiveCaps(cleanMessage)) {
        // Convertir en minuscules/majuscules normales
        cleanMessage = cleanMessage.toLowerCase();
    }

    // Mode strict : vérifications supplémentaires
    if (strictMode) {
        // Interdire les liens même avec allowUrls
        if (containsUrl(cleanMessage).found) {
            return { allowed: false, reason: 'Mode strict : liens interdits' };
        }
    }

    // Le message est valide
    return {
        allowed: true,
        message: cleanMessage,
        language: detectLanguage(cleanMessage)
    };
}

// ===== FILTRE DE PSEUDO =====
function filterUsername(username) {
    if (typeof username !== 'string') {
        return { allowed: false, reason: 'Pseudo invalide' };
    }

    const clean = username.trim();

    if (clean.length < config.security.minUsernameLength) {
        return { allowed: false, reason: `Trop court (min ${config.security.minUsernameLength})` };
    }

    if (clean.length > config.security.maxUsernameLength) {
        return { allowed: false, reason: `Trop long (max ${config.security.maxUsernameLength})` };
    }

    // Mots interdits
    const bannedCheck = containsBannedWord(clean);
    if (bannedCheck.found) {
        return { allowed: false, reason: 'Pseudo inapproprié' };
    }

    // Caractères autorisés
    if (!/^[\w\s\-À-ÿ\u{1F300}-\u{1FAFF}]+$/u.test(clean)) {
        return { allowed: false, reason: 'Caractères non autorisés' };
    }

    // Spam
    if (containsRepeatedChars(clean)) {
        return { allowed: false, reason: 'Trop de caractères répétés' };
    }

    return { allowed: true, username: clean };
}

// ===== DÉTECTION DE COMPORTEMENT SUSPECT =====
function analyzeMessagePattern(message) {
    const flags = {
        isAllCaps: isAllCaps(message),
        isExcessiveCaps: isExcessiveCaps(message),
        hasRepeatedChars: containsRepeatedChars(message).found,
        hasSpecialSpam: containsSpecialCharSpam(message).found,
        hasUrl: containsUrl(message).found,
        hasInvisibleChars: containsInvisibleChars(message),
        length: message.length
    };

    // Score de suspicion
    let suspicionScore = 0;
    if (flags.isAllCaps) suspicionScore += 1;
    if (flags.isExcessiveCaps) suspicionScore += 1;
    if (flags.hasRepeatedChars) suspicionScore += 2;
    if (flags.hasSpecialSpam) suspicionScore += 3;
    if (flags.hasUrl) suspicionScore += 2;
    if (flags.hasInvisibleChars) suspicionScore += 5;

    return {
        flags,
        suspicionScore,
        isSuspicious: suspicionScore >= 3
    };
}

// ===== EXPORT =====
module.exports = {
    filterMessage,
    filterUsername,
    containsBannedWord,
    containsUrl,
    containsRepeatedChars,
    containsSpecialCharSpam,
    containsInvisibleChars,
    isAllCaps,
    isExcessiveCaps,
    normalizeText,
    detectLanguage,
    analyzeMessagePattern,
    BANNED_WORDS
};