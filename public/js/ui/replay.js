// =============================================================
// JEU DE CARTES — UI : REPLAY (Mode replay)
// =============================================================
// Permet de revivre une partie terminée coup par coup :
// lecture, pause, avance/retour, vitesse.
// =============================================================

import store from '../state.js';
import { router, navigateTo, SCREENS } from '../router.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    gameId: null,
    replay: null,
    currentStep: 0,
    isPlaying: false,
    speed: 1,
    playInterval: null,
    unsubscribers: [],
    initialized: false
};

const SPEEDS = [0.5, 1, 1.5, 2, 3];
const BASE_STEP_DURATION = 1500; // ms par défaut entre chaque coup

/* ============================================================
   INITIALISATION
   ============================================================ */

export async function init(params = {}) {
    console.log('🎬 Initialisation du replay');

    state.gameId = params.gameId;

    if (!state.gameId) {
        console.warn('⚠️ Pas de gameId, retour au lobby');
        navigateTo(SCREENS.LOBBY);
        return;
    }

    // Attacher les événements
    attachEvents();

    // Charger le replay
    await loadReplay();

    // Rendu initial
    render();

    state.initialized = true;
    console.log('✅ Replay initialisé');
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton quitter
    const exitBtn = helpers.$('#btn-exit-replay');
    if (exitBtn) {
        exitBtn.addEventListener('click', handleQuit);
    }

    // Bouton play/pause
    const playBtn = helpers.$('#btn-replay-play');
    if (playBtn) {
        playBtn.addEventListener('click', togglePlay);
    }

    // Bouton étape précédente
    const prevBtn = helpers.$('#btn-replay-prev');
    if (prevBtn) {
        prevBtn.addEventListener('click', stepBackward);
    }

    // Bouton étape suivante
    const nextBtn = helpers.$('#btn-replay-next');
    if (nextBtn) {
        nextBtn.addEventListener('click', stepForward);
    }

    // Bouton reset
    const resetBtn = helpers.$('#btn-replay-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', resetReplay);
    }

    // Vitesse
    const speedSelect = helpers.$('#replay-speed');
    if (speedSelect) {
        speedSelect.innerHTML = SPEEDS.map(s =>
            `<option value="${s}"${s === 1 ? ' selected' : ''}>${s}x</option>`
        ).join('');

        speedSelect.addEventListener('change', (e) => {
            setSpeed(parseFloat(e.target.value));
        });
    }

    // Timeline (slider)
    const timeline = helpers.$('#replay-timeline');
    if (timeline) {
        timeline.addEventListener('input', (e) => {
            const step = parseInt(e.target.value);
            goToStep(step);
        });
    }

    // Raccourcis clavier
    document.addEventListener('keydown', handleKeydown);
}

function handleKeydown(e) {
    // Ignorer si un input est focus
    if (document.activeElement?.tagName === 'INPUT') return;

    switch (e.key) {
        case ' ':
            e.preventDefault();
            togglePlay();
            break;
        case 'ArrowLeft':
            e.preventDefault();
            stepBackward();
            break;
        case 'ArrowRight':
            e.preventDefault();
            stepForward();
            break;
        case 'Home':
            e.preventDefault();
            resetReplay();
            break;
        case 'End':
            e.preventDefault();
            goToStep(state.replay?.steps?.length - 1 || 0);
            break;
    }
}

/* ============================================================
   CHARGEMENT
   ============================================================ */

async function loadReplay() {
    try {
        const response = await fetch(`/api/replay/${state.gameId}`);

        if (!response.ok) {
            throw new Error('Replay introuvable');
        }

        state.replay = await response.json();

        if (!state.replay || !state.replay.steps) {
            throw new Error('Replay invalide');
        }

        console.log(`🎬 Replay chargé : ${state.replay.steps.length} étapes`);

    } catch (error) {
        console.error('Erreur chargement replay:', error);
        showToast('Replay introuvable', 'error');
        setTimeout(() => navigateTo(SCREENS.LOBBY), 1500);
    }
}

/* ============================================================
   CONTRÔLES
   ============================================================ */

function togglePlay() {
    if (state.isPlaying) {
        pause();
    } else {
        play();
    }
}

function play() {
    if (!state.replay || !state.replay.steps) return;

    // Si on est à la fin, recommencer
    if (state.currentStep >= state.replay.steps.length - 1) {
        state.currentStep = 0;
    }

    state.isPlaying = true;
    updatePlayButton();

    const duration = BASE_STEP_DURATION / state.speed;

    state.playInterval = setInterval(() => {
        if (state.currentStep < state.replay.steps.length - 1) {
            state.currentStep++;
            renderStep();
            updateTimeline();
        } else {
            pause();
        }
    }, duration);
}

function pause() {
    state.isPlaying = false;
    if (state.playInterval) {
        clearInterval(state.playInterval);
        state.playInterval = null;
    }
    updatePlayButton();
}

function stepForward() {
    if (!state.replay || !state.replay.steps) return;

    pause();

    if (state.currentStep < state.replay.steps.length - 1) {
        state.currentStep++;
        renderStep();
        updateTimeline();
    }
}

function stepBackward() {
    if (!state.replay || !state.replay.steps) return;

    pause();

    if (state.currentStep > 0) {
        state.currentStep--;
        renderStep();
        updateTimeline();
    }
}

function resetReplay() {
    pause();
    state.currentStep = 0;
    renderStep();
    updateTimeline();
}

function goToStep(step) {
    if (!state.replay || !state.replay.steps) return;

    step = helpers.clamp(step, 0, state.replay.steps.length - 1);

    pause();
    state.currentStep = step;
    renderStep();
    updateTimeline();
}

