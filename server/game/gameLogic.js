// ===== server/game/gameLogic.js =====
// Moteur de jeu : règles, cartes, effets, validation

const config = require('../config');

// ===== CONSTANTES =====
const SUITS = ['pique', 'carreau', 'coeur', 'trefle'];

const SUIT_SYMBOLS = {
    pique: '♠',
    carreau: '♦',
    coeur: '♥',
    trefle: '♣'
};

const SUIT_COLORS = {
    pique: 'black',
    carreau: 'red',
    coeur: 'red',
    trefle: 'black'
};

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

// ===== CRÉATION DU DECK =====
function createDeck(options = {}) {
    const {
        includeJokers = true,
        deckCount = 1 // 1 = 54 cartes (52 + 2 jokers)
    } = options;

    const deck = [];
    let id = 0;

    // Créer deckCount paquets de 52 cartes
    for (let d = 0; d < deckCount; d++) {
        SUITS.forEach(suit => {
            RANKS.forEach(rank => {
                deck.push({
                    id: `card_${id++}`,
                    suit: suit,
                    rank: rank,
                    type: 'normal',
                    symbol: SUIT_SYMBOLS[suit],
                    color: SUIT_COLORS[suit],
                    value: getCardValue(rank)
                });
            });
        });
    }

    // Ajouter les jokers
    if (includeJokers) {
        for (let d = 0; d < deckCount; d++) {
            deck.push({
                id: `card_${id++}`,
                suit: 'joker',
                rank: 'JOKER',
                type: 'joker',
                symbol: '🃏',
                color: 'red',
                jokerColor: 'rouge',
                value: config.scoring.joker
            });

            deck.push({
                id: `card_${id++}`,
                suit: 'joker',
                rank: 'JOKER',
                type: 'joker',
                symbol: '🃏',
                color: 'black',
                jokerColor: 'noir',
                value: config.scoring.joker
            });
        }
    }

    return deck;
}

// ===== VALEUR D'UNE CARTE (pour le scoring) =====
function getCardValue(rank) {
    const values = {
        'A': config.scoring.ace,
        '2': config.scoring.two,
        '3': config.scoring.three,
        '4': config.scoring.four,
        '5': config.scoring.five,
        '6': config.scoring.six,
        '7': config.scoring.seven,
        '8': config.scoring.eight,
        '9': config.scoring.nine,
        '10': config.scoring.ten,
        'J': config.scoring.jack,
        'Q': config.scoring.queen,
        'K': config.scoring.king,
        'JOKER': config.scoring.joker
    };
    return values[rank] || 0;
}

// ===== MÉLANGE (Fisher-Yates) =====
function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

// ===== DISTRIBUTION =====
function distributeCards(deck, playerCount, cardsPerPlayer = null) {
    const perPlayer = cardsPerPlayer || config.game.cardsPerPlayer;
    const shuffled = shuffle(deck);
    const hands = [];

    for (let i = 0; i < playerCount; i++) {
        hands.push(shuffled.slice(i * perPlayer, (i + 1) * perPlayer));
    }

    const remaining = shuffled.slice(playerCount * perPlayer);

    return { hands, bank: remaining };
}

// ===== CARTE CENTRALE VALIDE =====
function isValidCenterCard(card) {
    if (!card) return false;
    if (card.type === 'joker') return false;
    if (card.rank === '7' || card.rank === 'A' || card.rank === 'J') return false;
    return true;
}

function drawCenterCard(bank) {
    const bankCopy = [...bank];
    let attempts = 0;
    const maxAttempts = 100;

    while (attempts < maxAttempts && bankCopy.length > 0) {
        const randomIndex = Math.floor(Math.random() * bankCopy.length);
        const card = bankCopy[randomIndex];

        if (isValidCenterCard(card)) {
            bankCopy.splice(randomIndex, 1);
            return { centerCard: card, newBank: bankCopy };
        }
        attempts++;
    }

    // Fallback : première carte valide
    const validIndex = bankCopy.findIndex(isValidCenterCard);
    if (validIndex !== -1) {
        const card = bankCopy[validIndex];
        bankCopy.splice(validIndex, 1);
        return { centerCard: card, newBank: bankCopy };
    }

    return { centerCard: null, newBank: bankCopy };
}

