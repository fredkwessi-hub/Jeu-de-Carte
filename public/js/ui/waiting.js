// =============================================================
// JEU DE CARTES — UI : WAITING (Salle d'attente)
// =============================================================
// Gère l'écran de salle d'attente : code de partie, liste des
// joueurs, ajout de bots, démarrage de la partie.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import { router, navigateTo, SCREENS } from '../router.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    gameId: null,
    isHost: false,
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(params = {}) {
    console.log('🎨 Initialisation de la salle d\'attente');

    state.gameId = params.gameId || store.get('waiting.gameId') || store.get('game.id');

    if (!state.gameId) {
        console.warn('⚠️ Pas de gameId, retour au lobby');
        navigateTo(SCREENS.LOBBY);
        return;
    }

    // Attacher les événements
    attachEvents();

    // S'abonner aux changements
    setupSubscriptions();

    // Rafraîchir le UI
    refreshUI();

    state.initialized = true;
    console.log('✅ Salle d\'attente initialisée:', state.gameId);
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton retour
    const backBtn = helpers.$('#btn-back-lobby');
    if (backBtn) {
        backBtn.addEventListener('click', handleLeave);
    }

    // Bouton copier le code
    const copyBtn = helpers.$('#btn-copy-code');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyGameCode);
    }

    // Bouton partager
    const shareBtn = helpers.$('#btn-share-code');
    if (shareBtn) {
        shareBtn.addEventListener('click', shareGameCode);
    }

    // Bouton ajouter un bot
    const addBotBtn = helpers.$('#btn-add-bot');
    if (addBotBtn) {
        addBotBtn.addEventListener('click', handleAddBot);
    }

    // Bouton démarrer la partie
    const startBtn = helpers.$('#btn-start-game');
    if (startBtn) {
        startBtn.addEventListener('click', handleStartGame);
    }
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function handleLeave() {
    if (!state.gameId) {
        navigateTo(SCREENS.LOBBY);
        return;
    }

    const confirmed = confirm(i18n.t('game.quit_confirm'));
    if (!confirmed) return;

    try {
        await socketActions.leaveGame(state.gameId);
    } catch (error) {
        console.error('Erreur quitter:', error);
    }

    // Nettoyer l'état
    store.reset('waiting');
    store.reset('game');

    navigateTo(SCREENS.LOBBY);
}

async function copyGameCode() {
    if (!state.gameId) return;

    try {
        await navigator.clipboard.writeText(state.gameId);
        showToast(i18n.t('common.copied'), 'success');
    } catch (error) {
        console.error('Erreur copie:', error);
        showToast('Impossible de copier', 'error');
    }
}

async function shareGameCode() {
    if (!state.gameId) return;

    const shareData = {
        title: '🃏 Jeu de Cartes',
        text: `Rejoins ma partie ! Code : ${state.gameId}`,
        url: `${window.location.origin}?game=${state.gameId}`
    };

    try {
        if (navigator.share) {
            await navigator.share(shareData);
        } else {
            await navigator.clipboard.writeText(shareData.text);
            showToast('Lien copié !', 'success');
        }
    } catch (error) {
        // L'utilisateur a annulé
        if (error.name !== 'AbortError') {
            console.error('Erreur partage:', error);
        }
    }
}

async function handleAddBot() {
    if (!state.gameId) return;

    const difficultySelect = helpers.$('#bot-difficulty');
    const difficulty = difficultySelect ? difficultySelect.value : 'medium';

    try {
        const response = await socketActions.addBot(state.gameId, difficulty);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur ajout bot');
        }

        showToast('🤖 Bot ajouté !', 'success');

    } catch (error) {
        console.error('Erreur ajout bot:', error);
        showToast(error.message, 'error');
    }
}

async function handleStartGame() {
    if (!state.gameId) return;

    // Vérifier qu'il y a au moins 2 joueurs
    const players = store.get('waiting.players', []);
    if (players.length < 2) {
        showToast('Il faut au moins 2 joueurs', 'warning');
        return;
    }

    // Vérifier qu'on est l'hôte
    if (!state.isHost) {
        showToast('Seul l\'hôte peut démarrer', 'warning');
        return;
    }

    try {
        const startBtn = helpers.$('#btn-start-game');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = `
        <span class="btn-shine"></span>
        <span class="btn-icon">⏳</span>
        <span class="btn-text">Démarrage...</span>
      `;
        }

        const response = await socketActions.startGame(state.gameId);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur démarrage');
        }

        // La navigation vers l'écran de jeu sera faite par l'événement `game:started`

    } catch (error) {
        console.error('Erreur démarrage:', error);
        showToast(error.message, 'error');

        // Réactiver le bouton
        const startBtn = helpers.$('#btn-start-game');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = `
        <span class="btn-shine"></span>
        <span class="btn-icon">🚀</span>
        <span class="btn-text">${i18n.t('waiting.start_game')}</span>
      `;
        }
    }
}

/* ============================================================
   UI — RAFRAÎCHISSEMENT
   ============================================================ */

function refreshUI() {
    refreshGameCode();
    refreshPlayersList();
    refreshStartButton();
    refreshBotControls();
}

function refreshGameCode() {
    const codeEl = helpers.$('#display-game-code');
    if (codeEl) {
        codeEl.textContent = state.gameId || '---';
    }
}

