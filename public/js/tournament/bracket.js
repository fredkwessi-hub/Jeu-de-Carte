// =============================================================
// JEU DE CARTES — TOURNAMENT : BRACKET (Arbre du tournoi)
// =============================================================
// Rendu visuel du bracket : rounds, matchs, connexions,
// progression, mise en évidence du round actif.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    container: null,
    unsubscribers: [],
    initialized: false,
    highlightedMatchId: null
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(containerSelector = '#bracket-display') {
    if (state.initialized) return;

    state.container = helpers.$(containerSelector);
    if (!state.container) {
        console.warn('⚠️ Container de bracket introuvable:', containerSelector);
        return;
    }

    // S'abonner aux changements
    state.unsubscribers.push(
        store.subscribe('tournament.bracket', () => render()),
        store.subscribe('tournament.currentRound', () => render()),
        store.subscribe('tournament.matches', () => render()),
        store.subscribe('tournament.status', () => render())
    );

    state.initialized = true;
    console.log('✅ Bracket initialisé');
}

/* ============================================================
   RENDU PRINCIPAL
   ============================================================ */

export function render() {
    if (!state.container) return;

    const bracket = store.get('tournament.bracket');
    const tournamentStatus = store.get('tournament.status');

    // Si pas de bracket, afficher un placeholder
    if (!bracket) {
        state.container.innerHTML = `
      <div class="empty-state-small" style="grid-column: 1 / -1;">
        <p>${tournamentStatus === 'lobby' ? '🏆 Le bracket sera généré au démarrage' : 'Chargement du bracket...'}</p>
      </div>
    `;
        return;
    }

    const rounds = bracket.rounds || [];
    const currentRound = bracket.currentRound || 1;

    if (rounds.length === 0) {
        state.container.innerHTML = `
      <div class="empty-state-small" style="grid-column: 1 / -1;">
        <p>Aucun match pour le moment</p>
      </div>
    `;
        return;
    }

    // Rendre chaque round
    state.container.innerHTML = rounds.map(round => {
        return renderRound(round, currentRound);
    }).join('');

    // Attacher les événements
    attachMatchEvents();
}

/* ============================================================
   RENDU D'UN ROUND
   ============================================================ */

function renderRound(round, currentRound) {
    const isActive = round.number === currentRound;
    const isCompleted = round.completed;
    const isFuture = round.number > currentRound;

    let roundClasses = 'bracket-round';
    if (isActive && !isCompleted) roundClasses += ' active';
    if (isCompleted) roundClasses += ' completed';
    if (isFuture) roundClasses += ' future';

    // Header avec nom du round
    const headerHtml = `
    <div class="bracket-round-header">
      ${round.name}
      ${isActive && !isCompleted ? '<span class="round-active-badge">En cours</span>' : ''}
    </div>
  `;

    // Matchs
    const matchesHtml = (round.matches || []).map(match => {
        return renderMatch(match);
    }).join('');

    return `
    <div class="${roundClasses}" data-round-number="${round.number}">
      ${headerHtml}
      ${matchesHtml}
    </div>
  `;
}

/* ============================================================
   RENDU D'UN MATCH
   ============================================================ */

function renderMatch(match) {
    const myId = store.get('player.id');

    let cardClasses = 'match-card';
    if (match.status === 'playing') cardClasses += ' playing';
    else if (match.status === 'finished') cardClasses += ' finished';
    else cardClasses += ' pending';

    // Highlight
    if (state.highlightedMatchId === match.id) {
        cardClasses += ' highlighted';
    }

    const player1Html = renderMatchPlayer(match.player1, match.winner, myId, 'player1');
    const player2Html = renderMatchPlayer(match.player2, match.winner, myId, 'player2');

    return `
    <div class="${cardClasses}" data-match-id="${match.id}">
      ${player1Html}
      <div class="match-vs">VS</div>
      ${player2Html}
    </div>
  `;
}

function renderMatchPlayer(player, winner, myId, position) {
    // Cas : joueur manquant (bye ou à déterminer)
    if (!player) {
        return `
      <div class="match-player bye">
        <div class="match-player-avatar">❓</div>
        <span class="match-player-name">À déterminer</span>
      </div>
    `;
    }

    const isWinner = winner && winner.id === player.id;
    const isMe = player.id === myId;

    let classes = 'match-player';
    if (isWinner) classes += ' winner';
    if (isMe) classes += ' me';
    if (player.isBot) classes += ' bot';

    // Avatar (emoji ou initiale)
    const avatarContent = player.avatar || (player.isBot ? '🤖' : '👤');

    return `
    <div class="${classes}" data-player-id="${player.id}">
      <div class="match-player-avatar">${avatarContent}</div>
      <span class="match-player-name">${helpers.escapeHtml(player.name)}</span>
      ${player.isBot ? '<span class="match-player-bot">BOT</span>' : ''}
      ${isWinner ? '<span class="match-player-score">✓</span>' : ''}
    </div>
  `;
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachMatchEvents() {
    if (!state.container) return;

    state.container.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => {
            const matchId = card.dataset.matchId;
            handleMatchClick(matchId);
        });
    });
}

