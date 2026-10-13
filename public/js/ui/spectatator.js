// =============================================================
// JEU DE CARTES — UI : SPECTATOR (Mode spectateur)
// =============================================================
// Gère le mode spectateur : observer une partie en cours sans
// y participer, voir les actions et le journal.
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
    unsubscribers: [],
    initialized: false,
    lastPileCount: 0
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(params = {}) {
    console.log('👁️ Initialisation du mode spectateur');

    state.gameId = params.gameId || store.get('spectator.gameId');

    if (!state.gameId) {
        console.warn('⚠️ Pas de gameId, retour au lobby');
        navigateTo(SCREENS.LOBBY);
        return;
    }

    // Attacher les événements
    attachEvents();

    // S'abonner aux changements
    setupSubscriptions();

    // Demander à rejoindre en tant que spectateur
    requestSpectate();

    // Rendu initial
    render();

    state.initialized = true;
    console.log('✅ Mode spectateur initialisé:', state.gameId);
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton quitter
    const exitBtn = helpers.$('#btn-exit-spectator');
    if (exitBtn) {
        exitBtn.addEventListener('click', handleQuit);
    }

    // Toggle journal
    const logHeader = helpers.$('#spectator-log-header');
    if (logHeader) {
        logHeader.addEventListener('click', toggleLog);
    }
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function requestSpectate() {
    if (!state.gameId) return;

    try {
        socketActions.spectateGame(state.gameId);
        console.log('👁️ Demande de spectate envoyée');
    } catch (error) {
        console.error('Erreur spectate:', error);
        showToast('Impossible de rejoindre en spectateur', 'error');
        setTimeout(() => navigateTo(SCREENS.LOBBY), 1500);
    }
}

function handleQuit() {
    if (state.gameId) {
        socketActions.stopSpectating(state.gameId);
    }

    store.reset('spectator');
    navigateTo(SCREENS.LOBBY);
}

function toggleLog() {
    const content = helpers.$('#spectator-log-content');
    const btn = helpers.$('#btn-toggle-spectator-log');
    if (!content) return;

    content.classList.toggle('collapsed');

    if (btn) {
        btn.textContent = content.classList.contains('collapsed') ? '▲' : '▼';
    }
}

/* ============================================================
   RENDU
   ============================================================ */

function render() {
    renderHeader();
    renderOpponents();
    renderCenterCard();
    renderTurnInfo();
    renderLog();
}

function renderHeader() {
    const codeEl = helpers.$('#spectator-game-code');
    if (codeEl) codeEl.textContent = state.gameId;

    const playersEl = helpers.$('#spectator-players');
    if (playersEl) {
        const players = store.get('spectator.game.players', []);
        const names = players.map(p => p.name).join(', ');
        playersEl.textContent = names || '...';
    }
}

function renderOpponents() {
    const container = helpers.$('#spectator-opponents-zone');
    if (!container) return;

    const game = store.get('spectator.game');
    if (!game) {
        container.innerHTML = '<div class="empty-state-small">Chargement...</div>';
        return;
    }

    const players = game.players || [];
    const currentPlayerId = game.currentPlayerId;

    if (players.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = players.map(player => {
        const isCurrent = player.id === currentPlayerId;
        const isFinished = player.rank !== null && player.rank !== undefined;

        let classes = 'opponent';
        if (isCurrent) classes += ' current';
        if (isFinished) classes += ' finished';
        if (player.isBot) classes += ' bot-opponent';

        const miniCardsCount = Math.min(player.cardCount || 0, 8);
        const miniCards = Array(miniCardsCount).fill('<div class="mini-card"></div>').join('');

        return `
      <div class="${classes}">
        <div class="opponent-name">
          ${player.avatar || '👤'} ${helpers.escapeHtml(player.name)}
        </div>
        ${player.isBot ? `<div class="opponent-bot-badge">🤖 ${player.botDifficulty || 'Bot'}</div>` : ''}
        <div class="opponent-cards">
          🖐️ ${player.cardCount || 0} cartes
        </div>
        ${isFinished ? `<div class="opponent-rank">🏆 #${player.rank}</div>` : ''}
        <div class="mini-cards">${miniCards}</div>
      </div>
    `;
    }).join('');
}

function renderCenterCard() {
    const container = helpers.$('#spectator-center-card');
    if (!container) return;

    const game = store.get('spectator.game');
    const card = game?.centerCard;

    if (!card) {
        container.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">En attente...</div>';
        return;
    }

    container.innerHTML = renderCardHTML(card);

    let classes = 'card center-card';
    if (card.type === 'joker') {
        classes += ' joker';
        if (card.jokerColor === 'noir') classes += ' joker-black';
    } else {
        classes += ` ${card.color || 'black'}`;
    }
    container.className = classes;

    // Compteurs
    const bankCountEl = helpers.$('#spectator-bank-count');
    if (bankCountEl && game) {
        bankCountEl.textContent = `${game.bankCount || 0} cartes`;
    }
}

function renderTurnInfo() {
    const indicator = helpers.$('#spectator-turn-info');
    if (!indicator) return;

    const game = store.get('spectator.game');
    if (!game) {
        indicator.textContent = '⏳ Chargement...';
        return;
    }

    const currentPlayer = (game.players || []).find(p => p.id === game.currentPlayerId);

    if (currentPlayer) {
        indicator.textContent = `⏳ Tour de ${currentPlayer.name}`;
    } else {
        indicator.textContent = '⏳ En attente...';
    }
}

function renderLog() {
    const container = helpers.$('#spectator-log-content');
    if (!container) return;

    const game = store.get('spectator.game');
    const log = game?.log || [];

    if (log.length === 0) {
        container.innerHTML = '<div class="log-entry" style="opacity:0.5;">Aucun événement</div>';
        return;
    }

    container.innerHTML = log.slice().reverse().map(entry => {
        const message = typeof entry === 'string' ? entry : entry.message || '';
        return `<div class="log-entry">${helpers.escapeHtml(message)}</div>`;
    }).join('');
}

function renderCardHTML(card) {
    if (!card) return '';

    if (card.type === 'joker') {
        return `
      <div class="card-corner top-left">🃏</div>
      <div class="card-symbol">${card.jokerColor === 'rouge' ? '🔴' : '⚫'}</div>
      <div class="card-rank">JOKER</div>
      <div class="card-corner bottom-right">🃏</div>
    `;
    }

    const symbol = card.symbol || helpers.getSuitSymbol(card.suit);

    return `
    <div class="card-corner top-left">${card.rank}<br>${symbol}</div>
    <div class="card-symbol">${symbol}</div>
    <div class="card-rank">${card.rank}</div>
    <div class="card-corner bottom-right">${card.rank}<br>${symbol}</div>
  `;
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // State
    state.unsubscribers.push(
        store.subscribe('spectator.game', () => {
            render();
        })
    );

    // Socket events
    socket.on('spectator:started', (data) => {
        console.log('👁️ Spectate démarré');
        if (data.game) {
            store.set('spectator.isSpectating', true);
            store.set('spectator.gameId', data.game.id);
            store.set('spectator.game', data.game);
        }
        render();
    });

    socket.on('spectator:update', (data) => {
        if (data) {
            store.set('spectator.game', data);
        }
    });
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
    console.log('🧹 Mode spectateur nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy
};