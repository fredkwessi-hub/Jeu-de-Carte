// ===== server/socket/handlers.js =====
// Gestion de tous les événements Socket.IO

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const auth = require('./auth');
const reconnect = require('./reconnect');
const gameManager = require('../game/gameManager');
const gameLogic = require('../game/gameLogic');
const aiLogic = require('../ai/aiLogic');
const botPersonalities = require('../ai/botPersonalities');
const botMemory = require('../ai/botMemory');
const tournamentManager = require('../tournament/tournamentManager');
const scoring = require('../game/scoring');
const elo = require('../game/elo');
const profiles = require('../data/profiles');
const chat = require('../social/chat');
const friends = require('../social/friends');
const rooms = require('../social/rooms');
const moderation = require('../moderation/filter');
const antiCheat = require('../moderation/antiCheat');

// ===== INITIALISATION =====
function init(io) {
    io.on('connection', (socket) => {
        logger.info(`🔌 Nouveau socket: ${socket.id}`);

        // ============================================================
        // AUTHENTIFICATION
        // ============================================================

        socket.on('authenticate', (data, callback) => {
            try {
                const session = auth.createSession(socket, data);

                // Envoyer la session au client
                socket.emit('authenticated', session);

                // Vérifier s'il y a une reconnexion en attente
                if (reconnect.hasPendingReconnection(session.playerId)) {
                    const reconnInfo = reconnect.getReconnectionInfo(session.playerId);
                    socket.emit('reconnection_available', reconnInfo);
                }

                if (typeof callback === 'function') callback({ success: true, session });
            } catch (error) {
                logger.error('Erreur authentification:', error);
                socket.emit('error', { message: 'Erreur d\'authentification' });
                if (typeof callback === 'function') callback({ success: false, error: error.message });
            }
        });

        socket.on('reconnect_attempt', (data, callback) => {
            try {
                if (!socket.playerId) {
                    return socket.emit('error', { message: 'Non authentifié' });
                }

                const result = reconnect.tryReconnect(socket.playerId, socket);

                if (result.success) {
                    socket.emit('reconnected', {
                        type: result.type,
                        game: result.type === 'game' ? gameManager.getGame(result.game.id) : null,
                        tournament: result.type === 'tournament' ? tournamentManager.getTournament(result.tournament.id) : null,
                        elapsed: result.elapsed
                    });
                } else {
                    socket.emit('reconnect_failed', { reason: result.reason });
                }

                if (typeof callback === 'function') callback(result);
            } catch (error) {
                logger.error('Erreur reconnexion:', error);
                socket.emit('error', { message: 'Erreur de reconnexion' });
            }
        });

        // ============================================================
        // LOBBY
        // ============================================================

        socket.on('get_lobby', (callback) => {
            try {
                const lobby = {
                    onlinePlayers: auth.getOnlineCount(),
                    waitingGames: gameManager.getWaitingGames().map(g => ({
                        id: g.id,
                        host: g.players[0]?.name,
                        playerCount: g.players.length,
                        maxPlayers: g.settings.maxPlayers,
                        mode: g.settings.mode
                    })),
                    activeTournaments: tournamentManager.getWaitingTournaments().map(t => ({
                        id: t.id,
                        host: t.hostName,
                        playerCount: t.participants.length,
                        maxPlayers: t.playerCount
                    })),
                    publicRooms: rooms.getPublicRooms(),
                    stats: {
                        gamesInProgress: gameManager.getActiveGames().length,
                        tournamentsInProgress: tournamentManager.getActiveTournaments().length
                    }
                };

                if (typeof callback === 'function') callback(lobby);
                else socket.emit('lobby_update', lobby);
            } catch (error) {
                logger.error('Erreur get_lobby:', error);
            }
        });

        // ============================================================
        // CRÉATION / REJOINTE DE PARTIE
        // ============================================================

        socket.on('create_game', (data, callback) => {
            try {
                if (!socket.playerId) return socket.emit('error', { message: 'Non authentifié' });

                const playerProfile = profiles.getProfile(socket.playerId);
                const game = gameManager.createGame({
                    id: socket.playerId,
                    socketId: socket.id,
                    name: playerProfile.username,
                    avatar: playerProfile.avatar,
                    elo: playerProfile.elo
                }, data);

                socket.join(game.id);

                const response = {
                    success: true,
                    gameId: game.id,
                    game: serializeGameForPlayer(game, socket.playerId)
                };

                socket.emit('game_created', response);
                if (typeof callback === 'function') callback(response);

                logger.game(`Partie créée: ${game.id}`);
            } catch (error) {
                logger.error('Erreur create_game:', error);
                socket.emit('error', { message: 'Erreur lors de la création' });
            }
        });

        socket.on('join_game', (data, callback) => {
            try {
                if (!socket.playerId) return socket.emit('error', { message: 'Non authentifié' });
                if (!data.gameId) return socket.emit('error', { message: 'gameId requis' });

                const playerProfile = profiles.getProfile(socket.playerId);
                const result = gameManager.addPlayer(data.gameId, {
                    id: socket.playerId,
                    socketId: socket.id,
                    name: playerProfile.username,
                    avatar: playerProfile.avatar,
                    elo: playerProfile.elo
                });

                if (result.error) {
                    return socket.emit('error', { message: result.error });
                }

                socket.join(data.gameId);

                const response = {
                    success: true,
                    gameId: data.gameId,
                    game: serializeGameForPlayer(result.game, socket.playerId)
                };

                socket.emit('game_joined', response);
                if (typeof callback === 'function') callback(response);

                // Notifier les autres joueurs
                socket.to(data.gameId).emit('player_joined', {
                    player: {
                        id: result.player.id,
                        name: result.player.name,
                        avatar: result.player.avatar
                    },
                    players: result.game.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        avatar: p.avatar,
                        isBot: p.isBot,
                        botDifficulty: p.botDifficulty
                    }))
                });

                logger.player(`${playerProfile.username} a rejoint ${data.gameId}`);
            } catch (error) {
                logger.error('Erreur join_game:', error);
                socket.emit('error', { message: 'Erreur lors de la connexion' });
            }
        });

        socket.on('leave_game', (data) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                gameManager.removePlayer(data.gameId, socket.playerId);
                socket.leave(data.gameId);

                socket.to(data.gameId).emit('player_left', {
                    playerId: socket.playerId
                });

                logger.player(`${socket.playerId} a quitté ${data.gameId}`);
            } catch (error) {
                logger.error('Erreur leave_game:', error);
            }
        });

        // ============================================================
        // AJOUT / RETRAIT DE BOT
        // ============================================================

        socket.on('add_bot', (data, callback) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game) return socket.emit('error', { message: 'Partie introuvable' });
                if (game.hostId !== socket.playerId) return socket.emit('error', { message: 'Seul l\'hôte peut ajouter des bots' });

                // Choisir une personnalité aléatoire
                const personalities = botPersonalities.getAllPersonalities();
                const persona = personalities[Math.floor(Math.random() * personalities.length)];

                const result = gameManager.addBot(data.gameId, {
                    difficulty: data.difficulty || 'medium',
                    personality: data.personality || persona.id
                });

                if (result.error) return socket.emit('error', { message: result.error });

                io.to(data.gameId).emit('player_joined', {
                    player: {
                        id: result.player.id,
                        name: result.player.name,
                        avatar: result.player.avatar,
                        isBot: true,
                        botDifficulty: result.player.botDifficulty,
                        botPersonality: result.player.botPersonality
                    },
                    players: result.game.players.map(p => ({
                        id: p.id,
                        name: p.name,
                        avatar: p.avatar,
                        isBot: p.isBot,
                        botDifficulty: p.botDifficulty,
                        botPersonality: p.botPersonality
                    }))
                });

                if (typeof callback === 'function') callback({ success: true, bot: result.player });
            } catch (error) {
                logger.error('Erreur add_bot:', error);
                socket.emit('error', { message: 'Erreur lors de l\'ajout du bot' });
            }
        });

        socket.on('remove_bot', (data) => {
            try {
                if (!socket.playerId || !data.gameId || !data.botId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game) return;
                if (game.hostId !== socket.playerId) return;

                gameManager.removePlayer(data.gameId, data.botId);

                io.to(data.gameId).emit('player_left', {
                    playerId: data.botId
                });
            } catch (error) {
                logger.error('Erreur remove_bot:', error);
            }
        });

        // ============================================================
        // DÉMARRAGE DE PARTIE
        // ============================================================

        socket.on('start_game', (data, callback) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game) return socket.emit('error', { message: 'Partie introuvable' });
                if (game.hostId !== socket.playerId) return socket.emit('error', { message: 'Seul l\'hôte peut démarrer' });

                const result = gameManager.startGame(data.gameId);
                if (result.error) return socket.emit('error', { message: result.error });

                // Envoyer l'état à chaque joueur
                result.game.players.forEach(player => {
                    if (!player.isBot && player.socketId) {
                        io.to(player.socketId).emit('game_started', {
                            game: serializeGameForPlayer(result.game, player.id)
                        });
                    }
                });

                // Démarrer le tour du bot si c'est son tour
                setTimeout(() => triggerBotIfNeeded(io, result.game), 1500);

                if (typeof callback === 'function') callback({ success: true });
            } catch (error) {
                logger.error('Erreur start_game:', error);
                socket.emit('error', { message: 'Erreur au démarrage' });
            }
        });

        // ============================================================
        // JOUER DES CARTES
        // ============================================================

        socket.on('play_cards', (data, callback) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game) return socket.emit('error', { message: 'Partie introuvable' });
                if (game.status !== 'playing') return socket.emit('error', { message: 'Partie non active' });

                // Anti-triche : vérifier le timing
                if (!antiCheat.validatePlay(game, socket.playerId, data)) {
                    logger.warn(`Triche suspectée: ${socket.playerId}`, { data });
                    return socket.emit('error', { message: 'Coup invalide' });
                }

                const player = game.players.find(p => p.id === socket.playerId);
                if (!player) return socket.emit('error', { message: 'Joueur introuvable' });
                if (player.rank) return socket.emit('error', { message: 'Vous avez déjà terminé' });

                const currentPlayer = game.players[game.currentPlayerIndex];
                if (currentPlayer.id !== socket.playerId) {
                    return socket.emit('error', { message: 'Ce n\'est pas votre tour' });
                }

                // Récupérer les cartes
                const cards = data.cardIds.map(id => player.hand.find(c => c.id === id)).filter(Boolean);
                if (cards.length === 0) return socket.emit('error', { message: 'Cartes invalides' });

                // Valider le coup
                const validation = gameLogic.validatePlay(cards, player.hand, {
                    centerCard: game.centerCard,
                    imposedSuit: game.imposedSuit,
                    imposedColor: game.imposedColor,
                    pendingDraw: game.pendingDraw,
                    imposedSuitChoice: data.imposedSuit
                });

                if (!validation.valid) {
                    return socket.emit('error', {
                        message: validation.reason,
                        requiresSuitChoice: validation.requiresSuitChoice
                    });
                }

                // Exécuter le coup
                const result = executePlay(game, player, cards, data.imposedSuit);

                // Diffuser la mise à jour
                broadcastGameUpdate(io, game);

                // Animations
                if (result.animationType) {
                    io.to(game.id).emit('card_animation', {
                        type: result.animationType,
                        color: result.animationColor,
                        playerName: player.name
                    });
                }

                // Si la partie est terminée
                if (game.status === 'finished') {
                    handleGameEnd(io, game);
                } else {
                    // Déclencher le bot suivant
                    setTimeout(() => triggerBotIfNeeded(io, game), 1500);
                }

                if (typeof callback === 'function') callback({ success: true });
            } catch (error) {
                logger.error('Erreur play_cards:', error);
                socket.emit('error', { message: 'Erreur lors du coup' });
            }
        });

        socket.on('draw_card', (data) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game || game.status !== 'playing') return;

                const player = game.players.find(p => p.id === socket.playerId);
                if (!player || player.rank) return;

                const currentPlayer = game.players[game.currentPlayerIndex];
                if (currentPlayer.id !== socket.playerId) return socket.emit('error', { message: 'Pas votre tour' });

                const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
                const drawn = autoDraw(game, player, drawCount);

                if (game.pendingDraw > 0) {
                    gameManager.addLog(game, `💥 ${player.name} pioche ${drawn.length} cartes (attaque)`);
                    game.pendingDraw = 0;
                    game.pendingDrawFrom = null;
                } else {
                    gameManager.addLog(game, `📥 ${player.name} pioche 1 carte`);
                }

                nextPlayer(game);
                broadcastGameUpdate(io, game);

                socket.emit('cards_drawn', { cards: drawn });
                setTimeout(() => triggerBotIfNeeded(io, game), 1500);
            } catch (error) {
                logger.error('Erreur draw_card:', error);
            }
        });

        // ============================================================
        // CHAT
        // ============================================================

        socket.on('chat_message', (data) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                // Filtre de modération
                const filtered = moderation.filterMessage(data.message);
                if (!filtered.allowed) {
                    return socket.emit('error', { message: filtered.reason });
                }

                const result = chat.addMessage(data.gameId, socket.playerId, filtered.message);
                if (result.success) {
                    io.to(data.gameId).emit('chat_message', result.message);
                }
            } catch (error) {
                logger.error('Erreur chat_message:', error);
            }
        });

        // ============================================================
        // CHAMPIONNAT
        // ============================================================

        socket.on('create_tournament', (data, callback) => {
            try {
                if (!socket.playerId) return;

                const playerProfile = profiles.getProfile(socket.playerId);
                const tournament = tournamentManager.createTournament({
                    id: socket.playerId,
                    socketId: socket.id,
                    name: playerProfile.username,
                    avatar: playerProfile.avatar
                }, data);

                socket.join(tournament.id);

                socket.emit('tournament_created', {
                    success: true,
                    tournamentId: tournament.id,
                    tournament: serializeTournament(tournament)
                });

                if (typeof callback === 'function') callback({ success: true, tournamentId: tournament.id });
            } catch (error) {
                logger.error('Erreur create_tournament:', error);
                socket.emit('error', { message: 'Erreur création championnat' });
            }
        });

        socket.on('join_tournament', (data, callback) => {
            try {
                if (!socket.playerId || !data.tournamentId) return;

                const playerProfile = profiles.getProfile(socket.playerId);
                const result = tournamentManager.addParticipant(data.tournamentId, {
                    id: socket.playerId,
                    socketId: socket.id,
                    name: playerProfile.username,
                    avatar: playerProfile.avatar
                });

                if (result.error) return socket.emit('error', { message: result.error });

                socket.join(data.tournamentId);

                io.to(data.tournamentId).emit('tournament_update', {
                    tournament: serializeTournament(result.tournament)
                });

                socket.emit('tournament_joined', {
                    success: true,
                    tournamentId: data.tournamentId,
                    tournament: serializeTournament(result.tournament)
                });

                if (typeof callback === 'function') callback({ success: true });
            } catch (error) {
                logger.error('Erreur join_tournament:', error);
            }
        });

        socket.on('start_tournament', (data, callback) => {
            try {
                if (!socket.playerId || !data.tournamentId) return;

                const tournament = tournamentManager.getTournament(data.tournamentId);
                if (!tournament) return socket.emit('error', { message: 'Championnat introuvable' });
                if (tournament.hostId !== socket.playerId) return socket.emit('error', { message: 'Seul l\'hôte peut démarrer' });

                const result = tournamentManager.startTournament(data.tournamentId);
                if (result.error) return socket.emit('error', { message: result.error });

                io.to(data.tournamentId).emit('tournament_started', {
                    tournament: serializeTournament(result.tournament)
                });

                if (typeof callback === 'function') callback({ success: true });
            } catch (error) {
                logger.error('Erreur start_tournament:', error);
            }
        });

        socket.on('add_tournament_bot', (data, callback) => {
            try {
                if (!socket.playerId || !data.tournamentId) return;

                const tournament = tournamentManager.getTournament(data.tournamentId);
                if (!tournament) return socket.emit('error', { message: 'Championnat introuvable' });
                if (tournament.hostId !== socket.playerId) return socket.emit('error', { message: 'Non autorisé' });

                const result = tournamentManager.addBot(data.tournamentId, {
                    difficulty: data.difficulty || 'medium'
                });

                if (result.error) return socket.emit('error', { message: result.error });

                io.to(data.tournamentId).emit('tournament_update', {
                    tournament: serializeTournament(result.tournament)
                });

                if (typeof callback === 'function') callback({ success: true });
            } catch (error) {
                logger.error('Erreur add_tournament_bot:', error);
            }
        });

        // ============================================================
        // SPECTATEUR
        // ============================================================

        socket.on('spectate_game', (data) => {
            try {
                if (!socket.playerId || !data.gameId) return;

                const game = gameManager.getGame(data.gameId);
                if (!game) return socket.emit('error', { message: 'Partie introuvable' });

                gameManager.addSpectator(data.gameId, socket.id);
                socket.join(data.gameId);

                socket.emit('spectate_started', {
                    game: serializeGameForSpectator(game)
                });

                logger.player(`${socket.playerId} est spectateur de ${data.gameId}`);
            } catch (error) {
                logger.error('Erreur spectate_game:', error);
            }
        });

        socket.on('stop_spectating', (data) => {
            try {
                if (!data.gameId) return;
                gameManager.removeSpectator(data.gameId, socket.id);
                socket.leave(data.gameId);
            } catch (error) {
                logger.error('Erreur stop_spectating:', error);
            }
        });

        // ============================================================
        // AMIS
        // ============================================================

        socket.on('add_friend', (data, callback) => {
            try {
                if (!socket.playerId || !data.friendId) return;

                const result = friends.addFriend(socket.playerId, data.friendId);
                if (typeof callback === 'function') callback(result);
            } catch (error) {
                logger.error('Erreur add_friend:', error);
            }
        });

        socket.on('get_friends', (callback) => {
            try {
                if (!socket.playerId) return;
                const list = friends.getFriends(socket.playerId);
                if (typeof callback === 'function') callback(list);
            } catch (error) {
                logger.error('Erreur get_friends:', error);
            }
        });

        // ============================================================
        // PROFIL
        // ============================================================

        socket.on('update_profile', (data, callback) => {
            try {
                if (!socket.playerId) return;

                const updates = {};
                if (data.username) updates.username = helpers.sanitizeString(data.username, 20);
                if (data.avatar) updates.avatar = data.avatar;
                if (data.settings) updates.settings = data.settings;

                const profile = auth.updateProfile(socket.playerId, updates);

                if (typeof callback === 'function') callback({ success: true, profile });
                socket.emit('profile_updated', profile);
            } catch (error) {
                logger.error('Erreur update_profile:', error);
            }
        });

        socket.on('get_profile', (data, callback) => {
            try {
                const playerId = data?.playerId || socket.playerId;
                if (!playerId) return;

                const profile = profiles.getProfile(playerId);
                const stats = elo.getPlayerEloStats(profile);

                if (typeof callback === 'function') callback({ profile, stats });
            } catch (error) {
                logger.error('Erreur get_profile:', error);
            }
        });

        // ============================================================
        // DÉCONNEXION
        // ============================================================

        socket.on('disconnect', () => {
            logger.info(`🔌 Socket déconnecté: ${socket.id}`);

            const session = auth.getSession(socket.id);
            if (session) {
                // Trouver où le joueur était
                let gameId = null;
                let tournamentId = null;

                // Chercher dans les parties
                gameManager.getAllGames().forEach(g => {
                    const p = g.players.find(pl => pl.id === session.playerId);
                    if (p && p.socketId === socket.id) {
                        gameId = g.id;
                        p.isConnected = false;
                    }
                });

                // Chercher dans les championnats
                tournamentManager.getAllTournaments().forEach(t => {
                    const p = t.participants.find(pl => pl.id === session.playerId);
                    if (p && p.socketId === socket.id) {
                        tournamentId = t.id;
                        p.isConnected = false;
                    }
                });

                // Enregistrer la déconnexion
                reconnect.registerDisconnection(session.playerId, {
                    gameId,
                    tournamentId,
                    socketId: socket.id
                });

                // Notifier les autres
                if (gameId) {
                    socket.to(gameId).emit('player_disconnected', {
                        playerId: session.playerId,
                        playerName: session.username
                    });
                }

                auth.removeSession(socket);
            }
        });
    });
}

