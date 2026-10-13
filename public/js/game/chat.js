// =============================================================
// JEU DE CARTES — GAME : CHAT (Chat de partie)
// =============================================================
// Gestion du chat en jeu : envoi, réception, emojis, réactions,
// modération locale.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import helpers from '../utils/helpers.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const CONFIG = {
    maxMessageLength: 200,
    maxMessages: 100,
    rateLimitMs: 1000, // 1 message par seconde
    quickEmojis: ['😂', '😎', '😱', '🔥', '👏', '😅', '😭', '🤔', '😈', '👋', '🎉', '💀']
};

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    messages: [],
    lastMessageTime: 0,
    messageCount: 0,
    isOpen: false,
    unsubscribers: [],
    initialized: false,
    container: null,
    input: null
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('💬 Initialisation du chat');

    // Récupérer les éléments DOM
    state.container = helpers.$('#chat-messages');
    state.input = helpers.$('#chat-input');

    // Attacher les événements
    attachEvents();

    // S'abonner
    setupSubscriptions();

    // Rendu initial
    render();

    state.initialized = true;
    console.log('✅ Chat initialisé');
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Envoyer un message
    const sendBtn = helpers.$('#btn-send-chat');
    if (sendBtn) {
        sendBtn.addEventListener('click', handleSend);
    }

    // Enter dans l'input
    if (state.input) {
        state.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });
    }

    // Quick emojis
    setupQuickEmojis();
}

function setupQuickEmojis() {
    const container = helpers.$('#quick-emojis');
    if (!container) return;

    container.innerHTML = CONFIG.quickEmojis.map(emoji =>
        `<button class="quick-emoji" data-emoji="${emoji}">${emoji}</button>`
    ).join('');

    container.querySelectorAll('.quick-emoji').forEach(btn => {
        btn.addEventListener('click', () => {
            if (state.input) {
                state.input.value += btn.dataset.emoji;
                state.input.focus();
            }
        });
    });
}

/* ============================================================
   ENVOI
   ============================================================ */

function handleSend() {
    if (!state.input) return;

    const message = state.input.value.trim();
    if (!message) return;

    // Vérifier la longueur
    if (message.length > CONFIG.maxMessageLength) {
        showToast(`Message trop long (max ${CONFIG.maxMessageLength} caractères)`, 'warning');
        return;
    }

    // Rate limiting
    const now = Date.now();
    if (now - state.lastMessageTime < CONFIG.rateLimitMs) {
        showToast('Trop rapide ! Attends un peu...', 'warning');
        return;
    }

    state.lastMessageTime = now;

    // Envoyer
    const gameId = store.get('game.id');
    if (gameId) {
        socketActions.sendChatMessage(gameId, message);
    }

    // Vider l'input
    state.input.value = '';
    state.input.focus();
}

/* ============================================================
   RÉCEPTION
   ============================================================ */

function handleMessage(data) {
    if (!data) return;

    // Ajouter au state
    state.messages.push(data);

    // Limiter la taille
    if (state.messages.length > CONFIG.maxMessages) {
        state.messages.shift();
    }

    // Mettre à jour le store
    store.set('game.chat', state.messages);

    // Rendre le nouveau message
    appendMessage(data);

    // Scroller vers le bas
    scrollToBottom();

    // Notification si chat fermé
    if (!state.isOpen) {
        showNotificationBadge();
    }
}

function appendMessage(data) {
    if (!state.container) return;

    const myId = store.get('player.id');
    const isMe = data.playerId === myId;

    // Supprimer le placeholder si présent
    const placeholder = state.container.querySelector('div[style*="opacity:0.5"]');
    if (placeholder) placeholder.remove();

    const messageEl = createMessageElement(data, isMe);
    state.container.appendChild(messageEl);
}

function createMessageElement(data, isMe) {
    let classes = 'chat-message';
    if (isMe) classes += ' me';
    if (data.isBot) classes += ' bot';
    if (data.isSystem) classes += ' system';

    const el = document.createElement('div');
    el.className = classes;

    el.innerHTML = `
    <div class="chat-message-header">
      ${data.avatar || '👤'} ${helpers.escapeHtml(data.playerName || 'Système')}
    </div>
    <div class="chat-message-body">${helpers.escapeHtml(data.message || '')}</div>
  `;

    return el;
}

