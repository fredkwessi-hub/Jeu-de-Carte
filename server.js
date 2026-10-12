const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const gameLogic = require('./gameLogic');
const aiLogic = require('./aiLogic');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// ===== STOCKAGE =====
const games = new Map();
const playerRooms = new Map();

// ===== CRÉATION D'UNE PARTIE =====
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

// ===== DÉMARRER UNE PARTIE =====
function startGame(gameId) {
    const game = games.get(gameId);
    if (!game) return { error: 'Partie introuvable' };
    if (game.players.length < 2) return { error: 'Il faut au moins 2 joueurs' };

    const deck = gameLogic.createDeck();
    const { hands, bank } = gameLogic.distributeCards(deck, game.players.length, 5);

    game.players.forEach((player, i) => {
        player.hand = hands[i];
    });

    const { centerCard, newBank } = gameLogic.drawCenterCard(bank);

    game.bank = newBank;
    game.centerCard = centerCard;
    game.pile = [centerCard];
    game.status = 'playing';
    game.currentPlayerIndex = 0;
    game.turnCount = 0;
    game.log = [];

    addLog(game, `🎮 La partie commence ! Carte centrale : ${formatCard(centerCard)}`);

    // Si le premier joueur est un bot, le faire jouer
    setTimeout(() => triggerBotIfNeeded(game), 1500);

    return { success: true, game };
}

function formatCard(card) {
    if (!card) return '?';
    if (card.type === 'joker') return `🃏 Joker ${card.jokerColor}`;
    return `${card.rank}${card.symbol}`;
}

function addLog(game, message) {
    game.log.push({
        time: new Date().toISOString(),
        message
    });
    if (game.log.length > 50) game.log.shift();
}

// ===== PASSER AU JOUEUR SUIVANT =====
function nextPlayer(game) {
    game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + game.players.length) % game.players.length;
}

// ===== FIN DE PARTIE POUR UN JOUEUR =====
function checkPlayerFinished(game, player) {
    if (player.hand.length === 0 && !game.finishedPlayers.find(p => p.id === player.id)) {
        game.finishedPlayers.push({
            id: player.id,
            name: player.name,
            rank: game.finishedPlayers.length + 1,
            finishedAt: new Date().toISOString()
        });
        player.rank = game.finishedPlayers.length;
        addLog(game, `🏆 ${player.name} termine à la position ${player.rank} !`);

        if (game.finishedPlayers.length >= game.players.length - 1) {
            const remaining = game.players.find(p => !p.rank);
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
            addLog(game, `🎉 Partie terminée !`);

            // Sauvegarder l'historique
            const history = readHistory();
            history.push({
                gameId: game.id,
                players: game.finishedPlayers,
                finishedAt: new Date().toISOString()
            });
            saveHistory(history);
        }
        return true;
    }
    return false;
}

// ===== APPLIQUER EFFET D'UNE CARTE =====
function applyCardEffect(game, card, playerId) {
    const effect = gameLogic.getCardEffect(card);

    if (effect.type === 'joker') {
        game.pendingDraw += 4;
        game.pendingDrawFrom = playerId;
        addLog(game, `🃏 Joker joué ! ${game.pendingDraw} cartes en attente`);
    } else if (effect.type === 'seven') {
        game.pendingDraw += 2;
        game.pendingDrawFrom = playerId;
        addLog(game, `7️⃣ Sept joué ! ${game.pendingDraw} cartes en attente`);
    } else if (effect.type === 'ace') {
        game.skipNext = true;
        addLog(game, `🅰️ As joué ! Le joueur suivant est suspendu`);
    } else if (effect.type === 'jack') {
        addLog(game, `🎭 J commande joué !`);
    }

    return effect;
}