// ===== VALIDATION D'UN COUP =====
/**
 * Vérifie si une carte peut être jouée
 * @param {Object} card - Carte à jouer
 * @param {Object} centerCard - Carte centrale
 * @param {Object} options - { imposedSuit, imposedColor, pendingDraw, gameMode }
 */
function canPlayCard(card, centerCard, options = {}) {
    if (!card) return false;

    const { imposedSuit, imposedColor, pendingDraw = 0, gameMode = 'normal' } = options;

    // ===== CAS SPÉCIAL : ATTAQUE EN COURS =====
    if (pendingDraw > 0) {
        // Seuls les 7 et Jokers peuvent bloquer
        return card.type === 'joker' || card.rank === '7';
    }

    // ===== CAS SPÉCIAL : COULEUR IMPOSÉE PAR UN J =====
    if (imposedSuit) {
        if (card.type === 'joker') return true;
        return card.suit === imposedSuit;
    }

    // ===== CAS SPÉCIAL : COULEUR IMPOSÉE PAR UN JOKER =====
    if (imposedColor) {
        if (card.type === 'joker') return true;
        return card.color === imposedColor;
    }

    // ===== CAS SPÉCIAL : CENTRE = JOKER =====
    if (centerCard && centerCard.type === 'joker') {
        if (card.type === 'joker') return true;
        return card.color === centerCard.color;
    }

    // ===== CAS NORMAL =====
    if (card.type === 'joker') return true; // Joker peut toujours être posé
    if (!centerCard) return true;

    // Même rang OU même couleur
    if (card.rank === centerCard.rank) return true;
    if (card.suit === centerCard.suit) return true;

    return false;
}

// ===== VÉRIFIER SI UN JOUEUR A UN COUP VALIDE =====
function hasValidMove(hand, centerCard, options = {}) {
    return hand.some(card => canPlayCard(card, centerCard, options));
}

// ===== EFFET D'UNE CARTE =====
function getCardEffect(card) {
    if (!card) return { type: 'none' };

    if (card.type === 'joker') {
        return {
            type: 'joker',
            drawCount: 4,
            blockable: true,
            imposeColor: true,
            reverse: false,
            skip: false
        };
    }

    if (card.rank === '7') {
        return {
            type: 'seven',
            drawCount: 2,
            blockable: true,
            imposeColor: false,
            reverse: false,
            skip: false
        };
    }

    if (card.rank === 'A') {
        return {
            type: 'ace',
            drawCount: 0,
            blockable: false,
            imposeColor: false,
            reverse: false,
            skip: true
        };
    }

    if (card.rank === 'J') {
        return {
            type: 'jack',
            drawCount: 0,
            blockable: false,
            imposeColor: false,
            imposeSuit: true,
            reverse: false,
            skip: false
        };
    }

    if (card.rank === 'K') {
        return {
            type: 'king',
            drawCount: 0,
            blockable: false,
            imposeColor: false,
            reverse: true, // Roi inverse le sens
            skip: false
        };
    }

    return { type: 'normal' };
}

// ===== CARTES JOUABLES DU MÊME RANG =====
function getPlayableCardsOfSameRank(hand, rank) {
    return hand.filter(card => card.rank === rank);
}

// ===== RECONSTITUTION DE LA BANQUE =====
function reshuffleBank(pile, options = {}) {
    const { minPileSize = 2 } = options;

    if (pile.length <= 1) {
        return { newBank: [], newPile: pile };
    }

    // On garde la carte du dessus
    const topCard = pile[pile.length - 1];
    const rest = pile.slice(0, -1);

    // Mélange le reste
    const shuffled = shuffle(rest);

    return {
        newBank: shuffled,
        newPile: [topCard]
    };
}

