// =============================================================
// JEU DE CARTES — PROFILE : ELO (Classement ELO)
// =============================================================
// Gestion du classement ELO : niveaux, progression, rangs,
// historique des changements.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const LEVELS = [
    { level: 1, minElo: 0, name: 'Débutant', emoji: '🌱', color: '#2ECC71' },
    { level: 2, minElo: 800, name: 'Apprenti', emoji: '🌿', color: '#27AE60' },
    { level: 3, minElo: 1000, name: 'Intermédiaire', emoji: '🌳', color: '#3498DB' },
    { level: 4, minElo: 1200, name: 'Confirmé', emoji: '⭐', color: '#9B59B6' },
    { level: 5, minElo: 1400, name: 'Avancé', emoji: '🌟', color: '#F39C12' },
    { level: 6, minElo: 1600, name: 'Expert', emoji: '💫', color: '#E67E22' },
    { level: 7, minElo: 1800, name: 'Maître', emoji: '👑', color: '#E74C3C' },
    { level: 8, minElo: 2000, name: 'Grand Maître', emoji: '🏆', color: '#FFD700' },
    { level: 9, minElo: 2200, name: 'Légende', emoji: '🔥', color: '#FF6584' },
    { level: 10, minElo: 2500, name: 'Mythique', emoji: '🌈', color: '#9D6FFF' }
];

const DEFAULT_ELO = 1000;

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    unsubscribers: [],
    initialized: false,
    eloHistory: [] // Historique local des changements
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('🏆 Initialisation du système ELO');

    // Charger l'historique depuis le storage
    loadHistory();

    // S'abonner aux changements d'ELO
    state.unsubscribers.push(
        store.subscribe('player.elo', (newElo, oldElo) => {
            if (newElo !== oldElo) {
                recordEloChange(oldElo, newElo);
            }
        })
    );

    state.initialized = true;
    console.log('✅ Système ELO initialisé');
}

/* ============================================================
   NIVEAUX
   ============================================================ */

/**
 * Récupère le niveau correspondant à un ELO
 */
export function getLevelFromElo(elo) {
    elo = Number(elo) || DEFAULT_ELO;

    let currentLevel = LEVELS[0];

    for (const level of LEVELS) {
        if (elo >= level.minElo) {
            currentLevel = level;
        } else {
            break;
        }
    }

    return currentLevel;
}

/**
 * Récupère le niveau suivant
 */
export function getNextLevel(elo) {
    elo = Number(elo) || DEFAULT_ELO;

    for (const level of LEVELS) {
        if (elo < level.minElo) {
            return level;
        }
    }

    return null; // Déjà au niveau max
}

/**
 * Récupère le niveau du joueur actuel
 */
export function getCurrentLevel() {
    const elo = store.get('player.elo', DEFAULT_ELO);
    return getLevelFromElo(elo);
}

/* ============================================================
   PROGRESSION
   ============================================================ */

/**
 * Calcule la progression vers le niveau suivant
 */
export function getProgress(elo) {
    elo = Number(elo) || DEFAULT_ELO;

    const currentLevel = getLevelFromElo(elo);
    const nextLevel = getNextLevel(elo);

    if (!nextLevel) {
        return {
            current: 100,
            needed: 0,
            percent: 100,
            pointsToNext: 0,
            currentLevel,
            nextLevel: null
        };
    }

    const currentMin = currentLevel.minElo;
    const nextMin = nextLevel.minElo;
    const range = nextMin - currentMin;
    const progress = elo - currentMin;

    return {
        current: progress,
        needed: range,
        percent: Math.min(Math.round((progress / range) * 100), 100),
        pointsToNext: Math.max(nextMin - elo, 0),
        currentLevel,
        nextLevel
    };
}

/**
 * Récupère la progression du joueur actuel
 */
export function getCurrentProgress() {
    const elo = store.get('player.elo', DEFAULT_ELO);
    return getProgress(elo);
}

/* ============================================================
   AFFICHAGE
   ============================================================ */

/**
 * Rend la carte ELO du profil
 */
export function render(containerSelector = '#profile-elo-card') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const elo = store.get('player.elo', DEFAULT_ELO);
    const progress = getProgress(elo);
    const level = progress.currentLevel;

    container.innerHTML = `
    <div class="elo-display" style="--level-color: ${level.color};">
      <div class="elo-level-badge">
        <span class="elo-level-emoji">${level.emoji}</span>
        <span class="elo-level-name">${level.name}</span>
        <span class="elo-level-number">Niveau ${level.level}</span>
      </div>

      <div class="elo-value-display">
        <span class="elo-value-label">ELO</span>
        <span class="elo-value-number">${elo}</span>
      </div>

      ${progress.nextLevel ? `
        <div class="elo-progress">
          <div class="elo-progress-bar">
            <div class="elo-progress-fill" style="width: ${progress.percent}%; background: linear-gradient(90deg, ${level.color}, ${progress.nextLevel.color});"></div>
          </div>
          <div class="elo-progress-text">
            ${progress.pointsToNext} points avant ${progress.nextLevel.emoji} ${progress.nextLevel.name}
          </div>
        </div>
      ` : `
        <div class="elo-max-level">
          🎉 Niveau maximum atteint !
        </div>
      `}
    </div>
  `;
}

