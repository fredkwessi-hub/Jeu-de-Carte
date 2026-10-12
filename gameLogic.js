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
const JOKERS = ['joker_rouge', 'joker_noir'];

// ===== DECK =====
function createDeck() {
    const deck = [];
    let id = 0;

    SUITS.forEach(function(suit) {
        RANKS.forEach(function(rank) {
            deck.push({
                id: 'card_' + (id++),
                suit: suit,
                rank: rank,
                type: 'normal',
                symbol: SUIT_SYMBOLS[suit],
                color: SUIT_COLORS[suit]
            });
        });
    });

    deck.push({
        id: 'card_' + (id++),
        suit: 'joker',
        rank: 'JOKER',
        type: 'joker',
        symbol: '🃏',
        color: 'red',
        jokerColor: 'rouge'
    });

    deck.push({
        id: 'card_' + (id++),
        suit: 'joker',
        rank: 'JOKER',
        type: 'joker',
        symbol: '🃏',
        color: 'black',
        jokerColor: 'noir'
    });

    return deck;
}

// ===== MÉLANGE =====
function shuffle(array) {
    const arr = array.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const temp = arr[i];
        arr[i] = arr[j];
        arr[j] = temp;
    }
    return arr;
}

// ===== DISTRIBUTION =====
function distributeCards(deck, playerCount, cardsPerPlayer) {
    cardsPerPlayer = cardsPerPlayer || 5;
    const shuffled = shuffle(deck);
    const hands = [];

    for (let i = 0; i < playerCount; i++) {
        hands.push(shuffled.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer));
    }

    const remaining = shuffled.slice(playerCount * cardsPerPlayer);

    return { hands: hands, bank: remaining };
}

// ===== CARTE CENTRALE =====
function isValidCenterCard(card) {
    if (!card) return false;
    if (card.type === 'joker') return false;
    if (card.rank === '7' || card.rank === 'A' || card.rank === 'J') return false;
    return true;
}

function drawCenterCard(bank) {
    const bankCopy = bank.slice();
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

    const validIndex = bankCopy.findIndex(isValidCenterCard);
    if (validIndex !== -1) {
        const card = bankCopy[validIndex];
        bankCopy.splice(validIndex, 1);
        return { centerCard: card, newBank: bankCopy };
    }

    return { centerCard: null, newBank: bankCopy };
}

// ===== VALIDATION =====
function canPlayCard(card, centerCard, imposedSuit) {
    if (!card) return false;

    if (imposedSuit) {
        if (card.type === 'joker') return true;
        return card.suit === imposedSuit;
    }

    if (card.type === 'joker') return true;
    if (!centerCard) return true;

    if (card.rank === centerCard.rank) return true;
    if (card.suit === centerCard.suit) return true;

    return false;
}

function hasValidMove(hand, centerCard, imposedSuit) {
    return hand.some(function(card) { return canPlayCard(card, centerCard, imposedSuit); });
}

// ===== EFFETS =====
function getCardEffect(card) {
    if (!card) return { type: 'none' };

    if (card.type === 'joker') {
        return { type: 'joker', drawCount: 4, blockable: true };
    }
    if (card.rank === '7') {
        return { type: 'seven', drawCount: 2, blockable: true };
    }
    if (card.rank === 'A') {
        return { type: 'ace', skip: true };
    }
    if (card.rank === 'J') {
        return { type: 'jack', impose: true };
    }
    return { type: 'normal' };
}

// ===== CARTES DU MÊME RANG =====
function getPlayableCardsOfSameRank(hand, rank) {
    return hand.filter(function(card) { return card.rank === rank; });
}

// ===== RECONSTITUTION BANQUE =====
function reshuffleBank(pile) {
    if (pile.length <= 1) return { newBank: [], newPile: pile };

    const topCard = pile[pile.length - 1];
    const rest = pile.slice(0, -1);
    const shuffled = shuffle(rest);

    return {
        newBank: shuffled,
        newPile: [topCard]
    };
}

// ===== FONCTIONS IA =====
function canBlockAttack(hand) {
    return hand.some(function(card) {
        if (card.type === 'joker') return true;
        if (card.rank === '7') return true;
        return false;
    });
}

function getPlayableCards(hand, centerCard, imposedSuit) {
    return hand.filter(function(card) { return canPlayCard(card, centerCard, imposedSuit); });
}

function groupByRank(hand) {
    const groups = {};
    hand.forEach(function(card) {
        if (!groups[card.rank]) groups[card.rank] = [];
        groups[card.rank].push(card);
    });
    return groups;
}

function groupBySuit(hand) {
    const groups = {};
    hand.forEach(function(card) {
        if (card.suit && card.type !== 'joker') {
            if (!groups[card.suit]) groups[card.suit] = [];
            groups[card.suit].push(card);
        }
    });
    return groups;
}

// ===== EXPORTS =====
module.exports = {
    SUITS: SUITS,
    SUIT_SYMBOLS: SUIT_SYMBOLS,
    SUIT_COLORS: SUIT_COLORS,
    RANKS: RANKS,
    JOKERS: JOKERS,
    createDeck: createDeck,
    shuffle: shuffle,
    distributeCards: distributeCards,
    isValidCenterCard: isValidCenterCard,
    drawCenterCard: drawCenterCard,
    canPlayCard: canPlayCard,
    hasValidMove: hasValidMove,
    getCardEffect: getCardEffect,
    getPlayableCardsOfSameRank: getPlayableCardsOfSameRank,
    reshuffleBank: reshuffleBank,
    canBlockAttack: canBlockAttack,
    getPlayableCards: getPlayableCards,
    groupByRank: groupByRank,
    groupBySuit: groupBySuit
};