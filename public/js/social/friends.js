// =============================================================
// JEU DE CARTES — SOCIAL : FRIENDS (Système d'amis)
// =============================================================
// Gestion complète des amis : liste, demandes, invitations,
// recherche, blocage.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    activeTab: 'list', // 'list' | 'requests'
    searchResults: [],
    isSearching: false,
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('👥 Initialisation des amis');

    // Attacher les événements
    attachEvents();

    // S'abonner aux changements
    setupSubscriptions();

    // Charger les données
    loadFriends();

    state.initialized = true;
    console.log('✅ Amis initialisés');
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Tabs
    helpers.$$('.friends-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            switchTab(tab.dataset.tab);
        });
    });

    // Recherche
    const searchBtn = helpers.$('#btn-search-friend');
    if (searchBtn) {
        searchBtn.addEventListener('click', handleSearch);
    }

    const searchInput = helpers.$('#input-friend-search');
    if (searchInput) {
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleSearch();
            }
        });

        // Debounce pour la recherche en direct
        searchInput.addEventListener('input', helpers.debounce(() => {
            handleSearch();
        }, 500));
    }
}

/* ============================================================
   TABS
   ============================================================ */

function switchTab(tabName) {
    state.activeTab = tabName;

    // Mettre à jour les onglets
    helpers.$$('.friends-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.tab === tabName);
    });

    // Mettre à jour le contenu
    helpers.$$('.friends-tab-content').forEach(content => {
        content.classList.toggle('active', content.id === `friends-tab-${tabName}`);
    });
}

/* ============================================================
   CHARGEMENT
   ============================================================ */

async function loadFriends() {
    try {
        const response = await socketActions.getFriends();

        if (response) {
            store.set('social.friends', response.friends || []);
            store.set('social.friendRequests', {
                incoming: response.requests?.incoming || [],
                outgoing: response.requests?.outgoing || []
            });
        }

        renderFriends();
        renderRequests();

    } catch (error) {
        console.error('Erreur chargement amis:', error);
    }
}

/* ============================================================
   RENDU — LISTE D'AMIS
   ============================================================ */

function renderFriends() {
    const container = helpers.$('#friends-list');
    if (!container) return;

    const friends = store.get('social.friends', []);

    if (friends.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>${i18n.t('friends.no_friends')}</p>
      </div>
    `;
        return;
    }

    // Trier : en ligne en premier, puis par nom
    const sorted = [...friends].sort((a, b) => {
        if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
        return a.name.localeCompare(b.name);
    });

    container.innerHTML = sorted.map(friend => renderFriendItem(friend)).join('');

    // Attacher les événements
    container.querySelectorAll('.friend-item').forEach(item => {
        const friendId = item.dataset.friendId;

        // Bouton inviter
        const inviteBtn = item.querySelector('.btn-invite');
        if (inviteBtn) {
            inviteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                inviteFriend(friendId);
            });
        }

        // Bouton retirer
        const removeBtn = item.querySelector('.btn-remove');
        if (removeBtn) {
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                removeFriend(friendId);
            });
        }
    });
}

function renderFriendItem(friend) {
    const statusClass = friend.isOnline ? 'online' : '';
    const statusText = friend.isOnline
        ? (friend.isInGame ? i18n.t('friends.in_game') : i18n.t('friends.online'))
        : i18n.t('friends.offline');

    return `
    <div class="friend-item" data-friend-id="${friend.id}">
      <div class="friend-avatar ${statusClass}">${friend.avatar || '👤'}</div>
      <div class="friend-info">
        <div class="friend-name">${helpers.escapeHtml(friend.name)}</div>
        <div class="friend-status ${statusClass}">${statusText}</div>
      </div>
      <div class="friend-actions">
        ${friend.isOnline && !friend.isInGame ? `
          <button class="btn btn-sm btn-primary btn-invite" title="Inviter">
            🎮
          </button>
        ` : ''}
        <button class="btn btn-sm btn-secondary btn-remove" title="Retirer">
          ✕
        </button>
      </div>
    </div>
  `;
}

/* ============================================================
   RENDU — DEMANDES
   ============================================================ */

function renderRequests() {
    const container = helpers.$('#friend-requests-list');
    if (!container) return;

    const requests = store.get('social.friendRequests', { incoming: [], outgoing: [] });
    const incoming = requests.incoming || [];
    const outgoing = requests.outgoing || [];

    if (incoming.length === 0 && outgoing.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>${i18n.t('friends.no_requests')}</p>
      </div>
    `;
        return;
    }

    let html = '';

    // Demandes reçues
    if (incoming.length > 0) {
        html += `
      <div style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px;">
        📥 Reçues (${incoming.length})
      </div>
    `;
        html += incoming.map(req => renderIncomingRequest(req)).join('');
    }

    // Demandes envoyées
    if (outgoing.length > 0) {
        html += `
      <div style="padding: 8px 12px; font-size: 11px; font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 1px; margin-top: 8px;">
        📤 Envoyées (${outgoing.length})
      </div>
    `;
        html += outgoing.map(req => renderOutgoingRequest(req)).join('');
    }

    container.innerHTML = html;

    // Attacher les événements
    container.querySelectorAll('.btn-accept').forEach(btn => {
        btn.addEventListener('click', () => acceptRequest(btn.dataset.friendId));
    });

    container.querySelectorAll('.btn-decline').forEach(btn => {
        btn.addEventListener('click', () => declineRequest(btn.dataset.friendId));
    });

    container.querySelectorAll('.btn-cancel').forEach(btn => {
        btn.addEventListener('click', () => cancelRequest(btn.dataset.friendId));
    });
}