// ===== PIOCHE AUTOMATIQUE (POUR ATTAQUE) =====
function autoDraw(game, player, count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
        if (game.bank.length === 0) {
            const { newBank, newPile } = gameLogic.reshuffleBank(game.pile);
            if (newBank.length === 0) break;
            game.bank = newBank;
            game.pile = newPile;
            game.centerCard = newPile[newPile.length - 1];
            addLog(game, `🔄 Banque reconstituée (${newBank.length} cartes)`);
        }
        if (game.bank.length > 0) {
            drawn.push(game.bank.pop());
        }
    }
    player.hand.push(...drawn);
    return drawn;
}

// ===== VÉRIFIER SI LE JOUEUR SUIVANT PEUT BLOQUER =====
function checkNextPlayerCanBlock(game) {
    if (game.pendingDraw === 0) return;

    const nextPlayer = game.players[game.currentPlayerIndex];
    const canBlock = gameLogic.canBlockAttack(nextPlayer.hand);

    if (!canBlock) {
        // Le joueur pioche automatiquement
        const drawn = autoDraw(game, nextPlayer, game.pendingDraw);
        addLog(game, `💥 ${nextPlayer.name} pioche ${drawn.length} cartes !`);
        game.pendingDraw = 0;
        game.pendingDrawFrom = null;
        nextPlayer(game);
    }
}

// ===== IA DU BOT =====
function playBotTurn(game) {
    const bot = game.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;
    if (bot.rank) {
        // Le bot a déjà fini, passer au suivant
        nextPlayer(game);
        broadcastGameUpdate(game);
        setTimeout(() => triggerBotIfNeeded(game), 1000);
        return;
    }

    const difficulty = bot.botDifficulty || aiLogic.DIFFICULTY.MEDIUM;

    // Demander à l'IA de choisir un coup
    const gameState = {
        centerCard: game.centerCard,
        imposedSuit: game.imposedSuit,
        pendingDraw: game.pendingDraw,
        playerCount: game.players.length
    };

    const move = aiLogic.chooseMove(bot.hand, gameState, difficulty);

    if (move.action === 'draw') {
        // Le bot pioche
        const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
        const drawn = autoDraw(game, bot, drawCount);

        if (game.pendingDraw > 0) {
            addLog(game, `💥 ${bot.name} pioche ${drawn.length} cartes (attaque)`);
            game.pendingDraw = 0;
            game.pendingDrawFrom = null;
        } else {
            addLog(game, `📥 ${bot.name} pioche 1 carte`);
        }

        nextPlayer(game);
        broadcastGameUpdate(game);
        setTimeout(() => triggerBotIfNeeded(game), 1500);
        return;
    }

    // Le bot joue des cartes
    const cards = move.cards;
    if (!cards || cards.length === 0) return;

    // Vérifier que le bot peut bloquer ou jouer
    if (game.pendingDraw > 0) {
        // Blocage
        let totalDraw = game.pendingDraw;
        cards.forEach(card => {
            const effect = gameLogic.getCardEffect(card);
            totalDraw += effect.drawCount;
        });

        cards.forEach(card => {
            bot.hand = bot.hand.filter(c => c.id !== card.id);
            game.pile.push(card);
        });

        game.centerCard = cards[cards.length - 1];
        game.pendingDraw = totalDraw;
        game.pendingDrawFrom = bot.id;

        addLog(game, `🛡️ ${bot.name} bloque et renvoie ${game.pendingDraw} cartes !`);

        checkPlayerFinished(game, bot);
        nextPlayer(game);
        checkNextPlayerCanBlock(game);

        broadcastGameUpdate(game);
        setTimeout(() => triggerBotIfNeeded(game), 1500);
        return;
    }

    // Vérifier si un J est joué
    const jackPlayed = cards.find(c => c.rank === 'J');
    if (jackPlayed) {
        const suit = aiLogic.chooseSuitForJack(bot.hand, difficulty);
        game.imposedSuit = suit;
        addLog(game, `🎭 ${bot.name} impose ${suit}`);
    } else {
        game.imposedSuit = null;
    }

    // Retirer les cartes
    cards.forEach(card => {
        bot.hand = bot.hand.filter(c => c.id !== card.id);
        game.pile.push(card);
    });

    game.centerCard = cards[cards.length - 1];

    // Appliquer l'effet
    const lastCard = cards[cards.length - 1];
    applyCardEffect(game, lastCard, bot.id);

    addLog(game, `▶️ ${bot.name} joue ${cards.map(formatCard).join(', ')}`);

    checkPlayerFinished(game, bot);
    nextPlayer(game);

    // Effet As : skip
    if (game.skipNext) {
        const skipped = game.players[game.currentPlayerIndex];
        addLog(game, `⏭️ ${skipped.name} est suspendu`);
        game.skipNext = false;
        nextPlayer(game);
    }

    // Vérifier si le suivant peut bloquer
    checkNextPlayerCanBlock(game);

    broadcastGameUpdate(game);
    setTimeout(() => triggerBotIfNeeded(game), 1500);
}

