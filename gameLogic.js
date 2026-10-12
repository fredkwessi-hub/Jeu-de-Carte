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

// ===== CRÉATION DU DECK =====
function createDeck() {
    const deck = [];
    let id = 0;

    SUITS.forEach(suit => {
        RANKS.forEach(rank => {
            deck.push({
                id: `card_${id++}`,
                suit: suit,
                rank: rank,
                type: 'normal',
                symbol: SUIT_SYMBOLS[suit],
                color: SUIT_COLORS[suit]
            });
        });
    });

    // Ajouter les 2 jokers
    deck.push({
        id: `card_${id++}`,
        suit: 'joker',
        rank: 'JOKER',
        type: 'joker',
        symbol: '🃏',
        color: 'red',
        jokerColor: 'rouge'
    });

    deck.push({
        id: `card_${id++}`,
        suit: 'joker',
        rank: 'JOKER',
        type: 'joker',
        symbol: '🃏',
        color: 'black',
        jokerColor: 'noir'
    });

    return deck;
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
function distributeCards(deck, playerCount, cardsPerPlayer = 5) {
    const shuffled = shuffle(deck);
    const hands = [];

    for (let i = 0; i < playerCount; i++) {
        hands.push(shuffled.slice(i * cardsPerPlayer, (i + 1) * cardsPerPlayer));
    }

    const remaining = shuffled.slice(playerCount * cardsPerPlayer);

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

    // Fallback : chercher la première carte valide
    const validIndex = bankCopy.findIndex(isValidCenterCard);
    if (validIndex !== -1) {
        const card = bankCopy[validIndex];
        bankCopy.splice(validIndex, 1);
        return { centerCard: card, newBank: bankCopy };
    }

    return { centerCard: null, newBank: bankCopy };
}

// ===== VALIDATION D'UN COUP =====
function canPlayCard(card, centerCard, imposedSuit = null) {
    if (!card) return false;

    // Si un J a imposé une couleur
    if (imposedSuit) {
        if (card.type === 'joker') return true; // Joker passe toujours
        return card.suit === imposedSuit;
    }

    // Carte normale : même rang OU même couleur
    if (card.type === 'joker') return true;
    if (!centerCard) return true;

    if (card.rank === centerCard.rank) return true;
    if (card.suit === centerCard.suit) return true;

    return false;
}

// ===== VÉRIFIER SI LE JOUEUR A UN COUP VALIDE =====
function hasValidMove(hand, centerCard, imposedSuit = null) {
    return hand.some(card => canPlayCard(card, centerCard, imposedSuit));
}

// ===== EFFET DES CARTES SPÉCIALES =====
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

// ===== RECHERCHE DE PLUSIEURS CARTES DU MÊME RANG =====
function getPlayableCardsOfSameRank(hand, rank) {
    return hand.filter(card => card.rank === rank);
}

// ===== RECONSTITUTION DE LA BANQUE =====
function reshuffleBank(pile) {
    // On garde la carte la plus haute (celle du dessus)
    if (pile.length <= 1) return { newBank: [], newPile: pile };

    const topCard = pile[pile.length - 1];
    const rest = pile.slice(0, -1);
    const shuffled = shuffle(rest);

    return {
        newBank: shuffled,
        newPile: [topCard]
    };
}

// ===== FONCTIONS POUR L'IA =====

// Vérifier si un joueur peut bloquer une attaque
function canBlockAttack(hand) {
    return hand.some(card => {
        if (card.type === 'joker') return true;
        if (card.rank === '7') return true;
        return false;
    });
}

// Obtenir toutes les cartes jouables
function getPlayableCards(hand, centerCard, imposedSuit = null) {
    return hand.filter(card => canPlayCard(card, centerCard, imposedSuit));
}

// Grouper les cartes par rang
function groupByRank(hand) {
    const groups = {};
    hand.forEach(card => {
        if (!groups[card.rank]) groups[card.rank] = [];
        groups[card.rank].push(card);
    });
    return groups;
}

// Grouper les cartes par couleur
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

// ===== EXPORTS =====
module.exports = {
    SUITS,
    SUIT_SYMBOLS,
    SUIT_COLORS,
    RANKS,
    JOKERS,
    createDeck,
    shuffle,
    distributeCards,
    isValidCenterCard,
    drawCenterCard,
    canPlayCard,
    hasValidMove,
    getCardEffect,
    getPlayableCardsOfSameRank,
    reshuffleBank,
    canBlockAttack,
    getPlayableCards,
    groupByRank,
    groupBySuit
};