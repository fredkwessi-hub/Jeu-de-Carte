// =============================================================
// JEU DE CARTES — TOURNAMENT : MATCHES (Suivi des matchs)
// =============================================================
// Suivi en temps réel des matchs : en cours, à venir, historique,
// notifications de démarrage/fin de match.
// =============================================================

import store from '../state.js';
import { socket } from '../socket.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    currentMatchId: null,
    currentMatch: null,
    matchHistory: [],
    unsubscribers: [],
    initialized: false,
    matchStartTime: null
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('⚔️ Initialisation du suivi des matchs');

    setupSubscriptions();
    setupSocketListeners();

    state.initialized = true;
    console.log('✅ Suivi des matchs initialisé');
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    state.unsubscribers.push(
        store.subscribe('tournament.matches', () => {
            updateMatchHistory();
        }),
        store.subscribe('tournament.bracket', () => {
            updateMatchHistory();
        })
    );
}

function setupSocketListeners() {
    // Début d'un match
    socket.on('tournament:match_started', (data) => {
        handleMatchStarted(data);
    });

    // Fin d'un match
    socket.on('tournament:match_ended', (data) => {
        handleMatchEnded(data);
    });

    // Championnat terminé
    socket.on('tournament:finished', (data) => {
        handleTournamentFinished(data);
    });
}

/* ============================================================
   GESTION DES ÉVÉNEMENTS
   ============================================================ */

function handleMatchStarted(data) {
    if (!data) return;

    console.log('⚔️ Match démarré:', data.matchId);

    state.currentMatchId = data.matchId;
    state.matchStartTime = Date.now();

    // Trouver les infos du match
    const match = findMatchById(data.matchId);
    if (match) {
        state.currentMatch = match;

        // Vérifier si c'est notre match
        const myId = store.get('player.id');
        const isMyMatch =
            (match.player1 && match.player1.id === myId) ||
            (match.player2 && match.player2.id === myId);

        if (isMyMatch) {
            // C'est notre match ! Notification
            showMatchNotification(match, true);

            // Naviguer vers l'écran de jeu sera fait par le socket `game_started`
        } else {
            // Match d'autres joueurs
            showMatchNotification(match, false);
        }
    }
}

function handleMatchEnded(data) {
    if (!data || !data.match) return;

    console.log('🏁 Match terminé:', data.match.id);

    const { match, tournament } = data;

    // Ajouter à l'historique
    state.matchHistory.unshift({
        id: match.id,
        round: match.round,
        winner: match.winner,
        loser: match.loser,
        finishedAt: new Date().toISOString()
    });

    // Limiter la taille
    if (state.matchHistory.length > 50) {
        state.matchHistory.pop();
    }

    // Notification
    if (match.winner) {
        showToast(`🏆 ${match.winner.name} remporte le match !`, 'success');
    }

    state.currentMatch = null;
    state.currentMatchId = null;
    state.matchStartTime = null;
}

function handleTournamentFinished(data) {
    console.log('🎉 Championnat terminé');

    state.currentMatch = null;
    state.currentMatchId = null;
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

function showMatchNotification(match, isMyMatch) {
    const player1 = match.player1?.name || '?';
    const player2 = match.player2?.name || '?';

    const message = isMyMatch
        ? `⚔️ À toi de jouer !\n${player1} vs ${player2}`
        : `⚔️ ${player1} vs ${player2}`;

    if (isMyMatch) {
        showToast('⚔️ Ton match commence !', 'warning');
    } else {
        showToast(`⚔️ ${player1} vs ${player2}`, 'info');
    }
}

/* ============================================================
   RECHERCHE DE MATCH
   ============================================================ */

function findMatchById(matchId) {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return null;

    for (const round of bracket.rounds) {
        const match = (round.matches || []).find(m => m.id === matchId);
        if (match) return match;
    }

    return null;
}

/* ============================================================
   MISE À JOUR DE L'HISTORIQUE
   ============================================================ */

function updateMatchHistory() {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return;

    const history = [];

    bracket.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
            if (match.status === 'finished' && match.winner) {
                history.push({
                    id: match.id,
                    round: match.round,
                    roundName: getRoundName(match.round),
                    winner: match.winner,
                    loser: match.loser,
                    finishedAt: match.finishedAt
                });
            }
        });
    });

    // Trier par date décroissante
    history.sort((a, b) => {
        const dateA = new Date(a.finishedAt || 0).getTime();
        const dateB = new Date(b.finishedAt || 0).getTime();
        return dateB - dateA;
    });

    state.matchHistory = history;
}

/* ============================================================
   GETTERS
   ============================================================ */

/**
 * Récupère le match en cours
 */
export function getCurrentMatch() {
    return state.currentMatch;
}

/**
 * Récupère le prochain match
 */