// ============================================================
// FONCTIONS INTERNES
// ============================================================

function executePlay(game, player, cards, imposedSuit) {
    let animationType = null;
    let animationColor = null;

    // ===== CAS BLOCAGE =====
    if (game.pendingDraw > 0) {
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

        const lastBlocker = cards[cards.length - 1];
        if (lastBlocker.type === 'joker') {
            game.imposedColor = lastBlocker.color;
            game.imposedSuit = null;
            animationColor = lastBlocker.color;
        }

        game.pendingDraw = totalDraw;
        game.pendingDrawFrom = player.id;

        animationType = lastBlocker.type === 'joker' ? 'joker' : 'seven';

        gameManager.addLog(game, `🛡️ ${player.name} bloque et renvoie ${game.pendingDraw} cartes !`);

        if (checkPlayerFinished(game, player)) return { animationType, animationColor };

        nextPlayer(game);
        checkNextPlayerCanBlock(game);

        return { animationType, animationColor };
    }

    // ===== CAS NORMAL =====
    const jackPlayed = cards.find(c => c.rank === 'J');
    const jokerPlayed = cards.find(c => c.type === 'joker');
    const sevenPlayed = cards.find(c => c.rank === '7');
    const acePlayed = cards.find(c => c.rank === 'A');
    const kingPlayed = cards.find(c => c.rank === 'K');

    // Gestion impositions
    if (jackPlayed && imposedSuit) {
        game.imposedSuit = imposedSuit;
        game.imposedColor = null;
    } else if (jackPlayed && !imposedSuit) {
        // Le client doit fournir imposedSuit
        game.imposedSuit = 'pique'; // fallback
        game.imposedColor = null;
    } else if (jokerPlayed) {
        game.imposedColor = jokerPlayed.color;
        game.imposedSuit = null;
    } else {
        game.imposedSuit = null;
        game.imposedColor = null;
    }

    // Retirer les cartes
    cards.forEach(card => {
        player.hand = player.hand.filter(c => c.id !== card.id);
        game.pile.push(card);
    });

    game.centerCard = cards[cards.length - 1];
    const lastCard = cards[cards.length - 1];

    // Effets
    if (jokerPlayed) {
        game.pendingDraw += 4;
        game.pendingDrawFrom = player.id;
        animationType = 'joker';
        animationColor = jokerPlayed.color;
    } else if (sevenPlayed) {
        game.pendingDraw += 2;
        game.pendingDrawFrom = player.id;
        animationType = 'seven';
        animationColor = sevenPlayed.color;
    } else if (acePlayed) {
        game.skipNext = true;
        animationType = 'ace';
    } else if (jackPlayed) {
        animationType = 'jack';
    } else if (kingPlayed) {
        game.direction *= -1;
        animationType = 'king';
    }

    gameManager.addLog(game, `▶️ ${player.name} joue ${cards.map(c => gameManager.formatCard(c)).join(', ')}`);

    if (checkPlayerFinished(game, player)) return { animationType, animationColor };

    nextPlayer(game);

    // Effet As
    if (game.skipNext) {
        gameManager.addLog(game, `⏭️ ${game.players[game.currentPlayerIndex].name} est suspendu`);
        game.skipNext = false;
        nextPlayer(game);
    }

    checkNextPlayerCanBlock(game);

    return { animationType, animationColor };
}