function refreshPlayersList() {
    const container = helpers.$('#waiting-players-list');
    if (!container) return;

    const players = store.get('waiting.players', []);
    const hostId = store.get('waiting.hostId');
    const myId = store.get('player.id');

    // Compteurs
    const countEl = helpers.$('#waiting-player-count');
    const maxEl = helpers.$('#waiting-max-players');
    if (countEl) countEl.textContent = players.length;
    if (maxEl) maxEl.textContent = store.get('waiting.maxPlayers', 4);

    if (players.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>En attente de joueurs...</p>
      </div>
    `;
        return;
    }

    container.innerHTML = players.map(player => {
        const isHost = player.id === hostId;
        const isMe = player.id === myId;
        const isBot = player.isBot;

        let classes = 'player-item';
        if (isHost) classes += ' host';
        if (isBot) classes += ' bot';
        if (isMe) classes += ' me';

        return `
      <div class="${classes}">
        <span>${helpers.escapeHtml(player.name)}</span>
        ${isBot ? `<span class="bot-badge">🤖 ${player.botDifficulty || 'Bot'}</span>` : ''}
        ${isMe ? '<span style="color: var(--color-primary); font-size: 12px;">(vous)</span>' : ''}
        ${isBot && state.isHost ? `
          <button
            class="btn-icon btn-icon-sm remove-bot-btn"
            data-bot-id="${player.id}"
            title="Retirer ce bot"
            style="margin-left: auto;"
          >×</button>
        ` : ''}
      </div>
    `;
    }).join('');

    // Attacher les handlers de suppression de bot
    container.querySelectorAll('.remove-bot-btn').forEach(btn => {
        btn.addEventListener('click', () => handleRemoveBot(btn.dataset.botId));
    });
}

function refreshStartButton() {
    const startBtn = helpers.$('#btn-start-game');
    const message = helpers.$('#waiting-message');
    if (!startBtn || !message) return;

    const players = store.get('waiting.players', []);
    const canStart = state.isHost && players.length >= 2;

    if (canStart) {
        startBtn.classList.remove('hidden');
        message.style.display = 'none';
        startBtn.disabled = false;
        startBtn.innerHTML = `
      <span class="btn-shine"></span>
      <span class="btn-icon">🚀</span>
      <span class="btn-text">${i18n.t('waiting.start_game')}</span>
    `;
    } else {
        startBtn.classList.add('hidden');
        message.style.display = 'block';

        if (!state.isHost) {
            message.textContent = 'En attente du démarrage par l\'hôte...';
        } else if (players.length < 2) {
            message.textContent = 'Ajoutez un bot ou attendez un joueur...';
        } else {
            message.textContent = i18n.t('waiting.awaiting_players');
        }
    }
}

function refreshBotControls() {
    const controls = helpers.$('#bot-controls');
    if (!controls) return;

    const players = store.get('waiting.players', []);
    const maxPlayers = store.get('waiting.maxPlayers', 4);

    // Afficher uniquement si on est l'hôte et qu'il reste de la place
    const canAddBot = state.isHost && players.length < maxPlayers;
    controls.classList.toggle('hidden', !canAddBot);
}

async function handleRemoveBot(botId) {
    if (!state.gameId || !botId) return;

    try {
        await socketActions.removeBot(state.gameId, botId);
        showToast('Bot retiré', 'success');
    } catch (error) {
        console.error('Erreur retrait bot:', error);
        showToast(error.message, 'error');
    }
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // État de la salle
    state.unsubscribers.push(
        store.subscribe('waiting.players', () => {
            refreshPlayersList();
            refreshStartButton();
            refreshBotControls();
        }),
        store.subscribe('waiting.maxPlayers', () => {
            refreshPlayersList();
            refreshBotControls();
        }),
        store.subscribe('waiting.isHost', () => {
            refreshStartButton();
            refreshBotControls();
        })
    );

    // Socket events
    socket.on('game:player_joined', (data) => {
        console.log('👤 Joueur rejoint:', data);
        if (data.players) {
            store.set('waiting.players', data.players);
        }
        if (data.player) {
            showToast(`${data.player.name} a rejoint`, 'info');
        }
    });

    socket.on('game:player_left', (data) => {
        console.log('👤 Joueur parti:', data);
        if (data.players) {
            store.set('waiting.players', data.players);
        }
    });

    socket.on('game:started', (data) => {
        console.log('🎮 Partie démarrée');
        navigateTo(SCREENS.GAME, {
            params: { gameId: state.gameId }
        });
    });

    socket.on('game:update', (data) => {
        // Mettre à jour la liste si on est encore dans la salle
        if (data.game && data.game.status === 'waiting') {
            updateWaitingFromGame(data.game);
        }
    });
}

/* ============================================================
   MISE À JOUR DEPUIS LES DONNÉES DU JEU
   ============================================================ */

/**
 * Met à jour l'état de la salle d'attente depuis les données reçues
 */
export function updateWaitingFromGame(game) {
    if (!game) return;

    const myId = store.get('player.id');

    store.batch(() => {
        store.set('waiting.gameId', game.id);
        store.set('waiting.hostId', game.hostId);
        store.set('waiting.isHost', game.hostId === myId);
        store.set('waiting.maxPlayers', game.maxPlayers);
        store.set('waiting.players', game.players || []);
    });

    state.isHost = game.hostId === myId;
}

/* ============================================================
   UTILITAIRES UI
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
    state.initialized = false;
    state.gameId = null;
    console.log('🧹 Salle d\'attente nettoyée');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    updateWaitingFromGame
};