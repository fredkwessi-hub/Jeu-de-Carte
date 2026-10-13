// ===== server/tournament/tournamentManager.js =====
// Gestion complète des championnats

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const bracket = require('./bracket');
const matchmaking = require('./matchmaking');
const gameManager = require('../game/gameManager');
const aiLogic = require('../ai/aiLogic');
const scoring = require('../game/scoring');
const elo = require('../game/elo');
const profiles = require('../data/profiles');

// ===== STOCKAGE =====
const tournaments = new Map(); // tournamentId -> Tournament

// ===== CRÉATION =====
function createTournament(host, settings = {}) {
    const tournamentId = helpers.generateTournamentId();

    const playerCount = settings.playerCount || config.tournament.defaultPlayerCount;

    if (!config.tournament.allowedPlayerCounts.includes(playerCount)) {
        throw new Error(`Nombre de joueurs invalide. Autorisé: ${config.tournament.allowedPlayerCounts.join(', ')}`);
    }

    const tournament = {
        id: tournamentId,
        hostId: host.id,
        hostName: host.name,
        hostAvatar: host.avatar,

        // Configuration
        playerCount: playerCount,
        settings: {
            pairingStrategy: settings.pairingStrategy || 'seeded',
            allowByes: settings.allowByes !== false,
            smallFinal: settings.smallFinal !== false && config.tournament.allowSmallFinal,
            botDifficulty: settings.botDifficulty || 'medium'
        },

        // Participants
        participants: [{
            id: host.id,
            socketId: host.socketId,
            name: host.name,
            avatar: host.avatar,
            elo: host.elo || config.elo.initialRating,
            isBot: false,
            isConnected: true,
            eliminated: false,
            matchesWon: 0,
            joinedAt: helpers.now()
        }],

        // État
        status: 'lobby', // lobby, starting, playing, finished
        currentRound: 0,
        totalRounds: 0,
        bracket: null,
        matches: [],
        currentMatchIndex: 0,

        // Historique
        log: [],
        matchHistory: [],

        // Champion
        winner: null,

        // Métadonnées
        createdAt: helpers.now(),
        startedAt: null,
        finishedAt: null
    };

    tournaments.set(tournamentId, tournament);
    logger.tournament(`Championnat créé: ${tournamentId}`, {
        host: host.name,
        playerCount
    });

    return tournament;
}

// ===== RÉCUPÉRATION =====
function getTournament(tournamentId) {
    return tournaments.get(tournamentId) || null;
}

function getAllTournaments() {
    return Array.from(tournaments.values());
}

function getWaitingTournaments() {
    return Array.from(tournaments.values()).filter(t => t.status === 'lobby');
}

function getActiveTournaments() {
    return Array.from(tournaments.values()).filter(t => t.status === 'playing');
}

// ===== AJOUT DE PARTICIPANT =====
function addParticipant(tournamentId, participant) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return { error: 'Championnat introuvable' };
    if (tournament.status !== 'lobby') return { error: 'Le championnat a déjà commencé' };
    if (tournament.participants.length >= tournament.playerCount) {
        return { error: 'Championnat complet' };
    }
    if (tournament.participants.find(p => p.id === participant.id)) {
        return { error: 'Vous êtes déjà inscrit' };
    }

    const newParticipant = {
        id: participant.id,
        socketId: participant.socketId,
        name: participant.name,
        avatar: participant.avatar,
        elo: participant.elo || config.elo.initialRating,
        isBot: false,
        isConnected: true,
        eliminated: false,
        matchesWon: 0,
        joinedAt: helpers.now()
    };

    tournament.participants.push(newParticipant);

    addLog(tournament, `👤 ${participant.name} a rejoint le championnat (${tournament.participants.length}/${tournament.playerCount})`);

    logger.tournament(`${participant.name} rejoint ${tournamentId}`);

    return { success: true, tournament, participant: newParticipant };
}