function checkPlayerFinished(game, player) {
    if (player.hand.length === 0 && !game.finishedPlayers.find(p => p.id === player.id)) {
        game.finishedPlayers.push({
            id: player.id,
            name: player.name,
            rank: game.finishedPlayers.length + 1,
            finishedAt: helpers.now()
        });
        player.rank = game.finishedPlayers.length;

        gameManager.addLog(game, `🏆 ${player.name} termine à la position ${player.rank} !`);

        const remaining = game.players.filter(p => !p.rank);

        if (remaining.length === 1) {
            const last = remaining[0];
            game.finishedPlayers.push({
                id: last.id,
                name: last.name,
                rank: game.finishedPlayers.length + 1,
                finishedAt: helpers.now()
            });
            last.rank = game.finishedPlayers.length;

            gameManager.addLog(game, `💀 ${last.name} est le dernier !`);

            // Appliquer les scores si mode points
            if (game.settings.rules.scoring === 'points') {
                scoring.applyRoundScores(game);
            }

            game.status = 'finished';
            game.finishedAt = helpers.now();

            gameManager.addLog(game, `🎉 Partie terminée ! Classement complet établi.`);
        }

        return true;
    }
    return false;
}

function checkNextPlayerCanBlock(game) {
    if (game.pendingDraw === 0) return;

    const nextP = game.players[game.currentPlayerIndex];
    if (!nextP) return;

    const canBlock = gameLogic.canBlockAttack(nextP.hand);

    if (!canBlock) {
        const drawn = autoDraw(game, nextP, game.pendingDraw);
        gameManager.addLog(game, `💥 ${nextP.name} pioche ${drawn.length} cartes !`);
        game.pendingDraw = 0;
        game.pendingDrawFrom = null;
        nextPlayer(game);
    }
}

