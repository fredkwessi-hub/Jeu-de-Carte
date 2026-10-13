// =============================================================
// JEU DE CARTES — SOCKET (Connexion Socket.IO)
// =============================================================
// Wrapper autour de Socket.IO avec reconnexion, queue, events.
// =============================================================

import store from './state.js';
import storage from './utils/storage.js';
import helpers from './utils/helpers.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const SOCKET_CONFIG = {
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 20000,
    autoConnect: false
};

const RECONNECT_WINDOW = 60000; // 60s pour se reconnecter
const MESSAGE_QUEUE_MAX = 50;
const HEARTBEAT_INTERVAL = 25000; // 25s

/* ============================================================
   SOCKET CLIENT CLASS
   ============================================================ */

class SocketClient {
    constructor() {
        this.socket = null;
        this.eventHandlers = new Map();
        this.messageQueue = [];
        this.isConnecting = false;
        this.isConnected = false;
        this.lastPingTime = 0;
        this.latency = 0;
        this.heartbeatInterval = null;
        this.reconnectAttempts = 0;
        this.intentionalDisconnect = false;
    }

    /* --------------------------------------------------------
       CONNEXION
       -------------------------------------------------------- */

    /**
     * Initialise la connexion Socket.IO
     */
    connect(options = {}) {
        if (this.socket && this.socket.connected) {
            console.log('🔌 Socket déjà connecté');
            return Promise.resolve();
        }

        if (this.isConnecting) {
            console.log('🔌 Connexion en cours...');
            return Promise.resolve();
        }

        this.isConnecting = true;
        this.intentionalDisconnect = false;

        return new Promise((resolve, reject) => {
            try {
                const config = {
                    ...SOCKET_CONFIG,
                    ...options
                };

                console.log('🔌 Connexion au serveur...', config);

                this.socket = window.io(config);

                // Enregistrer tous les handlers en attente
                this.registerPendingHandlers();

                // Événements de connexion
                this.socket.on('connect', () => this.onConnect());
                this.socket.on('disconnect', (reason) => this.onDisconnect(reason));
                this.socket.on('connect_error', (error) => this.onConnectError(error));
                this.socket.on('reconnect', (attempt) => this.onReconnect(attempt));
                this.socket.on('reconnect_attempt', (attempt) => this.onReconnectAttempt(attempt));
                this.socket.on('reconnect_error', (error) => this.onReconnectError(error));
                this.socket.on('reconnect_failed', () => this.onReconnectFailed());

                // Ping/Pong pour mesurer la latence
                this.socket.on('pong', (timestamp) => {
                    this.latency = Date.now() - timestamp;
                });

                // Événements métier (à dispatcher vers les handlers)
                this.registerBusinessEvents();

                // Résoudre immédiatement (la connexion se fera en async)
                resolve();
            } catch (error) {
                console.error('❌ Erreur initialisation socket:', error);
                this.isConnecting = false;
                reject(error);
            }
        });
    }

    /**
     * Connecte avec les infos du joueur
     */
    connectWithPlayer() {
        const playerId = store.get('player.id') || storage.getPlayerId();
        const username = store.get('player.username') || storage.getUsername();

        return this.connect().then(() => {
            // Attendre la vraie connexion
            return new Promise((resolve) => {
                if (this.socket.connected) {
                    this.authenticate(playerId, username);
                    resolve();
                } else {
                    this.socket.once('connect', () => {
                        this.authenticate(playerId, username);
                        resolve();
                    });
                }
            });
        });
    }

    /**
     * Authentifie le joueur auprès du serveur
     */
    authenticate(playerId, username, avatar = null) {
        this.emit('authenticate', {
            playerId,
            username,
            avatar: avatar || store.get('player.avatar')
        });
    }

    /* --------------------------------------------------------
       DÉCONNEXION
       -------------------------------------------------------- */

    disconnect() {
        this.intentionalDisconnect = true;
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
        this.isConnected = false;
        console.log('🔌 Déconnexion manuelle');
    }

    /* --------------------------------------------------------
       ÉVÉNEMENTS SYSTÈME
       -------------------------------------------------------- */

    onConnect() {
        console.log('✅ Socket connecté:', this.socket.id);
        this.isConnecting = false;
        this.isConnected = true;
        this.reconnectAttempts = 0;

        store.batch(() => {
            store.set('player.isConnected', true);
            store.set('session.socketId', this.socket.id);
            store.set('session.connectedAt', new Date().toISOString());
            store.set('session.reconnecting', false);
        });

        // Vider la queue de messages
        this.flushMessageQueue();

        // Démarrer le heartbeat
        this.startHeartbeat();

        // Émettre l'événement local
        this.emitLocal('socket:connected');
    }

    onDisconnect(reason) {
        console.log('❌ Socket déconnecté:', reason);
        this.isConnected = false;

        store.batch(() => {
            store.set('player.isConnected', false);
            store.set('session.socketId', null);
        });

        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }

        // Si déconnexion non intentionnelle, activer le mode reconnexion
        if (!this.intentionalDisconnect && reason !== 'io client disconnect') {
            store.set('session.reconnecting', true);
            this.emitLocal('socket:reconnecting', { reason });
        } else {
            this.emitLocal('socket:disconnected', { reason });
        }
    }

    onConnectError(error) {
        console.error('❌ Erreur de connexion:', error.message);
        this.isConnecting = false;
        this.emitLocal('socket:error', { error: error.message });
    }

    onReconnect(attempt) {
        console.log(`🔄 Reconnecté après ${attempt} tentative(s)`);
        this.emitLocal('socket:reconnected', { attempt });
    }

    onReconnectAttempt(attempt) {
        console.log(`🔄 Tentative de reconnexion #${attempt}`);
        this.reconnectAttempts = attempt;
        store.set('session.reconnectionAttempts', attempt);
        this.emitLocal('socket:reconnecting', { attempt });
    }

    onReconnectError(error) {
        console.error('❌ Erreur reconnexion:', error.message);
    }

    onReconnectFailed() {
        console.error('❌ Échec définitif de reconnexion');
        store.set('session.reconnecting', false);
        this.emitLocal('socket:reconnect_failed');
    }

    /* --------------------------------------------------------
       HEARTBEAT
       -------------------------------------------------------- */

    startHeartbeat() {
        if (this.heartbeatInterval) clearInterval(this.heartbeatInterval);

        this.heartbeatInterval = setInterval(() => {
            if (this.socket && this.socket.connected) {
                this.socket.emit('ping', Date.now());
            }
        }, HEARTBEAT_INTERVAL);
    }

    /* --------------------------------------------------------
       ÉMISSION
       -------------------------------------------------------- */

    /**
     * Émet un événement au serveur
     * @param {string} event
     * @param {*} data
     * @param {boolean} queueIfDisconnected
     */
    emit(event, data = {}, queueIfDisconnected = true) {
        if (!this.socket || !this.socket.connected) {
            if (queueIfDisconnected && this.canQueue(event)) {
                this.queueMessage(event, data);
            }
            return false;
        }

        try {
            this.socket.emit(event, data);
            return true;
        } catch (error) {
            console.error(`Erreur émission "${event}":`, error);
            return false;
        }
    }

    /**
     * Émet et attend une réponse (avec timeout)
     */
    emitWithAck(event, data = {}, timeout = 10000) {
        return new Promise((resolve, reject) => {
            if (!this.socket || !this.socket.connected) {
                return reject(new Error('Socket non connecté'));
            }

            const timer = setTimeout(() => {
                reject(new Error(`Timeout sur "${event}"`));
            }, timeout);

            try {
                this.socket.emit(event, data, (response) => {
                    clearTimeout(timer);
                    resolve(response);
                });
            } catch (error) {
                clearTimeout(timer);
                reject(error);
            }
        });
    }

    /**
     * Émission sans queue (pour les events critiques en temps réel)
     */
    emitNow(event, data = {}) {
        return this.emit(event, data, false);
    }

    /* --------------------------------------------------------
       QUEUE (Messages en attente de reconnexion)
       -------------------------------------------------------- */

    canQueue(event) {
        // Ne pas mettre en queue certains events critiques
        const noQueue = ['authenticate', 'disconnect', 'ping'];
        return !noQueue.includes(event);
    }

    queueMessage(event, data) {
        if (this.messageQueue.length >= MESSAGE_QUEUE_MAX) {
            this.messageQueue.shift(); // Retirer le plus ancien
        }
        this.messageQueue.push({ event, data, timestamp: Date.now() });
        console.log(`📥 Message en queue: ${event} (${this.messageQueue.length} en attente)`);
    }

    flushMessageQueue() {
        if (this.messageQueue.length === 0) return;

        console.log(`📤 Envoi de ${this.messageQueue.length} message(s) en queue`);
        const queue = [...this.messageQueue];
        this.messageQueue = [];

        queue.forEach(({ event, data, timestamp }) => {
            // Ignorer les messages trop anciens (> 30s)
            if (Date.now() - timestamp > 30000) {
                console.log(`⏭️ Message expiré ignoré: ${event}`);
                return;
            }
            this.emit(event, data, false);
        });
    }

    /* --------------------------------------------------------
       ÉCOUTE
       -------------------------------------------------------- */

    /**
     * Enregistre un handler pour un événement
     * @param {string} event
     * @param {Function} handler
     */
    on(event, handler) {
        if (!this.eventHandlers.has(event)) {
            this.eventHandlers.set(event, new Set());
        }
        this.eventHandlers.get(event).add(handler);

        // Retourner une fonction de désabonnement
        return () => this.off(event, handler);
    }

    /**
     * Retire un handler
     */
    off(event, handler) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.delete(handler);
        }
    }

    /**
     * Enregistre un handler qui ne s'exécute qu'une fois
     */
    once(event, handler) {
        const wrapper = (...args) => {
            this.off(event, wrapper);
            handler(...args);
        };
        return this.on(event, wrapper);
    }

    /**
     * Enregistre tous les handlers en attente dans le socket
     */
    registerPendingHandlers() {
        this.eventHandlers.forEach((handlers, event) => {
            handlers.forEach(handler => {
                this.socket.on(event, handler);
            });
        });
    }

    /**
     * Émet un événement local (ne touche pas le serveur)
     */
    emitLocal(event, data) {
        const handlers = this.eventHandlers.get(event);
        if (handlers) {
            handlers.forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Erreur handler local "${event}":`, error);
                }
            });
        }
    }

    /* --------------------------------------------------------
       ÉVÉNEMENTS MÉTIER (Dispatch automatique vers le store)
       -------------------------------------------------------- */

    registerBusinessEvents() {
        // ===== Authentification =====
        this.socket.on('authenticated', (data) => {
            console.log('✅ Authentifié:', data);
            store.set('player.isAuthenticated', true);
            this.emitLocal('auth:success', data);
        });

        this.socket.on('error', (data) => {
            console.error('❌ Erreur serveur:', data);
            store.set('lastError', data);
            this.emitLocal('server:error', data);
        });

        // ===== Reconnexion disponible =====
        this.socket.on('reconnection_available', (data) => {
            console.log('🔄 Reconnexion disponible:', data);
            store.batch(() => {
                store.set('reconnection.available', true);
                store.set('reconnection.gameId', data.gameId);
                store.set('reconnection.tournamentId', data.tournamentId);
                store.set('reconnection.remainingMs', data.remaining || 0);
                store.set('reconnection.elapsedMs', data.elapsed || 0);
            });
            this.emitLocal('reconnect:available', data);
        });

        this.socket.on('reconnected', (data) => {
            console.log('✅ Reconnexion réussie:', data);
            store.batch(() => {
                store.set('reconnection.available', false);
                store.set('session.reconnecting', false);
            });
            this.emitLocal('reconnect:success', data);
        });

        this.socket.on('reconnect_failed', (data) => {
            console.log('❌ Reconnexion échouée:', data);
            store.set('reconnection.available', false);
            this.emitLocal('reconnect:failed', data);
        });

        // ===== Parties =====
        this.socket.on('game_created', (data) => {
            console.log('🎮 Partie créée:', data.gameId);
            this.emitLocal('game:created', data);
        });

        this.socket.on('game_joined', (data) => {
            console.log('🎮 Partie rejointe:', data.gameId);
            this.emitLocal('game:joined', data);
        });

        this.socket.on('player_joined', (data) => {
            console.log('👤 Joueur rejoint:', data.player.name);
            this.emitLocal('game:player_joined', data);
        });

        this.socket.on('player_left', (data) => {
            console.log('👤 Joueur parti:', data.playerId);
            this.emitLocal('game:player_left', data);
        });

        this.socket.on('player_disconnected', (data) => {
            console.log('⚠️ Joueur déconnecté:', data.playerName);
            this.emitLocal('game:player_disconnected', data);
        });

        this.socket.on('game_started', (data) => {
            console.log('🎮 Partie démarrée');
            this.emitLocal('game:started', data);
        });

        this.socket.on('game_update', (data) => {
            this.emitLocal('game:update', data);
        });

        this.socket.on('game_over', (data) => {
            console.log('🏁 Partie terminée');
            this.emitLocal('game:over', data);
        });

        this.socket.on('cards_drawn', (data) => {
            console.log('📥 Cartes piochées:', data.cards?.length);
            this.emitLocal('game:cards_drawn', data);
        });

        this.socket.on('card_animation', (data) => {
            this.emitLocal('game:card_animation', data);
        });

        this.socket.on('bot_chat', (data) => {
            this.emitLocal('game:bot_chat', data);
        });

        // ===== Championnat =====
        this.socket.on('tournament_created', (data) => {
            console.log('🏆 Championnat créé:', data.tournamentId);
            this.emitLocal('tournament:created', data);
        });

        this.socket.on('tournament_joined', (data) => {
            console.log('🏆 Championnat rejoint:', data.tournamentId);
            this.emitLocal('tournament:joined', data);
        });

        this.socket.on('tournament_update', (data) => {
            this.emitLocal('tournament:update', data);
        });

        this.socket.on('tournament_started', (data) => {
            console.log('🏆 Championnat démarré');
            this.emitLocal('tournament:started', data);
        });

        this.socket.on('tournament_match_started', (data) => {
            console.log('⚔️ Match du championnat démarré');
            this.emitLocal('tournament:match_started', data);
        });

        this.socket.on('match_ended', (data) => {
            console.log('🏁 Match terminé');
            this.emitLocal('tournament:match_ended', data);
        });

        this.socket.on('tournament_finished', (data) => {
            console.log('🏆 Championnat terminé');
            this.emitLocal('tournament:finished', data);
        });

        // ===== Chat =====
        this.socket.on('chat_message', (data) => {
            this.emitLocal('chat:message', data);
        });

        // ===== Spectateur =====
        this.socket.on('spectate_started', (data) => {
            this.emitLocal('spectator:started', data);
        });

        this.socket.on('spectator_update', (data) => {
            this.emitLocal('spectator:update', data);
        });

        // ===== Stats serveur =====
        this.socket.on('server_stats', (data) => {
            store.batch(() => {
                store.set('social.onlineCount', data.onlinePlayers || 0);
            });
        });

        this.socket.on('server_shutdown', (data) => {
            console.warn('⚠️ Serveur en cours d\'arrêt:', data.message);
            this.emitLocal('server:shutdown', data);
        });
    }

    /* --------------------------------------------------------
       GETTERS
       -------------------------------------------------------- */

    isSocketConnected() {
        return this.isConnected && this.socket && this.socket.connected;
    }

    getLatency() {
        return this.latency;
    }

    getSocketId() {
        return this.socket?.id || null;
    }

    getQueueLength() {
        return this.messageQueue.length;
    }

    /* --------------------------------------------------------
       DEBUG
       -------------------------------------------------------- */

    debug() {
        console.group('🔌 État du socket');
        console.log('Connecté:', this.isConnected);
        console.log('ID:', this.getSocketId());
        console.log('Latence:', this.latency + 'ms');
        console.log('Queue:', this.messageQueue.length, 'message(s)');
        console.log('Handlers:', this.eventHandlers.size, 'événement(s)');
        console.groupEnd();
    }
}

/* ============================================================
   INSTANCE UNIQUE
   ============================================================ */

export const socket = new SocketClient();

/* ============================================================
   RACCOURCIS D'ÉMISSION (Actions fréquentes)
   ============================================================ */

export const socketActions = {
    /* ----- Parties ----- */
    createGame(settings = {}) {
        return socket.emitWithAck('create_game', settings);
    },

    joinGame(gameId) {
        return socket.emitWithAck('join_game', { gameId });
    },

    leaveGame(gameId) {
        return socket.emit('leave_game', { gameId });
    },

    startGame(gameId) {
        return socket.emitWithAck('start_game', { gameId });
    },

    addBot(gameId, difficulty = 'medium') {
        return socket.emitWithAck('add_bot', { gameId, difficulty });
    },

    removeBot(gameId, botId) {
        return socket.emit('remove_bot', { gameId, botId });
    },

    playCards(gameId, cardIds, imposedSuit = null) {
        return socket.emitWithAck('play_cards', { gameId, cardIds, imposedSuit });
    },

    drawCard(gameId) {
        return socket.emit('draw_card', { gameId });
    },

    /* ----- Championnat ----- */
    createTournament(playerCount = 4) {
        return socket.emitWithAck('create_tournament', { playerCount });
    },

    joinTournament(tournamentId) {
        return socket.emitWithAck('join_tournament', { tournamentId });
    },

    leaveTournament(tournamentId) {
        return socket.emit('leave_tournament', { tournamentId });
    },

    startTournament(tournamentId) {
        return socket.emitWithAck('start_tournament', { tournamentId });
    },

    addTournamentBot(tournamentId, difficulty = 'medium') {
        return socket.emitWithAck('add_tournament_bot', { tournamentId, difficulty });
    },

    /* ----- Chat ----- */
    sendChatMessage(gameId, message) {
        return socket.emit('chat_message', { gameId, message });
    },

    /* ----- Spectateur ----- */
    spectateGame(gameId) {
        return socket.emit('spectate_game', { gameId });
    },

    stopSpectating(gameId) {
        return socket.emit('stop_spectating', { gameId });
    },

    /* ----- Profil ----- */
    updateProfile(updates) {
        return socket.emitWithAck('update_profile', updates);
    },

    getProfile(playerId = null) {
        return socket.emitWithAck('get_profile', { playerId });
    },

    /* ----- Amis ----- */
    addFriend(friendId) {
        return socket.emitWithAck('add_friend', { friendId });
    },

    getFriends() {
        return socket.emitWithAck('get_friends');
    },

    /* ----- Reconnexion ----- */
    reconnectAttempt() {
        return socket.emitWithAck('reconnect_attempt');
    },

    /* ----- Lobby ----- */
    getLobby() {
        return socket.emitWithAck('get_lobby');
    }
};

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    socket,
    socketActions,
    SOCKET_CONFIG
};