function setSpeed(speed) {
    state.speed = speed;

    // Si en lecture, redémarrer avec la nouvelle vitesse
    if (state.isPlaying) {
        pause();
        play();
    }

    showToast(`Vitesse : ${speed}x`, 'info');
}

/* ============================================================
   RENDU
   ============================================================ */

function render() {
    if (!state.replay) return;

    renderHeader();
    renderStep();
    updateTimeline();
    updatePlayButton();
}

function renderHeader() {
    const codeEl = helpers.$('#replay-game-code');
    if (codeEl) codeEl.textContent = state.gameId;

    const playersEl = helpers.$('#replay-players');
    if (playersEl && state.replay.players) {
        const names = state.replay.players.map(p => p.name).join(', ');
        playersEl.textContent = names;
    }

    const infoEl = helpers.$('#replay-info');
    if (infoEl && state.replay.metadata) {
        const { duration, turnCount } = state.replay.metadata;
        infoEl.textContent = `${turnCount || 0} coups • ${helpers.formatDuration(duration || 0)}`;
    }
}

function renderStep() {
    if (!state.replay || !state.replay.steps) return;

    const step = state.replay.steps[state.currentStep];
    if (!step) return;

    // Numéro de l'étape
    const stepNumberEl = helpers.$('#replay-step-number');
    if (stepNumberEl) {
        stepNumberEl.textContent = `${state.currentStep + 1} / ${state.replay.steps.length}`;
    }

    // Description du coup
    const actionEl = helpers.$('#replay-action');
    if (actionEl) {
        actionEl.textContent = step.description || `Coup ${state.currentStep + 1}`;
    }

    // Joueurs
    renderPlayers(step);

    // Carte centrale
    renderCenterCard(step);

    // Indicateurs
    renderIndicators(step);

    // Journal cumulé jusqu'à cette étape
    renderLog();
}

function renderPlayers(step) {
    const container = helpers.$('#replay-opponents-zone');
    if (!container) return;

    const players = step.players || state.replay.players || [];

    container.innerHTML = players.map(player => {
        const isCurrent = step.currentPlayerId === player.id;
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
        <div class="opponent-cards">🖐️ ${player.cardCount || 0} cartes</div>
        ${isFinished ? `<div class="opponent-rank">🏆 #${player.rank}</div>` : ''}
        <div class="mini-cards">${miniCards}</div>
      </div>
    `;
    }).join('');
}

function renderCenterCard(step) {
    const container = helpers.$('#replay-center-card');
    if (!container) return;

    const card = step.centerCard;

    if (!card) {
        container.innerHTML = '';
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
}

function renderIndicators(step) {
    const imposedEl = helpers.$('#replay-imposed');
    if (imposedEl) {
        if (step.imposedSuit) {
            const symbols = { pique: '♠', carreau: '♦', coeur: '♥', trefle: '♣' };
            imposedEl.classList.remove('hidden');
            imposedEl.textContent = `🎭 Couleur imposée : ${symbols[step.imposedSuit]} ${step.imposedSuit}`;
        } else if (step.imposedColor) {
            imposedEl.classList.remove('hidden');
            imposedEl.textContent = step.imposedColor === 'red'
                ? '🃏 Joker Rouge — Jouez du rouge 🔴'
                : '🃏 Joker Noir — Jouez du noir ⚫';
        } else {
            imposedEl.classList.add('hidden');
        }
    }

    const pendingEl = helpers.$('#replay-pending');
    if (pendingEl) {
        if (step.pendingDraw > 0) {
            pendingEl.classList.remove('hidden');
            pendingEl.textContent = `⚠️ ${step.pendingDraw} cartes en attente`;
        } else {
            pendingEl.classList.add('hidden');
        }
    }
}

function renderLog() {
    const container = helpers.$('#replay-log-content');
    if (!container) return;

    // Cumuler les logs jusqu'à l'étape actuelle
    const logs = [];
    for (let i = 0; i <= state.currentStep; i++) {
        const step = state.replay.steps[i];
        if (step && step.log) {
            logs.push(step.log);
        } else if (step && step.description) {
            logs.push(step.description);
        }
    }

    if (logs.length === 0) {
        container.innerHTML = '<div class="log-entry" style="opacity:0.5;">Début de la partie</div>';
        return;
    }

    container.innerHTML = logs.slice().reverse().map(msg => {
        return `<div class="log-entry">${helpers.escapeHtml(msg)}</div>`;
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
   UI CONTROLS
   ============================================================ */

function updatePlayButton() {
    const btn = helpers.$('#btn-replay-play');
    if (!btn) return;

    btn.innerHTML = state.isPlaying
        ? '<span class="btn-icon">⏸</span><span class="btn-text">Pause</span>'
        : '<span class="btn-icon">▶</span><span class="btn-text">Lecture</span>';
}

function updateTimeline() {
    const timeline = helpers.$('#replay-timeline');
    if (!timeline || !state.replay || !state.replay.steps) return;

    timeline.max = state.replay.steps.length - 1;
    timeline.value = state.currentStep;

    // Barre de progression
    const progress = helpers.$('#replay-progress');
    if (progress) {
        const percent = state.replay.steps.length > 1
            ? (state.currentStep / (state.replay.steps.length - 1)) * 100
            : 0;
        progress.style.width = `${percent}%`;
    }
}

/* ============================================================
   ACTIONS
   ============================================================ */

function handleQuit() {
    pause();

    store.reset('replay');
    navigateTo(SCREENS.LOBBY);
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
    pause();
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    document.removeEventListener('keydown', handleKeydown);
    state.initialized = false;
    state.replay = null;
    state.gameId = null;
    state.currentStep = 0;
    console.log('🧹 Replay nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    SPEEDS
};