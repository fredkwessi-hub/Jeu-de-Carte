// =============================================================
// JEU DE CARTES — STATE (Store d'état global réactif)
// =============================================================
// Store centralisé avec souscriptions (pattern observer).
// Aucun DOM ici : uniquement de la logique d'état.
// =============================================================

import helpers from './utils/helpers.js';
import storage from './utils/storage.js';

/* ============================================================
   ÉTAT INITIAL
   ============================================================ */

const initialState = {
    // ===== Joueur =====
    player: {
        id: null,
        username: '',
        avatar: 'default',
        elo: 1000,
        level: 1,
        xp: 0,
        xpToNextLevel: 100,
        wins: 0,
        losses: 0,
        gamesPlayed: 0,
        winRate: 0,
        currentStreak: 0,
        longestStreak: 0,
        isAuthenticated: false,
        isConnected: false
    },

    // ===== Session =====
    session: {
        socketId: null,
        connectedAt: null,
        reconnecting: false,
        reconnectionAttempts: 0
    },

    // ===== UI =====
    ui: {
        currentScreen: 'splash',
        previousScreen: null,
        isModalOpen: false,
        activeModal: null,
        isLoading: false,
        loadingMessage: '',
        theme: 'dark',
        language: 'fr',
        orientation: 'portrait'
    },

    // ===== Paramètres =====
    settings: {
        theme: 'dark',
        language: 'fr',
        soundEnabled: true,
        musicEnabled: false,
        hapticEnabled: true,
        notificationsEnabled: true,
        autoReady: false,
        chatVisible: true
    },

    // ===== Jeu en cours =====
    game: {
        id: null,
        status: null,
        mode: null,
        players: [],
        centerCard: null,
        bankCount: 0,
        pileCount: 0,
        currentPlayerId: null,
        currentPlayerIndex: 0,
        imposedSuit: null,
        imposedColor: null,
        pendingDraw: 0,
        skipNext: false,
        direction: 1,
        turnCount: 0,
        hand: [],
        selectedCards: [],
        finishedPlayers: [],
        log: [],
        chat: [],
        isMyTurn: false,
        myRank: null,
        tournamentId: null,
        matchId: null
    },

    // ===== Championnat =====
    tournament: {
        id: null,
        status: null,
        hostId: null,
        playerCount: 0,
        participants: [],
        bracket: null,
        currentRound: 0,
        totalRounds: 0,
        matches: [],
        winner: null,
        finalRanking: [],
        isActive: false
    },

    // ===== Spectateur =====
    spectator: {
        isSpectating: false,
        gameId: null,
        game: null
    },

    // ===== Salle d'attente =====
    waiting: {
        gameId: null,
        isHost: false,
        players: [],
        maxPlayers: 4,
        canStart: false,
        waitingMessage: ''
    },

    // ===== Social =====
    social: {
        friends: [],
        friendRequests: { incoming: [], outgoing: [] },
        blockedPlayers: [],
        publicRooms: [],
        onlineCount: 0
    },

    // ===== Classement =====
    leaderboard: {
        entries: [],
        myRank: null,
        lastUpdated: null
    },

    // ===== Statistiques =====
    stats: {
        totalGames: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        averageRank: 0,
        bestRank: null,
        totalPlayTime: 0
    },

    // ===== Notifications =====
    notifications: {
        list: [],
        unreadCount: 0
    },

    // ===== Reconnexion =====
    reconnection: {
        available: false,
        gameId: null,
        tournamentId: null,
        remainingMs: 0,
        elapsedMs: 0
    },

    // ===== Erreurs =====
    lastError: null
};

/* ============================================================
   STORE CLASS (Pattern Observer)
   ============================================================ */

class Store {
    constructor(initialState) {
        this.state = helpers.deepClone(initialState);
        this.listeners = new Map(); // path -> Set<callback>
        this.globalListeners = new Set(); // callbacks globaux
        this.middlewares = []; // Pour logger/persister
        this.isBatching = false;
        this.pendingUpdates = new Set();
    }

    /* --------------------------------------------------------
       LECTURE
       -------------------------------------------------------- */

