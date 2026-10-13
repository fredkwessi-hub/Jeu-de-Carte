// =============================================================
// JEU DE CARTES — GAME : HAND (Gestion de la main)
// =============================================================
// Gestion complète de la main du joueur : rendu, sélection,
// tri, interactions, drag & drop.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';
import cards from './cards.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    selectedCards: new Set(),
    sortMode: 'suit',
    container: null,
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(containerSelector = '#my-hand') {
    if (state.initialized) return;

    state.container = helpers.$(containerSelector);
    if (!state.container) {
        console.warn('⚠️ Container de main introuvable:', containerSelector);
        return;
    }

    // S'abonner aux changements
    state.unsubscribers.push(
        store.subscribe('game.hand', () => render()),
        store.subscribe('game.isMyTurn', () => render()),
        store.subscribe('game.imposedSuit', () => updatePlayableStates()),
        store.subscribe('game.imposedColor', () => updatePlayableStates()),
        store.subscribe('game.pendingDraw', () => updatePlayableStates()),
        store.subscribe('game.centerCard', () => updatePlayableStates())
    );

    state.initialized = true;
    console.log('✅ Main initialisée');
}

/* ============================================================
   RENDU
   ============================================================ */

export function render() {
    if (!state.container) return;

    const hand = store.get('game.hand', []);
    const isMyTurn = store.get('game.isMyTurn', false);
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));

    // Mettre à jour le compteur
    const countEl = helpers.$('#my-card-count');
    if (countEl) countEl.textContent = hand.length;

    // Main vide
    if (hand.length === 0) {
        state.container.innerHTML = `
      <div class="hand-empty">
        ${me && me.rank ? `🎉 Vous avez terminé #${me.rank} !` : 'Aucune carte en main'}
      </div>
    `;
        updatePlayButton();
        return;
    }

    // Trier la main
    const sortedHand = cards.sortHand(hand, state.sortMode);

    // Créer le conteneur de cartes
    state.container.innerHTML = '';

    const canPlay = isMyTurn && !(me && me.rank);

    sortedHand.forEach(card => {
        const playable = canPlay && isCardPlayable(card);
        const selected = state.selectedCards.has(card.id);

        const cardEl = cards.createCardElement(card, {
            playable,
            selected,
            clickable: true
        });

        // Attacher le clic
        cardEl.addEventListener('click', () => handleCardClick(card.id));

        // Attacher le hover (tooltip)
        cardEl.addEventListener('mouseenter', (e) => showCardTooltip(e, card));
        cardEl.addEventListener('mouseleave', hideCardTooltip);

        state.container.appendChild(cardEl);
    });

    updatePlayButton();
}

/* ============================================================
   INTERACTIONS
   ============================================================ */

function handleCardClick(cardId) {
    const hand = store.get('game.hand', []);
    const card = hand.find(c => c.id === cardId);

    if (!card) return;

    // Vérifier si la carte est jouable
    if (!isCardPlayable(card)) {
        // Feedback visuel : shake
        const cardEl = state.container.querySelector(`[data-card-id="${cardId}"] .card`);
        if (cardEl) cards.animateCardShake(cardEl);
        return;
    }

    // Vérifier la règle du même rang
    if (state.selectedCards.size > 0) {
        const firstCardId = Array.from(state.selectedCards)[0];
        const firstCard = hand.find(c => c.id === firstCardId);

        if (firstCard && firstCard.rank !== card.rank) {
            // Remplacer la sélection
            state.selectedCards.clear();
            state.selectedCards.add(cardId);
            updateSelectionUI();
            return;
        }
    }

    // Toggle
    if (state.selectedCards.has(cardId)) {
        state.selectedCards.delete(cardId);
    } else {
        state.selectedCards.add(cardId);
    }

    updateSelectionUI();
}

function updateSelectionUI() {
    if (!state.container) return;

    state.container.querySelectorAll('.card-wrapper').forEach(wrapper => {
        const cardId = wrapper.dataset.cardId;
        const cardEl = wrapper.querySelector('.card');
        const isSelected = state.selectedCards.has(cardId);

        cardEl.classList.toggle('selected', isSelected);
    });

    // Mettre à jour le store
    store.set('game.selectedCards', Array.from(state.selectedCards));

    updatePlayButton();
}

function updatePlayButton() {
    const btn = helpers.$('#btn-play-selected');
    if (!btn) return;

    const isMyTurn = store.get('game.isMyTurn', false);
    const hasSelection = state.selectedCards.size > 0;
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));

    btn.disabled = !isMyTurn || !hasSelection || (me && me.rank);

    // Mettre à jour le texte
    if (hasSelection) {
        const textEl = btn.querySelector('.btn-text');
        if (textEl) {
            textEl.textContent = `Jouer (${state.selectedCards.size})`;
        }
    } else {
        const textEl = btn.querySelector('.btn-text');
        if (textEl) {
            textEl.textContent = 'Jouer';
        }
    }
}

/* ============================================================
   JOUABILITÉ
   ============================================================ */

export function isCardPlayable(card) {
    if (!card) return false;

    const pendingDraw = store.get('game.pendingDraw', 0);
    const imposedSuit = store.get('game.imposedSuit');
    const imposedColor = store.get('game.imposedColor');
    const centerCard = store.get('game.centerCard');

    // Attaque en cours
    if (pendingDraw > 0) {
        return card.type === 'joker' || card.rank === '7';
    }

    // Joker passe toujours
    if (card.type === 'joker') return true;

    // Couleur imposée par un J
    if (imposedSuit) {
        return card.suit === imposedSuit;
    }

    // Couleur imposée par un Joker
    if (imposedColor) {
        return card.color === imposedColor;
    }

    // Centre = Joker
    if (centerCard && centerCard.type === 'joker') {
        return card.color === centerCard.color;
    }

    // Cas normal
    if (!centerCard) return true;

    return card.rank === centerCard.rank || card.suit === centerCard.suit;
}

function updatePlayableStates() {
    if (!state.container) return;

    const hand = store.get('game.hand', []);
    const isMyTurn = store.get('game.isMyTurn', false);
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));
    const canPlay = isMyTurn && !(me && me.rank);

    state.container.querySelectorAll('.card-wrapper').forEach(wrapper => {
        const cardId = wrapper.dataset.cardId;
        const card = hand.find(c => c.id === cardId);
        const cardEl = wrapper.querySelector('.card');

        if (!card || !cardEl) return;

        const playable = canPlay && isCardPlayable(card);

        cardEl.classList.toggle('playable', playable);
        cardEl.classList.toggle('not-playable', !playable && canPlay);
    });
}

/* ============================================================
   SÉLECTION
   ============================================================ */

export function getSelectedCards() {
    const hand = store.get('game.hand', []);
    const ids = Array.from(state.selectedCards);
    return hand.filter(card => ids.includes(card.id));
}

export function getSelectedIds() {
    return Array.from(state.selectedCards);
}

export function clearSelection() {
    state.selectedCards.clear();
    updateSelectionUI();
}

export function selectAll() {
    const hand = store.get('game.hand', []);
    hand.forEach(card => {
        if (isCardPlayable(card)) {
            state.selectedCards.add(card.id);
        }
    });
    updateSelectionUI();
}

export function invertSelection() {
    const hand = store.get('game.hand', []);
    const newSelection = new Set();

    hand.forEach(card => {
        if (!state.selectedCards.has(card.id) && isCardPlayable(card)) {
            newSelection.add(card.id);
        }
    });

    state.selectedCards = newSelection;
    updateSelectionUI();
}

/* ============================================================
   TRI
   ============================================================ */

export function setSortMode(mode) {
    if (mode !== 'suit' && mode !== 'rank') return;

    state.sortMode = mode;
    render();

    console.log('📊 Tri:', mode === 'suit' ? 'par couleur' : 'par rang');
}

export function getSortMode() {
    return state.sortMode;
}

export function toggleSort() {
    setSortMode(state.sortMode === 'suit' ? 'rank' : 'suit');
}

/* ============================================================
   TOOLTIP
   ============================================================ */

let tooltipElement = null;

function showCardTooltip(event, card) {
    hideCardTooltip();

    const text = cards.formatCard(card);

    tooltipElement = document.createElement('div');
    tooltipElement.className = 'card-tooltip';
    tooltipElement.textContent = text;
    tooltipElement.style.position = 'fixed';
    tooltipElement.style.pointerEvents = 'none';

    document.body.appendChild(tooltipElement);

    const rect = event.target.getBoundingClientRect();
    tooltipElement.style.left = `${rect.left + rect.width / 2}px`;
    tooltipElement.style.top = `${rect.top - 10}px`;
    tooltipElement.style.transform = 'translate(-50%, -100%)';
}

function hideCardTooltip() {
    if (tooltipElement) {
        tooltipElement.remove();
        tooltipElement = null;
    }
}

/* ============================================================
   DRAG & DROP (optionnel)
   ============================================================ */

export function enableDragAndDrop() {
    if (!state.container) return;

    state.container.querySelectorAll('.card-wrapper').forEach(wrapper => {
        wrapper.draggable = true;

        wrapper.addEventListener('dragstart', (e) => {
            e.dataTransfer.setData('text/plain', wrapper.dataset.cardId);
            wrapper.classList.add('dragging');
        });

        wrapper.addEventListener('dragend', () => {
            wrapper.classList.remove('dragging');
        });
    });
}

/* ============================================================
   ANIMATIONS
   ============================================================ */

/**
 * Anime la pose des cartes sélectionnées
 */
export async function animateSelectedCards() {
    if (!state.container) return;

    const selectedElements = Array.from(state.selectedCards).map(id =>
        state.container.querySelector(`[data-card-id="${id}"]`)
    ).filter(Boolean);

    if (selectedElements.length === 0) return;

    selectedElements.forEach(el => {
        el.classList.add('card-placing');
    });

    await helpers.sleep(300);

    selectedElements.forEach(el => {
        el.classList.remove('card-placing');
    });
}

/**
 * Fait apparaître les nouvelles cartes
 */
export function animateNewCards() {
    if (!state.container) return;

    state.container.querySelectorAll('.card-wrapper').forEach((wrapper, index) => {
        wrapper.style.animationDelay = `${index * 50}ms`;
        wrapper.classList.add('card-appearing');
    });
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.selectedCards.clear();
    state.container = null;
    state.initialized = false;
    console.log('🧹 Main nettoyée');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    render,
    destroy,
    isCardPlayable,
    getSelectedCards,
    getSelectedIds,
    clearSelection,
    selectAll,
    invertSelection,
    setSortMode,
    getSortMode,
    toggleSort,
    enableDragAndDrop,
    animateSelectedCards,
    animateNewCards
};