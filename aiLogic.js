// aiLogic.js
const gameLogic = require('./gameLogic');

const DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard'
};

// ===== CHOISIR UN COUP =====
function chooseMove(botHand, gameState, difficulty) {
    difficulty = difficulty || DIFFICULTY.MEDIUM;
    const centerCard = gameState.centerCard;
    const imposedSuit = gameState.imposedSuit;
    const imposedColor = gameState.imposedColor;
    const pendingDraw = gameState.pendingDraw;

    // CAS ATTAQUE
    if (pendingDraw > 0) {
        const blockers = botHand.filter(function(c) {
            return c.type === 'joker' || c.rank === '7';
        });

        if (blockers.length > 0) {
            const jokers = blockers.filter(function(c) { return c.type === 'joker'; });
            const sevens = blockers.filter(function(c) { return c.rank === '7'; });

            if (difficulty === DIFFICULTY.EASY) {
                return { action: 'play', cards: [blockers[0]] };
            }

            if (blockers.length >= 2) {
                if (sevens.length > 0) return { action: 'play', cards: [sevens[0]] };
                return { action: 'play', cards: [jokers[0]] };
            }

            return { action: 'play', cards: [blockers[0]] };
        }

        return { action: 'draw' };
    }

    // CAS COULEUR IMPOSÉE PAR UN J (symbole)
    if (imposedSuit) {
        const matchingSuit = botHand.filter(function(c) { return c.suit === imposedSuit; });
        const jokers = botHand.filter(function(c) { return c.type === 'joker'; });

        if (matchingSuit.length > 0) {
            return chooseBestCard(matchingSuit, centerCard, difficulty, gameState, botHand);
        }
        if (jokers.length > 0) {
            return { action: 'play', cards: [jokers[0]] };
        }
        return { action: 'draw' };
    }

    // CAS COULEUR IMPOSÉE PAR UN JOKER (rouge/noir)
    if (imposedColor) {
        const matchingColor = botHand.filter(function(c) {
            return c.color === imposedColor && c.type !== 'joker';
        });
        const jokers = botHand.filter(function(c) { return c.type === 'joker'; });

        if (matchingColor.length > 0) {
            return chooseBestCard(matchingColor, centerCard, difficulty, gameState, botHand);
        }
        if (jokers.length > 0) {
            return { action: 'play', cards: [jokers[0]] };
        }
        return { action: 'draw' };
    }

    // CAS CENTRE EST UN JOKER
    if (centerCard && centerCard.type === 'joker') {
        const matchingColor = botHand.filter(function(c) {
            return c.color === centerCard.color && c.type !== 'joker';
        });
        const jokers = botHand.filter(function(c) { return c.type === 'joker'; });

        if (matchingColor.length > 0) {
            return chooseBestCard(matchingColor, centerCard, difficulty, gameState, botHand);
        }
        if (jokers.length > 0) {
            return { action: 'play', cards: [jokers[0]] };
        }
        return { action: 'draw' };
    }

    // CAS NORMAL
    const playable = botHand.filter(function(c) {
        return gameLogic.canPlayCard(c, centerCard, null, null);
    });

    if (playable.length === 0) {
        return { action: 'draw' };
    }

    return chooseBestCard(playable, centerCard, difficulty, gameState, botHand);
}

// ===== CHOISIR LA MEILLEURE CARTE =====
function chooseBestCard(playableCards, centerCard, difficulty, gameState, fullHand) {
    fullHand = fullHand || [];

    if (difficulty === DIFFICULTY.EASY) {
        return { action: 'play', cards: [playableCards[0]] };
    }

    const rankGroups = {};
    playableCards.forEach(function(c) {
        if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
        rankGroups[c.rank].push(c);
    });

    let bestGroup = null;
    let bestGroupSize = 0;
    Object.keys(rankGroups).forEach(function(rank) {
        if (rankGroups[rank].length > bestGroupSize) {
            bestGroupSize = rankGroups[rank].length;
            bestGroup = rankGroups[rank];
        }
    });

    if (bestGroupSize >= 2 && fullHand.length >= 3) {
        return { action: 'play', cards: bestGroup };
    }

    if (fullHand.length <= 2) {
        return { action: 'play', cards: [playableCards[0]] };
    }

    const nonJokers = playableCards.filter(function(c) { return c.type !== 'joker'; });
    if (nonJokers.length > 0) {
        const aces = nonJokers.filter(function(c) { return c.rank === 'A'; });
        const sevens = nonJokers.filter(function(c) { return c.rank === '7'; });

        if (aces.length >= 2) return { action: 'play', cards: [aces[0]] };
        if (sevens.length >= 2) return { action: 'play', cards: [sevens[0]] };

        return { action: 'play', cards: [nonJokers[0]] };
    }

    return { action: 'play', cards: [playableCards[0]] };
}

// ===== COULEUR POUR LE J =====
function chooseSuitForJack(botHand, difficulty) {
    difficulty = difficulty || DIFFICULTY.MEDIUM;

    if (difficulty === DIFFICULTY.EASY) {
        const suits = ['pique', 'carreau', 'coeur', 'trefle'];
        return suits[Math.floor(Math.random() * 4)];
    }

    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    botHand.forEach(function(card) {
        if (card.suit && suitCounts[card.suit] !== undefined) {
            suitCounts[card.suit]++;
        }
    });

    let bestSuit = 'pique';
    let bestCount = -1;
    Object.keys(suitCounts).forEach(function(suit) {
        if (suitCounts[suit] > bestCount) {
            bestCount = suitCounts[suit];
            bestSuit = suit;
        }
    });

    return bestSuit;
}

// ===== NOMS DE BOTS =====
const BOT_NAMES = [
    '🤖 Robo',
    '🎩 Alfred',
    '🧠 Einstein',
    '🎯 Sniper',
    '🦊 Renard',
    '🐺 Loup',
    '🦉 Hibou',
    '🐉 Dragon',
    '👾 Pixel',
    '🎲 Lucky',
    '🎪 Magic',
    '⚡ Flash'
];

function getRandomBotName(existingNames) {
    existingNames = existingNames || [];
    const available = BOT_NAMES.filter(function(n) {
        return existingNames.indexOf(n) === -1;
    });
    if (available.length === 0) {
        return '🤖 Bot ' + Math.floor(Math.random() * 1000);
    }
    return available[Math.floor(Math.random() * available.length)];
}

module.exports = {
    DIFFICULTY: DIFFICULTY,
    chooseMove: chooseMove,
    chooseSuitForJack: chooseSuitForJack,
    getRandomBotName: getRandomBotName,
    BOT_NAMES: BOT_NAMES
};