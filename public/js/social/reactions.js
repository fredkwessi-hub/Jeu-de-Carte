// =============================================================
// JEU DE CARTES — SOCIAL : REACTIONS (Réactions emoji)
// =============================================================
// Système de réactions rapides pendant les parties : emojis
// flottants, sons, vibrations.
// =============================================================

import store from '../state.js';
import { socket } from '../socket.js';
import helpers from '../utils/helpers.js';
import sounds from '../game/sounds.js';
import haptics from '../game/haptics.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const REACTIONS = {
    // Positifs
    '😂': { label: 'Rire', color: '#FFD700' },
    '😎': { label: 'Cool', color: '#00D4FF' },
    '🔥': { label: 'En feu', color: '#FF6584' },
    '👏': { label: 'Bravo', color: '#2ECC71' },
    '🎉': { label: 'Fête', color: '#9D6FFF' },
    '💪': { label: 'Force', color: '#F39C12' },

    // Réactions
    '😱': { label: 'Choc', color: '#FF6584' },
    '😅': { label: 'Gêné', color: '#FFB347' },
    '😭': { label: 'Triste', color: '#3498DB' },
    '🤔': { label: 'Pensif', color: '#A8A7BE' },
    '😈': { label: 'Malicieux', color: '#9B59B6' },
    '💀': { label: 'Mort', color: '#2C3E50' },

    // Amicaux
    '👋': { label: 'Salut', color: '#00D4FF' },
    '🤝': { label: 'Poignée', color: '#2ECC71' },
    '❤️': { label: 'Coeur', color: '#FF6584' },
    '⭐': { label: 'Étoile', color: '#FFD700' }
};

const REACTION_DURATION = 2500; // ms

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    container: null,
    recentReactions: new Map(), // playerId -> timestamp
    rateLimitMs: 2000,
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('😀 Initialisation des réactions');

    // Créer le container
    state.container = helpers.$('#reactions-container');
    if (!state.container) {
        state.container = document.createElement('div');
        state.container.id = 'reactions-container';
        state.container.className = 'reactions-container';
        document.body.appendChild(state.container);
    }

    // S'abonner aux events
    setupSocketListeners();

    state.initialized = true;
    console.log('✅ Réactions initialisées');
}

/* ============================================================
   ENVOI DE RÉACTION
   ============================================================ */

/**
 * Envoie une réaction
 */
export function sendReaction(emoji) {
    if (!REACTIONS[emoji]) {
        console.warn('Emoji non supporté:', emoji);
        return false;
    }

    // Rate limiting
    const myId = store.get('player.id');
    const now = Date.now();
    const lastReaction = state.recentReactions.get(myId) || 0;

    if (now - lastReaction < state.rateLimitMs) {
        return false;
    }

    state.recentReactions.set(myId, now);

    // Envoyer au serveur
    const gameId = store.get('game.id');
    if (gameId) {
        socket.emit('send_reaction', { gameId, emoji });
    }

    // Afficher localement
    showReaction(emoji, myId);

    // Son + vibration
    sounds.playClick();
    haptics.light();

    return true;
}

/**
 * Affiche une réaction reçue
 */
function showReaction(emoji, playerId) {
    if (!state.container) return;

    const config = REACTIONS[emoji] || { color: '#FFD700' };
    const player = getPlayerById(playerId);

    // Créer l'élément
    const el = document.createElement('div');
    el.className = 'floating-reaction';
    el.innerHTML = `
    <div class="reaction-emoji">${emoji}</div>
    ${player ? `<div class="reaction-player">${helpers.escapeHtml(player.name)}</div>` : ''}
  `;

    el.style.color = config.color;
    el.style.setProperty('--reaction-color', config.color);

    // Position aléatoire en haut
    const left = 10 + Math.random() * 80;
    el.style.left = `${left}%`;

    state.container.appendChild(el);

    // Animation de sortie
    setTimeout(() => {
        el.classList.add('fading');
        setTimeout(() => el.remove(), 500);
    }, REACTION_DURATION);
}

/* ============================================================
   UI — SÉLECTEUR DE RÉACTIONS
   ============================================================ */

/**
 * Affiche le sélecteur d'emojis
 */
export function openReactionPicker() {
    const picker = helpers.$('#reaction-picker');
    if (!picker) {
        createReactionPicker();
        return;
    }

    picker.classList.toggle('active');
}

function createReactionPicker() {
    const picker = document.createElement('div');
    picker.id = 'reaction-picker';
    picker.className = 'reaction-picker';

    picker.innerHTML = `
    <div class="reaction-picker-header">
      <span>Réagir</span>
      <button class="btn-icon btn-icon-sm" id="close-reaction-picker">✕</button>
    </div>
    <div class="reaction-picker-grid">
      ${Object.keys(REACTIONS).map(emoji => `
        <button class="reaction-option" data-emoji="${emoji}" title="${REACTIONS[emoji].label}">
          ${emoji}
        </button>
      `).join('')}
    </div>
  `;

    document.body.appendChild(picker);

    // Événements
    picker.querySelector('#close-reaction-picker').addEventListener('click', () => {
        picker.classList.remove('active');
    });

    picker.querySelectorAll('.reaction-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const emoji = btn.dataset.emoji;
            sendReaction(emoji);
            picker.classList.remove('active');
        });
    });

    // Ouvrir avec animation
    requestAnimationFrame(() => {
        picker.classList.add('active');
    });
}

/* ============================================================
   SOCKET
   ============================================================ */

function setupSocketListeners() {
    socket.on('reaction_received', (data) => {
        if (data && data.emoji) {
            showReaction(data.emoji, data.playerId);
            sounds.playClick();
        }
    });

    // Aussi via le chat
    socket.on('chat:message', (data) => {
        if (data && data.message && REACTIONS[data.message]) {
            // C'est un emoji seul, le traiter comme une réaction
            showReaction(data.message, data.playerId);
        }
    });
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function getPlayerById(playerId) {
    const players = store.get('game.players', []);
    return players.find(p => p.id === playerId);
}

/**
 * Récupère tous les emojis disponibles
 */
export function getAvailableReactions() {
    return Object.keys(REACTIONS);
}

/**
 * Récupère la config d'un emoji
 */
export function getReactionConfig(emoji) {
    return REACTIONS[emoji] || null;
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    if (state.container) {
        state.container.innerHTML = '';
    }
    state.recentReactions.clear();
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 Réactions nettoyées');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    sendReaction,
    openReactionPicker,
    getAvailableReactions,
    getReactionConfig,
    REACTIONS
};