// ===== AJOUT DE BOT =====
function addBot(tournamentId, botInfo = {}) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return { error: 'Championnat introuvable' };
    if (tournament.status !== 'lobby') return { error: 'Déjà commencé' };
    if (tournament.participants.length >= tournament.playerCount) {
        return { error: 'Championnat complet' };
    }

    const existingNames = tournament.participants.map(p => p.name);
    const botName = botInfo.name || gameManager.generateBotName(existingNames);

    const personalities = require('../ai/botPersonalities').getAllPersonalities();
    const persona = personalities[Math.floor(Math.random() * personalities.length)];

    const bot = {
        id: helpers.generateId('bot'),
        socketId: null,
        name: botName,
        avatar: 'bot',
        elo: config.elo.initialRating,
        isBot: true,
        botDifficulty: botInfo.difficulty || tournament.settings.botDifficulty,
        botPersonality: botInfo.personality || persona.id,
        isConnected: true,
        eliminated: false,
        matchesWon: 0,
        joinedAt: helpers.now()
    };

    tournament.participants.push(bot);

    addLog(tournament, `🤖 ${botName} a rejoint le championnat`);

    logger.bot(`${botName} ajouté à ${tournamentId}`);

    return { success: true, tournament, participant: bot };
}

// ===== RETRAIT DE PARTICIPANT =====
function removeParticipant(tournamentId, participantId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return { error: 'Championnat introuvable' };
    if (tournament.status === 'playing') return { error: 'Impossible de quitter en cours de partie' };

    const index = tournament.participants.findIndex(p => p.id === participantId);
    if (index === -1) return { error: 'Participant introuvable' };

    const removed = tournament.participants.splice(index, 1)[0];
    logger.tournament(`${removed.name} a quitté ${tournamentId}`);

    // Si plus personne, supprimer
    if (tournament.participants.length === 0) {
        tournaments.delete(tournamentId);
        return { success: true, deleted: true };
    }

    return { success: true, tournament };
}

// ===== DÉMARRAGE DU CHAMPIONNAT =====
function startTournament(tournamentId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return { error: 'Championnat introuvable' };
    if (tournament.status !== 'lobby') return { error: 'Déjà commencé' };
    if (tournament.participants.length !== tournament.playerCount) {
        return { error: `Il faut ${tournament.playerCount} participants (${tournament.participants.length} actuellement)` };
    }

    // Créer le bracket
    tournament.bracket = bracket.createBracket(tournament.participants);
    tournament.totalRounds = tournament.bracket.totalRounds;
    tournament.currentRound = 1;
    tournament.status = 'playing';
    tournament.startedAt = helpers.now();

    addLog(tournament, `🏆 Le championnat commence ! ${tournament.playerCount} participants, ${tournament.totalRounds} tours`);

    logger.tournament(`🏆 Championnat ${tournamentId} démarré`, {
        participants: tournament.participants.length,
        rounds: tournament.totalRounds
    });

    // Lancer le premier match
    setTimeout(() => launchNextMatch(tournamentId), 2000);

    return { success: true, tournament };
}

// ===== LANCER LE PROCHAIN MATCH =====
function launchNextMatch(tournamentId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament || tournament.status !== 'playing') return;

    // Trouver le prochain match à jouer
    const nextMatch = bracket.getNextMatch(tournament.bracket);

    if (!nextMatch) {
        // Plus de matchs : vérifier si le tour est terminé
        const progress = bracket.getProgress(tournament.bracket);

        if (progress.finishedMatches === progress.totalMatches) {
            // Le bracket est terminé
            finishTournament(tournamentId);
        } else {
            // Attendre la fin des matchs en cours
            setTimeout(() => launchNextMatch(tournamentId), 3000);
        }
        return;
    }

    // Lancer le match
    launchMatch(tournament, nextMatch);
}

