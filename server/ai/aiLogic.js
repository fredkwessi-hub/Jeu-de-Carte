// ===== server/ai/aiLogic.js =====
// Intelligence artificielle principale du jeu

const config = require('../config');
const logger = require('../utils/logger');
const gameLogic = require('../game/gameLogic');
const botPersonalities = require('./botPersonalities');
const botMemory = require('./botMemory');

// ===== NIVEAUX DE DIFFICULTÉ =====
const DIFFICULTY = {
    EASY: 'easy',
    MEDIUM: 'medium',
    HARD: 'hard',
    EXPERT: 'expert'
};

// ===== FONCTION PRINCIPALE : CHOISIR UN COUP =====
/**
 * L'IA analyse la situation et retourne le meilleur coup
 * @param {Array} botHand - Main du bot
 * @param {Object} gameState - État actuel de la partie
 * @param {String} difficulty - Niveau de difficulté
 * @param {String} personality - Personnalité du bot
 * @param {String} botId - ID du bot (pour la mémoire)
 */
function chooseMove(botHand, gameState, difficulty = DIFFICULTY.MEDIUM, personality = 'balanced', botId = null) {
    // Récupérer la personnalité
    const persona = botPersonalities.getPersonality(personality);

    // Récupérer la mémoire si disponible
    const memory = botId ? botMemory.getMemory(botId) : null;

    // État enrichi avec les infos de la partie
    const context = {
        hand: botHand,
        centerCard: gameState.centerCard,
        imposedSuit: gameState.imposedSuit,
        imposedColor: gameState.imposedColor,
        pendingDraw: gameState.pendingDraw,
        playerCount: gameState.playerCount,
        direction: gameState.direction,
        opponents: gameState.opponents || [],
        bankCount: gameState.bankCount || 0,
        pileCount: gameState.pileCount || 0,
        turnCount: gameState.turnCount || 0,
        memory: memory,
        persona: persona,
        difficulty: difficulty
    };

    // ===== CAS 1 : ATTAQUE EN COURS =====
    if (context.pendingDraw > 0) {
        return handleAttack(context);
    }

    // ===== CAS 2 : COULEUR IMPOSÉE PAR UN J =====
    if (context.imposedSuit) {
        return handleImposedSuit(context);
    }

    // ===== CAS 3 : COULEUR IMPOSÉE PAR UN JOKER =====
    if (context.imposedColor) {
        return handleImposedColor(context);
    }

    // ===== CAS 4 : CENTRE = JOKER =====
    if (context.centerCard && context.centerCard.type === 'joker') {
        return handleJokerCenter(context);
    }

    // ===== CAS 5 : JEU NORMAL =====
    return handleNormalPlay(context);
}

// ===== GESTION D'UNE ATTAQUE =====
function handleAttack(context) {
    const { hand, persona, difficulty } = context;

    // Chercher des bloqueurs (7 ou Joker)
    const blockers = hand.filter(c => c.type === 'joker' || c.rank === '7');

    if (blockers.length === 0) {
        // Ne peut pas bloquer : pioche
        return { action: 'draw' };
    }

    // ===== STRATÉGIE SELON LA PERSONNALITÉ =====
    if (persona.attackStyle === 'aggressive' || difficulty === DIFFICULTY.EXPERT) {
        // Agressif : bloque avec le plus fort (Joker en priorité)
        const joker = blockers.find(c => c.type === 'joker');
        if (joker) {
            return { action: 'play', cards: [joker], reason: 'aggressive_block_joker' };
        }
    }

    if (persona.attackStyle === 'defensive') {
        // Défensif : bloque avec le plus faible (7 avant Joker)
        const seven = blockers.find(c => c.rank === '7');
        if (seven) {
            return { action: 'play', cards: [seven], reason: 'defensive_block_seven' };
        }
    }

    // Équilibré : garde un bloqueur si possible
    if (blockers.length >= 2) {
        const seven = blockers.find(c => c.rank === '7');
        if (seven) {
            return { action: 'play', cards: [seven], reason: 'keep_joker' };
        }
        return { action: 'play', cards: [blockers[0]], reason: 'block' };
    }

    // Un seul bloqueur : l'utiliser
    return { action: 'play', cards: [blockers[0]], reason: 'must_block' };
}