function autoDraw(game, player, count) {
    const drawn = [];
    for (let i = 0; i < count; i++) {
        if (game.bank.length === 0) {
            const { newBank, newPile } = gameLogic.reshuffleBank(game.pile);
            if (newBank.length === 0) break;
            game.bank = newBank;
            game.pile = newPile;
            game.centerCard = newPile[newPile.length - 1];
            gameManager.addLog(game, `🔄 Banque reconstituée (${newBank.length} cartes)`);
        }
        if (game.bank.length > 0) {
            drawn.push(game.bank.pop());
        }
    }
    player.hand.push(...drawn);
    player.hand = gameLogic.sortHand(player.hand);
    return drawn;
}

function nextPlayer(game) {
    const count = game.players.length;
    if (count === 0) return;
    game.currentPlayerIndex = (game.currentPlayerIndex + game.direction + count) % count;
}

function triggerBotIfNeeded(io, game) {
    if (game.status !== 'playing') return;

    const currentPlayer = game.players[game.currentPlayerIndex];
    if (!currentPlayer) return;

    if (currentPlayer.isBot) {
        if (game.botTimeout) clearTimeout(game.botTimeout);

        game.botTimeout = setTimeout(() => {
            playBotTurn(io, game);
        }, config.game.botTurnDelay);
    }
}

