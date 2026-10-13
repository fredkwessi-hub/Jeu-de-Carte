// =============================================================
// JEU DE CARTES — APP (Point d'entrée principal)
// =============================================================
// Assemble tous les modules, initialise l'application,
// connecte le socket, gère les événements globaux.
// =============================================================

import store, { playerActions, gameActions, uiActions } from './state.js';
import { socket, socketActions } from './socket.js';
import { router, navigateTo, goBack, SCREENS } from './router.js';
import helpers from './utils/helpers.js';
import storage from './utils/storage.js';
import i18n from './utils/i18n.js';

// UI Modules
import lobbyUI from './ui/lobby.js';
import waitingUI from './ui/waiting.js';
import gameUI from './ui/game.js';
import tournamentUI from './ui/tournament.js';
import settingsUI from './ui/settings.js';
import spectatorUI from './ui/spectator.js';
import replayUI from './ui/replay.js';

// Game Modules
import cards from './game/cards.js';
import hand from './game/hand.js';
import animations from './game/animations.js';
import sounds from './game/sounds.js';
import haptics from './game/haptics.js';
import chat from './game/chat.js';

// Tournament Modules
import bracket from './tournament/bracket.js';
import matches from './tournament/matches.js';

// Social Modules
import friends from './social/friends.js';
import reactions from './social/reactions.js';
import rooms from './social/rooms.js';

// Profile Modules
import stats from './profile/stats.js';
import elo from './profile/elo.js';
import avatars from './profile/avatars.js';

/* ============================================================
   ÉTAT GLOBAL DE L'APP
   ============================================================ */

const app = {
    version: '2.0.0',
    initialized: false,
    startedAt: null,
    cleanupCallbacks: []
};

/* ============================================================
   POINT D'ENTRÉE PRINCIPAL
   ============================================================ */

/**
 * Initialise l'application complète
 */
async function init() {
    if (app.initialized) {
        console.warn('⚠️ App déjà initialisée');
        return;
    }

    console.log('🚀 Démarrage de Jeu de Cartes v' + app.version);
    app.startedAt = Date.now();

    try {
        // 1. Initialiser l'UI de base (fond, toasts, etc.)
        await initBaseUI();

        // 2. Hydrater le store depuis localStorage
        store.hydrate();

        // 3. Initialiser i18n
        i18n.init();
        document.documentElement.setAttribute('lang', i18n.getLanguage());

        // 4. Appliquer le thème sauvegardé
        applySavedTheme();

        // 5. Initialiser les modules du jeu
        await initGameModules();

        // 6. Initialiser les modules UI
        await initUIModules();

        // 7. Initialiser les modules profile
        await initProfileModules();

        // 8. Configurer le router
        setupRouter();

        // 9. Connecter le socket
        await connectSocket();

        // 10. Configurer les événements globaux
        setupGlobalEvents();

        // 11. Cacher le splash après un délai
        setTimeout(() => {
            hideSplashScreen();
        }, 1200);

        app.initialized = true;

        const elapsed = Date.now() - app.startedAt;
        console.log(`✅ App prête en ${elapsed}ms`);

        // Émettre un événement
        window.dispatchEvent(new CustomEvent('app:ready'));

    } catch (error) {
        console.error('❌ Erreur d\'initialisation:', error);
        showFatalError(error);
    }
}

/* ============================================================
   INITIALISATION — UI DE BASE
   ============================================================ */

async function initBaseUI() {
    console.log('🎨 Init UI de base');

    // Initialiser les paramètres
    settingsUI.init();
}

/* ============================================================
   INITIALISATION — MODULES DU JEU
   ============================================================ */

async function initGameModules() {
    console.log('🎮 Init modules de jeu');

    // Sons
    sounds.init();

    // Vibrations
    haptics.init();

    // Cartes (rien à init, juste utilitaire)
    // cards.init() n'existe pas, c'est un module utilitaire

    // Main (initialisée quand on entre en jeu)
    // hand.init() sera appelé par gameUI

    // Animations (utilitaire)
    // animations.init() n'existe pas

    // Chat (initialisé quand on entre en jeu)
    // chat.init() sera appelé par gameUI
}

/* ============================================================
   INITIALISATION — MODULES UI
   ============================================================ */

async function initUIModules() {
    console.log('🖥️ Init modules UI');

    // Lobby (peut être initialisé dès le départ)
    lobbyUI.init();
}

/* ============================================================
   INITIALISATION — MODULES PROFILE
   ============================================================ */

