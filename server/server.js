// ===== server/server.js =====
// Point d'entrée principal du serveur

// ===== IMPORTS =====
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');

// ===== CONFIG & UTILS =====
const config = require('./config');
const logger = require('./utils/logger');
const helpers = require('./utils/helpers');

// ===== MODULES MÉTIER =====
const gameManager = require('./game/gameManager');
const tournamentManager = require('./tournament/tournamentManager');
const auth = require('./socket/auth');
const reconnect = require('./socket/reconnect');
const socketHandlers = require('./socket/handlers');
const profiles = require('./data/profiles');
const persistence = require('./data/persistence');
const stats = require('./data/stats');
const chat = require('./social/chat');
const friends = require('./social/friends');
const rooms = require('./social/rooms');
const antiCheat = require('./moderation/antiCheat');

// ============================================================
// INITIALISATION EXPRESS
// ============================================================

const app = express();
const server = http.createServer(app);

// ============================================================
// INITIALISATION SOCKET.IO
// ============================================================

const io = new Server(server, {
    cors: {
        origin: config.cors.origin,
        methods: config.cors.methods,
        credentials: config.cors.credentials
    },
    transports: config.socket.transports,
    pingTimeout: config.socket.pingTimeout,
    pingInterval: config.socket.pingInterval,
    maxHttpBufferSize: config.socket.maxHttpBufferSize
});

// ============================================================
// MIDDLEWARE EXPRESS
// ============================================================

app.use(cors({
    origin: config.cors.origin,
    methods: config.cors.methods,
    credentials: config.cors.credentials
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Servir les fichiers statiques du dossier public
app.use(express.static(path.join(__dirname, '../public'), {
    maxAge: config.server.isProduction ? '7d' : 0,
    etag: true
}));

// Logger HTTP simple (en dev uniquement)
if (config.server.isDevelopment) {
    app.use((req, res, next) => {
        logger.debug(`📡 ${req.method} ${req.path}`);
        next();
    });
}

// ============================================================
// ROUTES HTTP
// ============================================================

// Health check (pour Render)
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'ok',
        version: config.version,
        env: config.server.env,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
    });
});

