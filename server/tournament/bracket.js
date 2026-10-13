// ===== server/tournament/bracket.js =====
// Génération et gestion des brackets de tournoi

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');

// ===== GÉNÉRATION DU BRACKET INITIAL =====
/**
 * Génère le bracket du premier tour selon le nombre de participants
 * Supporte : 4, 8, 16 joueurs (et plus si nécessaire)
 */
function generateInitialBracket(participants) {
    const count = participants.length;

    // Vérifier que le nombre est valide
    if (!isValidBracketSize(count)) {
        throw new Error(`Nombre de participants invalide: ${count}. Doit être 4, 8, 16...`);
    }

    // Mélanger les participants
    const shuffled = helpers.shuffleArray(participants);

    // Créer les matchs du premier tour
    const matches = [];
    for (let i = 0; i < count; i += 2) {
        matches.push(createMatch(shuffled[i], shuffled[i + 1], 1, matches.length));
    }

    return {
        rounds: [{
            number: 1,
            name: getRoundName(1, count),
            matches: matches,
            completed: false,
            winners: []
        }],
        totalRounds: calculateTotalRounds(count),
        currentRound: 1,
        totalParticipants: count,
        createdAt: helpers.now()
    };
}

// ===== CRÉATION D'UN MATCH =====
function createMatch(player1, player2, round, index) {
    return {
        id: helpers.generateMatchId(),
        round: round,
        index: index,
        player1: player1 ? {
            id: player1.id,
            name: player1.name,
            avatar: player1.avatar,
            isBot: player1.isBot || false
        } : null,
        player2: player2 ? {
            id: player2.id,
            name: player2.name,
            avatar: player2.avatar,
            isBot: player2.isBot || false
        } : null,
        winner: null,
        loser: null,
        gameId: null,
        status: 'pending', // pending, playing, finished
        startedAt: null,
        finishedAt: null,
        score1: 0,
        score2: 0
    };
}

// ===== CALCUL DU NOMBRE DE TOURS =====
function calculateTotalRounds(participantCount) {
    return Math.log2(participantCount);
}

function isValidBracketSize(count) {
    return count >= 2 && (count & (count - 1)) === 0; // Puissance de 2
}

// ===== NOM DU TOUR =====
function getRoundName(round, totalParticipants) {
    const totalRounds = calculateTotalRounds(totalParticipants);
    const remaining = totalRounds - round + 1;

    const names = {
        1: 'Finale',
        2: 'Demi-finales',
        3: 'Quarts de finale',
        4: 'Huitièmes de finale',
        5: 'Seizièmes de finale'
    };

    return names[remaining] || `Tour ${round}`;
}

// ===== GÉNÉRATION DU TOUR SUIVANT =====
/**
 * À partir des gagnants du tour précédent, génère les matchs du tour suivant
 */
function generateNextRound(bracket, winners) {
    const currentRound = bracket.rounds[bracket.rounds.length - 1];

    // Vérifier que tous les matchs sont terminés
    if (!currentRound.completed) {
        throw new Error('Le tour actuel n\'est pas terminé');
    }

    // Si un seul gagnant, c'est le champion
    if (winners.length === 1) {
        return null; // Pas de tour suivant
    }

    // Créer les matchs du tour suivant
    const nextRoundNumber = bracket.currentRound + 1;
    const matches = [];

    for (let i = 0; i < winners.length; i += 2) {
        matches.push(createMatch(winners[i], winners[i + 1], nextRoundNumber, matches.length));
    }

    const nextRound = {
        number: nextRoundNumber,
        name: getRoundName(nextRoundNumber, bracket.totalParticipants),
        matches: matches,
        completed: false,
        winners: []
    };

    bracket.rounds.push(nextRound);
    bracket.currentRound = nextRoundNumber;

    return nextRound;
}