async function initProfileModules() {
    console.log('👤 Init modules profile');

    // Avatars
    avatars.init();

    // ELO
    elo.init();

    // Stats
    stats.init();
}

/* ============================================================
   CONFIGURATION DU ROUTER
   ============================================================ */

function setupRouter() {
    console.log('🧭 Configuration du router');

    // Installer les guards par défaut
    router.installDefaultGuards();

    // Enregistrer tous les écrans
    router.registerMany({
        [SCREENS.SPLASH]: {
            onEnter: () => {
                console.log('📺 Écran: splash');
            }
        },
        [SCREENS.LOGIN]: {
            onEnter: () => {
                console.log('📺 Écran: login');
                lobbyUI.init();
            }
        },
        [SCREENS.LOBBY]: {
            onEnter: () => {
                console.log('📺 Écran: lobby');
                lobbyUI.init();
                rooms.init();
            },
            onExit: () => {
                // Nettoyer si nécessaire
            }
        },
        [SCREENS.WAITING]: {
            onEnter: (params) => {
                console.log('📺 Écran: waiting', params);
                waitingUI.init(params);
            },
            onExit: () => {
                waitingUI.destroy();
            }
        },
        [SCREENS.GAME]: {
            onEnter: (params) => {
                console.log('📺 Écran: game', params);
                gameUI.init(params);
                hand.init('#my-hand');
                chat.init();
            },
            onExit: () => {
                gameUI.destroy();
                hand.destroy();
                chat.destroy();
            }
        },
        [SCREENS.TOURNAMENT_WAITING]: {
            onEnter: (params) => {
                console.log('📺 Écran: tournament waiting', params);
                tournamentUI.init(params);
                bracket.init('#bracket-preview-content');
            },
            onExit: () => {
                tournamentUI.destroy();
                bracket.destroy();
            }
        },
        [SCREENS.TOURNAMENT_BRACKET]: {
            onEnter: (params) => {
                console.log('📺 Écran: tournament bracket', params);
                tournamentUI.init(params);
                bracket.init('#bracket-display');
                matches.init();
            },
            onExit: () => {
                tournamentUI.destroy();
                bracket.destroy();
                matches.destroy();
            }
        },
        [SCREENS.SPECTATOR]: {
            onEnter: (params) => {
                console.log('📺 Écran: spectator', params);
                spectatorUI.init(params);
            },
            onExit: () => {
                spectatorUI.destroy();
            }
        },
        [SCREENS.PROFILE]: {
            onEnter: () => {
                console.log('📺 Écran: profile');
                stats.render();
                stats.renderDetailed();
                elo.render();
                elo.renderLevels();
                elo.renderHistory();
                avatars.renderCategorizedSelector('#profile-avatar-selector');
            }
        },
        [SCREENS.FRIENDS]: {
            onEnter: () => {
                console.log('📺 Écran: friends');
                friends.init();
                friends.loadFriends();
            },
            onExit: () => {
                friends.destroy();
            }
        }
    });

    // Initialiser le router
    router.init();
}

/* ============================================================
   CONNEXION SOCKET
   ============================================================ */

async function connectSocket() {
    console.log('🔌 Connexion au serveur...');

    try {
        await socket.connect();

        // Attendre la vraie connexion
        await new Promise((resolve) => {
            if (socket.isSocketConnected()) {
                resolve();
            } else {
                socket.once('socket:connected', resolve);

                // Timeout de sécurité
                setTimeout(resolve, 5000);
            }
        });

        // Si on a un username sauvegardé, s'authentifier
        const savedUsername = storage.getUsername();
        const savedPlayerId = storage.getPlayerId();

        if (savedUsername && savedPlayerId) {
            console.log('👤 Authentification automatique...');
            socket.authenticate(savedPlayerId, savedUsername);

            // Attendre la confirmation
            await new Promise((resolve) => {
                const timeout = setTimeout(resolve, 3000);

                const unsub = socket.on('auth:success', () => {
                    clearTimeout(timeout);
                    unsub();
                    resolve();
                });
            });
        }

        console.log('✅ Socket connecté');

    } catch (error) {
        console.error('❌ Erreur connexion socket:', error);
        // L'app fonctionne quand même en mode offline pour certaines parties
    }
}

/* ============================================================
   ÉVÉNEMENTS GLOBAUX
   ============================================================ */