function scrollToBottom() {
    if (state.container) {
        state.container.scrollTop = state.container.scrollHeight;
    }
}

/* ============================================================
   RENDU
   ============================================================ */

function render() {
    if (!state.container) return;

    const chat = store.get('game.chat', []);

    if (chat.length === 0) {
        state.container.innerHTML = `
      <div style="opacity: 0.5; text-align: center; padding: 20px; font-size: 13px;">
        Aucun message
      </div>
    `;
        return;
    }

    state.container.innerHTML = '';

    const myId = store.get('player.id');

    chat.forEach(msg => {
        const isMe = msg.playerId === myId;
        const el = createMessageElement(msg, isMe);
        state.container.appendChild(el);
    });

    scrollToBottom();
}

/* ============================================================
   OUVERTURE / FERMETURE
   ============================================================ */

export function open() {
    state.isOpen = true;

    const panel = helpers.$('#game-chat-panel');
    if (panel) {
        panel.classList.remove('hidden');
        setTimeout(() => state.input?.focus(), 100);
    }

    // Cacher le badge de notification
    hideNotificationBadge();

    scrollToBottom();
}

export function close() {
    state.isOpen = false;

    const panel = helpers.$('#game-chat-panel');
    if (panel) {
        panel.classList.add('hidden');
    }
}

export function toggle() {
    if (state.isOpen) {
        close();
    } else {
        open();
    }
}

/* ============================================================
   BADGE DE NOTIFICATION
   ============================================================ */

function showNotificationBadge() {
    const btn = helpers.$('#btn-game-chat');
    if (!btn) return;

    btn.classList.add('has-notification');

    // Ajouter un point rouge si pas déjà présent
    if (!btn.querySelector('.notification-dot')) {
        const dot = document.createElement('span');
        dot.className = 'notification-dot';
        btn.appendChild(dot);
    }
}

function hideNotificationBadge() {
    const btn = helpers.$('#btn-game-chat');
    if (!btn) return;

    btn.classList.remove('has-notification');

    const dot = btn.querySelector('.notification-dot');
    if (dot) dot.remove();
}

/* ============================================================
   RÉACTIONS RAPIDES
   ============================================================ */

/**
 * Envoie une réaction rapide (emoji seul)
 */
export function sendReaction(emoji) {
    const gameId = store.get('game.id');
    if (!gameId) return;

    socketActions.sendChatMessage(gameId, emoji);
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // Nouveau message
    socket.on('chat:message', (data) => {
        handleMessage(data);
    });

    // Chat de bot
    socket.on('game:bot_chat', (data) => {
        handleMessage({
            playerId: data.botId,
            playerName: data.botName,
            avatar: '🤖',
            message: data.message,
            isBot: true
        });
    });

    // Messages système
    socket.on('game:update', (data) => {
        if (data.game && data.game.chat) {
            // Synchroniser le chat avec le serveur
            const serverChat = data.game.chat;
            if (serverChat.length > state.messages.length) {
                // Nouveaux messages, mettre à jour
                const newMessages = serverChat.slice(state.messages.length);
                newMessages.forEach(msg => handleMessage(msg));
            }
        }
    });
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function showToast(message, type = 'info') {
    const container = helpers.$('#toast-container');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = helpers.createElement('div', {
        className: `toast ${type}`
    }, [
        helpers.createElement('span', { className: 'toast-icon' }, [icons[type] || 'ℹ️']),
        helpers.createElement('span', { className: 'toast-message' }, [message])
    ]);

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function clear() {
    state.messages = [];
    if (state.container) {
        state.container.innerHTML = '';
    }
}

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.messages = [];
    state.container = null;
    state.input = null;
    state.initialized = false;
    console.log('🧹 Chat nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    clear,
    open,
    close,
    toggle,
    sendReaction,
    CONFIG
};