function renderIncomingRequest(req) {
    return `
    <div class="friend-item" data-friend-id="${req.id}">
      <div class="friend-avatar">${req.avatar || '👤'}</div>
      <div class="friend-info">
        <div class="friend-name">${helpers.escapeHtml(req.name)}</div>
        <div class="friend-status">Veut être ton ami</div>
      </div>
      <div class="friend-actions">
        <button class="btn btn-sm btn-primary btn-accept" data-friend-id="${req.id}" title="Accepter">
          ✓
        </button>
        <button class="btn btn-sm btn-secondary btn-decline" data-friend-id="${req.id}" title="Refuser">
          ✕
        </button>
      </div>
    </div>
  `;
}

function renderOutgoingRequest(req) {
    return `
    <div class="friend-item" data-friend-id="${req.id}" style="opacity: 0.7;">
      <div class="friend-avatar">${req.avatar || '👤'}</div>
      <div class="friend-info">
        <div class="friend-name">${helpers.escapeHtml(req.name)}</div>
        <div class="friend-status">Demande envoyée</div>
      </div>
      <div class="friend-actions">
        <button class="btn btn-sm btn-secondary btn-cancel" data-friend-id="${req.id}" title="Annuler">
          ✕
        </button>
      </div>
    </div>
  `;
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function handleSearch() {
    const input = helpers.$('#input-friend-search');
    if (!input) return;

    const query = input.value.trim();

    if (query.length < 2) {
        helpers.$('#friend-search-results').innerHTML = '';
        return;
    }

    state.isSearching = true;

    try {
        // Recherche locale via API
        const response = await fetch(`/api/players/search?q=${encodeURIComponent(query)}`);

        if (response.ok) {
            const results = await response.json();
            state.searchResults = results;
            renderSearchResults(results);
        } else {
            renderSearchResults([]);
        }

    } catch (error) {
        console.error('Erreur recherche:', error);
        renderSearchResults([]);
    } finally {
        state.isSearching = false;
    }
}

function renderSearchResults(results) {
    const container = helpers.$('#friend-search-results');
    if (!container) return;

    if (!results || results.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small" style="padding: 12px;">
        <p>Aucun joueur trouvé</p>
      </div>
    `;
        return;
    }

    const myId = store.get('player.id');
    const friends = store.get('social.friends', []).map(f => f.id);
    const requests = store.get('social.friendRequests', { incoming: [], outgoing: [] });
    const pendingOut = (requests.outgoing || []).map(r => r.id);
    const pendingIn = (requests.incoming || []).map(r => r.id);

    container.innerHTML = results
        .filter(p => p.id !== myId)
        .map(player => {
            const isFriend = friends.includes(player.id);
            const hasPendingOut = pendingOut.includes(player.id);
            const hasPendingIn = pendingIn.includes(player.id);

            let actionButton = '';

            if (isFriend) {
                actionButton = '<span class="badge badge-success">Ami</span>';
            } else if (hasPendingOut) {
                actionButton = '<span class="badge badge-warning">En attente</span>';
            } else if (hasPendingIn) {
                actionButton = `<button class="btn btn-sm btn-primary btn-accept-search" data-friend-id="${player.id}">Accepter</button>`;
            } else {
                actionButton = `<button class="btn btn-sm btn-primary btn-add-search" data-friend-id="${player.id}">+ Ajouter</button>`;
            }

            return `
        <div class="friend-item">
          <div class="friend-avatar">${player.avatar || '👤'}</div>
          <div class="friend-info">
            <div class="friend-name">${helpers.escapeHtml(player.name)}</div>
            <div class="friend-status">ELO ${player.elo || 1000}</div>
          </div>
          <div class="friend-actions">
            ${actionButton}
          </div>
        </div>
      `;
        }).join('');

    // Attacher les événements
    container.querySelectorAll('.btn-add-search').forEach(btn => {
        btn.addEventListener('click', () => sendFriendRequest(btn.dataset.friendId));
    });

    container.querySelectorAll('.btn-accept-search').forEach(btn => {
        btn.addEventListener('click', () => acceptRequest(btn.dataset.friendId));
    });
}

async function sendFriendRequest(friendId) {
    try {
        const response = await socketActions.addFriend(friendId);

        if (response && response.success) {
            showToast('Demande envoyée !', 'success');
            loadFriends();
        } else {
            throw new Error(response?.error || 'Erreur');
        }

    } catch (error) {
        console.error('Erreur ajout ami:', error);
        showToast(error.message, 'error');
    }
}

async function acceptRequest(friendId) {
    try {
        const response = await socketActions.addFriend(friendId);

        if (response && response.success) {
            showToast('Ami ajouté !', 'success');
            loadFriends();
        }

    } catch (error) {
        console.error('Erreur acceptation:', error);
        showToast(error.message, 'error');
    }
}

async function declineRequest(friendId) {
    try {
        // Refuser = ne rien faire, ou envoyer un signal
        store.set('social.friendRequests', {
            ...store.get('social.friendRequests'),
            incoming: (store.get('social.friendRequests').incoming || []).filter(r => r.id !== friendId)
        });
        renderRequests();
        showToast('Demande refusée', 'info');

    } catch (error) {
        console.error('Erreur refus:', error);
    }
}

async function cancelRequest(friendId) {
    try {
        store.set('social.friendRequests', {
            ...store.get('social.friendRequests'),
            outgoing: (store.get('social.friendRequests').outgoing || []).filter(r => r.id !== friendId)
        });
        renderRequests();
        showToast('Demande annulée', 'info');

    } catch (error) {
        console.error('Erreur annulation:', error);
    }
}

async function removeFriend(friendId) {
    if (!confirm('Retirer cet ami ?')) return;

    try {
        // À implémenter côté serveur
        const friends = store.get('social.friends', []);
        store.set('social.friends', friends.filter(f => f.id !== friendId));
        renderFriends();
        showToast('Ami retiré', 'info');

    } catch (error) {
        console.error('Erreur retrait:', error);
    }
}

function inviteFriend(friendId) {
    const gameId = store.get('game.id');

    if (!gameId) {
        showToast('Crée d\'abord une partie', 'warning');
        return;
    }

    // Envoyer l'invitation
    socket.emit('invite_friend', { friendId, gameId });
    showToast('Invitation envoyée !', 'success');
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    state.unsubscribers.push(
        store.subscribe('social.friends', renderFriends),
        store.subscribe('social.friendRequests', renderRequests)
    );

    // Socket events
    socket.on('friend_request', (data) => {
        showToast(`📨 ${data.fromName} veut être ton ami !`, 'info');
        loadFriends();
    });

    socket.on('friend_accepted', (data) => {
        showToast(`✅ ${data.name} a accepté ton amitié !`, 'success');
        loadFriends();
    });

    socket.on('friend_online', (data) => {
        // Mettre à jour le statut
        const friends = store.get('social.friends', []);
        const index = friends.findIndex(f => f.id === data.playerId);
        if (index !== -1) {
            friends[index].isOnline = true;
            store.set('social.friends', [...friends]);
        }
    });

    socket.on('friend_offline', (data) => {
        const friends = store.get('social.friends', []);
        const index = friends.findIndex(f => f.id === data.playerId);
        if (index !== -1) {
            friends[index].isOnline = false;
            store.set('social.friends', [...friends]);
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
    }, 3500);
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.searchResults = [];
    state.initialized = false;
    console.log('🧹 Amis nettoyés');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    loadFriends,
    renderFriends,
    renderRequests,
    switchTab
};