export function getNextMatch() {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return null;

    const currentRound = bracket.currentRound || 1;

    // Chercher d'abord dans le round actuel
    for (const round of bracket.rounds) {
        if (round.number !== currentRound) continue;

        for (const match of round.matches || []) {
            if (match.status === 'pending' && match.player1 && match.player2) {
                return match;
            }
        }
    }

    // Sinon chercher dans les rounds suivants
    for (const round of bracket.rounds) {
        if (round.number <= currentRound) continue;

        for (const match of round.matches || []) {
            if (match.status === 'pending' && match.player1 && match.player2) {
                return match;
            }
        }
    }

    return null;
}

/**
 * Récupère l'historique des matchs
 */
export function getMatchHistory() {
    return [...state.matchHistory];
}

/**
 * Récupère les matchs d'un round
 */
export function getMatchesByRound(roundNumber) {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return [];

    const round = bracket.rounds.find(r => r.number === roundNumber);
    return round ? (round.matches || []) : [];
}

/**
 * Récupère tous les matchs à venir
 */
export function getUpcomingMatches() {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return [];

    const upcoming = [];

    bracket.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
            if (match.status === 'pending' && match.player1 && match.player2) {
                upcoming.push({
                    ...match,
                    roundName: getRoundName(match.round)
                });
            }
        });
    });

    return upcoming;
}

/**
 * Récupère les matchs en cours
 */
export function getOngoingMatches() {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) return [];

    const ongoing = [];

    bracket.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
            if (match.status === 'playing') {
                ongoing.push({
                    ...match,
                    roundName: getRoundName(match.round)
                });
            }
        });
    });

    return ongoing;
}

/**
 * Vérifie si un joueur est en train de jouer
 */
export function isPlayerPlaying(playerId) {
    const ongoing = getOngoingMatches();
    return ongoing.some(match =>
        (match.player1 && match.player1.id === playerId) ||
        (match.player2 && match.player2.id === playerId)
    );
}

/* ============================================================
   STATISTIQUES
   ============================================================ */

/**
 * Récupère des stats sur les matchs
 */
export function getStats() {
    const bracket = store.get('tournament.bracket');
    if (!bracket || !bracket.rounds) {
        return {
            total: 0,
            pending: 0,
            playing: 0,
            finished: 0,
            progress: 0
        };
    }

    let pending = 0;
    let playing = 0;
    let finished = 0;

    bracket.rounds.forEach(round => {
        (round.matches || []).forEach(match => {
            if (match.status === 'pending') pending++;
            else if (match.status === 'playing') playing++;
            else if (match.status === 'finished') finished++;
        });
    });

    const total = pending + playing + finished;
    const progress = total > 0 ? Math.round((finished / total) * 100) : 0;

    return { total, pending, playing, finished, progress };
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

function getRoundName(roundNumber) {
    const totalRounds = store.get('tournament.totalRounds', 2);
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
   RENDU (optionnel : liste textuelle)
   ============================================================ */

/**
 * Génère le HTML de la liste des matchs à venir
 */
export function renderUpcomingMatches(container) {
    const el = typeof container === 'string' ? helpers.$(container) : container;
    if (!el) return;

    const upcoming = getUpcomingMatches();

    if (upcoming.length === 0) {
        el.innerHTML = '<div class="empty-state-small">Aucun match à venir</div>';
        return;
    }

    el.innerHTML = upcoming.map(match => `
    <div class="match-history-item">
      <span class="match-history-round">${match.roundName}</span>
      <span class="match-history-players">
        ${helpers.escapeHtml(match.player1.name)} vs ${helpers.escapeHtml(match.player2.name)}
      </span>
    </div>
  `).join('');
}

/**
 * Génère le HTML de l'historique des matchs
 */
export function renderMatchHistory(container) {
    const el = typeof container === 'string' ? helpers.$(container) : container;
    if (!el) return;

    const history = getMatchHistory();

    if (history.length === 0) {
        el.innerHTML = '<div class="empty-state-small">Aucun match terminé</div>';
        return;
    }

    el.innerHTML = history.map(match => `
    <div class="match-history-item">
      <span class="match-history-round">${match.roundName}</span>
      <span class="match-history-players">
        ${helpers.escapeHtml(match.winner.name)} bat ${helpers.escapeHtml(match.loser.name)}
      </span>
      <span class="match-history-winner">🏆</span>
    </div>
  `).join('');
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.currentMatch = null;
    state.currentMatchId = null;
    state.matchHistory = [];
    state.initialized = false;
    console.log('🧹 Suivi des matchs nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    getCurrentMatch,
    getNextMatch,
    getMatchHistory,
    getMatchesByRound,
    getUpcomingMatches,
    getOngoingMatches,
    isPlayerPlaying,
    getStats,
    renderUpcomingMatches,
    renderMatchHistory
};