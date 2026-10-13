// ===== server/social/chat.js =====
// Système de chat global et par partie

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const moderation = require('../moderation/filter');

// ===== STOCKAGE =====
const globalChat = []; // Historique global
const privateChats = new Map(); // conversationId -> messages

// Anti-spam : playerId -> { lastMessageTime, messageCount, mutedUntil }
const rateLimits = new Map();

// ===== CONSTANTES =====
const MAX_GLOBAL_HISTORY = 100;
const MAX_PRIVATE_HISTORY = 50;
const MAX_MESSAGE_LENGTH = config.security.maxChatMessageLength;
const RATE_LIMIT_INTERVAL = config.security.chatRateLimit; // ms
const MAX_MESSAGES_PER_MINUTE = 10;
const MUTE_DURATION = 60000; // 1 minute

// ===== VÉRIFIER LE RATE LIMIT =====
function checkRateLimit(playerId) {
    const now = Date.now();
    let entry = rateLimits.get(playerId);

    if (!entry) {
        entry = {
            lastMessageTime: 0,
            messageCount: 0,
            minuteStart: now,
            mutedUntil: 0
        };
        rateLimits.set(playerId, entry);
    }

    // Vérifier si mute
    if (entry.mutedUntil > now) {
        const remaining = Math.ceil((entry.mutedUntil - now) / 1000);
        return {
            allowed: false,
            reason: `Vous êtes mute pendant encore ${remaining}s`,
            muted: true
        };
    }

    // Reset du compteur chaque minute
    if (now - entry.minuteStart > 60000) {
        entry.messageCount = 0;
        entry.minuteStart = now;
    }

    // Vérifier l'intervalle minimum
    if (now - entry.lastMessageTime < RATE_LIMIT_INTERVAL) {
        return {
            allowed: false,
            reason: 'Vous envoyez des messages trop rapidement'
        };
    }

    // Vérifier le nombre max par minute
    if (entry.messageCount >= MAX_MESSAGES_PER_MINUTE) {
        entry.mutedUntil = now + MUTE_DURATION;
        logger.warn(`Mute automatique de ${playerId} (spam)`);
        return {
            allowed: false,
            reason: `Trop de messages. Mute pendant ${MUTE_DURATION / 1000}s`,
            muted: true
        };
    }

    entry.lastMessageTime = now;
    entry.messageCount++;

    return { allowed: true };
}

// ===== CHAT GLOBAL =====
function addGlobalMessage(player, message) {
    // Vérifier rate limit
    const rateCheck = checkRateLimit(player.id);
    if (!rateCheck.allowed) {
        return { success: false, reason: rateCheck.reason, muted: rateCheck.muted };
    }

    // Filtrer le message
    const filterResult = moderation.filterMessage(message);
    if (!filterResult.allowed) {
        return { success: false, reason: filterResult.reason };
    }

    // Créer le message
    const chatMessage = {
        id: helpers.generateId('msg'),
        type: 'global',
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        elo: player.elo,
        level: player.level,
        message: filterResult.message,
        timestamp: helpers.now(),
        isSystem: false,
        isBot: player.isBot || false
    };

    globalChat.push(chatMessage);

    // Limiter la taille
    if (globalChat.length > MAX_GLOBAL_HISTORY) {
        globalChat.shift();
    }

    logger.info(`💬 [GLOBAL] ${player.name}: ${filterResult.message}`);

    return { success: true, message: chatMessage };
}

function getGlobalHistory(limit = 50) {
    return globalChat.slice(-limit);
}

function clearGlobalChat() {
    globalChat.length = 0;
    logger.info('Chat global nettoyé');
}

// ===== CHAT DE PARTIE =====
function addGameMessage(gameId, player, message, gameManager) {
    // Vérifier rate limit
    const rateCheck = checkRateLimit(player.id);
    if (!rateCheck.allowed) {
        return { success: false, reason: rateCheck.reason };
    }

    // Filtrer le message
    const filterResult = moderation.filterMessage(message);
    if (!filterResult.allowed) {
        return { success: false, reason: filterResult.reason };
    }

    // Créer le message
    const chatMessage = {
        id: helpers.generateId('msg'),
        type: 'game',
        gameId: gameId,
        playerId: player.id,
        playerName: player.name,
        avatar: player.avatar,
        message: filterResult.message,
        timestamp: helpers.now(),
        isSystem: false,
        isBot: player.isBot || false
    };

    // Ajouter au chat de la partie
    const result = gameManager.addChatMessage(gameId, player.id, filterResult.message);

    if (!result.success) {
        return result;
    }

    logger.info(`💬 [${gameId}] ${player.name}: ${filterResult.message}`);

    return { success: true, message: chatMessage };
}

// ===== MESSAGES SYSTÈME =====
function createSystemMessage(gameId, message, type = 'info') {
    return {
        id: helpers.generateId('sys'),
        type: 'system',
        gameId: gameId,
        message: message,
        systemType: type, // info, success, warning, error
        timestamp: helpers.now(),
        isSystem: true
    };
}

// ===== CHAT PRIVÉ =====
function getConversationId(player1Id, player2Id) {
    // Toujours trier pour avoir le même ID dans les deux sens
    const sorted = [player1Id, player2Id].sort();
    return `chat_${sorted[0]}_${sorted[1]}`;
}

