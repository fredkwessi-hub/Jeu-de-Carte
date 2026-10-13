// =============================================================
// JEU DE CARTES — GAME : CARDS (Rendu des cartes)
// =============================================================
// Création d'éléments DOM de cartes, styles, animations.
// =============================================================

import helpers from '../utils/helpers.js';

/* ============================================================
   CONSTANTES
   ============================================================ */

export const SUITS = ['pique', 'carreau', 'coeur', 'trefle'];

export const SUIT_SYMBOLS = {
    pique: '♠',
    carreau: '♦',
    coeur: '♥',
    trefle: '♣'
};

export const SUIT_COLORS = {
    pique: 'black',
    carreau: 'red',
    coeur: 'red',
    trefle: 'black'
};

export const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/* ============================================================
   CRÉATION DE L'ÉLÉMENT CARTE
   ============================================================ */

/**
 * Crée l'élément DOM d'une carte
 * @param {Object} card - { id, suit, rank, type, color, jokerColor, symbol }
 * @param {Object} options - { size, playable, selected, faceDown, animated }
 * @returns {HTMLElement}
 */
export function createCardElement(card, options = {}) {
    const {
        size = 'normal',
        playable = false,
        selected = false,
        faceDown = false,
        animated = true,
        clickable = false
    } = options;

    if (!card) return null;

    const wrapper = document.createElement('div');
    wrapper.className = 'card-wrapper';
    wrapper.dataset.cardId = card.id;

    const cardEl = document.createElement('div');
    cardEl.className = getCardClasses(card, { size, playable, selected, faceDown, animated });

    if (faceDown) {
        cardEl.innerHTML = renderCardBack();
    } else {
        cardEl.innerHTML = renderCardFace(card);
    }

    wrapper.appendChild(cardEl);

    if (clickable) {
        wrapper.style.cursor = 'pointer';
        wrapper.classList.add('card-clickable');
    }

    return wrapper;
}

/**
 * Génère les classes CSS de la carte
 */
function getCardClasses(card, options = {}) {
    const { size, playable, selected, faceDown, animated } = options;

    const classes = ['card'];

    if (faceDown) {
        classes.push('card-back');
    } else if (card.type === 'joker') {
        classes.push('joker');
        if (card.jokerColor === 'noir' || card.color === 'black') {
            classes.push('joker-black');
        }
    } else {
        classes.push(card.color || SUIT_COLORS[card.suit] || 'black');
    }

    if (size && size !== 'normal') {
        classes.push(`card-${size}`);
    }

    if (playable) classes.push('playable');
    if (selected) classes.push('selected');
    if (!animated) classes.push('no-animation');

    return classes.join(' ');
}

/* ============================================================
   RENDU DE LA FACE
   ============================================================ */

/**
 * Génère le HTML de la face d'une carte
 */
export function renderCardFace(card) {
    if (!card) return '';

    if (card.type === 'joker') {
        return renderJokerFace(card);
    }

    const symbol = card.symbol || SUIT_SYMBOLS[card.suit] || '?';
    const rank = card.rank || '?';

    return `
    <div class="card-corner top-left">
      ${rank}<br>${symbol}
    </div>
    <div class="card-center">
      <div class="card-symbol">${symbol}</div>
      <div class="card-rank">${rank}</div>
    </div>
    <div class="card-corner bottom-right">
      ${rank}<br>${symbol}
    </div>
  `;
}

/**
 * Génère le HTML d'un Joker
 */
function renderJokerFace(card) {
    const isRed = card.jokerColor === 'rouge' || card.color === 'red';

    return `
    <div class="card-corner top-left">🃏</div>
    <div class="card-center">
      <div class="card-symbol">${isRed ? '🔴' : '⚫'}</div>
      <div class="card-rank">JOKER</div>
    </div>
    <div class="card-corner bottom-right">🃏</div>
  `;
}

/* ============================================================
   RENDU DU DOS
   ============================================================ */

/**
 * Génère le HTML du dos d'une carte
 */
export function renderCardBack() {
    return `
    <div class="card-back-pattern">
      <div class="card-back-inner">🂠</div>
    </div>
  `;
}

/* ============================================================
   RENDU MINI-CARTE (pour les adversaires)
   ============================================================ */

/**
 * Crée un élément mini-carte
 */
export function createMiniCardElement() {
    const el = document.createElement('div');
    el.className = 'mini-card';
    return el;
}

/**
 * Crée plusieurs mini-cartes
 */
export function createMiniCards(count) {
    const container = document.createElement('div');
    container.className = 'mini-cards';

    const max = Math.min(count, 8);
    for (let i = 0; i < max; i++) {
        container.appendChild(createMiniCardElement());
    }

    return container;
}

/* ============================================================
   RENDU D'UN JOKER CENTRAL (carte centrale spéciale)
   ============================================================ */

/**
 * Crée une carte centrale stylisée
 */
export function createCenterCardElement(card) {
    const el = document.createElement('div');

    if (!card) {
        el.className = 'card center-card empty';
        el.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">En attente...</div>';
        return el;
    }

    let classes = 'card center-card';
    if (card.type === 'joker') {
        classes += ' joker';
        if (card.jokerColor === 'noir') classes += ' joker-black';
    } else {
        classes += ` ${card.color || SUIT_COLORS[card.suit] || 'black'}`;
    }

    el.className = classes;
    el.innerHTML = renderCardFace(card);

    return el;
}

/* ============================================================
   ANIMATIONS
   ============================================================ */

/**
 * Anime une carte qui "vole" vers le centre
 */
