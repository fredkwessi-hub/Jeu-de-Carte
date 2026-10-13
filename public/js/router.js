// =============================================================
// JEU DE CARTES — ROUTER (Navigation SPA)
// =============================================================
// Gère les transitions entre les écrans, l'historique, les
// paramètres d'URL et les animations.
// =============================================================

import store from './state.js';
import helpers from './utils/helpers.js';
import i18n from './utils/i18n.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const SCREENS = {
    SPLASH: 'splash',
    LOGIN: 'login',
    LOBBY: 'lobby',
    WAITING: 'waiting',
    GAME: 'game',
    TOURNAMENT_WAITING: 'tournament-waiting',
    TOURNAMENT_BRACKET: 'tournament-bracket',
    SPECTATOR: 'spectator',
    PROFILE: 'profile',
    FRIENDS: 'friends'
};

const TRANSITION_DURATION = 400; // ms

const ROUTES = {
    'splash': { url: '/', hash: '#splash' },
    'login': { url: '/login', hash: '#login' },
    'lobby': { url: '/lobby', hash: '#lobby' },
    'waiting': { url: '/waiting', hash: '#waiting' },
    'game': { url: '/game', hash: '#game' },
    'tournament-waiting': { url: '/tournament', hash: '#tournament' },
    'tournament-bracket': { url: '/bracket', hash: '#bracket' },
    'spectator': { url: '/spectate', hash: '#spectate' },
    'profile': { url: '/profile', hash: '#profile' },
    'friends': { url: '/friends', hash: '#friends' }
};

/* ============================================================
   ROUTER CLASS
   ============================================================ */

class Router {
    constructor() {
        this.currentScreen = null;
        this.previousScreen = null;
        this.transitioning = false;
        this.history = [];
        this.screenHandlers = new Map(); // screenName -> { onEnter, onExit, onUpdate }
        this.guards = []; // Fonctions de garde (ex: auth requise)
        this.initialized = false;
    }

    /* --------------------------------------------------------
       INITIALISATION
       -------------------------------------------------------- */

    init() {
        if (this.initialized) return;

        // Écouter les changements de hash
        window.addEventListener('hashchange', () => this.onHashChange());

        // Écouter le bouton back/forward du navigateur
        window.addEventListener('popstate', () => this.onPopState());

        // Écouter les événements personnalisés
        window.addEventListener('navigate', (e) => {
            if (e.detail && e.detail.screen) {
                this.navigate(e.detail.screen, e.detail.options);
            }
        });

        // Déterminer l'écran initial
        const initialScreen = this.determineInitialScreen();

        // Afficher l'écran initial sans animation
        this.showScreen(initialScreen, { animate: false, updateUrl: false });

        this.initialized = true;
        console.log('🧭 Router initialisé, écran initial:', initialScreen);
    }

    /**
     * Détermine l'écran initial selon l'URL et l'état du joueur
     */
    determineInitialScreen() {
        // 1. Paramètre de hash dans l'URL
        const hash = window.location.hash.slice(1);
        if (hash && Object.values(SCREENS).includes(hash)) {
            return hash;
        }

        // 2. Paramètre de query (?screen=lobby)
        const urlScreen = helpers.getUrlParam('screen');
        if (urlScreen && Object.values(SCREENS).includes(urlScreen)) {
            return urlScreen;
        }

        // 3. État du joueur
        const isAuthenticated = store.get('player.isAuthenticated');
        const username = store.get('player.username');

        if (isAuthenticated || username) {
            return SCREENS.LOBBY;
        }

        // 4. Par défaut : splash
        return SCREENS.SPLASH;
    }

    /* --------------------------------------------------------
       ENREGISTREMENT D'ÉCRANS
       -------------------------------------------------------- */

    /**
     * Enregistre un écran avec ses handlers
     * @param {string} screenName
     * @param {Object} handlers - { onEnter, onExit, onUpdate }
     */
    register(screenName, handlers = {}) {
        this.screenHandlers.set(screenName, handlers);
        console.log(`📺 Écran enregistré: ${screenName}`);
    }

    /**
     * Enregistre plusieurs écrans
     */
    registerMany(screens) {
        Object.entries(screens).forEach(([name, handlers]) => {
            this.register(name, handlers);
        });
    }

    /* --------------------------------------------------------
       NAVIGATION
       -------------------------------------------------------- */