/**
 * Rend une barre de progression simple
 */
export function renderProgressBar(containerSelector = '#elo-progress-bar') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const progress = getCurrentProgress();

    container.innerHTML = `
    <div class="progress-bar-large">
      <div class="progress-fill" style="width: ${progress.percent}%"></div>
    </div>
    <p class="profile-progress-text">
      ${progress.current} / ${progress.needed} XP
    </p>
  `;
}

/**
 * Rend la liste des niveaux
 */
export function renderLevels(containerSelector = '#elo-levels') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const currentElo = store.get('player.elo', DEFAULT_ELO);
    const currentLevel = getLevelFromElo(currentElo);

    container.innerHTML = LEVELS.map(level => {
        const isCurrent = level.level === currentLevel.level;
        const isUnlocked = currentElo >= level.minElo;

        return `
      <div class="level-item ${isCurrent ? 'current' : ''} ${isUnlocked ? 'unlocked' : 'locked'}">
        <div class="level-emoji" style="color: ${level.color};">${level.emoji}</div>
        <div class="level-info">
          <div class="level-name">${level.name}</div>
          <div class="level-elo">${level.minElo}+ ELO</div>
        </div>
        ${isCurrent ? '<span class="level-current-badge">Actuel</span>' : ''}
        ${isUnlocked && !isCurrent ? '<span class="level-check">✓</span>' : ''}
      </div>
    `;
    }).join('');
}

/* ============================================================
   HISTORIQUE
   ============================================================ */

function recordEloChange(oldElo, newElo) {
    const change = newElo - oldElo;

    state.eloHistory.unshift({
        oldElo,
        newElo,
        change,
        timestamp: Date.now()
    });

    // Limiter l'historique
    if (state.eloHistory.length > 50) {
        state.eloHistory.pop();
    }

    saveHistory();
}

function saveHistory() {
    try {
        localStorage.setItem('jdc_elo_history', JSON.stringify(state.eloHistory));
    } catch (error) {
        console.error('Erreur sauvegarde historique ELO:', error);
    }
}

function loadHistory() {
    try {
        const saved = localStorage.getItem('jdc_elo_history');
        if (saved) {
            state.eloHistory = JSON.parse(saved);
        }
    } catch (error) {
        state.eloHistory = [];
    }
}

/**
 * Récupère l'historique des changements d'ELO
 */
export function getHistory() {
    return [...state.eloHistory];
}

/**
 * Rend l'historique récent
 */
export function renderHistory(containerSelector = '#elo-history', limit = 10) {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const history = state.eloHistory.slice(0, limit);

    if (history.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>Aucun historique</p>
      </div>
    `;
        return;
    }

    container.innerHTML = history.map(entry => {
        const isPositive = entry.change > 0;
        const sign = isPositive ? '+' : '';
        const color = isPositive ? 'var(--color-success)' : 'var(--color-danger)';
        const timeAgo = helpers.timeAgo(new Date(entry.timestamp));

        return `
      <div class="elo-history-item">
        <span class="elo-history-change" style="color: ${color};">
          ${sign}${entry.change}
        </span>
        <span class="elo-history-elo">
          ${entry.oldElo} → ${entry.newElo}
        </span>
        <span class="elo-history-time">${timeAgo}</span>
      </div>
    `;
    }).join('');
}

/* ============================================================
   CALCULS
   ============================================================ */

/**
 * Calcule le changement d'ELO attendu (formule standard)
 */
export function calculateExpectedChange(myElo, opponentElo, won) {
    const expected = 1 / (1 + Math.pow(10, (opponentElo - myElo) / 400));
    const actual = won ? 1 : 0;
    const kFactor = 32;

    return Math.round(kFactor * (actual - expected));
}

/**
 * Simule le prochain niveau
 */
export function simulateNextLevel(currentElo, pointsGained) {
    const newElo = currentElo + pointsGained;
    return {
        newElo,
        oldLevel: getLevelFromElo(currentElo),
        newLevel: getLevelFromElo(newElo),
        willLevelUp: getLevelFromElo(newElo).level > getLevelFromElo(currentElo).level
    };
}

/* ============================================================
   LEADERBOARD
   ============================================================ */

/**
 * Récupère le classement global
 */
export async function fetchLeaderboard(limit = 100) {
    try {
        const response = await fetch(`/api/leaderboard?limit=${limit}`);

        if (response.ok) {
            const data = await response.json();
            store.set('leaderboard.entries', data);
            return data;
        }

        return [];

    } catch (error) {
        console.error('Erreur chargement leaderboard:', error);
        return [];
    }
}

/**
 * Trouve le rang d'un joueur dans le classement
 */
export function findPlayerRank(playerId) {
    const entries = store.get('leaderboard.entries', []);
    const index = entries.findIndex(e => e.id === playerId);
    return index >= 0 ? index + 1 : null;
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 ELO nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    getLevelFromElo,
    getNextLevel,
    getCurrentLevel,
    getProgress,
    getCurrentProgress,
    render,
    renderProgressBar,
    renderLevels,
    getHistory,
    renderHistory,
    calculateExpectedChange,
    simulateNextLevel,
    fetchLeaderboard,
    findPlayerRank,
    LEVELS,
    DEFAULT_ELO
};