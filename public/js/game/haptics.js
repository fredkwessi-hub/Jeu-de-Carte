// =============================================================
// JEU DE CARTES — GAME : HAPTICS (Vibrations)
// =============================================================
// Gestion des vibrations mobiles : feedback tactile,
// patterns spécifiques aux événements du jeu.
// =============================================================

import store from '../state.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const PATTERNS = {
    // Interface
    light: [10],
    medium: [20],
    heavy: [40],
    double: [10, 30, 10],
    triple: [10, 20, 10, 20, 10],

    // Cartes
    cardPlace: [15],
    cardDraw: [10],
    cardShuffle: [5, 10, 5, 10, 5],

    // Événements du jeu
    yourTurn: [50, 30, 50],
    attack: [30, 20, 30, 20, 30],
    block: [20, 10, 40],
    imposed: [15, 10, 15],

    // Victoire / Défaite
    win: [100, 50, 100, 50, 200],
    lose: [200, 100, 200],
    champion: [100, 30, 100, 30, 100, 30, 300],

    // Erreurs / Alertes
    error: [80, 40, 80],
    warning: [40, 20, 40],

    // Notifications
    notification: [20, 10, 20]
};

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    supported: false,
    enabled: true,
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    // Vérifier le support
    state.supported = 'vibrate' in navigator;

    // Charger les préférences
    const settings = store.get('settings', {});
    state.enabled = settings.hapticEnabled !== false;

    if (state.supported) {
        console.log('📳 Vibrations supportées');
    } else {
        console.log('📳 Vibrations non supportées');
    }

    state.initialized = true;
}

/* ============================================================
   VIBRATION
   ============================================================ */

/**
 * Vibre selon un pattern
 * @param {string|Array} pattern - Nom du pattern ou tableau de durées
 */
export function vibrate(pattern) {
    // Vérifications
    if (!state.supported) return false;
    if (!state.enabled) return false;
    if (!store.get('settings.hapticEnabled', true)) return false;

    // Résoudre le pattern
    let vibrationPattern;

    if (typeof pattern === 'string') {
        vibrationPattern = PATTERNS[pattern];
        if (!vibrationPattern) {
            console.warn(`Pattern inconnu: ${pattern}`);
            return false;
        }
    } else if (Array.isArray(pattern)) {
        vibrationPattern = pattern;
    } else if (typeof pattern === 'number') {
        vibrationPattern = [pattern];
    } else {
        return false;
    }

    try {
        return navigator.vibrate(vibrationPattern);
    } catch (error) {
        console.error('Erreur vibration:', error);
        return false;
    }
}

/**
 * Arrête toute vibration en cours
 */
export function stop() {
    if (state.supported) {
        navigator.vibrate(0);
    }
}

/* ============================================================
   PATTERNS PRÉDÉFINIS
   ============================================================ */

// Interface
export const light = () => vibrate('light');
export const medium = () => vibrate('medium');
export const heavy = () => vibrate('heavy');
export const double = () => vibrate('double');
export const triple = () => vibrate('triple');

// Cartes
export const cardPlace = () => vibrate('cardPlace');
export const cardDraw = () => vibrate('cardDraw');
export const cardShuffle = () => vibrate('cardShuffle');

// Événements du jeu
export const yourTurn = () => vibrate('yourTurn');
export const attack = () => vibrate('attack');
export const block = () => vibrate('block');
export const imposed = () => vibrate('imposed');

// Victoire / Défaite
export const win = () => vibrate('win');
export const lose = () => vibrate('lose');
export const champion = () => vibrate('champion');

// Erreurs
export const error = () => vibrate('error');
export const warning = () => vibrate('warning');

// Notifications
export const notification = () => vibrate('notification');

/* ============================================================
   ÉVÉNEMENTS SPÉCIFIQUES
   ============================================================ */

/**
 * Vibre pour un événement de jeu
 */
export function vibrateForEvent(event, data = {}) {
    switch (event) {
        case 'yourTurn':
            return yourTurn();
        case 'attack':
            return attack();
        case 'block':
            return block();
        case 'imposed':
            return imposed();
        case 'win':
            return win();
        case 'lose':
            return lose();
        case 'error':
            return error();
        case 'cardPlayed':
            return cardPlace();
        case 'cardDrawn':
            return cardDraw();
        case 'specialCard':
            return vibrate('heavy');
        default:
            return false;
    }
}

/* ============================================================
   CONTRÔLES
   ============================================================ */

/**
 * Active/désactive les vibrations
 */
export function setEnabled(enabled) {
    state.enabled = enabled;
    store.set('settings.hapticEnabled', enabled);
    store.persist();

    if (!enabled) {
        stop();
    }

    console.log(`📳 Vibrations ${enabled ? 'activées' : 'désactivées'}`);
}

export function isEnabled() {
    return state.enabled && state.supported;
}

export function isSupported() {
    return state.supported;
}

/* ============================================================
   TEST
   ============================================================ */

/**
 * Test toutes les vibrations
 */
export async function testAll() {
    const patterns = ['light', 'medium', 'heavy', 'double', 'triple'];

    for (const pattern of patterns) {
        vibrate(pattern);
        await new Promise(r => setTimeout(r, 500));
    }

    console.log('📳 Test vibrations terminé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    vibrate,
    stop,
    vibrateForEvent,
    setEnabled,
    isEnabled,
    isSupported,
    testAll,

    // Raccourcis
    light,
    medium,
    heavy,
    double,
    triple,
    cardPlace,
    cardDraw,
    cardShuffle,
    yourTurn,
    attack,
    block,
    imposed,
    win,
    lose,
    champion,
    error,
    warning,
    notification,

    // Config
    PATTERNS
};