function playBotTurn(io, game) {
    const bot = game.players[game.currentPlayerIndex];
    if (!bot || !bot.isBot) return;

    if (bot.rank) {
        nextPlayer(game);
        broadcastGameUpdate(io, game);
        setTimeout(() => triggerBotIfNeeded(io, game), 1000);
        return;
    }

    const difficulty = bot.botDifficulty || 'medium';
    const personality = bot.botPersonality || 'balanced';

    const gameState = {
        centerCard: game.centerCard,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw,
        playerCount: game.players.length,
        direction: game.direction,
        bankCount: game.bank.length,
        pileCount: game.pile.length,
        turnCount: game.turnCount,
        opponents: game.players
            .filter(p => p.id !== bot.id)
            .map(p => ({ id: p.id, name: p.name, cardCount: p.hand.length, rank: p.rank }))
    };

    const move = aiLogic.chooseMove(bot.hand, gameState, difficulty, personality, bot.id);

    // Enregistrer le coup dans la mémoire
    botMemory.recordMove(bot.id, { card: move.cards ? move.cards[0] : null });

    // Observer les adversaires (simulé)
    game.players.forEach(p => {
        if (p.id !== bot.id && !p.isBot && p.hand.length > 0) {
            // On ne voit pas sa main, mais on peut observer ses coups précédents
        }
    });

    // ===== PIOCHE =====
    if (move.action === 'draw') {
        const drawCount = game.pendingDraw > 0 ? game.pendingDraw : 1;
        const drawn = autoDraw(game, bot, drawCount);

        if (game.pendingDraw > 0) {
            gameManager.addLog(game, `💥 ${bot.name} pioche ${drawn.length} cartes`);
            game.pendingDraw = 0;
            game.pendingDrawFrom = null;
        } else {
            gameManager.addLog(game, `📥 ${bot.name} pioche 1 carte`);
        }

        // Chat aléatoire
        if (botPersonalities.shouldChat(botPersonalities.getPersonality(personality))) {
            io.to(game.id).emit('bot_chat', {
                botId: bot.id,
                botName: bot.name,
                message: botPersonalities.getChatMessage('draw')
            });
        }

        nextPlayer(game);
        broadcastGameUpdate(io, game);
        setTimeout(() => triggerBotIfNeeded(io, game), 1500);
        return;
    }

    // ===== JOUER =====
    const cards = move.cards;
    if (!cards || cards.length === 0) return;

    const result = executePlay(game, bot, cards, move.imposedSuit);

    broadcastGameUpdate(io, game);

    if (result.animationType) {
        io.to(game.id).emit('card_animation', {
            type: result.animationType,
            color: result.animationColor,
            playerName: bot.name
        });

        // Chat du bot
        if (botPersonalities.shouldChat(botPersonalities.getPersonality(personality))) {
            let chatType = null;
            if (result.animationType === 'joker') chatType = 'joker_play';
            else if (result.animationType === 'seven') chatType = 'seven_play';
            else if (result.animationType === 'ace') chatType = 'ace_play';
            else if (result.animationType === 'jack') chatType = 'jack_play';

            if (chatType) {
                io.to(game.id).emit('bot_chat', {
                    botId: bot.id,
                    botName: bot.name,
                    message: botPersonalities.getChatMessage(chatType)
                });
            }
        }
    }

    if (game.status === 'finished') {
        handleGameEnd(io, game);
    } else {
        setTimeout(() => triggerBotIfNeeded(io, game), 1500);
    }
}