// ===== LANCER UN MATCH =====
function launchMatch(tournament, match) {
    if (match.status !== 'pending') return;

    match.status = 'playing';
    match.startedAt = helpers.now();

    logger.tournament(`Match lancé: ${match.player1.name} vs ${match.player2.name}`, {
        round: match.round,
        tournamentId: tournament.id
    });

    addLog(tournament, `⚔️ ${match.player1.name} affronte ${match.player2.name}`);

    // Créer une partie
    const game = gameManager.createGame(
        { id: match.player1.id, socketId: match.player1.id, name: match.player1.name, avatar: match.player1.avatar },
        {
            maxPlayers: 2,
            mode: 'duel',
            rules: {
                stacking: true,
                reverse: true,
                drawAndPlay: false,
                scoring: 'standard'
            }
        }
    );

    // Ajouter le joueur 2
    gameManager.addPlayer(game.id, {
        id: match.player2.id,
        socketId: match.player2.socketId || match.player2.id,
        name: match.player2.name,
        avatar: match.player2.avatar,
        elo: match.player2.elo
    });

    // Si un joueur est un bot, le configurer
    if (match.player1.isBot) {
        const p = game.players.find(pl => pl.id === match.player1.id);
        if (p) {
            p.isBot = true;
            p.botDifficulty = match.player1.botDifficulty || 'medium';
            p.botPersonality = match.player1.botPersonality || 'balanced';
        }
    }
    if (match.player2.isBot) {
        const p = game.players.find(pl => pl.id === match.player2.id);
        if (p) {
            p.isBot = true;
            p.botDifficulty = match.player2.botDifficulty || 'medium';
            p.botPersonality = match.player2.botPersonality || 'balanced';
        }
    }

    match.gameId = game.id;

    // Démarrer la partie
    gameManager.startGame(game.id);

    // Notifier les joueurs
    game.players.forEach(player => {
        if (!player.isBot && player.socketId) {
            io.to(player.socketId).emit('tournament_match_started', {
                tournamentId: tournament.id,
                matchId: match.id,
                round: match.round,
                matchName: bracket.getRoundName(match.round, tournament.playerCount),
                game: gameManager.getGame(game.id)
            });
        }
    });

    // Surveiller la fin du match
    const checkInterval = setInterval(() => {
        const g = gameManager.getGame(game.id);
        if (!g || g.status === 'finished') {
            clearInterval(checkInterval);
            if (g && g.status === 'finished') {
                handleMatchEnd(tournament, match, g);
            }
        }
    }, 1000);
}

// ===== FIN D'UN MATCH =====
function handleMatchEnd(tournament, match, game) {
    if (match.status === 'finished') return;
    match.status = 'finished';
    match.finishedAt = helpers.now();

    const winner = game.finishedPlayers[0];
    const loser = game.finishedPlayers[game.finishedPlayers.length - 1];

    // Enregistrer dans le bracket
    bracket.recordMatchResult(tournament.bracket, match.id, winner, loser);

    // Mettre à jour le match
    match.winner = winner;
    match.loser = loser;

    // Historique
    tournament.matchHistory.push({
        matchId: match.id,
        round: match.round,
        player1: match.player1.name,
        player2: match.player2.name,
        winner: winner.name,
        loser: loser.name,
        finishedAt: helpers.now()
    });

    // Marquer le perdant comme éliminé
    const loserParticipant = tournament.participants.find(p => p.id === loser.id);
    if (loserParticipant) {
        loserParticipant.eliminated = true;
    }

    // Incrémenter les victoires du gagnant
    const winnerParticipant = tournament.participants.find(p => p.id === winner.id);
    if (winnerParticipant) {
        winnerParticipant.matchesWon++;
    }

    addLog(tournament, `🏆 ${winner.name} bat ${loser.name}`);

    logger.tournament(`Match terminé: ${winner.name} bat ${loser.name}`, {
        tournamentId: tournament.id,
        round: match.round
    });

    // Diffuser la mise à jour
    broadcastTournamentUpdate(tournament);

    // Attendre un peu puis lancer le match suivant
    setTimeout(() => launchNextMatch(tournament.id), 3000);
}

// ===== FIN DU CHAMPIONNAT =====
function finishTournament(tournamentId) {
    const tournament = tournaments.get(tournamentId);
    if (!tournament) return;

    const champion = bracket.getChampion(tournament.bracket);
    const finalRanking = bracket.getFinalRanking(tournament.bracket);

    tournament.status = 'finished';
    tournament.winner = champion;
    tournament.finalRanking = finalRanking;
    tournament.finishedAt = helpers.now();

    addLog(tournament, `🎉 Championnat terminé ! Champion: ${champion.name}`);

    logger.tournament(`🎉 Championnat ${tournamentId} terminé`, {
        champion: champion.name
    });

    // Mettre à jour les profils
    finalRanking.forEach((entry, index) => {
        const profile = profiles.getProfile(entry.id);
        if (profile) {
            profile.tournamentsPlayed = (profile.tournamentsPlayed || 0) + 1;
            if (index === 0) {
                profile.tournamentsWon = (profile.tournamentsWon || 0) + 1;
            }
            profiles.saveProfile(entry.id);
        }
    });

    // Diffuser le résultat final
    io.to(tournament.id).emit('tournament_finished', {
        tournamentId: tournament.id,
        champion: champion,
        finalRanking: finalRanking,
        tournament: serializeTournament(tournament)
    });

    // Sauvegarder l'historique
    saveTournamentHistory(tournament);
}