export function animateCardToCenter(cardElement, targetElement) {
    if (!cardElement || !targetElement) return Promise.resolve();

    return new Promise(resolve => {
        const cardRect = cardElement.getBoundingClientRect();
        const targetRect = targetElement.getBoundingClientRect();

        const deltaX = targetRect.left - cardRect.left;
        const deltaY = targetRect.top - cardRect.top;

        // Cloner la carte pour l'animation
        const clone = cardElement.cloneNode(true);
        clone.style.position = 'fixed';
        clone.style.left = `${cardRect.left}px`;
        clone.style.top = `${cardRect.top}px`;
        clone.style.width = `${cardRect.width}px`;
        clone.style.height = `${cardRect.height}px`;
        clone.style.zIndex = '9999';
        clone.style.pointerEvents = 'none';
        clone.style.transition = 'transform 0.5s cubic-bezier(0.4, 0, 0.2, 1), opacity 0.5s ease';
        clone.classList.add('card-flying');

        document.body.appendChild(clone);

        // Cacher la carte originale
        cardElement.style.opacity = '0.3';

        requestAnimationFrame(() => {
            clone.style.transform = `translate(${deltaX}px, ${deltaY}px) scale(1.2)`;
            clone.style.opacity = '0.8';
        });

        setTimeout(() => {
            clone.style.opacity = '0';
            setTimeout(() => {
                clone.remove();
                cardElement.style.opacity = '';
                resolve();
            }, 300);
        }, 500);
    });
}

/**
 * Anime la sélection d'une carte
 */
export function animateCardSelection(cardElement, selected) {
    if (!cardElement) return;

    if (selected) {
        cardElement.classList.add('card-selecting');
        setTimeout(() => cardElement.classList.remove('card-selecting'), 300);
    }
}

/**
 * Fait "trembler" une carte (erreur)
 */
export function animateCardShake(cardElement) {
    if (!cardElement) return;

    cardElement.classList.add('card-shaking');
    setTimeout(() => cardElement.classList.remove('card-shaking'), 500);
}

/**
 * Anime l'apparition d'une carte
 */
export function animateCardAppear(cardElement) {
    if (!cardElement) return;

    cardElement.classList.add('card-appearing');
    setTimeout(() => cardElement.classList.remove('card-appearing'), 500);
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

/**
 * Formate une carte en texte ("A♥", "Joker Rouge")
 */
export function formatCard(card) {
    if (!card) return '?';

    if (card.type === 'joker') {
        return `🃏 Joker ${card.jokerColor || (card.color === 'red' ? 'rouge' : 'noir')}`;
    }

    const symbol = card.symbol || SUIT_SYMBOLS[card.suit] || '?';
    return `${card.rank}${symbol}`;
}

/**
 * Récupère le symbole d'une couleur
 */
export function getSuitSymbol(suit) {
    return SUIT_SYMBOLS[suit] || '?';
}

/**
 * Récupère la couleur (red/black) d'une suite
 */
export function getSuitColor(suit) {
    return SUIT_COLORS[suit] || 'black';
}

/**
 * Vérifie si une carte est un Joker
 */
export function isJoker(card) {
    return card && card.type === 'joker';
}

/**
 * Vérifie si une carte est un 7
 */
export function isSeven(card) {
    return card && card.rank === '7';
}

/**
 * Vérifie si une carte est un As
 */
export function isAce(card) {
    return card && card.rank === 'A';
}

/**
 * Vérifie si une carte est un J
 */
export function isJack(card) {
    return card && card.rank === 'J';
}

/**
 * Vérifie si une carte est un Roi
 */
export function isKing(card) {
    return card && card.rank === 'K';
}

/**
 * Compare deux cartes (pour le tri)
 */
export function compareCards(a, b) {
    const suitOrder = { pique: 0, coeur: 1, carreau: 2, trefle: 3, joker: 4 };
    const rankOrder = {
        'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
        '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'JOKER': 14
    };

    const suitA = suitOrder[a.suit] ?? 99;
    const suitB = suitOrder[b.suit] ?? 99;

    if (suitA !== suitB) return suitA - suitB;

    const rankA = rankOrder[a.rank] ?? 99;
    const rankB = rankOrder[b.rank] ?? 99;

    return rankA - rankB;
}

/**
 * Trie une main
 */
export function sortHand(hand, sortBy = 'suit') {
    const sorted = [...hand];

    if (sortBy === 'suit') {
        sorted.sort(compareCards);
    } else if (sortBy === 'rank') {
        sorted.sort((a, b) => {
            const rankOrder = {
                'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
                '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'JOKER': 14
            };
            return (rankOrder[a.rank] ?? 99) - (rankOrder[b.rank] ?? 99);
        });
    }

    return sorted;
}

/**
 * Vérifie si toutes les cartes ont le même rang
 */
export function allSameRank(cards) {
    if (!cards || cards.length === 0) return false;
    const firstRank = cards[0].rank;
    return cards.every(c => c.rank === firstRank);
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    SUITS,
    SUIT_SYMBOLS,
    SUIT_COLORS,
    RANKS,
    createCardElement,
    renderCardFace,
    renderCardBack,
    createMiniCardElement,
    createMiniCards,
    createCenterCardElement,
    animateCardToCenter,
    animateCardSelection,
    animateCardShake,
    animateCardAppear,
    formatCard,
    getSuitSymbol,
    getSuitColor,
    isJoker,
    isSeven,
    isAce,
    isJack,
    isKing,
    compareCards,
    sortHand,
    allSameRank
};