function handleMatchClick(matchId) {
    const bracket = store.get('tournament.bracket');
    if (!bracket) return;

    // Trouver le match
    let match = null;
    for (const round of bracket.rounds || []) {
        const found = (round.matches || []).find(m => m.id === matchId);
        if (found) {
            match = found;
            break;
        }
    }

    if (!match) return;

    // Si le match est en cours et qu'on y participe, on peut y aller
    const myId = store.get('player.id');
    const isMyMatch =
        (match.player1 && match.player1.id === myId) ||
        (match.player2 && match.player2.id === myId);

    if (match.status === 'playing' && isMyMatch) {
        // Naviguer vers l'écran de jeu
        helpers.$('#gameScreen')?.classList.add('active');
        // Ou émettre un événement
        window.dispatchEvent(new CustomEvent('navigate', {
            detail: { screen: 'game' }
        }));
    } else if (match.status === 'playing') {
        // Spectateur
        window.dispatchEvent(new CustomEvent('navigate', {
            detail: { screen: 'spectator', params: { gameId: match.gameId } }
        }));
    }
}

/* ============================================================
   MISE À JOUR CIBLÉE
   ============================================================ */

/**
 * Met en évidence un match spécifique
 */
export function highlightMatch(matchId, duration = 3000) {
    state.highlightedMatchId = matchId;

    // Re-render
    render();

    // Retirer le highlight après un délai
    setTimeout(() => {
        state.highlightedMatchId = null;
        render();
    }, duration);
}

/**
 * Met à jour un seul match (plus efficace que re-render complet)
 */
export function updateMatch(matchId) {
    if (!state.container) return;

    const bracket = store.get('tournament.bracket');
    if (!bracket) return;

    // Trouver le match
    let match = null;
    for (const round of bracket.rounds || []) {
        const found = (round.matches || []).find(m => m.id === matchId);
        if (found) {
            match = found;
            break;
        }
    }

    if (!match) return;

    // Trouver l'élément DOM
    const cardEl = state.container.querySelector(`[data-match-id="${matchId}"]`);
    if (!cardEl) {
        // Match pas encore rendu, re-render complet
        render();
        return;
    }

    // Remplacer le contenu
    const newCard = document.createElement('div');
    newCard.innerHTML = renderMatch(match);
    const newCardEl = newCard.firstElementChild;

    cardEl.replaceWith(newCardEl);

    // Re-attacher les événements
    newCardEl.addEventListener('click', () => handleMatchClick(matchId));
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

/**
 * Récupère le nom du round selon son numéro
 */
export function getRoundName(roundNumber, totalRounds) {
    const remaining = totalRounds - roundNumber + 1;
    const names = {
        1: 'Finale',
        2: 'Demi-finales',
        3: 'Quarts de finale',
        4: 'Huitièmes de finale',
        5: 'Seizièmes de finale'
    };
    return names[remaining] || `Tour ${roundNumber}`;
}

/**
 * Compte les matchs terminés / total
 */
export function getMatchProgress() {
    const bracket = store.get('tournament.bracket');
    if (!bracket) return { finished: 0, total: 0, percentage: 0 };

    let finished = 0;
    let total = 0;

    (bracket.rounds || []).forEach(round => {
        (round.matches || []).forEach(match => {
            total++;
            if (match.status === 'finished') finished++;
        });
    });

    return {
        finished,
        total,
        percentage: total > 0 ? Math.round((finished / total) * 100) : 0
    };
}

/**
 * Récupère le prochain match
 */
export function getNextMatch() {
    const bracket = store.get('tournament.bracket');
    if (!bracket) return null;

    for (const round of bracket.rounds || []) {
        for (const match of round.matches || []) {
            if (match.status === 'pending' && match.player1 && match.player2) {
                return match;
            }
        }
    }

    return null;
}

/**
 * Vérifie si le bracket est terminé
 */
export function isFinished() {
    const bracket = store.get('tournament.bracket');
    if (!bracket) return false;

    const lastRound = bracket.rounds?.[bracket.rounds.length - 1];
    if (!lastRound) return false;

    return lastRound.matches?.length === 1 && lastRound.matches[0].status === 'finished';
}

/**
 * Récupère le champion
 */
export function getChampion() {
    const bracket = store.get('tournament.bracket');
    if (!bracket) return null;

    const lastRound = bracket.rounds?.[bracket.rounds.length - 1];
    if (!lastRound) return null;

    const finalMatch = lastRound.matches?.[0];
    if (!finalMatch || finalMatch.status !== 'finished') return null;

    return finalMatch.winner;
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.container = null;
    state.highlightedMatchId = null;
    state.initialized = false;
    console.log('🧹 Bracket nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    render,
    destroy,
    highlightMatch,
    updateMatch,
    getRoundName,
    getMatchProgress,
    getNextMatch,
    isFinished,
    getChampion
};