// ===== SÉRIALISATION =====
function serializeTournament(tournament) {
    return {
        id: tournament.id,
        hostId: tournament.hostId,
        hostName: tournament.hostName,
        hostAvatar: tournament.hostAvatar,
        playerCount: tournament.playerCount,
        settings: tournament.settings,
        status: tournament.status,
        currentRound: tournament.currentRound,
        totalRounds: tournament.totalRounds,

        participants: tournament.participants.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            elo: p.elo,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty,
            botPersonality: p.botPersonality,
            isConnected: p.isConnected,
            eliminated: p.eliminated,
            matchesWon: p.matchesWon
        })),

        bracket: tournament.bracket ? bracket.getVisualBracket(tournament.bracket) : null,
        progress: tournament.bracket ? bracket.getProgress(tournament.bracket) : null,

        matchHistory: tournament.matchHistory.slice(-20),
        log: tournament.log.slice(-30),

        winner: tournament.winner,
        finalRanking: tournament.finalRanking || null,

        createdAt: tournament.createdAt,
        startedAt: tournament.startedAt,
        finishedAt: tournament.finishedAt
    };
}

function serializeTournamentLight(tournament) {
    return {
        id: tournament.id,
        hostName: tournament.hostName,
        playerCount: tournament.playerCount,
        currentParticipants: tournament.participants.length,
        status: tournament.status,
        currentRound: tournament.currentRound,
        totalRounds: tournament.totalRounds,
        createdAt: tournament.createdAt
    };
}

// ===== BROADCAST =====
function broadcastTournamentUpdate(tournament) {
    io.to(tournament.id).emit('tournament_update', {
        tournament: serializeTournament(tournament)
    });
}

// ===== LOG =====
function addLog(tournament, message) {
    tournament.log.push({
        time: helpers.now(),
        message
    });
    if (tournament.log.length > 100) tournament.log.shift();
}

// ===== SAUVEGARDE HISTORIQUE =====
function saveTournamentHistory(tournament) {
    // Sera implémenté dans data/persistence.js
    logger.tournament(`Historique sauvegardé pour ${tournament.id}`);
}

// ===== NETTOYAGE =====
function cleanupInactiveTournaments() {
    const now = Date.now();
    const timeout = 60 * 60 * 1000; // 1 heure

    let deleted = 0;
    tournaments.forEach((tournament, id) => {
        if (tournament.status === 'lobby') {
            const createdAt = new Date(tournament.createdAt).getTime();
            if (now - createdAt > timeout) {
                tournaments.delete(id);
                deleted++;
            }
        }
    });

    if (deleted > 0) {
        logger.info(`${deleted} championnats inactifs supprimés`);
    }

    return deleted;
}

// Nettoyage périodique
setInterval(cleanupInactiveTournaments, 10 * 60 * 1000);

// ===== STATISTIQUES =====
function getStats() {
    const all = getAllTournaments();
    return {
        total: all.length,
        waiting: all.filter(t => t.status === 'lobby').length,
        playing: all.filter(t => t.status === 'playing').length,
        finished: all.filter(t => t.status === 'finished').length
    };
}

// ===== EXPORT =====
module.exports = {
    createTournament,
    getTournament,
    getAllTournaments,
    getWaitingTournaments,
    getActiveTournaments,
    addParticipant,
    addBot,
    removeParticipant,
    startTournament,
    launchNextMatch,
    launchMatch,
    handleMatchEnd,
    finishTournament,
    serializeTournament,
    serializeTournamentLight,
    broadcastTournamentUpdate,
    cleanupInactiveTournaments,
    getStats,
    tournaments
};