    /**
     * Récupère une valeur par chemin (ex: 'game.status')
     */
    get(path, defaultValue = null) {
        if (!path) return this.state;

        const keys = path.split('.');
        let current = this.state;

        for (const key of keys) {
            if (current == null || typeof current !== 'object') {
                return defaultValue;
            }
            current = current[key];
        }

        return current === undefined ? defaultValue : current;
    }

    /**
     * Récupère une copie profonde de tout l'état
     */
    getAll() {
        return helpers.deepClone(this.state);
    }

    /**
     * Vérifie si un chemin existe
     */
    has(path) {
        const keys = path.split('.');
        let current = this.state;
        for (const key of keys) {
            if (current == null || typeof current !== 'object' || !(key in current)) {
                return false;
            }
            current = current[key];
        }
        return true;
    }

    /* --------------------------------------------------------
       ÉCRITURE
       -------------------------------------------------------- */

    /**
     * Met à jour une valeur par chemin
     */
    set(path, value) {
        const oldValue = this.get(path);

        // Pas de changement → skip
        if (oldValue === value) return;

        // Appliquer les middlewares
        const processedValue = this.applyMiddlewares(path, value, oldValue);
        if (processedValue === undefined) return;

        // Mettre à jour l'état
        const keys = path.split('.');
        let current = this.state;

        for (let i = 0; i < keys.length - 1; i++) {
            const key = keys[i];
            if (current[key] == null || typeof current[key] !== 'object') {
                current[key] = {};
            }
            current = current[key];
        }

        const lastKey = keys[keys.length - 1];
        current[lastKey] = processedValue;

        // Notifier
        if (this.isBatching) {
            this.pendingUpdates.add(path);
        } else {
            this.notify(path, processedValue, oldValue);
        }
    }

    /**
     * Met à jour plusieurs valeurs d'un coup
     */
    update(updates) {
        this.batch(() => {
            Object.entries(updates).forEach(([path, value]) => {
                this.set(path, value);
            });
        });
    }

    /**
     * Fusionne un objet partiel dans une section de l'état
     */
    merge(path, partialObject) {
        const current = this.get(path, {});
        if (!helpers.isObject(current)) {
            console.warn(`merge() sur une valeur non-objet à "${path}"`);
            return;
        }
        this.set(path, { ...current, ...partialObject });
    }

    /**
     * Ajoute un élément à un tableau
     */
    push(path, item) {
        const arr = this.get(path, []);
        if (!Array.isArray(arr)) {
            console.warn(`push() sur une valeur non-tableau à "${path}"`);
            return;
        }
        this.set(path, [...arr, item]);
    }

    /**
     * Retire un élément d'un tableau par prédicat
     */
    remove(path, predicate) {
        const arr = this.get(path, []);
        if (!Array.isArray(arr)) return;
        this.set(path, arr.filter(item => !predicate(item)));
    }

    /**
     * Remplace toute une section
     */
    replace(path, value) {
        this.set(path, helpers.deepClone(value));
    }

    /**
     * Incrémente une valeur numérique
     */
    increment(path, amount = 1) {
        const current = this.get(path, 0);
        this.set(path, (Number(current) || 0) + amount);
    }

    /**
     * Toggle un booléen
     */
    toggle(path) {
        const current = this.get(path, false);
        this.set(path, !current);
    }

    /**
     * Réinitialise à l'état initial (ou une section)
     */
    reset(path = null) {
        if (path === null) {
            this.state = helpers.deepClone(initialState);
            this.notifyAll();
        } else {
            const initialValue = this.getFromObject(initialState, path);
            this.set(path, helpers.deepClone(initialValue));
        }
    }

    /**
     * Récupère une valeur depuis un objet (utilitaire interne)
     */
    getFromObject(obj, path) {
        const keys = path.split('.');
        let current = obj;
        for (const key of keys) {
            if (current == null) return undefined;
            current = current[key];
        }
        return current;
    }

    /* --------------------------------------------------------
       SOUSCRIPTION
       -------------------------------------------------------- */

