// =============================================================
// JEU DE CARTES — PROFILE : STATS (Statistiques)
// =============================================================
// Gestion et affichage des statistiques du joueur :
// parties, victoires, taux, séries, temps de jeu.
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
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('📊 Initialisation des statistiques');

    // S'abonner aux changements
    state.unsubscribers.push(
        store.subscribe('player', () => render()),
        store.subscribe('stats', () => render())
    );

    state.initialized = true;
    console.log('✅ Statistiques initialisées');
}

/* ============================================================
   RENDU
   ============================================================ */

/**
 * Rend les statistiques dans le container
 */
export function render(containerSelector = '#profile-stats') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const stats = getStats();

    container.innerHTML = `
    <div class="stats-grid">
      ${renderStatCard('🎮', stats.gamesPlayed, 'Parties jouées')}
      ${renderStatCard('🏆', stats.wins, 'Victoires')}
      ${renderStatCard('📊', stats.winRate + '%', 'Taux de victoire')}
      ${renderStatCard('🔥', stats.longestStreak, 'Meilleure série')}
    </div>
  `;
}

/**
 * Rend une carte de stat
 */
function renderStatCard(emoji, value, label) {
    return `
    <div class="stat-card-large glass-card">
      <span class="stat-card-emoji">${emoji}</span>
      <span class="stat-card-value">${value}</span>
      <span class="stat-card-label">${label}</span>
    </div>
  `;
}

/**
 * Rend les statistiques détaillées
 */
export function renderDetailed(containerSelector = '#profile-detailed') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const stats = getStats();

    container.innerHTML = `
    <div class="profile-section glass-card">
      <h3 class="profile-section-title">📈 Statistiques détaillées</h3>
      <div class="stats-detailed-grid">
        ${renderStatRow('🎯 Parties totales', stats.gamesPlayed)}
        ${renderStatRow('✅ Victoires', stats.wins)}
        ${renderStatRow('❌ Défaites', stats.losses)}
        ${renderStatRow('📊 Taux de victoire', stats.winRate + '%')}
        ${renderStatRow('🔥 Série actuelle', stats.currentStreak)}
        ${renderStatRow('🏆 Meilleure série', stats.longestStreak)}
        ${renderStatRow('📉 Pire série', stats.longestLoseStreak)}
        ${renderStatRow('⏱️ Temps de jeu', helpers.formatDuration(stats.totalPlayTime))}
        ${renderStatRow('🃏 Cartes jouées', helpers.formatNumber(stats.totalCardsPlayed))}
        ${renderStatRow('🎯 Jokers joués', stats.jokersPlayed)}
        ${renderStatRow('7️⃣ Sept joués', stats.sevensPlayed)}
        ${renderStatRow('🅰️ As joués', stats.acesPlayed)}
        ${renderStatRow('🎭 Valets joués', stats.jacksPlayed)}
        ${renderStatRow('👑 Rois joués', stats.kingsPlayed)}
        ${renderStatRow('✨ Parties parfaites', stats.perfectGames)}
        ${renderStatRow('🦅 Comebacks', stats.comebacks)}
      </div>
    </div>
  `;
}

function renderStatRow(label, value) {
    return `
    <div class="stat-row">
      <span class="stat-row-label">${label}</span>
      <span class="stat-row-value">${value}</span>
    </div>
  `;
}

/* ============================================================
   GETTERS
   ============================================================ */

/**
 * Récupère les statistiques actuelles
 */
export function getStats() {
    return {
        gamesPlayed: store.get('player.gamesPlayed', 0),
        wins: store.get('player.wins', 0),
        losses: store.get('player.losses', 0),
        winRate: store.get('player.winRate', 0),
        currentStreak: store.get('player.currentStreak', 0),
        longestStreak: store.get('player.longestStreak', 0),
        longestLoseStreak: store.get('player.longestLoseStreak', 0),
        totalPlayTime: store.get('stats.totalPlayTime', 0),
        totalCardsPlayed: store.get('stats.totalCardsPlayed', 0),
        jokersPlayed: store.get('stats.jokersPlayed', 0),
        sevensPlayed: store.get('stats.sevensPlayed', 0),
        acesPlayed: store.get('stats.acesPlayed', 0),
        jacksPlayed: store.get('stats.jacksPlayed', 0),
        kingsPlayed: store.get('stats.kingsPlayed', 0),
        perfectGames: store.get('stats.perfectGames', 0),
        comebacks: store.get('stats.comebacks', 0)
    };
}