// ===== VÉRIFIER SI UN JOUEUR PEUT BLOQUER UNE ATTAQUE =====
function canBlockAttack(hand) {
    return hand.some(card => {
        if (card.type === 'joker') return true;
        if (card.rank === '7') return true;
        return false;
    });
}

// ===== CARTES JOUABLES =====
function getPlayableCards(hand, centerCard, options = {}) {
    return hand.filter(card => canPlayCard(card, centerCard, options));
}

// ===== GROUPER PAR RANG =====
function groupByRank(hand) {
    const groups = {};
    hand.forEach(card => {
        if (!groups[card.rank]) groups[card.rank] = [];
        groups[card.rank].push(card);
    });
    return groups;
}

// ===== GROUPER PAR COULEUR =====
function groupBySuit(hand) {
    const groups = {};
    hand.forEach(card => {
        if (card.suit && card.type !== 'joker') {
            if (!groups[card.suit]) groups[card.suit] = [];
            groups[card.suit].push(card);
        }
    });
    return groups;
}

// ===== GROUPER PAR COULEUR (rouge/noir) =====
function groupByColor(hand) {
    const groups = { red: [], black: [] };
    hand.forEach(card => {
        if (card.type === 'joker') {
            groups[card.color].push(card);
        } else if (card.color) {
            groups[card.color].push(card);
        }
    });
    return groups;
}

// ===== CALCUL DU SCORE D'UNE MAIN =====
function calculateHandScore(hand) {
    return hand.reduce((total, card) => total + (card.value || 0), 0);
}

// ===== CARTES SPÉCIALES =====
function isSpecialCard(card) {
    if (!card) return false;
    if (card.type === 'joker') return true;
    return ['7', 'A', 'J', 'K'].includes(card.rank);
}

function getSpecialCardName(card) {
    if (!card) return null;
    if (card.type === 'joker') return 'Joker';
    const names = {
        '7': 'Sept',
        'A': 'As',
        'J': 'Valet',
        'K': 'Roi'
    };
    return names[card.rank] || null;
}

// ===== VÉRIFIER SI UNE CARTE PEUT ÊTRE JOUÉE EN MULTIPLE =====
function canPlayMultipleCards(cards) {
    if (!cards || cards.length === 0) return false;
    if (cards.length === 1) return true;

    const firstRank = cards[0].rank;
    return cards.every(card => card.rank === firstRank);
}

// ===== TROUVER LA COULEUR DOMINANTE D'UNE MAIN =====
function getDominantSuit(hand) {
    const counts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    hand.forEach(card => {
        if (card.suit && card.type !== 'joker' && counts[card.suit] !== undefined) {
            counts[card.suit]++;
        }
    });

    let bestSuit = 'pique';
    let bestCount = -1;
    Object.keys(counts).forEach(suit => {
        if (counts[suit] > bestCount) {
            bestCount = counts[suit];
            bestSuit = suit;
        }
    });

    return bestSuit;
}

// ===== TROUVER LA COULEUR DOMINANTE (rouge/noir) =====
function getDominantColor(hand) {
    const counts = { red: 0, black: 0 };
    hand.forEach(card => {
        if (card.type === 'joker') {
            counts[card.color]++;
        } else if (card.color) {
            counts[card.color]++;
        }
    });
    return counts.red >= counts.black ? 'red' : 'black';
}

// ===== VÉRIFIER SI UNE CARTE EST UNE FIGURE =====
function isFaceCard(card) {
    if (!card) return false;
    return ['J', 'Q', 'K'].includes(card.rank);
}

// ===== VÉRIFIER SI UNE CARTE EST UN AS =====
function isAce(card) {
    return card && card.rank === 'A';
}

// ===== VÉRIFIER SI UNE CARTE EST UN 7 =====
function isSeven(card) {
    return card && card.rank === '7';
}

// ===== VÉRIFIER SI UNE CARTE EST UN JOKER =====
function isJoker(card) {
    return card && card.type === 'joker';
}

// ===== VÉRIFIER SI UNE CARTE EST UN J =====
function isJack(card) {
    return card && card.rank === 'J';
}