// ===== GESTION COULEUR IMPOSÉE PAR UN J =====
function handleImposedSuit(context) {
    const { hand, imposedSuit, persona } = context;

    // Filtrer les cartes jouables
    const matchingSuit = hand.filter(c => c.suit === imposedSuit);
    const jokers = hand.filter(c => c.type === 'joker');

    // Si on a la couleur imposée
    if (matchingSuit.length > 0) {
        return chooseBestCard(matchingSuit, context);
    }

    // Sinon, jouer un Joker
    if (jokers.length > 0) {
        return { action: 'play', cards: [jokers[0]], reason: 'joker_break' };
    }

    // Sinon, pioche
    return { action: 'draw' };
}

// ===== GESTION COULEUR IMPOSÉE PAR UN JOKER =====
function handleImposedColor(context) {
    const { hand, imposedColor } = context;

    const matchingColor = hand.filter(c => c.color === imposedColor && c.type !== 'joker');
    const jokers = hand.filter(c => c.type === 'joker');

    if (matchingColor.length > 0) {
        return chooseBestCard(matchingColor, context);
    }

    if (jokers.length > 0) {
        return { action: 'play', cards: [jokers[0]], reason: 'joker_break' };
    }

    return { action: 'draw' };
}

// ===== GESTION CENTRE = JOKER =====
function handleJokerCenter(context) {
    const { hand, centerCard } = context;

    const matchingColor = hand.filter(c => c.color === centerCard.color && c.type !== 'joker');
    const jokers = hand.filter(c => c.type === 'joker');

    if (matchingColor.length > 0) {
        return chooseBestCard(matchingColor, context);
    }

    if (jokers.length > 0) {
        return { action: 'play', cards: [jokers[0]], reason: 'joker_chain' };
    }

    return { action: 'draw' };
}

// ===== JEU NORMAL =====
function handleNormalPlay(context) {
    const { hand, centerCard, difficulty, persona } = context;

    // Trouver toutes les cartes jouables
    const playable = hand.filter(c =>
        gameLogic.canPlayCard(c, centerCard, {
            imposedSuit: context.imposedSuit,
            imposedColor: context.imposedColor,
            pendingDraw: 0
        })
    );

    if (playable.length === 0) {
        return { action: 'draw' };
    }

    // ===== STRATÉGIE DU J (niveau moyen et plus) =====
    if (difficulty !== DIFFICULTY.EASY) {
        const jacks = playable.filter(c => c.rank === 'J');

        if (jacks.length > 0) {
            const jStrategy = shouldPlayJack(context, jacks.length);

            if (jStrategy.play) {
                const suit = chooseSuitForJack(hand, persona);
                return {
                    action: 'play',
                    cards: [jacks[0]],
                    imposedSuit: suit,
                    reason: 'strategic_jack_' + jStrategy.reason
                };
            }
        }
    }

    // ===== CHOISIR LA MEILLEURE CARTE =====
    return chooseBestCard(playable, context);
}

// ===== STRATÉGIE DU J =====
function shouldPlayJack(context, jackCount) {
    const { hand, persona, opponents, turnCount, bankCount } = context;

    // Si le bot a 2+ J, il en joue un
    if (jackCount >= 2) {
        return { play: true, reason: 'multiple_jacks' };
    }

    // Compter les couleurs
    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    hand.forEach(card => {
        if (card.suit && card.type !== 'joker') {
            suitCounts[card.suit]++;
        }
    });

    let maxCount = 0;
    Object.values(suitCounts).forEach(count => {
        if (count > maxCount) maxCount = count;
    });

    // Si le bot a 2+ cartes de sa couleur dominante et assez de cartes
    if (maxCount >= 2 && hand.length >= 4) {
        return { play: true, reason: 'dominant_suit' };
    }

    // Fin de partie : ne pas compliquer
    if (hand.length <= 2) {
        return { play: false, reason: 'endgame_simple' };
    }

    // Trop tôt pour jouer le J
    if (turnCount <= 1) {
        return { play: false, reason: 'early_game' };
    }

    // Vérifier si un adversaire est proche de gagner (personnalité agressive)
    if (persona.attackStyle === 'aggressive') {
        const dangerousOpponent = opponents.find(o => o.cardCount <= 2);
        if (dangerousOpponent) {
            return { play: true, reason: 'block_dangerous_opponent' };
        }
    }

    // Vérifier si la banque est presque vide (mode expert)
    if (context.difficulty === DIFFICULTY.EXPERT && bankCount < 10) {
        return { play: true, reason: 'endgame_pressure' };
    }

    // Par défaut : garder le J en réserve
    return { play: false, reason: 'keep_in_reserve' };
}