function handleGameEnd(io, game) {
    // Calculer les récompenses
    const rewards = scoring.calculateFinalRewards(game);

    // Mettre à jour l'ELO
    const profilesMap = {};
    game.players.forEach(p => {
        profilesMap[p.id] = profiles.getProfile(p.id);
    });
    const eloChanges = elo.updateEloAfterGame(game, profilesMap);

    // Sauvegarder les profils
    Object.keys(profilesMap).forEach(id => {
        profiles.saveProfile(id);
    });

    // Enregistrer l'historique
    const summary = scoring.getGameSummary(game);

    // Envoyer à chaque joueur
    game.players.forEach(player => {
        if (!player.isBot && player.socketId) {
            io.to(player.socketId).emit('game_over', {
                game: serializeGameForPlayer(game, player.id),
                finalRanking: game.finishedPlayers,
                rewards,
                eloChanges: eloChanges ? eloChanges[player.id] : null,
                summary
            });
        }
    });

    logger.game(`Partie ${game.id} terminée`, {
        winner: game.finishedPlayers[0]?.name,
        playerCount: game.players.length
    });
}

function broadcastGameUpdate(io, game) {
    game.turnCount++;

    // Envoyer à chaque joueur humain
    game.players.forEach(player => {
        if (!player.isBot && player.socketId) {
            io.to(player.socketId).emit('game_update', {
                game: serializeGameForPlayer(game, player.id)
            });
        }
    });

    // Envoyer aux spectateurs
    if (game.spectators && game.spectators.length > 0) {
        const spectatorState = serializeGameForSpectator(game);
        game.spectators.forEach(socketId => {
            io.to(socketId).emit('spectator_update', spectatorState);
        });
    }
}