// Stats publiques (API)
app.get('/api/stats', (req, res) => {
    try {
        const globalStats = stats.getGlobalStats();
        const profileStats = profiles.getGlobalStats();
        const antiCheatStats = antiCheat.getStats();

        res.json({
            game: globalStats,
            players: profileStats,
            moderation: {
                monitoredPlayers: antiCheatStats.monitoredPlayers,
                highRiskPlayers: antiCheatStats.highRiskPlayers
            },
            server: {
                uptime: Math.round(process.uptime()),
                version: config.version
            }
        });
    } catch (error) {
        logger.error('Erreur /api/stats:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Leaderboard public (API)
app.get('/api/leaderboard', (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 100, 500);
        const leaderboard = profiles.getLeaderboard(limit);
        res.json(leaderboard);
    } catch (error) {
        logger.error('Erreur /api/leaderboard:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Parties actives (API)
app.get('/api/games', (req, res) => {
    try {
        const games = gameManager.getActiveGames().map(g => ({
            id: g.id,
            mode: g.settings.mode,
            playerCount: g.players.length,
            maxPlayers: g.settings.maxPlayers,
            status: g.status,
            spectators: g.spectators.length,
            startedAt: g.startedAt
        }));
        res.json(games);
    } catch (error) {
        logger.error('Erreur /api/games:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Championnats actifs (API)
app.get('/api/tournaments', (req, res) => {
    try {
        const tournaments = tournamentManager.getActiveTournaments().map(t =>
            tournamentManager.serializeTournamentLight(t)
        );
        res.json(tournaments);
    } catch (error) {
        logger.error('Erreur /api/tournaments:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Salles publiques (API)
app.get('/api/rooms', (req, res) => {
    try {
        const roomList = rooms.getPublicRooms();
        res.json(roomList);
    } catch (error) {
        logger.error('Erreur /api/rooms:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Profil public d'un joueur (API)
app.get('/api/players/:playerId', (req, res) => {
    try {
        const profile = profiles.getProfile(req.params.playerId);
        if (!profile) {
            return res.status(404).json({ error: 'Joueur introuvable' });
        }

        // Ne renvoyer que les infos publiques
        res.json({
            id: profile.id,
            username: profile.username,
            avatar: profile.avatar,
            bio: profile.bio,
            elo: profile.elo,
            level: profile.level,
            wins: profile.wins,
            losses: profile.losses,
            winRate: profile.winRate,
            gamesPlayed: profile.gamesPlayed,
            longestWinStreak: profile.longestWinStreak,
            achievements: profile.achievements,
            isOnline: profile.isOnline
        });
    } catch (error) {
        logger.error('Erreur /api/players:', error);
        res.status(500).json({ error: 'Erreur interne' });
    }
});

// Fallback : renvoyer index.html pour toutes les autres routes (SPA)
app.get('*', (req, res, next) => {
    // Ne pas intercepter les routes API
    if (req.path.startsWith('/api/') || req.path.startsWith('/socket.io/')) {
        return next();
    }
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Gestion des erreurs Express
app.use((err, req, res, next) => {
    logger.error('Erreur Express:', err);
    res.status(500).json({ error: 'Erreur serveur' });
});

// ============================================================
// INITIALISATION SOCKET.IO
// ============================================================

// Rendre `io` accessible globalement (pour tournamentManager, handlers, etc.)
global.io = io;

// Initialiser les handlers
socketHandlers.init(io);

// Log des connexions
io.engine.on('connection_error', (err) => {
    logger.error('Erreur de connexion Socket.IO:', {
        code: err.code,
        message: err.message,
        context: err.context
    });
});

// ============================================================
// TÂCHES PÉRIODIQUES
// ============================================================

// Nettoyage périodique
setInterval(() => {
    try {
        const cleanedGames = gameManager.cleanupInactiveGames();
        const cleanedTournaments = tournamentManager.cleanupInactiveTournaments();
        const cleanedRooms = rooms.cleanupInactiveRooms();
        const cleanedReconnections = reconnect.cleanupOldReconnections();
        const cleanedChat = chat.cleanupOldConversations();
        const cleanedAntiCheat = antiCheat.cleanupOldProfiles();

        const total = cleanedGames + cleanedTournaments + cleanedRooms +
            cleanedReconnections + cleanedChat + cleanedAntiCheat;

        if (total > 0) {
            logger.info(`🧹 Nettoyage global: ${total} éléments supprimés`);
        }
    } catch (error) {
        logger.error('Erreur nettoyage périodique:', error);
    }
}, 5 * 60 * 1000); // Toutes les 5 minutes

// Sauvegarde périodique des profils
setInterval(() => {
    try {
        profiles.saveProfiles();
        logger.debug('💾 Sauvegarde automatique des profils');
    } catch (error) {
        logger.error('Erreur sauvegarde automatique:', error);
    }
}, config.data.saveInterval);

// Statistiques en direct (broadcast toutes les 30s)
setInterval(() => {
    try {
        const onlineCount = auth.getOnlineCount();
        const activeGames = gameManager.getActiveGames().length;
        const activeTournaments = tournamentManager.getActiveTournaments().length;

        io.emit('server_stats', {
            onlinePlayers: onlineCount,
            activeGames,
            activeTournaments,
            timestamp: Date.now()
        });
    } catch (error) {
        logger.error('Erreur broadcast stats:', error);
    }
}, 30000);

// ============================================================
// GESTION DES ERREURS GLOBALES
// ============================================================

process.on('uncaughtException', (err) => {
    logger.error('❌ Exception non capturée:', err);
    // Ne pas quitter en production, mais logger
    if (config.server.isProduction) {
        // En production, on pourrait redémarrer
        logger.error('Stack:', err.stack);
    } else {
        // En dev, on quitte pour voir l'erreur
        process.exit(1);
    }
});

process.on('unhandledRejection', (reason, promise) => {
    logger.error('❌ Rejet non géré:', reason);
    logger.error('Promise:', promise);
});

// ============================================================
// ARRÊT PROPRE
// ============================================================

let isShuttingDown = false;

function gracefulShutdown(signal) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    logger.section(`🛑 Arrêt du serveur (${signal})`);

    // Notifier les clients
    io.emit('server_shutdown', {
        message: 'Le serveur redémarre. Reconnectez-vous dans quelques secondes.'
    });

    // Sauvegarder les données
    try {
        logger.info('💾 Sauvegarde des profils...');
        profiles.saveProfiles();

        logger.info('💾 Sauvegarde des statistiques...');
        persistence.saveAll();

        logger.success('✅ Données sauvegardées');
    } catch (error) {
        logger.error('❌ Erreur sauvegarde:', error);
    }

    // Fermer les connexions
    io.close(() => {
        logger.info('🔌 Socket.IO fermé');

        server.close(() => {
            logger.success('✅ Serveur arrêté proprement');
            process.exit(0);
        });

        // Timeout de sécurité
        setTimeout(() => {
            logger.warn('⚠️ Arrêt forcé après timeout');
            process.exit(1);
        }, 5000);
    });
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

// ============================================================
// DÉMARRAGE
// ============================================================

function startServer() {
    logger.banner();

    // Initialiser la persistance
    logger.section('📂 Initialisation de la persistance');
    persistence.init();

    // Charger les profils
    logger.section('👥 Chargement des profils');
    const profileCount = profiles.loadProfiles();

    // Charger l'historique
    logger.section('📊 Chargement de l\'historique');
    try {
        const matchHistory = persistence.loadMatchHistory();
        logger.info(`📊 ${matchHistory.length} matchs chargés`);
    } catch (error) {
        logger.warn('Aucun historique de matchs');
    }

    // Démarrer le serveur
    server.listen(config.server.port, '0.0.0.0', () => {
        logger.section('🚀 Serveur démarré');
        logger.success(`🌍 http://localhost:${config.server.port}`);
        logger.info(`📦 Environnement : ${config.server.env}`);
        logger.info(`👥 ${profileCount} profils chargés`);
        logger.info(`🎮 Prêt à recevoir des connexions`);
        logger.info('');
        logger.info('Appuie sur Ctrl+C pour arrêter');
        logger.info('');
    });
}

// ============================================================
// LANCEMENT
// ============================================================

startServer();

// ============================================================
// EXPORT (pour tests)
// ============================================================

module.exports = {
    app,
    server,
    io
};