// ===== IMPORTS =====
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

const gameLogic = require('./gameLogic');
const aiLogic = require('./aiLogic');

// ===== CONFIGURATION =====
const PORT = process.env.PORT || 3000;

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling']
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/health', function(req, res) {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

app.get('/', function(req, res) {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== STOCKAGE =====
const games = new Map();
const tournaments = new Map();
const playerRooms = new Map();

// ===== CRÉATION PARTIE SIMPLE =====
function createGame(hostId, hostName, maxPlayers) {
    const gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const game = {
        id: gameId,
        hostId: hostId,
        players: [{
            id: hostId,
            name: hostName,
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: false,
            botDifficulty: null,
            rank: null
        }],
        maxPlayers: maxPlayers || 4,
        status: 'waiting',
        bank: [],
        pile: [],
        centerCard: null,
        currentPlayerIndex: 0,
        direction: 1,
        imposedSuit: null,
        imposedColor: null,
        pendingDraw: 0,
        pendingDrawFrom: null,
        skipNext: false,
        turnCount: 0,
        createdAt: new Date().toISOString(),
        finishedPlayers: [],
        log: [],
        botTimeout: null,
        mode: 'simple'
    };

    games.set(gameId, game);
    return game;
}

// ===== CRÉATION CHAMPIONNAT =====
function createTournament(hostId, hostName, playerCount) {
    const tournamentId = 'tournament_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);

    const tournament = {
        id: tournamentId,
        hostId: hostId,
        hostName: hostName,
        playerCount: playerCount || 4,
        participants: [{
            id: hostId,
            name: hostName,
            isBot: false,
            isConnected: true,
            eliminated: false,
            matchesWon: 0
        }],
        status: 'lobby',
        currentRound: 0,
        totalRounds: playerCount === 8 ? 3 : 2,
        matches: [],
        currentMatchIndex: 0,
        createdAt: new Date().toISOString(),
        log: [],
        winner: null
    };

    tournaments.set(tournamentId, tournament);
    return tournament;
}

// ===== OUTILS =====
function formatCard(card) {
    if (!card) return '?';
    if (card.type === 'joker') return '🃏 Joker ' + card.jokerColor;
    return card.rank + card.symbol;
}

function addLog(game, message) {
    game.log.push({ time: new Date().toISOString(), message: message });
    if (game.log.length > 50) game.log.shift();
}

function addTournamentLog(tournament, message) {
    tournament.log.push({ time: new Date().toISOString(), message: message });
    if (tournament.log.length > 100) tournament.log.shift();
}

function nextPlayer(game) {
    game.currentPlayerIndex =
        (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length;
}

// ===== DÉMARRAGE PARTIE =====
function startGame(gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.players.length < 2) return { error: 'Il faut au moins 2 joueurs' };

    const deck = gameLogic.createDeck();
    const distribution = gameLogic.distributeCards(deck, game.players.length, 5);

    game.players.forEach(function(player, i) {
        player.hand = distribution.hands[i];
        player.rank = null;
    });

    const centerResult = gameLogic.drawCenterCard(distribution.bank);

    game.bank = centerResult.newBank;
    game.centerCard = centerResult.centerCard;
    game.pile = [centerResult.centerCard];
    game.status = 'playing';
    game.currentPlayerIndex = 0;
    game.turnCount = 0;
    game.log = [];
    game.imposedSuit = null;
    game.imposedColor = null;
    game.finishedPlayers = [];

    addLog(game, '🎮 La partie commence ! Carte centrale : ' + formatCard(centerResult.centerCard));

    setTimeout(function() { triggerBotIfNeeded(game); }, 1500);

    return { success: true, game: game };
}

// ===== FIN DE PARTIE JOUEUR =====
function checkPlayerFinished(game, player) {
    if (player.hand.length === 0 && !game.finishedPlayers.find(function(p) { return p.id === player.id; })) {
        game.finishedPlayers.push({
            id: player.id,
            name: player.name,
            rank: game.finishedPlayers.length + 1,
            finishedAt: new Date().toISOString()
        });
        player.rank = game.finishedPlayers.length;
        addLog(game, '🏆 ' + player.name + ' termine à la position ' + player.rank + ' !');

        // On arrête dès qu'on connaît le gagnant ET le dernier
        const remainingPlayers = game.players.filter(function(p) { return !p.rank; });

        if (remainingPlayers.length === 1) {
            const last = remainingPlayers[0];
            game.finishedPlayers.push({
                id: last.id,
                name: last.name,
                rank: game.finishedPlayers.length + 1,
                finishedAt: new Date().toISOString()
            });
            last.rank = game.finishedPlayers.length;
            addLog(game, '💀 ' + last.name + ' est le dernier !');

            game.status = 'finished';
            addLog(game, '🎉 Partie terminée ! Classement complet établi.');

            broadcastGameUpdate(game);
            setTimeout(function() {
                broadcastGameOver(game);
            }, 500);
        }

        return true;
    }
    return false;
}

// ===== EFFETS =====
function applyCardEffect(game, card, playerId) {
    const effect = gameLogic.getCardEffect(card);

    if (effect.type === 'joker') {
        game.pendingDraw += 4;
        game.pendingDrawFrom = playerId;
        game.imposedColor = card.color;
        game.imposedSuit = null;
        addLog(game, '🃏 Joker ' + card.jokerColor + ' joué ! +4 cartes et couleur imposée : ' + (card.color === 'red' ? '🔴 Rouge' : '⚫ Noir'));
    } else if (effect.type === 'seven') {
        game.pendingDraw += 2;
        game.pendingDrawFrom = playerId;
        addLog(game, '7️⃣ Sept joué ! +2 cartes en attente');
    } else if (effect.type === 'ace') {
        game.skipNext = true;
        addLog(game, '🅰️ As joué ! Le joueur suivant est suspendu');
    } else if (effect.type === 'jack') {
        // Le J est géré en amont (imposedSuit défini avant)
        addLog(game, '🎭 J commande joué !');
    }

    return effect;
}

// ===== PIOCHE AUTO =====
function autoDraw(game, player, count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
        if (game.bank.length === 0) {
            const reshuffle = gameLogic.reshuffleBank(game.pile);
            if (reshuffle.newBank.length === 0) break;
            game.bank = reshuffle.newBank;
            game.pile = reshuffle.newPile;
            game.centerCard = reshuffle.newPile[reshuffle.newPile.length - 1];
            addLog(game, '🔄 Banque reconstituée (' + reshuffle.newBank.length + ' cartes)');
        }
        if (game.bank.length > 0) {
            drawn.push(game.bank.pop());
        }
    }
    player.hand.push.apply(player.hand, drawn);
    return drawn;
}

// ===== BLOCAGE AUTO =====
function checkNextPlayerCanBlock(game) {
    if (game.pendingDraw === 0) return;

    const nextP = game.players[game.currentPlayerIndex];
    const canBlock = gameLogic.canBlockAttack(nextP.hand);

    if (!canBlock) {
        const drawn = autoDraw(game, nextP, game.pendingDraw);
        addLog(game, '💥 ' + nextP.name + ' pioche ' + drawn.length + ' cartes !');
        game.pendingDraw = 0;
        game.pendingDrawFrom = null;
        nextPlayer(game);
    }
}

// ===== TOUR DU BOT =====
function playBotTurn(game) {
    const bot = game.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    if (bot.rank) {
        nextPlayer(game);
        broadcastGameUpdate(game);
        setTimeout(function() { triggerBotIfNeeded(game); }, 1000);
        return;
    }

    const difficulty = bot.botDifficulty || 'medium';

    const gameState = {
        centerCard: game.centerCard,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw,
        playerCount: game.players.length
    };

    const move = aiLogic.chooseMove(bot.hand, gameState, difficulty);

    // ==== CAS PIOCHE ====
    if (move.action === 'draw') {
        const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
        const drawn = autoDraw(game, bot, drawCount);

        if (game.pendingDraw > 0) {
            addLog(game, '💥 ' + bot.name + ' pioche ' + drawn.length + ' cartes (attaque)');
            game.pendingDraw = 0;
            game.pendingDrawFrom = null;
        } else {
            addLog(game, '📥 ' + bot.name + ' pioche 1 carte');
        }

        nextPlayer(game);
        broadcastGameUpdate(game);
        setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
        return;
    }

    const cards = move.cards;
    if (!cards || cards.length === 0) return;

    // ==== CAS BLOCAGE ====
    if (game.pendingDraw > 0) {
        let totalDraw = game.pendingDraw;
        cards.forEach(function(card) {
            const effect = gameLogic.getCardEffect(card);
            totalDraw += effect.drawCount;
        });

        cards.forEach(function(card) {
            bot.hand = bot.hand.filter(function(c) { return c.id !== card.id; });
            game.pile.push(card);
        });

        game.centerCard = cards[cards.length - 1];

        const lastBlocker = cards[cards.length - 1];
        if (lastBlocker.type === 'joker') {
            game.imposedColor = lastBlocker.color;
            game.imposedSuit = null;
        }

        game.pendingDraw = totalDraw;
        game.pendingDrawFrom = bot.id;

        addLog(game, '🛡️ ' + bot.name + ' bloque et renvoie ' + game.pendingDraw + ' cartes !');

        checkPlayerFinished(game, bot);
        if (game.status === 'finished') { broadcastGameUpdate(game); return; }

        nextPlayer(game);
        checkNextPlayerCanBlock(game);

        broadcastGameUpdate(game);
        setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
        return;
    }

    // ==== CAS NORMAL ====
    const jackPlayed = cards.find(function(c) { return c.rank === 'J'; });
    const jokerPlayed = cards.find(function(c) { return c.type === 'joker'; });
    const sevenPlayed = cards.find(function(c) { return c.rank === '7'; });
    const acePlayed = cards.find(function(c) { return c.rank === 'A'; });

    // Gestion de la couleur imposée
    if (jackPlayed) {
        // Priorité à la couleur choisie par l'IA (stratégie)
        const suit = move.imposedSuit || aiLogic.chooseSuitForJack(bot.hand, difficulty);
        game.imposedSuit = suit;
        game.imposedColor = null;
        addLog(game, '🎭 ' + bot.name + ' impose ' + suit + ' (stratégie)');
    } else if (jokerPlayed) {
        game.imposedColor = jokerPlayed.color;
        game.imposedSuit = null;
        addLog(game, '🃏 ' + bot.name + ' joue un Joker ' + jokerPlayed.jokerColor);
    } else {
        game.imposedSuit = null;
        game.imposedColor = null;
    }

    cards.forEach(function(card) {
        bot.hand = bot.hand.filter(function(c) { return c.id !== card.id; });
        game.pile.push(card);
    });

    game.centerCard = cards[cards.length - 1];
    const lastCard = cards[cards.length - 1];
    applyCardEffect(game, lastCard, bot.id);

    addLog(game, '▶️ ' + bot.name + ' joue ' + cards.map(formatCard).join(', '));

    // Émettre un événement d'animation pour les humains connectés
    let animationType = null;
    if (jokerPlayed) animationType = 'joker';
    else if (sevenPlayed) animationType = 'seven';
    else if (acePlayed) animationType = 'ace';
    else if (jackPlayed) animationType = 'jack';

    if (animationType) {
        game.players.forEach(function(p) {
            if (!p.isBot) {
                io.to(p.id).emit('cardAnimation', {
                    type: animationType,
                    color: jokerPlayed ? jokerPlayed.color : (sevenPlayed ? sevenPlayed.color : null),
                    playerName: bot.name
                });
            }
        });
    }

    checkPlayerFinished(game, bot);
    if (game.status === 'finished') { broadcastGameUpdate(game); return; }

    nextPlayer(game);

    if (game.skipNext) {
        const skipped = game.players[game.currentPlayerIndex];
        addLog(game, '⏭️ ' + skipped.name + ' est suspendu');
        game.skipNext = false;
        nextPlayer(game);
    }

    checkNextPlayerCanBlock(game);

    broadcastGameUpdate(game);
    setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
}

function triggerBotIfNeeded(game) {
    if (game.status !== 'playing') return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return;

    if (currentPlayer.isBot) {
        if (game.botTimeout) clearTimeout(game.botTimeout);
        game.botTimeout = setTimeout(function() { playBotTurn(game); }, 1000);
    }
}

// ===== SÉRIALISATION =====
function serializeGame(game, playerId) {
    return {
        id: game.id,
        status: game.status,
        maxPlayers: game.maxPlayers,
        hostId: game.hostId,
        mode: game.mode || 'simple',
        centerCard: game.centerCard,
        pileCount: game.pile.length,
        bankCount: game.bank.length,
        currentPlayerIndex: game.currentPlayerIndex,
        currentPlayerId: game.players[game.currentPlayerIndex] ? game.players[game.currentPlayerIndex].id : null,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw,
        skipNext: game.skipNext,
        turnCount: game.turnCount,
        players: game.players.map(function(p) {
            return {
                id: p.id,
                name: p.name,
                cardCount: p.hand.length,
                isActive: p.isActive,
                isConnected: p.isConnected,
                isBot: p.isBot,
                botDifficulty: p.botDifficulty,
                rank: p.rank,
                isCurrent: game.players[game.currentPlayerIndex] && game.players[game.currentPlayerIndex].id === p.id,
                hand: p.id === playerId ? p.hand : undefined
            };
        }),
        finishedPlayers: game.finishedPlayers,
        log: game.log.slice(-20),
        lastPileCards: game.pile.slice(-5)
    };
}

function broadcastGameUpdate(game) {
    game.players.forEach(function(player) {
        if (!player.isBot) {
            io.to(player.id).emit('gameUpdate', {
                game: serializeGame(game, player.id)
            });
        }
    });
}

function broadcastGameOver(game) {
    game.players.forEach(function(player) {
        if (!player.isBot) {
            io.to(player.id).emit('gameOver', {
                game: serializeGame(game, player.id),
                finalRanking: game.finishedPlayers
            });
        }
    });
}

// ===== SÉRIALISATION CHAMPIONNAT =====
function serializeTournament(tournament) {
    return {
        id: tournament.id,
        hostId: tournament.hostId,
        hostName: tournament.hostName,
        playerCount: tournament.playerCount,
        participants: tournament.participants,
        status: tournament.status,
        currentRound: tournament.currentRound,
        totalRounds: tournament.totalRounds,
        matches: tournament.matches.map(function(m) {
            return {
                id: m.id,
                round: m.round,
                player1: m.player1 ? { id: m.player1.id, name: m.player1.name, isBot: m.player1.isBot } : null,
                player2: m.player2 ? { id: m.player2.id, name: m.player2.name, isBot: m.player2.isBot } : null,
                winner: m.winner ? { id: m.winner.id, name: m.winner.name } : null,
                loser: m.loser ? { id: m.loser.id, name: m.loser.name } : null,
                status: m.status
            };
        }),
        currentMatchIndex: tournament.currentMatchIndex,
        log: tournament.log.slice(-30),
        winner: tournament.winner || null
    };
}

// ===== CHAMPIONNAT : GÉNÉRATION DES MATCHS =====
function generateMatches(tournament) {
    const participants = tournament.participants.slice();

    // Mélanger
    for (let i = participants.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = participants[i]; participants[i] = participants[j]; participants[j] = tmp;
    }

    const matches = [];
    for (let i = 0; i < participants.length; i += 2) {
        matches.push({
            id: 'match_' + Date.now() + '_' + i,
            round: tournament.currentRound,
            player1: participants[i],
            player2: participants[i + 1] || null,
            winner: null,
            loser: null,
            gameId: null,
            status: 'pending'
        });
    }

    tournament.matches = matches;
    tournament.currentMatchIndex = 0;
}

// ===== CHAMPIONNAT : LANCER UN MATCH =====
function launchMatch(tournament, index) {
    if (index >= tournament.matches.length) {
        endTournamentRound(tournament);
        return;
    }

    const match = tournament.matches[index];
    match.status = 'playing';

    const gameId = 'game_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    const game = {
        id: gameId,
        hostId: match.player1.id,
        players: [
            {
                id: match.player1.id,
                name: match.player1.name,
                hand: [],
                isActive: true,
                isConnected: true,
                isBot: match.player1.isBot,
                botDifficulty: match.player1.botDifficulty || 'medium',
                rank: null
            },
            {
                id: match.player2.id,
                name: match.player2.name,
                hand: [],
                isActive: true,
                isConnected: true,
                isBot: match.player2.isBot,
                botDifficulty: match.player2.botDifficulty || 'medium',
                rank: null
            }
        ],
        maxPlayers: 2,
        status: 'playing',
        bank: [],
        pile: [],
        centerCard: null,
        currentPlayerIndex: 0,
        direction: 1,
        imposedSuit: null,
        imposedColor: null,
        pendingDraw: 0,
        pendingDrawFrom: null,
        skipNext: false,
        turnCount: 0,
        finishedPlayers: [],
        log: [],
        botTimeout: null,
        mode: 'tournament',
        tournamentId: tournament.id,
        matchId: match.id
    };

    games.set(gameId, game);
    match.gameId = gameId;

    // Démarrer immédiatement
    startGame(gameId);

    // Notifier les joueurs humains
    game.players.forEach(function(p) {
        if (!p.isBot) {
            io.to(p.id).emit('gameStarted', {
                game: serializeGame(game, p.id),
                tournament: serializeTournament(tournament),
                matchInfo: {
                    round: tournament.currentRound,
                    matchIndex: index,
                    totalMatches: tournament.matches.length
                }
            });
        }
    });

    // Écouter la fin
    const checkInterval = setInterval(function() {
        const g = games.get(gameId);
        if (!g || g.status === 'finished') {
            clearInterval(checkInterval);
            if (g && g.status === 'finished') {
                handleMatchEnd(tournament, match, g);
            }
        }
    }, 1000);
}