    /**
     * Navigue vers un écran
     * @param {string} screenName
     * @param {Object} options - { animate, updateUrl, params, replace }
     */
    navigate(screenName, options = {}) {
        const {
            animate = true,
            updateUrl = true,
            params = {},
            replace = false
        } = options;

        // Vérifier que l'écran existe
        if (!Object.values(SCREENS).includes(screenName)) {
            console.error(`❌ Écran inconnu: ${screenName}`);
            return false;
        }

        // Vérifier les guards
        const guardResult = this.checkGuards(screenName, params);
        if (guardResult !== true) {
            console.warn(`🚫 Navigation bloquée vers ${screenName}:`, guardResult);
            return false;
        }

        // Éviter la navigation vers le même écran (sauf si params)
        if (this.currentScreen === screenName && !params.force) {
            console.log(`⏭️ Déjà sur l'écran: ${screenName}`);
            return true;
        }

        // Ajouter à l'historique
        if (!replace && this.currentScreen) {
            this.history.push({
                screen: this.currentScreen,
                timestamp: Date.now()
            });
        }

        // Effectuer la transition
        this.showScreen(screenName, { animate, updateUrl, params });

        return true;
    }

    /**
     * Navigue en arrière
     */
    back(fallbackScreen = SCREENS.LOBBY) {
        if (this.history.length > 0) {
            const previous = this.history.pop();
            this.showScreen(previous.screen, { animate: true, updateUrl: true });
            return true;
        }

        // Pas d'historique : fallback
        this.navigate(fallbackScreen, { replace: true });
        return false;
    }

    /**
     * Remplace l'écran actuel
     */
    replace(screenName, options = {}) {
        return this.navigate(screenName, { ...options, replace: true });
    }

    /* --------------------------------------------------------
       AFFICHAGE
       -------------------------------------------------------- */

    /**
     * Affiche un écran avec transition
     */
    showScreen(screenName, options = {}) {
        const { animate = true, updateUrl = true, params = {} } = options;

        if (this.transitioning) {
            console.warn('⏳ Transition en cours, ignoré');
            return;
        }

        this.transitioning = true;

        const previousScreen = this.currentScreen;
        const previousEl = previousScreen ? this.getScreenElement(previousScreen) : null;
        const nextEl = this.getScreenElement(screenName);

        if (!nextEl) {
            console.error(`❌ Élément introuvable pour l'écran: ${screenName}`);
            this.transitioning = false;
            return;
        }

        // Appeler onExit du précédent
        if (previousScreen && this.screenHandlers.has(previousScreen)) {
            const handlers = this.screenHandlers.get(previousScreen);
            if (handlers.onExit) {
                try {
                    handlers.onExit();
                } catch (error) {
                    console.error('Erreur onExit:', error);
                }
            }
        }

        // Mettre à jour le store
        this.previousScreen = previousScreen;
        this.currentScreen = screenName;

        store.batch(() => {
            store.set('ui.previousScreen', previousScreen);
            store.set('ui.currentScreen', screenName);
        });

        // Mettre à jour l'URL
        if (updateUrl) {
            this.updateUrl(screenName, params);
        }

        // Effectuer la transition visuelle
        if (animate && previousEl) {
            this.animateTransition(previousEl, nextEl, () => {
                this.onScreenShown(screenName, params);
            });
        } else {
            // Transition instantanée
            if (previousEl) {
                previousEl.classList.remove('active');
            }
            nextEl.classList.add('active');
            this.onScreenShown(screenName, params);
        }
    }

    /**
     * Animation de transition entre écrans
     */
    animateTransition(fromEl, toEl, callback) {
        // Sortie de l'ancien écran
        fromEl.classList.add('exiting');

        setTimeout(() => {
            fromEl.classList.remove('active');
            fromEl.classList.remove('exiting');

            // Entrée du nouvel écran
            toEl.classList.add('active');

            // Scroll top
            window.scrollTo({ top: 0, behavior: 'instant' });

            setTimeout(() => {
                this.transitioning = false;
                if (callback) callback();
            }, TRANSITION_DURATION);

        }, TRANSITION_DURATION / 2);
    }

    /**
     * Appelé après que l'écran soit affiché
     */
    onScreenShown(screenName, params) {
        // Appeler onEnter du nouvel écran
        if (this.screenHandlers.has(screenName)) {
            const handlers = this.screenHandlers.get(screenName);
            if (handlers.onEnter) {
                try {
                    handlers.onEnter(params);
                } catch (error) {
                    console.error('Erreur onEnter:', error);
                }
            }
        }

        // Traduire le DOM
        i18n.translateDOM();

        // Émettre un événement
        window.dispatchEvent(new CustomEvent('screen:changed', {
            detail: { screen: screenName, params }
        }));

        console.log(`📺 Écran actif: ${screenName}`);
    }