function serializeGameForPlayer(game, playerId) {
    return {
        id: game.id,
        status: game.status,
        settings: game.settings,
        centerCard: game.centerCard,
        pileCount: game.pile.length,
        bankCount: game.bank.length,
        currentPlayerIndex: game.currentPlayerIndex,
        currentPlayerId: game.players[game.currentPlayerIndex]?.id,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw,
        direction: game.direction,
        skipNext: game.skipNext,
        turnCount: game.turnCount,
        chat: game.chat.slice(-20),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            cardCount: p.hand.length,
            isConnected: p.isConnected,
            isBot: p.isBot,
            botDifficulty: p.botDifficulty,
            botPersonality: p.botPersonality,
            rank: p.rank,
            score: p.score,
            totalScore: p.totalScore,
            isCurrent: p.id === game.players[game.currentPlayerIndex]?.id,
            hand: p.id === playerId ? p.hand : undefined
        })),
        finishedPlayers: game.finishedPlayers,
        log: game.log.slice(-30)
    };
}

function serializeGameForSpectator(game) {
    return {
        id: game.id,
        status: game.status,
        centerCard: game.centerCard,
        pileCount: game.pile.length,
        bankCount: game.bank.length,
        currentPlayerIndex: game.currentPlayerIndex,
        currentPlayerId: game.players[game.currentPlayerIndex]?.id,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw,
        direction: game.direction,
        chat: game.chat.slice(-20),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            cardCount: p.hand.length,
            isConnected: p.isConnected,
            isBot: p.isBot,
            rank: p.rank,
            score: p.score,
            isCurrent: p.id === game.players[game.currentPlayerIndex]?.id
        })),
        finishedPlayers: game.finishedPlayers,
        log: game.log.slice(-30)
    };
}