// ===== ENREGISTREMENT DU RÉSULTAT D'UN MATCH =====
function recordMatchResult(bracket, matchId, winner, loser) {
    // Trouver le match dans tous les tours
    let match = null;
    let round = null;

    for (const r of bracket.rounds) {
        const found = r.matches.find(m => m.id === matchId);
        if (found) {
            match = found;
            round = r;
            break;
        }
    }

    if (!match) {
        throw new Error(`Match ${matchId} introuvable`);
    }

    // Mettre à jour le match
    match.winner = {
        id: winner.id,
        name: winner.name,
        avatar: winner.avatar,
        isBot: winner.isBot || false
    };
    match.loser = {
        id: loser.id,
        name: loser.name,
        avatar: loser.avatar,
        isBot: loser.isBot || false
    };
    match.status = 'finished';
    match.finishedAt = helpers.now();

    // Ajouter le gagnant à la liste des gagnants du tour
    if (!round.winners.includes(winner.id)) {
        round.winners.push(winner.id);
    }

    // Vérifier si le tour est terminé
    const allFinished = round.matches.every(m => m.status === 'finished');
    if (allFinished) {
        round.completed = true;
        logger.tournament(`Tour ${round.number} (${round.name}) terminé`, {
            winners: round.winners.length
        });
    }

    return match;
}

// ===== OBTENIR LES GAGNANTS D'UN TOUR =====
function getRoundWinners(bracket, roundNumber) {
    const round = bracket.rounds.find(r => r.number === roundNumber);
    if (!round) return [];

    return round.matches
        .filter(m => m.winner)
        .map(m => m.winner);
}

// ===== OBTENIR LE MATCH ACTUEL =====
function getCurrentMatches(bracket) {
    const currentRound = bracket.rounds[bracket.rounds.length - 1];
    if (!currentRound) return [];

    return currentRound.matches.filter(m => m.status !== 'finished');
}

// ===== OBTENIR LE PROCHAIN MATCH À JOUER =====
function getNextMatch(bracket) {
    for (const round of bracket.rounds) {
        for (const match of round.matches) {
            if (match.status === 'pending' && match.player1 && match.player2) {
                return match;
            }
        }
    }
    return null;
}

// ===== VÉRIFIER SI LE BRACKET EST TERMINÉ =====
function isBracketFinished(bracket) {
    const lastRound = bracket.rounds[bracket.rounds.length - 1];
    if (!lastRound) return false;

    // Le bracket est terminé si le dernier tour n'a qu'un match et qu'il est fini
    return lastRound.matches.length === 1 && lastRound.matches[0].status === 'finished';
}

// ===== OBTENIR LE CHAMPION =====
function getChampion(bracket) {
    if (!isBracketFinished(bracket)) return null;

    const lastRound = bracket.rounds[bracket.rounds.length - 1];
    return lastRound.matches[0].winner;
}

// ===== OBTENIR LE CLASSEMENT COMPLET =====
function getFinalRanking(bracket) {
    const ranking = [];

    // Parcourir les tours du dernier au premier
    for (let i = bracket.rounds.length - 1; i >= 0; i--) {
        const round = bracket.rounds[i];

        if (i === bracket.rounds.length - 1) {
            // Finale : champion + finaliste
            const finalMatch = round.matches[0];
            if (finalMatch.winner) {
                ranking.push({
                    ...finalMatch.winner,
                    position: 1,
                    medal: '🥇'
                });
            }
            if (finalMatch.loser) {
                ranking.push({
                    ...finalMatch.loser,
                    position: 2,
                    medal: '🥈'
                });
            }
        } else if (i === bracket.rounds.length - 2) {
            // Demi-finales : les perdants sont 3ème et 4ème
            round.matches.forEach(m => {
                if (m.loser && !ranking.find(r => r.id === m.loser.id)) {
                    ranking.push({
                        ...m.loser,
                        position: ranking.length + 1,
                        medal: ranking.length === 2 ? '🥉' : '🏅'
                    });
                }
            });
        } else {
            // Autres tours : les perdants
            round.matches.forEach(m => {
                if (m.loser && !ranking.find(r => r.id === m.loser.id)) {
                    ranking.push({
                        ...m.loser,
                        position: ranking.length + 1,
                        medal: '🏅'
                    });
                }
            });
        }
    }

    return ranking;
}