// ===== CHAMPIONNAT : FIN DE MATCH =====
function handleMatchEnd(tournament, match, game) {
    if (match.status === 'finished') return;
    match.status = 'finished';

    const winner = game.finishedPlayers[0];
    const loser = game.finishedPlayers[game.finishedPlayers.length - 1];

    match.winner = winner;
    match.loser = loser;

    addTournamentLog(tournament,
        '🏆 ' + winner.name + ' bat ' + loser.name + ' (Tour ' + tournament.currentRound + ')');

    // Marquer le perdant comme éliminé
    const loserP = tournament.participants.find(function(p) { return p.id === loser.id; });
    if (loserP) loserP.eliminated = true;

    io.to(tournament.id).emit('matchEnded', {
        tournament: serializeTournament(tournament),
        match: {
            id: match.id,
            round: match.round,
            winner: winner,
            loser: loser
        }
    });

    // Passer au match suivant
    tournament.currentMatchIndex++;
    setTimeout(function() {
        launchMatch(tournament, tournament.currentMatchIndex);
    }, 3000);
}

// ===== CHAMPIONNAT : FIN DE TOUR =====
function endTournamentRound(tournament) {
    const survivors = tournament.participants.filter(function(p) { return !p.eliminated; });

    addTournamentLog(tournament,
        '✅ Fin du tour ' + tournament.currentRound + ' — ' + survivors.length + ' survivants');

    // Si un seul survivant → champion
    if (survivors.length === 1) {
        tournament.status = 'finished';
        tournament.winner = survivors[0];

        io.to(tournament.id).emit('tournamentFinished', {
            tournament: serializeTournament(tournament),
            champion: survivors[0],
            finalRanking: tournament.participants
        });

        console.log('🏆 Champion du tournoi : ' + survivors[0].name);
        return;
    }

    // Sinon, tour suivant
    tournament.currentRound++;
    tournament.participants = survivors;
    tournament.currentMatchIndex = 0;

    generateMatches(tournament);

    io.to(tournament.id).emit('tournamentUpdate', {
        tournament: serializeTournament(tournament)
    });

    setTimeout(function() {
        launchMatch(tournament, 0);
    }, 3000);
}