    /**
     * S'abonne à un chemin
     * @param {string} path - Chemin (ex: 'game.status' ou '*' pour tout)
     * @param {Function} callback - (newValue, oldValue) => void
     * @returns {Function} Fonction de désabonnement
     */
    subscribe(path, callback) {
        if (path === '*') {
            this.globalListeners.add(callback);
            return () => this.globalListeners.delete(callback);
        }

        if (!this.listeners.has(path)) {
            this.listeners.set(path, new Set());
        }
        this.listeners.get(path).add(callback);

        // Retourner une fonction de désabonnement
        return () => {
            const set = this.listeners.get(path);
            if (set) {
                set.delete(callback);
                if (set.size === 0) this.listeners.delete(path);
            }
        };
    }

    /**
     * S'abonne à plusieurs chemins
     */
    subscribeMany(paths, callback) {
        const unsubscribers = paths.map(path => this.subscribe(path, callback));
        return () => unsubscribers.forEach(fn => fn());
    }

    /**
     * S'abonne et déclenche immédiatement avec la valeur actuelle
     */
    subscribeImmediate(path, callback) {
        callback(this.get(path), undefined);
        return this.subscribe(path, callback);
    }

    /* --------------------------------------------------------
       NOTIFICATION
       -------------------------------------------------------- */

    /**
     * Notifie les listeners d'un changement
     */
    notify(path, newValue, oldValue) {
        // Notifier les listeners du chemin exact
        const pathListeners = this.listeners.get(path);
        if (pathListeners) {
            pathListeners.forEach(callback => {
                try {
                    callback(newValue, oldValue);
                } catch (error) {
                    console.error(`Erreur dans listener pour "${path}":`, error);
                }
            });
        }

        // Notifier les listeners parents (ex: 'game' pour 'game.status')
        const parts = path.split('.');
        for (let i = parts.length - 1; i > 0; i--) {
            const parentPath = parts.slice(0, i).join('.');
            const parentListeners = this.listeners.get(parentPath);
            if (parentListeners) {
                const parentValue = this.get(parentPath);
                parentListeners.forEach(callback => {
                    try {
                        callback(parentValue, undefined);
                    } catch (error) {
                        console.error(`Erreur dans listener parent "${parentPath}":`, error);
                    }
                });
            }
        }

        // Notifier les listeners globaux
        this.globalListeners.forEach(callback => {
            try {
                callback(path, newValue, oldValue);
            } catch (error) {
                console.error('Erreur dans listener global:', error);
            }
        });

        // Émettre un événement DOM (utile pour les composants non-module)
        this.emitStateEvent(path, newValue);
    }

    /**
     * Notifie tous les listeners
     */
    notifyAll() {
        this.globalListeners.forEach(callback => {
            try {
                callback('*', this.state, undefined);
            } catch (error) {
                console.error('Erreur dans listener global:', error);
            }
        });
    }

    /**
     * Émet un CustomEvent DOM
     */
    emitStateEvent(path, value) {
        const event = new CustomEvent('state:change', {
            detail: { path, value }
        });
        window.dispatchEvent(event);
    }

    /* --------------------------------------------------------
       BATCHING (Grouper les mises à jour)
       -------------------------------------------------------- */

    /**
     * Groupe plusieurs modifications en une seule notification
     */
    batch(fn) {
        this.isBatching = true;
        this.pendingUpdates.clear();

        try {
            fn();
        } finally {
            this.isBatching = false;
            this.pendingUpdates.forEach(path => {
                const value = this.get(path);
                this.notify(path, value, undefined);
            });
            this.pendingUpdates.clear();
        }
    }

    /* --------------------------------------------------------
       MIDDLEWARES
       -------------------------------------------------------- */

    /**
     * Ajoute un middleware (permet de transformer les valeurs)
     */
    addMiddleware(fn) {
        this.middlewares.push(fn);
    }

    /**
     * Applique les middlewares
     */
    applyMiddlewares(path, value, oldValue) {
        let processed = value;

        for (const middleware of this.middlewares) {
            try {
                const result = middleware(path, processed, oldValue);
                if (result === false) return undefined; // Bloque le changement
                if (result !== undefined) processed = result;
            } catch (error) {
                console.error('Erreur middleware:', error);
            }
        }

        return processed;
    }

