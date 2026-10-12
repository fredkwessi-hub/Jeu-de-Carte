// aiLogic.js - Intelligence artificielle pour les bots

const gameLogic = require('./gameLogic');

// ===== NIVEAUX DE DIFFICULTÉ =====
const DIFFICULTY = {
    EASY: 'easy',     // Joue au hasard
    MEDIUM: 'medium', // Joue intelligemment mais simple
    HARD: 'hard'      // Stratégie avancée
};

// ===== CHOISIR UN COUP =====
function chooseMove(botHand, gameState, difficulty = DIFFICULTY.MEDIUM) {
    const { centerCard, imposedSuit, pendingDraw } = gameState;

    // ===== CAS 1 : ATTAQUE EN COURS =====
    if (pendingDraw > 0) {
        // Chercher un 7 ou un Joker pour bloquer
        const blockers = botHand.filter(c =>
            c.type === 'joker' || c.rank === '7'
        );

        if (blockers.length > 0) {
            // Choisir le meilleur bloqueur
            // Priorité : Joker (renvoie 4) > 7 (renvoie 2)
            // Mais on garde un bloqueur en réserve si possible
            const jokers = blockers.filter(c => c.type === 'joker');
            const sevens = blockers.filter(c => c.rank === '7');

            if (difficulty === DIFFICULTY.EASY) {
                return { action: 'play', cards: [blockers[0]] };
            }

            // Stratégie : si on a plusieurs bloqueurs, on en garde un
            if (blockers.length >= 2) {
                // Jouer le moins fort (7 avant Joker)
                if (sevens.length > 0) {
                    return { action: 'play', cards: [sevens[0]] };
                }
                return { action: 'play', cards: [jokers[0]] };
            }

            // Un seul bloqueur : on l'utilise
            return { action: 'play', cards: [blockers[0]] };
        }

        // Pas de bloqueur : piocher
        return { action: 'draw' };
    }

    // ===== CAS 2 : COULEUR IMPOSÉE =====
    if (imposedSuit) {
        // Vérifier si on a la couleur imposée
        const matchingSuit = botHand.filter(c => c.suit === imposedSuit);
        const jokers = botHand.filter(c => c.type === 'joker');

        if (matchingSuit.length > 0) {
            return chooseBestCard(matchingSuit, centerCard, difficulty, gameState);
        }

        // Pas la couleur imposée : Joker pour changer
        if (jokers.length > 0) {
            return { action: 'play', cards: [jokers[0]] };
        }

        // Rien : piocher
        return { action: 'draw' };
    }

    // ===== CAS 3 : JEU NORMAL =====
    const playable = botHand.filter(c =>
        gameLogic.canPlayCard(c, centerCard, null)
    );

    if (playable.length === 0) {
        return { action: 'draw' };
    }

    return chooseBestCard(playable, centerCard, difficulty, gameState, botHand);
}

// ===== CHOISIR LA MEILLEURE CARTE =====
function chooseBestCard(playableCards, centerCard, difficulty, gameState, fullHand = []) {
    if (difficulty === DIFFICULTY.EASY) {
        // Au hasard
        return { action: 'play', cards: [playableCards[0]] };
    }

    // ===== STRATÉGIE INTELLIGENTE =====

    // 1. Chercher plusieurs cartes du même rang (pour se débarrasser vite)
    const rankGroups = {};
    playableCards.forEach(c => {
        if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
        rankGroups[c.rank].push(c);
    });

    // Trouver le plus grand groupe
    let bestGroup = null;
    let bestGroupSize = 0;
    for (const [rank, cards] of Object.entries(rankGroups)) {
        if (cards.length > bestGroupSize) {
            bestGroupSize = cards.length;
            bestGroup = cards;
        }
    }

    // Si on a 2+ cartes du même rang et qu'on a beaucoup de cartes, on les joue
    if (bestGroupSize >= 2 && fullHand.length >= 3) {
        return { action: 'play', cards: bestGroup };
    }

    // 2. Privilégier les cartes spéciales pour embêter les autres
    // As (skip) et 7 (attaque) sont stratégiques

    // Fin de partie : jouer ce qu'on peut pour finir
    if (fullHand.length <= 2) {
        return { action: 'play', cards: [playableCards[0]] };
    }

    // 3. Éviter de gaspiller les Jokers si possible
    const nonJokers = playableCards.filter(c => c.type !== 'joker');
    if (nonJokers.length > 0) {
        // Préférer les As et 7 (effets puissants)
        const aces = nonJokers.filter(c => c.rank === 'A');
        const sevens = nonJokers.filter(c => c.rank === '7');
        const jacks = nonJokers.filter(c => c.rank === 'J');

        // Jouer un As si on en a plusieurs
        if (aces.length >= 2) {
            return { action: 'play', cards: [aces[0]] };
        }

        // Jouer un 7 si on en a plusieurs
        if (sevens.length >= 2) {
            return { action: 'play', cards: [sevens[0]] };
        }

        // Sinon, jouer la première carte normale (évite de garder les spéciales)
        return { action: 'play', cards: [nonJokers[0]] };
    }

    // Que des Jokers
    return { action: 'play', cards: [playableCards[0]] };
}

// ===== CHOISIR UNE COULEUR POUR LE J =====
function chooseSuitForJack(botHand, difficulty = DIFFICULTY.MEDIUM) {
    if (difficulty === DIFFICULTY.EASY) {
        return ['pique', 'carreau', 'coeur', 'trefle'][Math.floor(Math.random() * 4)];
    }

    // Compter les couleurs dans la main du bot
    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    botHand.forEach(card => {
        if (card.suit && suitCounts[card.suit] !== undefined) {
            suitCounts[card.suit]++;
        }
    });

    // Choisir la couleur la plus représentée
    let bestSuit = 'pique';
    let bestCount = -1;
    for (const [suit, count] of Object.entries(suitCounts)) {
        if (count > bestCount) {
            bestCount = count;
            bestSuit = suit;
        }
    }

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

function getRandomBotName(existingNames = []) {
    const available = BOT_NAMES.filter(n => !existingNames.includes(n));
    if (available.length === 0) {
        return `🤖 Bot ${Math.floor(Math.random() * 1000)}`;
    }
    return available[Math.floor(Math.random() * available.length)];
}

// ===== EXPORTS =====
module.exports = {
    DIFFICULTY,
    chooseMove,
    chooseSuitForJack,
    getRandomBotName,
    BOT_NAMES
};