    /* --------------------------------------------------------
       URL & HISTORIQUE
       -------------------------------------------------------- */

    /**
     * Met à jour l'URL
     */
    updateUrl(screenName, params = {}) {
        const route = ROUTES[screenName];
        if (!route) return;

        const url = new URL(window.location);

        // Utiliser le hash (SPA simple)
        url.hash = route.hash;

        // Ajouter les params
        Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined && key !== 'force') {
                url.searchParams.set(key, value);
            }
        });

        // Remplacer l'URL sans recharger
        window.history.replaceState({ screen: screenName, params }, '', url);
    }

    /**
     * Lit l'écran depuis l'URL
     */
    getScreenFromUrl() {
        const hash = window.location.hash.slice(1);
        if (hash && Object.values(SCREENS).includes(hash)) {
            return hash;
        }
        return null;
    }

    /* --------------------------------------------------------
       ÉVÉNEMENTS
       -------------------------------------------------------- */

    onHashChange() {
        const screen = this.getScreenFromUrl();
        if (screen && screen !== this.currentScreen) {
            this.navigate(screen, { replace: true });
        }
    }

    onPopState() {
        const screen = this.getScreenFromUrl();
        if (screen && screen !== this.currentScreen) {
            this.navigate(screen, { replace: true, animate: true });
        }
    }

    /* --------------------------------------------------------
       GUARDS (Sécurité de navigation)
       -------------------------------------------------------- */

    /**
     * Ajoute un guard
     * @param {Function} guardFn - (screenName, params) => true | string (raison)
     */
    addGuard(guardFn) {
        this.guards.push(guardFn);
    }

    /**
     * Vérifie tous les guards
     */
    checkGuards(screenName, params) {
        for (const guard of this.guards) {
            try {
                const result = guard(screenName, params);
                if (result !== true) {
                    return result || 'Bloqué par un guard';
                }
            } catch (error) {
                console.error('Erreur guard:', error);
            }
        }
        return true;
    }

    /**
     * Guard par défaut : auth requise pour certains écrans
     */
    installDefaultGuards() {
        this.addGuard((screenName) => {
            // Écrans nécessitant une authentification
            const authRequired = [
                SCREENS.LOBBY,
                SCREENS.WAITING,
                SCREENS.GAME,
                SCREENS.TOURNAMENT_WAITING,
                SCREENS.TOURNAMENT_BRACKET,
                SCREENS.PROFILE,
                SCREENS.FRIENDS
            ];

            if (authRequired.includes(screenName)) {
                const isAuth = store.get('player.isAuthenticated') || store.get('player.username');
                if (!isAuth) {
                    console.warn('🔒 Authentification requise pour:', screenName);
                    return 'auth_required';
                }
            }

            return true;
        });
    }

    /* --------------------------------------------------------
       UTILITAIRES
       -------------------------------------------------------- */

    /**
     * Récupère l'élément DOM d'un écran
     */
    getScreenElement(screenName) {
        return document.getElementById(`screen-${screenName}`);
    }

    /**
     * Vérifie si un écran est actif
     */
    isActive(screenName) {
        return this.currentScreen === screenName;
    }

    /**
     * Récupère l'écran actuel
     */
    getCurrentScreen() {
        return this.currentScreen;
    }

    /**
     * Récupère l'écran précédent
     */
    getPreviousScreen() {
        return this.previousScreen;
    }

    /**
     * Vérifie si on peut revenir en arrière
     */
    canGoBack() {
        return this.history.length > 0;
    }

    /* --------------------------------------------------------
       DEBUG
       -------------------------------------------------------- */

    debug() {
        console.group('🧭 État du router');
        console.log('Écran actuel:', this.currentScreen);
        console.log('Écran précédent:', this.previousScreen);
        console.log('Historique:', this.history.length, 'entrées');
        console.log('Écrans enregistrés:', Array.from(this.screenHandlers.keys()));
        console.log('Guards:', this.guards.length);
        console.groupEnd();
    }
}

/* ============================================================
   INSTANCE UNIQUE
   ============================================================ */

export const router = new Router();

/* ============================================================
   HELPERS DE NAVIGATION
   ============================================================ */

/**
 * Navigue vers un écran
 */
export function navigateTo(screenName, options = {}) {
    return router.navigate(screenName, options);
}

/**
 * Reviens en arrière
 */
export function goBack(fallback = SCREENS.LOBBY) {
    return router.back(fallback);
}

/**
 * Remplace l'écran actuel
 */
export function replaceScreen(screenName, options = {}) {
    return router.replace(screenName, options);
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    router,
    navigateTo,
    goBack,
    replaceScreen,
    SCREENS
};