// ===== CHOISIR LA MEILLEURE CARTE PARMI LES JOUABLES =====
function chooseBestCard(playableCards, context) {
    const { difficulty, persona, hand } = context;

    // Facile : joue au hasard
    if (difficulty === DIFFICULTY.EASY) {
        return { action: 'play', cards: [playableCards[0]] };
    }

    // ===== 1. CHERCHER PLUSIEURS CARTES DU MÊME RANG =====
    const rankGroups = {};
    playableCards.forEach(c => {
        if (!rankGroups[c.rank]) rankGroups[c.rank] = [];
        rankGroups[c.rank].push(c);
    });

    let bestGroup = null;
    let bestGroupSize = 0;

    Object.keys(rankGroups).forEach(rank => {
        const size = rankGroups[rank].length;
        // Éviter de jouer plusieurs Jokers d'un coup (gaspillage)
        if (rank === 'JOKER' && size > 1) {
            // On en joue qu'un
            if (size > bestGroupSize) {
                bestGroupSize = 1;
                bestGroup = [rankGroups[rank][0]];
            }
        } else if (size > bestGroupSize) {
            bestGroupSize = size;
            bestGroup = rankGroups[rank];
        }
    });

    // Si on a plusieurs cartes du même rang et assez de cartes
    if (bestGroupSize >= 2 && hand.length >= 3) {
        return { action: 'play', cards: bestGroup, reason: 'multiple_same_rank' };
    }

    // ===== 2. FIN DE PARTIE : JOUER POUR FINIR =====
    if (hand.length <= 2) {
        // Prioriser les non-Jokers pour garder le Joker en dernier recours
        const nonJoker = playableCards.find(c => c.type !== 'joker');
        if (nonJoker) {
            return { action: 'play', cards: [nonJoker], reason: 'endgame' };
        }
        return { action: 'play', cards: [playableCards[0]], reason: 'endgame' };
    }

    // ===== 3. STRATÉGIE SELON LA PERSONNALITÉ =====
    if (persona.playStyle === 'aggressive') {
        // Prioriser les 7 et As
        const sevens = playableCards.filter(c => c.rank === '7');
        const aces = playableCards.filter(c => c.rank === 'A');

        if (sevens.length > 0) return { action: 'play', cards: [sevens[0]], reason: 'aggressive_seven' };
        if (aces.length > 0) return { action: 'play', cards: [aces[0]], reason: 'aggressive_ace' };
    }

    if (persona.playStyle === 'defensive') {
        // Éviter de gaspiller les 7, As, Jokers
        const safe = playableCards.filter(c =>
            c.type !== 'joker' && !['7', 'A', 'J', 'K'].includes(c.rank)
        );
        if (safe.length > 0) {
            return { action: 'play', cards: [safe[0]], reason: 'defensive_safe' };
        }
    }

    // ===== 4. JOUER LES CARTES "NORMAALES" EN PRIORITÉ =====
    const nonSpecial = playableCards.filter(c =>
        c.type !== 'joker' && !['7', 'A', 'J', 'K'].includes(c.rank)
    );

    if (nonSpecial.length > 0) {
        // Trier par valeur (jouer les plus fortes en premier)
        nonSpecial.sort((a, b) => b.value - a.value);
        return { action: 'play', cards: [nonSpecial[0]], reason: 'normal_play' };
    }

    // ===== 5. GARDER LES SPÉCIALES POUR LA FIN =====
    const nonJokers = playableCards.filter(c => c.type !== 'joker');
    if (nonJokers.length > 0) {
        return { action: 'play', cards: [nonJokers[0]], reason: 'keep_joker' };
    }

    // ===== 6. QUE DES JOKERS : en jouer un =====
    return { action: 'play', cards: [playableCards[0]], reason: 'must_play_joker' };
}