function setupGlobalEvents() {
    console.log('🌐 Configuration des événements globaux');

    // ===== Navigation =====
    window.addEventListener('navigate', (e) => {
        if (e.detail && e.detail.screen) {
            navigateTo(e.detail.screen, { params: e.detail.params });
        }
    });

    // ===== Connexion / Déconnexion =====
    socket.on('socket:connected', () => {
        console.log('🟢 Connecté');
        showToast('🟢 Connecté au serveur', 'success', 2000);
    });

    socket.on('socket:disconnected', () => {
        console.log('🔴 Déconnecté');
        showToast('🔴 Connexion perdue', 'error');
    });

    socket.on('socket:reconnecting', () => {
        showToast('🔄 Reconnexion...', 'warning');
    });

    socket.on('socket:reconnected', () => {
        showToast('🟢 Reconnecté !', 'success');
    });

    // ===== Reconnexion à une partie =====
    socket.on('reconnect:available', (data) => {
        console.log('🔄 Reconnexion disponible:', data);
        showReconnectionPrompt(data);
    });

    socket.on('reconnect:success', (data) => {
        console.log('✅ Reconnexion réussie:', data);

        if (data.game) {
            store.set('game', data.game);
            navigateTo(SCREENS.GAME, { params: { gameId: data.game.id } });
        } else if (data.tournament) {
            store.set('tournament', data.tournament);
            navigateTo(SCREENS.TOURNAMENT_BRACKET, { params: { tournamentId: data.tournament.id } });
        }
    });

    // ===== Erreurs serveur =====
    socket.on('server:error', (data) => {
        console.error('❌ Erreur serveur:', data);
        showToast(data.message || 'Erreur serveur', 'error');
    });

    // ===== Événements de partie =====
    socket.on('game:created', (data) => {
        console.log('🎮 Partie créée:', data);
        if (data.game) {
            store.set('waiting.gameId', data.gameId);
            store.set('waiting.hostId', data.game.hostId);
            store.set('waiting.players', data.game.players || []);
            store.set('waiting.maxPlayers', data.game.maxPlayers);
            store.set('waiting.isHost', true);

            navigateTo(SCREENS.WAITING, { params: { gameId: data.gameId } });
        }
    });

    socket.on('game:joined', (data) => {
        console.log('🎮 Partie rejointe:', data);
        if (data.game) {
            waitingUI.updateWaitingFromGame(data.game);
            navigateTo(SCREENS.WAITING, { params: { gameId: data.gameId } });
        }
    });

    socket.on('game:started', (data) => {
        console.log('🎮 Partie démarrée');
        if (data.game) {
            store.set('game', normalizeGame(data.game));
            navigateTo(SCREENS.GAME, { params: { gameId: data.game.id } });
        }
    });

    socket.on('game:update', (data) => {
        if (data.game) {
            store.set('game', normalizeGame(data.game));
        }
    });

    socket.on('game:over', (data) => {
        console.log('🏁 Partie terminée');

        // Mettre à jour les stats
        const myId = store.get('player.id');
        const myResult = data.finalRanking?.find(p => p.id === myId);

        if (myResult) {
            stats.updateAfterGame({
                won: myResult.rank === 1,
                rank: myResult.rank,
                duration: data.summary?.duration,
                stats: {
                    cardsPlayed: 0
                }
            });
        }

        // Mettre à jour l'ELO
        if (data.eloChanges && data.eloChanges.newRating) {
            store.set('player.elo', data.eloChanges.newRating);
        }
    });

    // ===== Événements de tournoi =====
    socket.on('tournament:created', (data) => {
        console.log('🏆 Tournoi créé:', data);
        if (data.tournament) {
            store.set('tournament', normalizeTournament(data.tournament));
            navigateTo(SCREENS.TOURNAMENT_WAITING, { params: { tournamentId: data.tournamentId } });
        }
    });

    socket.on('tournament:joined', (data) => {
        console.log('🏆 Tournoi rejoint:', data);
        if (data.tournament) {
            store.set('tournament', normalizeTournament(data.tournament));
            navigateTo(SCREENS.TOURNAMENT_WAITING, { params: { tournamentId: data.tournamentId } });
        }
    });

    socket.on('tournament:started', (data) => {
        console.log('🏆 Tournoi démarré');
        if (data.tournament) {
            store.set('tournament', normalizeTournament(data.tournament));
            navigateTo(SCREENS.TOURNAMENT_BRACKET, { params: { tournamentId: data.tournament.id } });
        }
    });

    socket.on('tournament:update', (data) => {
        if (data.tournament) {
            store.set('tournament', normalizeTournament(data.tournament));
        }
    });

    socket.on('tournament:match_started', (data) => {
        console.log('⚔️ Match démarré:', data);

        // Si c'est notre match, aller à l'écran de jeu
        if (data.game) {
            const myId = store.get('player.id');
            const isMyMatch = data.game.players?.some(p => p.id === myId);

            if (isMyMatch) {
                store.set('game', normalizeGame(data.game));
                navigateTo(SCREENS.GAME, { params: { gameId: data.game.id } });
            }
        }
    });

    socket.on('tournament:finished', (data) => {
        console.log('🏆 Tournoi terminé');
        // L'UI gère l'affichage du modal champion
    });

    // ===== Amis =====
    socket.on('friend_request', (data) => {
        showToast(`📨 ${data.fromName} veut être ton ami !`, 'info');
    });

    socket.on('friend_accepted', (data) => {
        showToast(`✅ ${data.name} a accepté ton amitié !`, 'success');
    });

    // ===== Réactions =====
    socket.on('reaction_received', (data) => {
        if (data && data.emoji) {
            reactions.showReaction?.(data.emoji, data.playerId);
        }
    });

    // ===== Avant de fermer =====
    window.addEventListener('beforeunload', () => {
        console.log('👋 Fermeture de l\'app');
        cleanup();
    });

    // ===== Visibilité de la page =====
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            console.log('📴 App en arrière-plan');
            // Réduire les animations
        } else {
            console.log('📱 App au premier plan');
        }
    });

    // ===== Raccourcis clavier globaux =====
    document.addEventListener('keydown', (e) => {
        // Échap : fermer les modals
        if (e.key === 'Escape') {
            helpers.$$('.modal.active').forEach(m => m.classList.remove('active'));
        }

        // Ctrl+Shift+D : debug
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
            e.preventDefault();
            store.debug();
            router.debug();
            socket.debug();
        }
    });

    // ===== Gestion des erreurs globales =====
    window.addEventListener('error', (e) => {
        console.error('❌ Erreur globale:', e.error || e.message);
    });

    window.addEventListener('unhandledrejection', (e) => {
        console.error('❌ Promesse rejetée:', e.reason);
    });
}