// ===== OBTENIR LE BRACKET EN FORMAT VISUEL =====
function getVisualBracket(bracket) {
    return {
        totalRounds: bracket.totalRounds,
        currentRound: bracket.currentRound,
        totalParticipants: bracket.totalParticipants,
        rounds: bracket.rounds.map(round => ({
            number: round.number,
            name: round.name,
            completed: round.completed,
            matches: round.matches.map(m => ({
                id: m.id,
                player1: m.player1 ? {
                    id: m.player1.id,
                    name: m.player1.name,
                    avatar: m.player1.avatar,
                    isBot: m.player1.isBot
                } : null,
                player2: m.player2 ? {
                    id: m.player2.id,
                    name: m.player2.name,
                    avatar: m.player2.avatar,
                    isBot: m.player2.isBot
                } : null,
                winner: m.winner ? {
                    id: m.winner.id,
                    name: m.winner.name,
                    avatar: m.winner.avatar
                } : null,
                status: m.status
            }))
        })),
        champion: getChampion(bracket)
    };
}

// ===== PROGRESSION DU TOURNOI =====
function getProgress(bracket) {
    const totalMatches = bracket.rounds.reduce((sum, r) => sum + r.matches.length, 0);
    const finishedMatches = bracket.rounds.reduce(
        (sum, r) => sum + r.matches.filter(m => m.status === 'finished').length, 0
    );

    return {
        totalMatches,
        finishedMatches,
        remainingMatches: totalMatches - finishedMatches,
        percentage: totalMatches > 0 ? Math.round((finishedMatches / totalMatches) * 100) : 0,
        currentRound: bracket.currentRound,
        totalRounds: bracket.totalRounds
    };
}

// ===== CRÉATION D'UN BRACKET POUR 3 JOUEURS (avec bye) =====
function generateBracket3Players(participants) {
    // Un joueur a un "bye" (passe directement au tour suivant)
    const shuffled = helpers.shuffleArray(participants);

    const match1 = createMatch(shuffled[0], shuffled[1], 1, 0);
    const byePlayer = shuffled[2];

    const round1 = {
        number: 1,
        name: 'Demi-finale',
        matches: [match1],
        completed: false,
        winners: [],
        bye: byePlayer
    };

    return {
        rounds: [round1],
        totalRounds: 2,
        currentRound: 1,
        totalParticipants: 3,
        createdAt: helpers.now()
    };
}

// ===== CRÉATION D'UN BRACKET POUR 5-7 JOUEURS =====
function generateBracketWithByes(participants) {
    const count = participants.length;
    const nextPowerOf2 = Math.pow(2, Math.ceil(Math.log2(count)));
    const byesCount = nextPowerOf2 - count;

    const shuffled = helpers.shuffleArray(participants);

    // Les premiers joueurs obtiennent un bye
    const byePlayers = shuffled.slice(0, byesCount);
    const playingPlayers = shuffled.slice(byesCount);

    const matches = [];
    for (let i = 0; i < playingPlayers.length; i += 2) {
        matches.push(createMatch(playingPlayers[i], playingPlayers[i + 1], 1, matches.length));
    }

    return {
        rounds: [{
            number: 1,
            name: getRoundName(1, nextPowerOf2),
            matches: matches,
            completed: false,
            winners: [],
            byes: byePlayers
        }],
        totalRounds: Math.log2(nextPowerOf2),
        currentRound: 1,
        totalParticipants: count,
        createdAt: helpers.now()
    };
}

// ===== FONCTION PRINCIPALE : CRÉATION DU BRACKET =====
function createBracket(participants) {
    const count = participants.length;

    if (count < 2) {
        throw new Error('Il faut au moins 2 participants');
    }

    // Puissance de 2 : bracket standard
    if (isValidBracketSize(count)) {
        return generateInitialBracket(participants);
    }

    // Cas 3 : bracket spécial
    if (count === 3) {
        return generateBracket3Players(participants);
    }

    // Autres cas : avec byes
    return generateBracketWithByes(participants);
}

// ===== EXPORT =====
module.exports = {
    createBracket,
    generateInitialBracket,
    generateNextRound,
    generateBracket3Players,
    generateBracketWithByes,
    createMatch,
    recordMatchResult,
    getRoundWinners,
    getCurrentMatches,
    getNextMatch,
    isBracketFinished,
    getChampion,
    getFinalRanking,
    getVisualBracket,
    getProgress,
    getRoundName,
    calculateTotalRounds,
    isValidBracketSize
};