// ===== CHOISIR UNE COULEUR POUR LE J =====
function chooseSuitForJack(hand, persona = null) {
    if (!persona || persona.difficulty === DIFFICULTY.EASY) {
        // Aléatoire
        const suits = ['pique', 'carreau', 'coeur', 'trefle'];
        return suits[Math.floor(Math.random() * 4)];
    }

    // Compter les couleurs dans la main
    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    hand.forEach(card => {
        if (card.suit && suitCounts[card.suit] !== undefined) {
            suitCounts[card.suit]++;
        }
    });

    // Choisir la couleur la plus représentée
    let bestSuit = 'pique';
    let bestCount = -1;

    Object.keys(suitCounts).forEach(suit => {
        if (suitCounts[suit] > bestCount) {
            bestCount = suitCounts[suit];
            bestSuit = suit;
        }
    });

    return bestSuit;
}

// ===== STRATÉGIE AVANCÉE : CHOISIR ENTRE PLUSIEURS CARTES =====
function evaluateMove(cards, context) {
    const { hand, opponents, persona } = context;
    let score = 0;

    cards.forEach(card => {
        // Bonus pour les cartes spéciales (si la personnalité aime)
        if (persona.preferSpecial) {
            if (card.type === 'joker') score += 10;
            if (card.rank === '7') score += 8;
            if (card.rank === 'A') score += 6;
            if (card.rank === 'J') score += 5;
            if (card.rank === 'K') score += 4;
        }

        // Pénalité pour les Jokers (à garder)
        if (card.type === 'joker' && !persona.preferSpecial) score -= 5;

        // Bonus pour les cartes de la couleur dominante
        const dominantSuit = gameLogic.getDominantSuit(hand);
        if (card.suit === dominantSuit) score += 3;

        // Bonus pour se débarrasser des cartes fortes
        score += card.value * 0.1;
    });

    // Bonus pour finir rapidement
    if (hand.length - cards.length <= 2) score += 20;

    return score;
}

// ===== ADAPTER LA STRATÉGIE SELON L'ADVERSAIRE (via mémoire) =====
function adaptToOpponent(context) {
    const { memory, persona } = context;

    if (!memory || !memory.opponentStats) return null;

    // Analyser les habitudes de l'adversaire
    const stats = memory.opponentStats;

    // Si l'adversaire joue souvent du rouge, on impose du noir
    if (stats.favoriteColor === 'red' && persona.playStyle === 'aggressive') {
        return { strategy: 'impose_opposite_color' };
    }

    return null;
}

// ===== OBTENIR LA COULEUR RECOMMANDÉE SELON LA MÉMOIRE =====
function getRecommendedSuit(hand, memory, persona) {
    if (!memory || !memory.suitStats) {
        return chooseSuitForJack(hand, persona);
    }

    // Analyser les couleurs déjà jouées par les adversaires
    const suitCounts = { pique: 0, carreau: 0, coeur: 0, trefle: 0 };
    hand.forEach(card => {
        if (card.suit && suitCounts[card.suit] !== undefined) {
            suitCounts[card.suit]++;
        }
    });

    // Pondérer avec la mémoire
    Object.keys(suitCounts).forEach(suit => {
        if (memory.suitStats[suit] && memory.suitStats[suit].opponentPlayed > 0) {
            // Si l'adversaire joue souvent cette couleur, on l'évite
            suitCounts[suit] *= 0.7;
        }
    });

    let bestSuit = 'pique';
    let bestScore = -1;
    Object.keys(suitCounts).forEach(suit => {
        if (suitCounts[suit] > bestScore) {
            bestScore = suitCounts[suit];
            bestSuit = suit;
        }
    });

    return bestSuit;
}

// ===== EXPORT =====
module.exports = {
    DIFFICULTY,
    chooseMove,
    chooseSuitForJack,
    shouldPlayJack,
    chooseBestCard,
    evaluateMove,
    handleAttack,
    handleImposedSuit,
    handleImposedColor,
    handleJokerCenter,
    handleNormalPlay,
    getRecommendedSuit,
    adaptToOpponent
};