// ===== VÉRIFIER SI UNE CARTE EST UN ROI =====
function isKing(card) {
    return card && card.rank === 'K';
}

// ===== COMPTER LES POINTS D'UNE MAIN =====
function countPoints(hand) {
    return hand.reduce((total, card) => total + (card.value || 0), 0);
}

// ===== VÉRIFIER SI UNE MAIN EST VIDE =====
function isEmptyHand(hand) {
    return !hand || hand.length === 0;
}

// ===== TRIER UNE MAIN (par couleur puis rang) =====
function sortHand(hand, sortBy = 'suit') {
    const suitOrder = { pique: 0, coeur: 1, carreau: 2, trefle: 3, joker: 4 };
    const rankOrder = {
        'A': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7,
        '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'JOKER': 14
    };

    return [...hand].sort((a, b) => {
        if (sortBy === 'suit') {
            if (suitOrder[a.suit] !== suitOrder[b.suit]) {
                return suitOrder[a.suit] - suitOrder[b.suit];
            }
            return rankOrder[a.rank] - rankOrder[b.rank];
        }
        if (sortBy === 'rank') {
            if (rankOrder[a.rank] !== rankOrder[b.rank]) {
                return rankOrder[a.rank] - rankOrder[b.rank];
            }
            return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return 0;
    });
}

// ===== VALIDATION DE COUP (COMPLET) =====
function validatePlay(cards, hand, gameState) {
    if (!cards || cards.length === 0) {
        return { valid: false, reason: 'Aucune carte sélectionnée' };
    }

    // Vérifier que toutes les cartes sont dans la main
    const allInHand = cards.every(card => hand.some(c => c.id === card.id));
    if (!allInHand) {
        return { valid: false, reason: 'Cartes non présentes dans la main' };
    }

    // Vérifier que toutes les cartes ont le même rang (si plusieurs)
    if (cards.length > 1) {
        const firstRank = cards[0].rank;
        const allSameRank = cards.every(card => card.rank === firstRank);
        if (!allSameRank) {
            return { valid: false, reason: 'Les cartes doivent avoir le même rang' };
        }
    }

    // Vérifier que chaque carte peut être jouée
    const options = {
        imposedSuit: gameState.imposedSuit,
        imposedColor: gameState.imposedColor,
        pendingDraw: gameState.pendingDraw,
        gameMode: gameState.mode
    };

    for (const card of cards) {
        if (!canPlayCard(card, gameState.centerCard, options)) {
            return {
                valid: false,
                reason: `La carte ${card.rank}${card.symbol || ''} ne peut pas être jouée`
            };
        }
    }

    // Vérifier si un J est joué
    const jackPlayed = cards.find(c => c.rank === 'J');
    if (jackPlayed && !gameState.imposedSuitChoice) {
        return {
            valid: false,
            reason: 'Vous devez choisir une couleur avec le J',
            requiresSuitChoice: true
        };
    }

    return { valid: true };
}

// ===== EXPORT =====
module.exports = {
    // Constantes
    SUITS,
    SUIT_SYMBOLS,
    SUIT_COLORS,
    RANKS,

    // Deck
    createDeck,
    shuffle,
    distributeCards,
    getCardValue,

    // Carte centrale
    isValidCenterCard,
    drawCenterCard,

    // Validation
    canPlayCard,
    hasValidMove,
    validatePlay,
    canPlayMultipleCards,

    // Effets
    getCardEffect,
    isSpecialCard,
    getSpecialCardName,

    // Cartes jouables
    getPlayableCards,
    getPlayableCardsOfSameRank,

    // Groupes
    groupByRank,
    groupBySuit,
    groupByColor,

    // Banque
    reshuffleBank,

    // Blocage
    canBlockAttack,

    // Couleurs
    getDominantSuit,
    getDominantColor,

    // Types de cartes
    isFaceCard,
    isAce,
    isSeven,
    isJoker,
    isJack,
    isKing,

    // Score
    calculateHandScore,
    countPoints,
    isEmptyHand,

    // Tri
    sortHand
};