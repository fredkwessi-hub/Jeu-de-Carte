// ===== server/config.js =====
// Configuration centralisée de l'application

require('dotenv').config();

const config = {
    // ===== Serveur =====
    server: {
        port: parseInt(process.env.PORT) || 3000,
        env: process.env.NODE_ENV || 'development',
        isProduction: process.env.NODE_ENV === 'production',
        isDevelopment: process.env.NODE_ENV !== 'production'
    },

    // ===== CORS =====
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST'],
        credentials: true
    },

    // ===== Socket.IO =====
    socket: {
        transports: ['websocket', 'polling'],
        pingTimeout: 60000,
        pingInterval: 25000,
        maxHttpBufferSize: 1e6 // 1 MB
    },

    // ===== Sécurité =====
    security: {
        sessionSecret: process.env.SESSION_SECRET || 'dev_secret_change_me',
        maxUsernameLength: 20,
        minUsernameLength: 2,
        maxChatMessageLength: 200,
        chatRateLimit: 3000 // ms entre 2 messages
    },

    // ===== Jeu =====
    game: {
        maxPlayersPerGame: parseInt(process.env.MAX_PLAYERS_PER_GAME) || 4,
        minPlayersPerGame: 2,
        cardsPerPlayer: 5,
        maxTurnTimeout: parseInt(process.env.DEFAULT_TURN_TIMEOUT) || 30, // secondes
        botTurnDelay: 1200, // ms avant que le bot joue
        reconnectWindow: 60000 // 60s pour se reconnecter
    },

    // ===== Championnat =====
    tournament: {
        allowedPlayerCounts: [4, 8, 16],
        defaultPlayerCount: 4,
        matchStartDelay: 3000, // ms entre les matchs
        allowSmallFinal: true // match pour la 3ème place
    },

    // ===== ELO =====
    elo: {
        initialRating: 1000,
        kFactor: 32,
        minRating: 100,
        maxRating: 3000
    },

    // ===== Scoring (points en fin de manche) =====
    scoring: {
        joker: 50,
        ace: 20,
        king: 10,
        queen: 10,
        jack: 10,
        ten: 10,
        nine: 9,
        eight: 8,
        seven: 7,
        six: 6,
        five: 5,
        four: 4,
        three: 3,
        two: 2,
        maxPointsBeforeLosing: 500 // premier à 500 points perd
    },

    // ===== Logs =====
    logs: {
        level: process.env.LOG_LEVEL || 'info',
        colors: true,
        saveToFile: false,
        logDir: './logs'
    },

    // ===== Data =====
    data: {
        dir: './data',
        profilesFile: './data/profiles.json',
        matchesFile: './data/matches.json',
        tournamentsFile: './data/tournaments.json',
        friendsFile: './data/friends.json',
        replaysDir: './data/replays',
        autoSave: true,
        saveInterval: 30000 // ms
    },

    // ===== Limites =====
    limits: {
        maxActiveGames: 100,
        maxActiveTournaments: 20,
        maxSpectatorsPerGame: 10,
        maxFriendsPerPlayer: 50,
        maxChatHistoryPerGame: 100
    },

    // ===== Fonctionnalités activées =====
    features: {
        chat: true,
        spectators: true,
        replay: true,
        friends: true,
        elo: true,
        tournaments: true,
        themes: true,
        sounds: true,
        haptics: true,
        bots: true,
        quickPlay: true,
        offlineMode: true,
        notifications: true
    },

    // ===== Thèmes disponibles =====
    themes: {
        default: 'dark',
        available: ['dark', 'light', 'neon', 'retro', 'classic', 'cosmic']
    },

    // ===== Langues =====
    i18n: {
        default: 'fr',
        available: ['fr', 'en']
    },

    // ===== Version =====
    version: '2.0.0'
};

// ===== Vérifications de sécurité =====
if (config.server.isProduction) {
    if (config.security.sessionSecret === 'dev_secret_change_me') {
        console.warn('⚠️  ATTENTION : Le SESSION_SECRET par défaut est utilisé en production !');
        console.warn('⚠️  Change-le dans le fichier .env');
    }
}

// ===== Export =====
module.exports = config;