// ===== SOCKET.IO =====
io.on('connection', function(socket) {
    console.log('🔌 Client connecté:', socket.id);

    // ========== PARTIE SIMPLE ==========
    socket.on('createGame', function(data) {
        const game = createGame(socket.id, data.playerName, data.maxPlayers);
        socket.join(game.id);
        playerRooms.set(socket.id, { gameId: game.id, playerId: socket.id });

        socket.emit('gameCreated', {
            gameId: game.id,
            playerId: socket.id,
            game: serializeGame(game, socket.id)
        });

        console.log('🎮 Partie créée: ' + game.id);
    });

    socket.on('joinGame', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'waiting') return socket.emit('error', { message: 'La partie a déjà commencé' });
        if (game.players.length >= game.maxPlayers) return socket.emit('error', { message: 'La partie est complète' });

        const newPlayer = {
            id: socket.id,
            name: data.playerName,
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: false,
            rank: null
        };

        game.players.push(newPlayer);
        socket.join(data.gameId);
        playerRooms.set(socket.id, { gameId: data.gameId, playerId: socket.id });

        io.to(data.gameId).emit('playerJoined', {
            player: { id: newPlayer.id, name: newPlayer.name },
            players: game.players.map(function(p) { return { id: p.id, name: p.name }; }),
            game: serializeGame(game, null)
        });

        socket.emit('gameJoined', {
            gameId: data.gameId,
            playerId: socket.id,
            game: serializeGame(game, socket.id)
        });
    });

    socket.on('addBot', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'waiting') return socket.emit('error', { message: 'Déjà commencé' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: "Seul l'hôte peut ajouter des bots" });
        if (game.players.length >= game.maxPlayers) return socket.emit('error', { message: 'Complet' });

        const existingNames = game.players.map(function(p) { return p.name; });
        const botName = aiLogic.getRandomBotName(existingNames);
        const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

        const bot = {
            id: botId,
            name: botName,
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: true,
            botDifficulty: data.difficulty || 'medium',
            rank: null
        };

        game.players.push(bot);

        io.to(data.gameId).emit('playerJoined', {
            player: { id: bot.id, name: bot.name, isBot: true },
            players: game.players.map(function(p) { return { id: p.id, name: p.name, isBot: p.isBot }; }),
            game: serializeGame(game, null)
        });
    });

    socket.on('removeBot', function(data) {
        const game = games.get(data.gameId);
        if (!game) return;
        if (game.hostId !== socket.id) return;
        if (game.status !== 'waiting') return;

        game.players = game.players.filter(function(p) { return p.id !== data.botId; });

        io.to(data.gameId).emit('playerLeft', {
            playerId: data.botId,
            players: game.players.map(function(p) { return { id: p.id, name: p.name, isBot: p.isBot }; })
        });
    });

    socket.on('startGame', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: "Seul l'hôte peut démarrer" });

        const result = startGame(data.gameId);
        if (result.error) return socket.emit('error', { message: result.error });

        game.players.forEach(function(player) {
            if (!player.isBot) {
                io.to(player.id).emit('gameStarted', {
                    game: serializeGame(game, player.id)
                });
            }
        });
    });

    // ========== JOUER DES CARTES ==========
    socket.on('playCards', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

        const player = game.players.find(function(p) { return p.id === socket.id; });
        if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
        if (player.rank) return socket.emit('error', { message: 'Vous avez déjà terminé' });

        const currentPlayer = game.players[game.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return socket.emit('error', { message: "Ce n'est pas votre tour" });

        const cards = data.cardIds.map(function(id) {
            return player.hand.find(function(c) { return c.id === id; });
        }).filter(Boolean);

        if (cards.length === 0) return socket.emit('error', { message: 'Cartes invalides' });

        if (cards.length > 1) {
            const firstRank = cards[0].rank;
            if (!cards.every(function(c) { return c.rank === firstRank; })) {
                return socket.emit('error', { message: 'Les cartes doivent avoir le même numéro' });
            }
        }

        // Cas blocage
        if (game.pendingDraw > 0) {
            const canBlock = cards.every(function(c) { return c.type === 'joker' || c.rank === '7'; });
            if (!canBlock) {
                return socket.emit('error', {
                    message: 'Bloquez avec un 7 ou Joker, ou piochez ' + game.pendingDraw + ' cartes'
                });
            }

            let totalDraw = game.pendingDraw;
            cards.forEach(function(card) {
                const effect = gameLogic.getCardEffect(card);
                totalDraw += effect.drawCount;
            });

            cards.forEach(function(card) {
                player.hand = player.hand.filter(function(c) { return c.id !== card.id; });
                game.pile.push(card);
            });

            game.centerCard = cards[cards.length - 1];

            const lastBlocker = cards[cards.length - 1];
            if (lastBlocker.type === 'joker') {
                game.imposedColor = lastBlocker.color;
                game.imposedSuit = null;
                addLog(game, '🃏 ' + player.name + ' bloque avec un Joker ' + lastBlocker.jokerColor + ' — Couleur imposée : ' + (lastBlocker.color === 'red' ? '🔴 Rouge' : '⚫ Noir'));
            }

            game.pendingDraw = totalDraw;
            game.pendingDrawFrom = socket.id;

            addLog(game, '🛡️ ' + player.name + ' bloque et renvoie ' + game.pendingDraw + ' cartes !');

            // Animation
            let animType = lastBlocker.type === 'joker' ? 'joker' : 'seven';
            io.to(game.id).emit('cardAnimation', {
                type: animType,
                color: lastBlocker.color,
                playerName: player.name
            });

            checkPlayerFinished(game, player);
            if (game.status === 'finished') { broadcastGameUpdate(game); return; }

            nextPlayer(game);
            checkNextPlayerCanBlock(game);

            broadcastGameUpdate(game);
            setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
            return;
        }

        // Cas normal
        for (let i = 0; i < cards.length; i++) {
            if (!gameLogic.canPlayCard(cards[i], game.centerCard, game.imposedSuit, game.imposedColor)) {
                let reason = formatCard(cards[i]) + ' ne peut pas être jouée';
                if (game.imposedColor) {
                    reason += ' (couleur imposée : ' + (game.imposedColor === 'red' ? '🔴 Rouge' : '⚫ Noir') + ')';
                } else if (game.imposedSuit) {
                    reason += ' (couleur imposée : ' + game.imposedSuit + ')';
                } else if (game.centerCard && game.centerCard.type === 'joker') {
                    reason += ' (le centre est un Joker ' + game.centerCard.jokerColor + ')';
                }
                return socket.emit('error', { message: reason });
            }
        }

        const jackPlayed = cards.find(function(c) { return c.rank === 'J'; });
        const jokerPlayed = cards.find(function(c) { return c.type === 'joker'; });
        const sevenPlayed = cards.find(function(c) { return c.rank === '7'; });
        const acePlayed = cards.find(function(c) { return c.rank === 'A'; });

        if (jackPlayed && data.imposedSuit) {
            game.imposedSuit = data.imposedSuit;
            game.imposedColor = null;
            addLog(game, '🎭 ' + player.name + ' impose ' + data.imposedSuit);
        } else if (jackPlayed && !data.imposedSuit) {
            return socket.emit('error', { message: 'Vous devez imposer une couleur avec le J' });
        } else if (jokerPlayed) {
            game.imposedColor = jokerPlayed.color;
            game.imposedSuit = null;
            addLog(game, '🃏 ' + player.name + ' joue un Joker ' + jokerPlayed.jokerColor + ' — Couleur imposée : ' + (jokerPlayed.color === 'red' ? '🔴 Rouge' : '⚫ Noir'));
        } else {
            game.imposedSuit = null;
            game.imposedColor = null;
        }

        cards.forEach(function(card) {
            player.hand = player.hand.filter(function(c) { return c.id !== card.id; });
            game.pile.push(card);
        });

        game.centerCard = cards[cards.length - 1];
        const lastCard = cards[cards.length - 1];
        applyCardEffect(game, lastCard, socket.id);

        addLog(game, '▶️ ' + player.name + ' joue ' + cards.map(formatCard).join(', '));

        // Animation
        let animationType = null;
        if (jokerPlayed) animationType = 'joker';
        else if (sevenPlayed) animationType = 'seven';
        else if (acePlayed) animationType = 'ace';
        else if (jackPlayed) animationType = 'jack';

        if (animationType) {
            io.to(game.id).emit('cardAnimation', {
                type: animationType,
                color: jokerPlayed ? jokerPlayed.color : (sevenPlayed ? sevenPlayed.color : null),
                playerName: player.name
            });
        }

        checkPlayerFinished(game, player);
        if (game.status === 'finished') { broadcastGameUpdate(game); return; }

        nextPlayer(game);

        if (game.skipNext) {
            addLog(game, '⏭️ ' + game.players[game.currentPlayerIndex].name + ' est suspendu');
            game.skipNext = false;
            nextPlayer(game);
        }

        checkNextPlayerCanBlock(game);

        broadcastGameUpdate(game);
        setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
    });

    // ========== PIOCHER ==========
    socket.on('drawCard', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

        const player = game.players.find(function(p) { return p.id === socket.id; });
        if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
        if (player.rank) return socket.emit('error', { message: 'Déjà terminé' });

        const currentPlayer = game.players[game.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return socket.emit('error', { message: "Ce n'est pas votre tour" });

        const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
        const drawn = autoDraw(game, player, drawCount);

        if (game.pendingDraw > 0) {
            addLog(game, '💥 ' + player.name + ' pioche ' + drawn.length + ' cartes (attaque)');
            game.pendingDraw = 0;
            game.pendingDrawFrom = null;
        } else {
            addLog(game, '📥 ' + player.name + ' pioche 1 carte');
        }

        nextPlayer(game);
        broadcastGameUpdate(game);

        socket.emit('cardsDrawn', { cards: drawn });
        setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
    });

    // ========== QUITTER PARTIE ==========
    socket.on('leaveGame', function(data) {
        const game = games.get(data.gameId);
        if (!game) return;

        game.players = game.players.filter(function(p) { return p.id !== socket.id; });
        socket.leave(data.gameId);
        playerRooms.delete(socket.id);

        if (game.players.length === 0) {
            games.delete(data.gameId);
        } else {
            io.to(data.gameId).emit('playerLeft', {
                playerId: socket.id,
                players: game.players.map(function(p) { return { id: p.id, name: p.name, isBot: p.isBot }; })
            });
        }
    });

    // ========== CHAMPIONNAT ==========
    socket.on('createTournament', function(data) {
        const tournament = createTournament(socket.id, data.playerName, data.playerCount);
        socket.join(tournament.id);
        playerRooms.set(socket.id, { tournamentId: tournament.id, playerId: socket.id });

        socket.emit('tournamentCreated', {
            tournamentId: tournament.id,
            playerId: socket.id,
            tournament: serializeTournament(tournament)
        });

        console.log('🏆 Championnat créé: ' + tournament.id);
    });

    socket.on('joinTournament', function(data) {
        const tournament = tournaments.get(data.tournamentId);
        if (!tournament) return socket.emit('error', { message: 'Championnat introuvable' });
        if (tournament.status !== 'lobby') return socket.emit('error', { message: 'Le championnat a déjà commencé' });
        if (tournament.participants.length >= tournament.playerCount) return socket.emit('error', { message: 'Championnat complet' });

        tournament.participants.push({
            id: socket.id,
            name: data.playerName,
            isBot: false,
            isConnected: true,
            eliminated: false,
            matchesWon: 0
        });

        socket.join(tournament.id);
        playerRooms.set(socket.id, { tournamentId: tournament.id, playerId: socket.id });

        io.to(tournament.id).emit('tournamentUpdate', {
            tournament: serializeTournament(tournament)
        });

        socket.emit('tournamentJoined', {
            tournamentId: tournament.id,
            playerId: socket.id,
            tournament: serializeTournament(tournament)
        });
    });

    socket.on('addTournamentBot', function(data) {
        const tournament = tournaments.get(data.tournamentId);
        if (!tournament) return socket.emit('error', { message: 'Championnat introuvable' });
        if (tournament.status !== 'lobby') return socket.emit('error', { message: 'Déjà commencé' });
        if (tournament.hostId !== socket.id) return socket.emit('error', { message: "Seul l'hôte peut ajouter des bots" });
        if (tournament.participants.length >= tournament.playerCount) return socket.emit('error', { message: 'Complet' });

        const existingNames = tournament.participants.map(function(p) { return p.name; });
        const botName = aiLogic.getRandomBotName(existingNames);
        const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

        tournament.participants.push({
            id: botId,
            name: botName,
            isBot: true,
            botDifficulty: data.difficulty || 'medium',
            isConnected: true,
            eliminated: false,
            matchesWon: 0
        });

        io.to(tournament.id).emit('tournamentUpdate', {
            tournament: serializeTournament(tournament)
        });
    });

    socket.on('startTournament', function(data) {
        const tournament = tournaments.get(data.tournamentId);
        if (!tournament) return socket.emit('error', { message: 'Championnat introuvable' });
        if (tournament.hostId !== socket.id) return socket.emit('error', { message: "Seul l'hôte peut démarrer" });
        if (tournament.participants.length !== tournament.playerCount) {
            return socket.emit('error', { message: 'Il faut ' + tournament.playerCount + ' participants' });
        }

        generateMatches(tournament);

        tournament.status = 'playing';
        tournament.currentRound = 1;

        addTournamentLog(tournament, '🏆 Le championnat commence ! Tour 1');

        launchMatch(tournament, 0);

        io.to(tournament.id).emit('tournamentUpdate', {
            tournament: serializeTournament(tournament)
        });
    });

    socket.on('leaveTournament', function(data) {
        const tournament = tournaments.get(data.tournamentId);
        if (!tournament) return;

        tournament.participants = tournament.participants.filter(function(p) { return p.id !== socket.id; });
        socket.leave(data.tournamentId);
        playerRooms.delete(socket.id);

        if (tournament.participants.length === 0) {
            tournaments.delete(data.tournamentId);
        } else {
            io.to(data.tournamentId).emit('tournamentUpdate', {
                tournament: serializeTournament(tournament)
            });
        }
    });

    // ========== DÉCONNEXION ==========
    socket.on('disconnect', function() {
        console.log('🔌 Client déconnecté:', socket.id);
        const room = playerRooms.get(socket.id);
        if (room) {
            if (room.gameId) {
                const game = games.get(room.gameId);
                if (game) {
                    const player = game.players.find(function(p) { return p.id === socket.id; });
                    if (player) {
                        player.isConnected = false;
                        io.to(room.gameId).emit('playerDisconnected', {
                            playerId: socket.id,
                            playerName: player.name
                        });
                    }
                }
            }
            if (room.tournamentId) {
                const tournament = tournaments.get(room.tournamentId);
                if (tournament) {
                    const p = tournament.participants.find(function(x) { return x.id === socket.id; });
                    if (p) {
                        p.isConnected = false;
                        io.to(room.tournamentId).emit('tournamentUpdate', {
                            tournament: serializeTournament(tournament)
                        });
                    }
                }
            }
            playerRooms.delete(socket.id);
        }
    });
});

// ===== LANCEMENT =====
server.listen(PORT, '0.0.0.0', function() {
    console.log('🚀 Serveur démarré sur le port ' + PORT);
    console.log('🌍 Environnement : ' + (process.env.NODE_ENV || 'development'));
});

process.on('uncaughtException', function(err) {
    console.error('❌ Exception non capturée:', err);
});

process.on('unhandledRejection', function(reason) {
    console.error('❌ Rejet non géré:', reason);
});