// ===== DÉCLENCHER LE BOT SI C'EST SON TOUR =====
function triggerBotIfNeeded(game) {
    if (game.status !== 'playing') return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return;

    if (currentPlayer.isBot) {
        // Nettoyer le timeout précédent
        if (game.botTimeout) {
            clearTimeout(game.botTimeout);
        }

        game.botTimeout = setTimeout(() => {
            playBotTurn(game);
        }, 1000);
    }
}

// ===== HISTORIQUE =====
const HISTORY_FILE = path.join(__dirname, 'history.json');
const readHistory = () => {
    try {
        return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    } catch {
        return [];
    }
};
const saveHistory = (history) => {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

// ===== SOCKET.IO =====
io.on('connection', (socket) => {
    console.log('🔌 Nouveau client connecté:', socket.id);

    // ===== CRÉER UNE PARTIE =====
    socket.on('createGame', ({ playerName, maxPlayers }) => {
        const game = createGame(socket.id, playerName, maxPlayers);
        socket.join(game.id);
        playerRooms.set(socket.id, { gameId: game.id, playerId: socket.id });

        socket.emit('gameCreated', {
            gameId: game.id,
            playerId: socket.id,
            game: serializeGame(game, socket.id)
        });

        console.log(`🎮 Partie créée: ${game.id} par ${playerName}`);
    });

    // ===== REJOINDRE UNE PARTIE =====
    socket.on('joinGame', ({ gameId, playerName }) => {
        const game = games.get(gameId);

        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'waiting') return socket.emit('error', { message: 'La partie a déjà commencé' });
        if (game.players.length >= game.maxPlayers) return socket.emit('error', { message: 'La partie est complète' });

        const newPlayer = {
            id: socket.id,
            name: playerName,
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: false,
            rank: null
        };

        game.players.push(newPlayer);
        socket.join(gameId);
        playerRooms.set(socket.id, { gameId, playerId: socket.id });

        io.to(gameId).emit('playerJoined', {
            player: { id: newPlayer.id, name: newPlayer.name },
            players: game.players.map(p => ({ id: p.id, name: p.name })),
            game: serializeGame(game, null)
        });

        socket.emit('gameJoined', {
            gameId,
            playerId: socket.id,
            game: serializeGame(game, socket.id)
        });

        console.log(`👤 ${playerName} a rejoint la partie ${gameId}`);
    });

    // ===== AJOUTER UN BOT =====
    socket.on('addBot', ({ gameId, difficulty }) => {
        const game = games.get(gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'waiting') return socket.emit('error', { message: 'La partie a déjà commencé' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: 'Seul l\'hôte peut ajouter des bots' });
        if (game.players.length >= game.maxPlayers) return socket.emit('error', { message: 'La partie est complète' });

        const existingNames = game.players.map(p => p.name);
        const botName = aiLogic.getRandomBotName(existingNames);
        const botId = 'bot_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4);

        const bot = {
            id: botId,
            name: botName,
            hand: [],
            isActive: true,
            isConnected: true,
            isBot: true,
            botDifficulty: difficulty || aiLogic.DIFFICULTY.MEDIUM,
            rank: null
        };

        game.players.push(bot);

        io.to(gameId).emit('playerJoined', {
            player: { id: bot.id, name: bot.name, isBot: true },
            players: game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot })),
            game: serializeGame(game, null)
        });

        console.log(`🤖 Bot ${botName} ajouté à la partie ${gameId}`);
    });

    // ===== SUPPRIMER UN BOT =====
    socket.on('removeBot', ({ gameId, botId }) => {
        const game = games.get(gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: 'Seul l\'hôte peut retirer des bots' });
        if (game.status !== 'waiting') return socket.emit('error', { message: 'La partie a déjà commencé' });

        const bot = game.players.find(p => p.id === botId && p.isBot);
        if (!bot) return;

        game.players = game.players.filter(p => p.id !== botId);

        io.to(gameId).emit('playerLeft', {
            playerId: botId,
            players: game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot }))
        });
    });

    // ===== DÉMARRER LA PARTIE =====
    socket.on('startGame', ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.hostId !== socket.id) return socket.emit('error', { message: 'Seul l\'hôte peut démarrer' });

        const result = startGame(gameId);
        if (result.error) return socket.emit('error', { message: result.error });

        game.players.forEach(player => {
            if (!player.isBot) {
                io.to(player.id).emit('gameStarted', {
                    game: serializeGame(game, player.id)
                });
            }
        });
    });

    // ===== JOUER DES CARTES =====
    socket.on('playCards', ({ gameId, cardIds, imposedSuit }) => {
        const game = games.get(gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
        if (player.rank) return socket.emit('error', { message: 'Vous avez déjà terminé' });

        const currentPlayer = game.players[game.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return socket.emit('error', { message: 'Ce n\'est pas votre tour' });

        const cards = cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
        if (cards.length === 0) return socket.emit('error', { message: 'Cartes invalides' });

        if (cards.length > 1) {
            const firstRank = cards[0].rank;
            if (!cards.every(c => c.rank === firstRank)) {
                return socket.emit('error', { message: 'Les cartes doivent avoir le même numéro' });
            }
        }

        // CAS BLOCAGE
        if (game.pendingDraw > 0) {
            const canBlock = cards.every(c => c.type === 'joker' || c.rank === '7');
            if (!canBlock) {
                return socket.emit('error', {
                    message: `Vous devez bloquer avec un 7 ou un Joker, ou piocher ${game.pendingDraw} cartes`
                });
            }

            let totalDraw = game.pendingDraw;
            cards.forEach(card => {
                const effect = gameLogic.getCardEffect(card);
                totalDraw += effect.drawCount;
            });

            cards.forEach(card => {
                player.hand = player.hand.filter(c => c.id !== card.id);
                game.pile.push(card);
            });

            game.centerCard = cards[cards.length - 1];
            game.pendingDraw = totalDraw;
            game.pendingDrawFrom = socket.id;

            addLog(game, `🛡️ ${player.name} bloque et renvoie ${game.pendingDraw} cartes !`);

            checkPlayerFinished(game, player);
            nextPlayer(game);
            checkNextPlayerCanBlock(game);

            broadcastGameUpdate(game);
            setTimeout(() => triggerBotIfNeeded(game), 1500);
            return;
        }

        // CAS NORMAL
        for (const card of cards) {
            if (!gameLogic.canPlayCard(card, game.centerCard, game.imposedSuit)) {
                return socket.emit('error', { message: `${formatCard(card)} ne peut pas être jouée` });
            }
        }

        const jackPlayed = cards.find(c => c.rank === 'J');
        if (jackPlayed && imposedSuit) {
            game.imposedSuit = imposedSuit;
            addLog(game, `🎭 ${player.name} impose ${imposedSuit}`);
        } else if (jackPlayed && !imposedSuit) {
            return socket.emit('error', { message: 'Vous devez imposer une couleur avec le J' });
        } else {
            game.imposedSuit = null;
        }

        cards.forEach(card => {
            player.hand = player.hand.filter(c => c.id !== card.id);
            game.pile.push(card);
        });

        game.centerCard = cards[cards.length - 1];
        const lastCard = cards[cards.length - 1];
        applyCardEffect(game, lastCard, socket.id);

        addLog(game, `▶️ ${player.name} joue ${cards.map(formatCard).join(', ')}`);

        checkPlayerFinished(game, player);
        nextPlayer(game);

        if (game.skipNext) {
            addLog(game, `⏭️ ${game.players[game.currentPlayerIndex].name} est suspendu`);
            game.skipNext = false;
            nextPlayer(game);
        }

        checkNextPlayerCanBlock(game);

        broadcastGameUpdate(game);
        setTimeout(() => triggerBotIfNeeded(game), 1500);
    });

    // ===== PIOCHER =====
    socket.on('drawCard', ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) return socket.emit('error', { message: 'Partie introuvable' });
        if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

        const player = game.players.find(p => p.id === socket.id);
        if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
        if (player.rank) return socket.emit('error', { message: 'Vous avez déjà terminé' });

        const currentPlayer = game.players[game.currentPlayerIndex];
        if (currentPlayer.id !== socket.id) return socket.emit('error', { message: 'Ce n\'est pas votre tour' });

        const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
        const drawn = autoDraw(game, player, drawCount);

        if (game.pendingDraw > 0) {
            addLog(game, `💥 ${player.name} pioche ${drawn.length} cartes (attaque)`);
            game.pendingDraw = 0;
            game.pendingDrawFrom = null;
        } else {
            addLog(game, `📥 ${player.name} pioche 1 carte`);
        }

        nextPlayer(game);
        broadcastGameUpdate(game);

        socket.emit('cardsDrawn', { cards: drawn });
        setTimeout(() => triggerBotIfNeeded(game), 1500);
    });

    // ===== QUITTER =====
    socket.on('leaveGame', ({ gameId }) => {
        const game = games.get(gameId);
        if (!game) return;

        game.players = game.players.filter(p => p.id !== socket.id);
        socket.leave(gameId);
        playerRooms.delete(socket.id);

        if (game.players.length === 0) {
            games.delete(gameId);
        } else {
            io.to(gameId).emit('playerLeft', {
                playerId: socket.id,
                players: game.players.map(p => ({ id: p.id, name: p.name, isBot: p.isBot }))
            });
        }
    });

    // ===== DÉCONNEXION =====
    socket.on('disconnect', () => {
        console.log('🔌 Client déconnecté:', socket.id);
        const room = playerRooms.get(socket.id);
        if (room) {
            const game = games.get(room.gameId);
            if (game) {
                const player = game.players.find(p => p.id === socket.id);
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
        currentPlayerId: game.players[game.currentPlayerIndex]?.id,
        imposedSuit: game.imposedSuit,
        pendingDraw: game.pendingDraw,
        skipNext: game.skipNext,
        turnCount: game.turnCount,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            cardCount: p.hand.length,
            isActive: p.isActive,
            isConnected: p.isConnected,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty,
            rank: p.rank,
            isCurrent: game.players[game.currentPlayerIndex]?.id === p.id,
            hand: p.id === playerId ? p.hand : undefined
        })),
        finishedPlayers: game.finishedPlayers,
        log: game.log.slice(-20),
        lastPileCards: game.pile.slice(-5)
    };
}

function broadcastGameUpdate(game) {
    game.players.forEach(player => {
        if (!player.isBot) {
            io.to(player.id).emit('gameUpdate', {
                game: serializeGame(game, player.id)
            });
        }
    });
}

// ===== DÉMARRER =====
server.listen(PORT, () => {
    console.log(`🚀 Serveur démarré sur http://localhost:${PORT}`);
    console.log(`🤖 IA disponible pour les bots`);
});