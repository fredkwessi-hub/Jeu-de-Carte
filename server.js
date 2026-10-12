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
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    },
    transports: ['websocket', 'polling']
});

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Route santé pour Render
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok', uptime: process.uptime() });
});

// Route racine
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== STOCKAGE =====
const games = new Map();
const playerRooms = new Map();

// ===== CRÉATION =====
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
        pendingDraw: 0,
        pendingDrawFrom: null,
        skipNext: false,
        turnCount: 0,
        createdAt: new Date().toISOString(),
        finishedPlayers: [],
        log: [],
        botTimeout: null
    };

    games.set(gameId, game);
    return game;
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

function nextPlayer(game) {
    game.currentPlayerIndex =
        (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length;
}

// ===== DÉMARRAGE =====
function startGame(gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.players.length < 2) return { error: 'Il faut au moins 2 joueurs' };

    const deck = gameLogic.createDeck();
    const distribution = gameLogic.distributeCards(deck, game.players.length, 5);

    game.players.forEach((player, i) => {
        player.hand = distribution.hands[i];
    });

    const centerResult = gameLogic.drawCenterCard(distribution.bank);

    game.bank = centerResult.newBank;
    game.centerCard = centerResult.centerCard;
    game.pile = [centerResult.centerCard];
    game.status = 'playing';
    game.currentPlayerIndex = 0;
    game.turnCount = 0;
    game.log = [];

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

        if (game.finishedPlayers.length >= game.players.length - 1) {
            const remaining = game.players.find(function(p) { return !p.rank; });
            if (remaining) {
                game.finishedPlayers.push({
                    id: remaining.id,
                    name: remaining.name,
                    rank: game.finishedPlayers.length + 1,
                    finishedAt: new Date().toISOString()
                });
                remaining.rank = game.finishedPlayers.length;
            }
            game.status = 'finished';
            addLog(game, '🎉 Partie terminée !');
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
        addLog(game, '🃏 Joker joué ! ' + game.pendingDraw + ' cartes en attente');
    } else if (effect.type === 'seven') {
        game.pendingDraw += 2;
        game.pendingDrawFrom = playerId;
        addLog(game, '7️⃣ Sept joué ! ' + game.pendingDraw + ' cartes en attente');
    } else if (effect.type === 'ace') {
        game.skipNext = true;
        addLog(game, '🅰️ As joué ! Le joueur suivant est suspendu');
    } else if (effect.type === 'jack') {
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

// ===== BOT =====
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
        pendingDraw: game.pendingDraw,
        playerCount: game.players.length
    };

    const move = aiLogic.chooseMove(bot.hand, gameState, difficulty);

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
        game.pendingDraw = totalDraw;
        game.pendingDrawFrom = bot.id;

        addLog(game, '🛡️ ' + bot.name + ' bloque et renvoie ' + game.pendingDraw + ' cartes !');

        checkPlayerFinished(game, bot);
        nextPlayer(game);
        checkNextPlayerCanBlock(game);

        broadcastGameUpdate(game);
        setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
        return;
    }

    const jackPlayed = cards.find(function(c) { return c.rank === 'J'; });
    if (jackPlayed) {
        const suit = aiLogic.chooseSuitForJack(bot.hand, difficulty);
        game.imposedSuit = suit;
        addLog(game, '🎭 ' + bot.name + ' impose ' + suit);
    } else {
        game.imposedSuit = null;
    }

    cards.forEach(function(card) {
        bot.hand = bot.hand.filter(function(c) { return c.id !== card.id; });
        game.pile.push(card);
    });

    game.centerCard = cards[cards.length - 1];
    const lastCard = cards[cards.length - 1];
    applyCardEffect(game, lastCard, bot.id);

    addLog(game, '▶️ ' + bot.name + ' joue ' + cards.map(formatCard).join(', '));

    checkPlayerFinished(game, bot);
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
        centerCard: game.centerCard,
        pileCount: game.pile.length,
        bankCount: game.bank.length,
        currentPlayerIndex: game.currentPlayerIndex,
        currentPlayerId: game.players[game.currentPlayerIndex] ? game.players[game.currentPlayerIndex].id : null,
        imposedSuit: game.imposedSuit,
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

// ===== SOCKET.IO =====
io.on('connection', function(socket) {
    console.log('🔌 Client connecté:', socket.id);

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
        if (game.status !== 'waiting') return socket.emit('error', { message: 'La partie a déjà commencé' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: "Seul l'hôte peut ajouter des bots" });
        if (game.players.length >= game.maxPlayers) return socket.emit('error', { message: 'La partie est complète' });

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
            game.pendingDraw = totalDraw;
            game.pendingDrawFrom = socket.id;

            addLog(game, '🛡️ ' + player.name + ' bloque et renvoie ' + game.pendingDraw + ' cartes !');

            checkPlayerFinished(game, player);
            nextPlayer(game);
            checkNextPlayerCanBlock(game);

            broadcastGameUpdate(game);
            setTimeout(function() { triggerBotIfNeeded(game); }, 1500);
            return;
        }

        for (let i = 0; i < cards.length; i++) {
            if (!gameLogic.canPlayCard(cards[i], game.centerCard, game.imposedSuit)) {
                return socket.emit('error', { message: formatCard(cards[i]) + ' ne peut pas être jouée' });
            }
        }

        const jackPlayed = cards.find(function(c) { return c.rank === 'J'; });
        if (jackPlayed && data.imposedSuit) {
            game.imposedSuit = data.imposedSuit;
            addLog(game, '🎭 ' + player.name + ' impose ' + data.imposedSuit);
        } else if (jackPlayed && !data.imposedSuit) {
            return socket.emit('error', { message: 'Vous devez imposer une couleur avec le J' });
        } else {
            game.imposedSuit = null;
        }

        cards.forEach(function(card) {
            player.hand = player.hand.filter(function(c) { return c.id !== card.id; });
            game.pile.push(card);
        });

        game.centerCard = cards[cards.length - 1];
        const lastCard = cards[cards.length - 1];
        applyCardEffect(game, lastCard, socket.id);

        addLog(game, '▶️ ' + player.name + ' joue ' + cards.map(formatCard).join(', '));

        checkPlayerFinished(game, player);
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

    socket.on('drawCard', function(data) {
        const game = games.get(data.gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

        const player = game.players.find(function(p) { return p.id === socket.id; });
        if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
        if (player.rank) return socket.emit('error', { message: 'Vous avez déjà terminé' });

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

    socket.on('disconnect', function() {
        console.log('🔌 Client déconnecté:', socket.id);
        const room = playerRooms.get(socket.id);
        if (room) {
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