    /* --------------------------------------------------------
       SÉLECTEURS (Raccourcis pratiques)
       -------------------------------------------------------- */

    /**
     * Vérifie si c'est le tour du joueur
     */
    isMyTurn() {
        return this.get('game.currentPlayerId') === this.get('player.id');
    }

    /**
     * Récupère le joueur actuel
     */
    getCurrentPlayer() {
        const currentId = this.get('game.currentPlayerId');
        return this.get('game.players', []).find(p => p.id === currentId);
    }

    /**
     * Récupère un joueur par ID
     */
    getPlayerById(id) {
        return this.get('game.players', []).find(p => p.id === id);
    }

    /**
     * Récupère les adversaires
     */
    getOpponents() {
        const myId = this.get('player.id');
        return this.get('game.players', []).filter(p => p.id !== myId);
    }

    /**
     * Vérifie si le joueur est dans une partie active
     */
    isInGame() {
        return this.get('game.id') !== null;
    }

    /**
     * Vérifie si le joueur est dans un championnat
     */
    isInTournament() {
        return this.get('tournament.id') !== null;
    }

    /**
     * Récupère les cartes sélectionnées (objets complets)
     */
    getSelectedCards() {
        const selectedIds = this.get('game.selectedCards', []);
        const hand = this.get('game.hand', []);
        return hand.filter(card => selectedIds.includes(card.id));
    }

    /* --------------------------------------------------------
       PERSISTANCE (Auto-save des préférences)
       -------------------------------------------------------- */

    /**
     * Persiste les paramètres et le profil dans localStorage
     */
    persist() {
        try {
            storage.saveSettings(this.get('settings'));
            storage.saveUsername(this.get('player.username'));
            storage.saveAvatar(this.get('player.avatar'));
            return true;
        } catch (error) {
            console.error('Erreur persistance:', error);
            return false;
        }
    }

    /**
     * Charge depuis localStorage
     */
    hydrate() {
        try {
            const savedSettings = storage.getSettings();
            const savedUsername = storage.getUsername();
            const savedAvatar = storage.getAvatar();
            const savedPlayerId = storage.getPlayerId();

            this.batch(() => {
                this.set('settings', savedSettings);
                this.set('ui.theme', savedSettings.theme);
                this.set('ui.language', savedSettings.language);
                this.set('player.username', savedUsername);
                this.set('player.avatar', savedAvatar);
                this.set('player.id', savedPlayerId);
            });

            return true;
        } catch (error) {
            console.error('Erreur hydratation:', error);
            return false;
        }
    }

    /* --------------------------------------------------------
       DEBUG
       -------------------------------------------------------- */

    /**
     * Log tout l'état (dev uniquement)
     */
    debug() {
        console.group('📦 État actuel');
        console.log(this.getAll());
        console.groupEnd();
    }

    /**
     * Récupère le nombre de listeners
     */
    stats() {
        let totalPathListeners = 0;
        this.listeners.forEach(set => {
            totalPathListeners += set.size;
        });

        return {
            paths: this.listeners.size,
            pathListeners: totalPathListeners,
            globalListeners: this.globalListeners.size,
            middlewares: this.middlewares.length
        };
    }
}

/* ============================================================
   INSTANCE UNIQUE
   ============================================================ */

export const store = new Store(initialState);

/* ============================================================
   ACTIONS SPÉCIFIQUES (helpers pratiques)
   ============================================================ */

/**
 * Actions groupées pour le joueur
 */
export const playerActions = {
    setProfile(profile) {
        store.batch(() => {
            store.merge('player', {
                id: profile.id,
                username: profile.username,
                avatar: profile.avatar,
                elo: profile.elo,
                level: profile.level || 1,
                wins: profile.wins || 0,
                losses: profile.losses || 0,
                gamesPlayed: profile.gamesPlayed || 0,
                winRate: profile.winRate || 0,
                isAuthenticated: true
            });
        });
        store.persist();
    },

    setConnected(isConnected) {
        store.set('player.isConnected', isConnected);
    },

    updateStats(stats) {
        store.merge('stats', stats);
    },

    reset() {
        store.reset('player');
    }
};

