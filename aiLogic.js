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

    // ===== CAS 1 : ATTAQUE EN COURS =====
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

            // Stratégie : garder un bloqueur en réserve si possible
            if (blockers.length >= 2) {
                if (sevens.length > 0) return { action: 'play', cards: [sevens[0]] };
                return { action: 'play', cards: [jokers[0]] };
            }

            return { action: 'play', cards: [blockers[0]] };
        }

        return { action: 'draw' };
    }

    // ===== CAS 2 : COULEUR IMPOSÉE PAR UN J =====
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

    // ===== CAS 3 : COULEUR IMPOSÉE PAR UN JOKER =====
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

    // ===== CAS 4 : CENTRE EST UN JOKER =====
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

    // ===== CAS 5 : JEU NORMAL =====
    const playable = botHand.filter(function(c) {
        return gameLogic.canPlayCard(c, centerCard, null, null);
    });

    if (playable.length === 0) {
        return { action: 'draw' };
    }

    // ===== STRATÉGIE DU J (niveau MOYEN et DIFFICILE) =====
    if (difficulty !== DIFFICULTY.EASY) {
        const jacks = playable.filter(function(c) { return c.rank === 'J'; });

        if (jacks.length > 0) {
            const jStrategy = shouldPlayJack(botHand, gameState, jacks.length);
            if (jStrategy.play) {
                // Choisir la meilleure couleur à imposer
                const suit = chooseSuitForJack(botHand, difficulty);
                // Le J lui-même est joué, mais on retourne l'info de la couleur choisie
                return {
                    action: 'play',
                    cards: [jacks[0]],
                    imposedSuit: suit
                };
            }
        }
    }

    return chooseBestCard(playable, centerCard, difficulty, gameState, botHand);
}

// ===== STRATÉGIE DU J =====
function shouldPlayJack(botHand, gameState, jackCount) {
    const playerCount = gameState.playerCount || 4;

    // Si le bot a 2+ J, il en joue un (peu de risque)
    if (jackCount >= 2) {
        return { play: true, reason: 'multiple_jacks' };
    }

    // Compter les cartes par couleur
    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    botHand.forEach(function(card) {
        if (card.suit && suitCounts[card.suit] !== undefined) {
            suitCounts[card.suit]++;
        }
    });

    // Trouver la couleur dominante
    let maxCount = 0;
    Object.keys(suitCounts).forEach(function(suit) {
        if (suitCounts[suit] > maxCount) maxCount = suitCounts[suit];
    });

    // Le bot doit avoir au moins 2 cartes de sa couleur dominante pour la valoriser
    if (maxCount >= 2) {
        // Si le bot a beaucoup de cartes, il peut se permettre d'imposer
        if (botHand.length >= 4) {
            return { play: true, reason: 'dominant_suit' };
        }
    }

    // Fin de partie : si le bot a peu de cartes, il finit vite sans stratégie
    if (botHand.length <= 2) {
        return { play: false, reason: 'endgame_simple' };
    }

    // Éviter de jouer le J trop tôt (premier tour)
    const totalPlayed = (gameState.playerCount || 4) - botHand.length;
    if (totalPlayed <= 0) {
        return { play: false, reason: 'early_game' };
    }

    // Par défaut : garder le J en réserve
    return { play: false, reason: 'keep_in_reserve' };
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

    // Si plusieurs cartes du même rang, on les joue
    if (bestGroupSize >= 2 && fullHand.length >= 3) {
        return { action: 'play', cards: bestGroup };
    }

    // Fin de partie : jouer n'importe quoi pour finir
    if (fullHand.length <= 2) {
        return { action: 'play', cards: [playableCards[0]] };
    }

    // Privilégier les non-Jokers
    const nonJokers = playableCards.filter(function(c) { return c.type !== 'joker'; });
    if (nonJokers.length > 0) {
        const aces = nonJokers.filter(function(c) { return c.rank === 'A'; });
        const sevens = nonJokers.filter(function(c) { return c.rank === '7'; });

        // Si plusieurs As ou plusieurs 7, les jouer
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