/* ============================================================
   MISE À JOUR
   ============================================================ */

/**
 * Met à jour les stats après une partie
 */
export function updateAfterGame(result) {
    if (!result) return;

    const won = result.won || false;
    const rank = result.rank || null;

    // Incrémenter les compteurs
    store.increment('player.gamesPlayed', 1);

    if (won) {
        store.increment('player.wins', 1);
        store.increment('player.currentStreak', 1);

        // Meilleure série
        const currentStreak = store.get('player.currentStreak', 0);
        const longestStreak = store.get('player.longestStreak', 0);
        if (currentStreak > longestStreak) {
            store.set('player.longestStreak', currentStreak);
        }

        // Reset lose streak
        store.set('player.currentLoseStreak', 0);

    } else {
        store.increment('player.losses', 1);
        store.increment('player.currentLoseStreak', 1);

        // Pire série
        const currentLoseStreak = store.get('player.currentLoseStreak', 0);
        const longestLoseStreak = store.get('player.longestLoseStreak', 0);
        if (currentLoseStreak > longestLoseStreak) {
            store.set('player.longestLoseStreak', currentLoseStreak);
        }

        // Reset win streak
        store.set('player.currentStreak', 0);
    }

    // Recalculer le win rate
    const gamesPlayed = store.get('player.gamesPlayed', 0);
    const wins = store.get('player.wins', 0);
    const winRate = gamesPlayed > 0 ? Math.round((wins / gamesPlayed) * 100) : 0;
    store.set('player.winRate', winRate);

    // Durée de jeu
    if (result.duration) {
        store.increment('stats.totalPlayTime', result.duration);
    }

    // Cartes jouées
    if (result.stats) {
        if (result.stats.cardsPlayed) store.increment('stats.totalCardsPlayed', result.stats.cardsPlayed);
        if (result.stats.jokersPlayed) store.increment('stats.jokersPlayed', result.stats.jokersPlayed);
        if (result.stats.sevensPlayed) store.increment('stats.sevensPlayed', result.stats.sevensPlayed);
        if (result.stats.acesPlayed) store.increment('stats.acesPlayed', result.stats.acesPlayed);
        if (result.stats.jacksPlayed) store.increment('stats.jacksPlayed', result.stats.jacksPlayed);
        if (result.stats.kingsPlayed) store.increment('stats.kingsPlayed', result.stats.kingsPlayed);
    }

    // Parties parfaites (gagnées sans piocher)
    if (won && result.stats?.perfectGame) {
        store.increment('stats.perfectGames', 1);
    }

    // Comebacks (gagné après avoir été dernier)
    if (won && result.stats?.comeback) {
        store.increment('stats.comebacks', 1);
    }

    // Persister
    store.persist();
}

/* ============================================================
   FORMATAGE
   ============================================================ */

/**
 * Retourne un résumé texte des stats
 */
export function getSummary() {
    const stats = getStats();

    return `${stats.wins}V - ${stats.losses}D (${stats.winRate}%)`;
}

/**
 * Retourne le rang textuel basé sur le win rate
 */
export function getRankTitle() {
    const stats = getStats();
    const winRate = stats.winRate;

    if (stats.gamesPlayed < 5) return '🌱 Débutant';
    if (winRate >= 70) return '🌟 Légende';
    if (winRate >= 60) return '👑 Maître';
    if (winRate >= 50) return '⭐ Expert';
    if (winRate >= 40) return '🔷 Confirmé';
    if (winRate >= 30) return '🔹 Intermédiaire';
    return '🌿 Apprenti';
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 Statistiques nettoyées');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    render,
    renderDetailed,
    getStats,
    updateAfterGame,
    getSummary,
    getRankTitle
};