function addPrivateMessage(sender, recipient, message) {
    // Vérifier rate limit
    const rateCheck = checkRateLimit(sender.id);
    if (!rateCheck.allowed) {
        return { success: false, reason: rateCheck.reason };
    }

    // Filtrer le message
    const filterResult = moderation.filterMessage(message);
    if (!filterResult.allowed) {
        return { success: false, reason: filterResult.reason };
    }

    const conversationId = getConversationId(sender.id, recipient.id);

    if (!privateChats.has(conversationId)) {
        privateChats.set(conversationId, []);
    }

    const chatMessage = {
        id: helpers.generateId('pmsg'),
        type: 'private',
        conversationId: conversationId,
        senderId: sender.id,
        senderName: sender.name,
        senderAvatar: sender.avatar,
        recipientId: recipient.id,
        recipientName: recipient.name,
        message: filterResult.message,
        timestamp: helpers.now(),
        read: false
    };

    const conversation = privateChats.get(conversationId);
    conversation.push(chatMessage);

    // Limiter
    if (conversation.length > MAX_PRIVATE_HISTORY) {
        conversation.shift();
    }

    logger.info(`💬 [PRIVÉ] ${sender.name} → ${recipient.name}: ${filterResult.message}`);

    return { success: true, message: chatMessage, conversationId };
}

function getPrivateConversation(player1Id, player2Id, limit = 50) {
    const conversationId = getConversationId(player1Id, player2Id);
    const conversation = privateChats.get(conversationId) || [];
    return conversation.slice(-limit);
}

function markConversationAsRead(playerId, otherPlayerId) {
    const conversationId = getConversationId(playerId, otherPlayerId);
    const conversation = privateChats.get(conversationId);

    if (!conversation) return 0;

    let count = 0;
    conversation.forEach(msg => {
        if (msg.recipientId === playerId && !msg.read) {
            msg.read = true;
            count++;
        }
    });

    return count;
}

function getUnreadCount(playerId) {
    let count = 0;
    privateChats.forEach(conversation => {
        conversation.forEach(msg => {
            if (msg.recipientId === playerId && !msg.read) {
                count++;
            }
        });
    });
    return count;
}

// ===== MUTE / BAN =====
function mutePlayer(playerId, durationMs, reason = 'Comportement inapproprié') {
    const entry = rateLimits.get(playerId) || {
        lastMessageTime: 0,
        messageCount: 0,
        minuteStart: Date.now(),
        mutedUntil: 0
    };

    entry.mutedUntil = Date.now() + durationMs;
    rateLimits.set(playerId, entry);

    logger.warn(`🔇 ${playerId} mute pendant ${durationMs / 1000}s (${reason})`);

    return { success: true, mutedUntil: entry.mutedUntil };
}

function unmutePlayer(playerId) {
    const entry = rateLimits.get(playerId);
    if (entry) {
        entry.mutedUntil = 0;
        entry.messageCount = 0;
        logger.info(`🔊 ${playerId} unmute`);
    }
    return { success: true };
}

function isMuted(playerId) {
    const entry = rateLimits.get(playerId);
    if (!entry) return false;
    return entry.mutedUntil > Date.now();
}

// ===== STATISTIQUES =====
function getStats() {
    let totalPrivateMessages = 0;
    privateChats.forEach(conv => {
        totalPrivateMessages += conv.length;
    });

    let mutedCount = 0;
    const now = Date.now();
    rateLimits.forEach(entry => {
        if (entry.mutedUntil > now) mutedCount++;
    });

    return {
        globalMessages: globalChat.length,
        privateConversations: privateChats.size,
        totalPrivateMessages,
        activeRateLimits: rateLimits.size,
        mutedPlayers: mutedCount
    };
}

// ===== NETTOYAGE =====
function cleanupOldConversations(maxAge = 30 * 24 * 60 * 60 * 1000) {
    const now = Date.now();
    let cleaned = 0;

    privateChats.forEach((conversation, id) => {
        if (conversation.length === 0) return;

        const lastMessage = conversation[conversation.length - 1];
        const lastTime = new Date(lastMessage.timestamp).getTime();

        if (now - lastTime > maxAge) {
            privateChats.delete(id);
            cleaned++;
        }
    });

    if (cleaned > 0) {
        logger.info(`💬 ${cleaned} conversations inactives nettoyées`);
    }

    return cleaned;
}

function cleanupRateLimits() {
    const now = Date.now();
    let cleaned = 0;

    rateLimits.forEach((entry, playerId) => {
        // Si inactif depuis 1 heure
        if (now - entry.lastMessageTime > 60 * 60 * 1000 && entry.mutedUntil < now) {
            rateLimits.delete(playerId);
            cleaned++;
        }
    });

    return cleaned;
}

// Nettoyage périodique
setInterval(() => {
    cleanupOldConversations();
    cleanupRateLimits();
}, 60 * 60 * 1000); // Toutes les heures

// ===== EXPORT =====
module.exports = {
    // Chat global
    addGlobalMessage,
    getGlobalHistory,
    clearGlobalChat,

    // Chat de partie
    addGameMessage,
    createSystemMessage,

    // Chat privé
    addPrivateMessage,
    getPrivateConversation,
    markConversationAsRead,
    getUnreadCount,
    getConversationId,

    // Modération
    mutePlayer,
    unmutePlayer,
    isMuted,
    checkRateLimit,

    // Stats
    getStats,

    // Nettoyage
    cleanupOldConversations,
    cleanupRateLimits,

    // Storage (pour debug)
    globalChat,
    privateChats,
    rateLimits
};