/* ============================================================
   NORMALISATION DES DONNÉES
   ============================================================ */

function normalizeGame(game) {
    const myId = store.get('player.id');
    const myPlayer = game.players?.find(p => p.id === myId);

    return {
        id: game.id,
        status: game.status,
        mode: game.mode || game.settings?.mode,
        players: game.players || [],
        centerCard: game.centerCard,
        bankCount: game.bankCount || 0,
        pileCount: game.pileCount || 0,
        currentPlayerId: game.currentPlayerId,
        currentPlayerIndex: game.currentPlayerIndex || 0,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw || 0,
        skipNext: game.skipNext || false,
        direction: game.direction || 1,
        turnCount: game.turnCount || 0,
        hand: myPlayer?.hand || [],
        selectedCards: [],
        finishedPlayers: game.finishedPlayers || [],
        log: game.log || [],
        chat: game.chat || [],
        isMyTurn: game.currentPlayerId === myId,
        myRank: myPlayer?.rank || null
    };
}

function normalizeTournament(tournament) {
    return {
        id: tournament.id,
        status: tournament.status,
        hostId: tournament.hostId,
        playerCount: tournament.playerCount,
        participants: tournament.participants || [],
        bracket: tournament.bracket || null,
        currentRound: tournament.currentRound || 0,
        totalRounds: tournament.totalRounds || 0,
        matches: tournament.matches || [],
        winner: tournament.winner || null,
        finalRanking: tournament.finalRanking || []
    };
}

/* ============================================================
   SPLASH & ERREURS
   ============================================================ */

function hideSplashScreen() {
    const splash = helpers.$('#screen-splash');
    if (!splash) return;

    // Si le joueur a un pseudo, aller au lobby
    const username = store.get('player.username') || storage.getUsername();
    const isAuthenticated = store.get('player.isAuthenticated');

    if (username && isAuthenticated) {
        navigateTo(SCREENS.LOBBY, { animate: true });
    } else {
        navigateTo(SCREENS.LOGIN, { animate: true });
    }
}