function serializeTournament(tournament) {
    return {
        id: tournament.id,
        hostId: tournament.hostId,
        hostName: tournament.hostName,
        playerCount: tournament.playerCount,
        status: tournament.status,
        currentRound: tournament.currentRound,
        totalRounds: tournament.totalRounds,
        participants: tournament.participants.map(p => ({
            id: p.id,
            name: p.name,
            avatar: p.avatar,
            isBot: p.isBot,
            isConnected: p.isConnected,
            eliminated: p.eliminated,
            matchesWon: p.matchesWon
        })),
        matches: tournament.matches.map(m => ({
            id: m.id,
            round: m.round,
            player1: m.player1 ? { id: m.player1.id, name: m.player1.name } : null,
            player2: m.player2 ? { id: m.player2.id, name: m.player2.name } : null,
            winner: m.winner ? { id: m.winner.id, name: m.winner.name } : null,
            loser: m.loser ? { id: m.loser.id, name: m.loser.name } : null,
            status: m.status
        })),
        currentMatchIndex: tournament.currentMatchIndex,
        winner: tournament.winner || null
    };
}

// ===== EXPORT =====
module.exports = {
    init,
    executePlay,
    checkPlayerFinished,
    checkNextPlayerCanBlock,
    autoDraw,
    nextPlayer,
    triggerBotIfNeeded,
    playBotTurn,
    handleGameEnd,
    broadcastGameUpdate,
    serializeGameForPlayer,
    serializeGameForSpectator,
    serializeTournament
};