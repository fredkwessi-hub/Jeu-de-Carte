// =============================================================
// JEU DE CARTES — SOCIAL : ROOMS (Salles publiques)
// =============================================================
// Gestion des salles publiques : liste, filtres, rejoindre,
// créer, invitations.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    filter: 'all', // 'all' | 'waiting' | 'playing'
    sortBy: 'recent', // 'recent' | 'players' | 'name'
    lastRefresh: 0,
    refreshInterval: null,
    unsubscribers: [],
    initialized: false
};

const REFRESH_INTERVAL = 10000; // 10 secondes

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('🌐 Initialisation des salles publiques');

    attachEvents();
    setupSubscriptions();

    // Charger au démarrage
    loadRooms();

    // Auto-refresh
    state.refreshInterval = setInterval(loadRooms, REFRESH_INTERVAL);

    state.initialized = true;
    console.log('✅ Salles publiques initialisées');
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton actualiser
    const refreshBtn = helpers.$('#btn-refresh-rooms');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            loadRooms(true);
        });
    }

    // Filtres
    helpers.$$('[data-room-filter]').forEach(btn => {
        btn.addEventListener('click', () => {
            state.filter = btn.dataset.roomFilter;
            updateFilterButtons();
            renderRooms();
        });
    });

    // Tri
    const sortSelect = helpers.$('#rooms-sort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            state.sortBy = e.target.value;
            renderRooms();
        });
    }
}

function updateFilterButtons() {
    helpers.$$('[data-room-filter]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.roomFilter === state.filter);
    });
}

/* ============================================================
   CHARGEMENT
   ============================================================ */

async function loadRooms(showFeedback = false) {
    try {
        const now = Date.now();

        // Éviter les refresh trop rapprochés (sauf manuel)
        if (!showFeedback && now - state.lastRefresh < 2000) {
            return;
        }

        state.lastRefresh = now;

        if (showFeedback) {
            const btn = helpers.$('#btn-refresh-rooms');
            if (btn) btn.textContent = '⏳';
        }

        const response = await fetch('/api/rooms');

        if (response.ok) {
            const rooms = await response.json();
            store.set('social.publicRooms', rooms);
            renderRooms();
        }

        if (showFeedback) {
            const btn = helpers.$('#btn-refresh-rooms');
            if (btn) btn.textContent = '🔄 Actualiser';
        }

    } catch (error) {
        console.error('Erreur chargement salles:', error);
    }
}

/* ============================================================
   RENDU
   ============================================================ */

export function renderRooms() {
    const container = helpers.$('#public-rooms-list');
    if (!container) return;

    let rooms = store.get('social.publicRooms', []);

    // Filtres
    if (state.filter !== 'all') {
        rooms = rooms.filter(r => r.status === state.filter);
    }

    // Tri
    rooms = sortRooms(rooms, state.sortBy);

    if (rooms.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>${i18n.t('lobby.no_rooms') || 'Aucune partie publique'}</p>
      </div>
    `;
        return;
    }

    container.innerHTML = rooms.slice(0, 12).map(room => renderRoomCard(room)).join('');

    // Attacher les clics
    container.querySelectorAll('.public-room-card').forEach(card => {
        card.addEventListener('click', () => {
            const roomId = card.dataset.roomId;
            const hasPassword = card.dataset.hasPassword === 'true';

            if (hasPassword) {
                promptPassword(roomId);
            } else {
                joinRoom(roomId);
            }
        });
    });
}

function renderRoomCard(room) {
    const statusIcon = room.status === 'playing' ? '🟢' : '⏳';
    const statusText = room.status === 'playing' ? 'En cours' : 'En attente';

    const isFull = room.playerCount >= room.maxPlayers;

    return `
    <div class="public-room-card" data-room-id="${room.id}" data-has-password="${room.hasPassword || false}">
      <div class="public-room-header">
        <div class="public-room-host">
          <div class="public-room-avatar">${room.hostAvatar || '👤'}</div>
          <span class="public-room-name">${helpers.escapeHtml(room.name || room.hostName)}</span>
        </div>
        <span class="public-room-players">
          ${room.playerCount}/${room.maxPlayers}
        </span>
      </div>
      <div class="public-room-footer">
        <span>${statusIcon} ${statusText}</span>
        ${room.hasPassword ? '<span>🔒 Privée</span>' : '<span>🌐 Publique</span>'}
        ${isFull ? '<span style="color: var(--color-danger);">Complet</span>' : ''}
      </div>
    </div>
  `;
}

function sortRooms(rooms, sortBy) {
    const sorted = [...rooms];

    switch (sortBy) {
        case 'recent':
            sorted.sort((a, b) => {
                const dateA = new Date(a.createdAt || 0).getTime();
                const dateB = new Date(b.createdAt || 0).getTime();
                return dateB - dateA;
            });
            break;

        case 'players':
            sorted.sort((a, b) => (b.playerCount || 0) - (a.playerCount || 0));
            break;

        case 'name':
            sorted.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            break;
    }

    return sorted;
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function joinRoom(roomId) {
    try {
        const response = await socketActions.joinGame(roomId);

        if (response && response.success) {
            // Naviguer vers la salle d'attente
            window.dispatchEvent(new CustomEvent('navigate', {
                detail: { screen: 'waiting', params: { gameId: roomId } }
            }));
        } else {
            throw new Error(response?.error || 'Erreur');
        }

    } catch (error) {
        console.error('Erreur rejoindre salle:', error);
        showToast(error.message, 'error');
    }
}

function promptPassword(roomId) {
    const password = prompt('🔒 Cette salle est protégée. Mot de passe :');

    if (password === null) return; // Annulé

    joinRoomWithPassword(roomId, password);
}

async function joinRoomWithPassword(roomId, password) {
    try {
        const response = await socketActions.joinGame(roomId, { password });

        if (response && response.success) {
            window.dispatchEvent(new CustomEvent('navigate', {
                detail: { screen: 'waiting', params: { gameId: roomId } }
            }));
        } else {
            throw new Error(response?.error || 'Mot de passe incorrect');
        }

    } catch (error) {
        console.error('Erreur:', error);
        showToast(error.message, 'error');
    }
}

/**
 * Crée une salle publique
 */
export async function createRoom(settings = {}) {
    try {
        const response = await socketActions.createGame({
            maxPlayers: settings.maxPlayers || 4,
            mode: settings.mode || 'normal',
            isPublic: settings.isPublic !== false,
            name: settings.name || null,
            password: settings.password || null
        });

        if (response && response.success) {
            showToast('Salle créée !', 'success');

            window.dispatchEvent(new CustomEvent('navigate', {
                detail: { screen: 'waiting', params: { gameId: response.gameId } }
            }));

            return response.gameId;
        }

    } catch (error) {
        console.error('Erreur création salle:', error);
        showToast(error.message, 'error');
    }
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    state.unsubscribers.push(
        store.subscribe('social.publicRooms', () => renderRooms())
    );

    // Socket events
    socket.on('rooms_update', (data) => {
        if (data && data.rooms) {
            store.set('social.publicRooms', data.rooms);
        }
    });

    socket.on('room_created', (data) => {
        loadRooms();
    });

    socket.on('room_deleted', (data) => {
        loadRooms();
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
    }, 3500);
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    if (state.refreshInterval) {
        clearInterval(state.refreshInterval);
        state.refreshInterval = null;
    }
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 Salles publiques nettoyées');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    loadRooms,
    renderRooms,
    createRoom
};