/**
 * Actions groupées pour la partie
 */
export const gameActions = {
    start(gameData) {
        store.batch(() => {
            store.merge('game', {
                id: gameData.id,
                status: gameData.status,
                mode: gameData.mode || gameData.settings?.mode,
                players: gameData.players || [],
                centerCard: gameData.centerCard,
                bankCount: gameData.bankCount || 0,
                pileCount: gameData.pileCount || 0,
                currentPlayerId: gameData.currentPlayerId,
                currentPlayerIndex: gameData.currentPlayerIndex || 0,
                imposedSuit: gameData.imposedSuit,
                imposedColor: gameData.imposedColor,
                pendingDraw: gameData.pendingDraw || 0,
                skipNext: gameData.skipNext || false,
                direction: gameData.direction || 1,
                turnCount: gameData.turnCount || 0,
                hand: gameData.hand || [],
                selectedCards: [],
                finishedPlayers: gameData.finishedPlayers || [],
                log: gameData.log || [],
                chat: gameData.chat || [],
                isMyTurn: false
            });
        });
    },

    update(gameData) {
        store.batch(() => {
            const myId = store.get('player.id');
            const myPlayer = gameData.players?.find(p => p.id === myId);

            store.merge('game', {
                status: gameData.status,
                players: gameData.players,
                centerCard: gameData.centerCard,
                bankCount: gameData.bankCount,
                pileCount: gameData.pileCount,
                currentPlayerId: gameData.currentPlayerId,
                currentPlayerIndex: gameData.currentPlayerIndex,
                imposedSuit: gameData.imposedSuit,
                imposedColor: gameData.imposedColor,
                pendingDraw: gameData.pendingDraw,
                skipNext: gameData.skipNext,
                direction: gameData.direction,
                turnCount: gameData.turnCount,
                hand: myPlayer?.hand || [],
                finishedPlayers: gameData.finishedPlayers || [],
                log: gameData.log || [],
                isMyTurn: gameData.currentPlayerId === myId
            });

            // Mettre à jour le rang du joueur s'il a fini
            if (myPlayer?.rank) {
                store.set('game.myRank', myPlayer.rank);
            }
        });
    },

    end() {
        store.reset('game');
    },

    selectCard(cardId) {
        const selected = store.get('game.selectedCards', []);
        if (selected.includes(cardId)) {
            store.set('game.selectedCards', selected.filter(id => id !== cardId));
        } else {
            store.set('game.selectedCards', [...selected, cardId]);
        }
    },

    clearSelection() {
        store.set('game.selectedCards', []);
    }
};

/**
 * Actions groupées pour l'UI
 */
export const uiActions = {
    goToScreen(screenName) {
        const current = store.get('ui.currentScreen');
        store.batch(() => {
            store.set('ui.previousScreen', current);
            store.set('ui.currentScreen', screenName);
        });
    },

    openModal(modalName) {
        store.batch(() => {
            store.set('ui.isModalOpen', true);
            store.set('ui.activeModal', modalName);
        });
    },

    closeModal() {
        store.batch(() => {
            store.set('ui.isModalOpen', false);
            store.set('ui.activeModal', null);
        });
    },

    setLoading(isLoading, message = '') {
        store.batch(() => {
            store.set('ui.isLoading', isLoading);
            store.set('ui.loadingMessage', message);
        });
    },

    setTheme(theme) {
        store.batch(() => {
            store.set('ui.theme', theme);
            store.set('settings.theme', theme);
        });
        document.documentElement.setAttribute('data-theme', theme);
        store.persist();
    }
};

/**
 * Actions pour les paramètres
 */
export const settingsActions = {
    update(partialSettings) {
        store.merge('settings', partialSettings);
        store.persist();
    },

    toggle(field) {
        const current = store.get(`settings.${field}`, false);
        store.set(`settings.${field}`, !current);
        store.persist();
    }
};

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    store,
    playerActions,
    gameActions,
    uiActions,
    settingsActions,
    initialState
};