function showFatalError(error) {
    const app = helpers.$('#app');
    if (!app) return;

    app.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; text-align: center;">
      <div style="max-width: 500px;">
        <div style="font-size: 80px; margin-bottom: 20px;">💥</div>
        <h1 style="color: var(--color-danger); margin-bottom: 16px;">Erreur de démarrage</h1>
        <p style="color: var(--text-secondary); margin-bottom: 24px;">
          Une erreur est survenue lors du chargement de l'application.
        </p>
        <pre style="background: var(--bg-card); padding: 16px; border-radius: 12px; text-align: left; font-size: 12px; overflow: auto; max-height: 200px; color: var(--text-secondary);">
${error.message || error}
        </pre>
        <button
          onclick="window.location.reload()"
          class="btn btn-primary"
          style="margin-top: 24px; padding: 14px 32px;"
        >
          🔄 Recharger
        </button>
      </div>
    </div>
  `;
}

/* ============================================================
   RECONNEXION
   ============================================================ */

function showReconnectionPrompt(data) {
    const elapsed = Math.round((data.elapsed || 0) / 1000);
    const remaining = Math.round((data.remaining || 60000) / 1000);

    if (remaining <= 0) return;

    showToast(
        `🔄 Une partie est en cours. Rejoins-la ! (${remaining}s)`,
        'info',
        5000
    );

    // Auto-reconnect après 1 seconde
    setTimeout(() => {
        socketActions.reconnectAttempt();
    }, 1000);
}

/* ============================================================
   APPLIQUER LE THÈME
   ============================================================ */

function applySavedTheme() {
    const settings = store.get('settings', {});
    const theme = settings.theme || 'dark';

    document.documentElement.setAttribute('data-theme', theme);

    // Mettre à jour le bouton de toggle
    const icons = {
        dark: '🌙',
        light: '☀️',
        neon: '💫',
        retro: '📼',
        classic: '🎩',
        cosmic: '🌌'
    };

    const btn = helpers.$('#btn-theme-toggle');
    if (btn) btn.textContent = icons[theme] || '🌙';

    console.log('🎨 Thème appliqué:', theme);
}

/* ============================================================
   TOASTS
   ============================================================ */

function showToast(message, type = 'info', duration = 3500) {
    const container = helpers.$('#toast-container');
    if (!container) return;

    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };

    const toast = helpers.createElement('div', {
        className: `toast ${type}`
    }, [
        helpers.createElement('span', { className: 'toast-icon' }, [icons[type] || 'ℹ️']),
        helpers.createElement('span', { className: 'toast-message' }, [message])
    ]);

    container.appendChild(toast);

    setTimeout(() => {
        toast.classList.add('removing');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

function cleanup() {
    console.log('🧹 Nettoyage de l\'app');

    // Appeler tous les cleanups enregistrés
    app.cleanupCallbacks.forEach(fn => {
        try {
            fn();
        } catch (error) {
            console.error('Erreur cleanup:', error);
        }
    });
    app.cleanupCallbacks = [];

    // Nettoyer les modules
    try {
        lobbyUI.destroy?.();
        waitingUI.destroy?.();
        gameUI.destroy?.();
        tournamentUI.destroy?.();
        spectatorUI.destroy?.();
        replayUI.destroy?.();

        hand.destroy?.();
        chat.destroy?.();
        sounds.destroy?.();
        haptics.destroy?.();

        bracket.destroy?.();
        matches.destroy?.();

        friends.destroy?.();
        reactions.destroy?.();
        rooms.destroy?.();

        stats.destroy?.();
        elo.destroy?.();
        avatars.destroy?.();
    } catch (error) {
        console.error('Erreur cleanup modules:', error);
    }

    // Déconnecter le socket
    socket.disconnect();
}

/**
 * Enregistre un callback de cleanup
 */
function onCleanup(callback) {
    app.cleanupCallbacks.push(callback);
}

/* ============================================================
   API GLOBALE (pour debug)
   ============================================================ */

window.JDC = {
    version: app.version,
    store,
    socket,
    socketActions,
    router,
    navigateTo,
    goBack,
    SCREENS,
    helpers,
    storage,
    i18n,
    sounds,
    animations,
    haptics,
    cards,
    hand,
    chat,
    bracket,
    matches,
    friends,
    reactions,
    rooms,
    stats,
    elo,
    avatars,
    debug: () => {
        console.group('🃏 Jeu de Cartes — Debug');
        console.log('Version:', app.version);
        store.debug();
        router.debug();
        socket.debug();
        console.groupEnd();
    }
};

/* ============================================================
   AUTO-START
   ============================================================ */

// Démarrer quand le DOM est prêt
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    app,
    init,
    cleanup,
    onCleanup,
    showToast,
    normalizeGame,
    normalizeTournament
};