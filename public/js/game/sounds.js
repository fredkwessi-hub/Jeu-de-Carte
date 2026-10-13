// =============================================================
// JEU DE CARTES — GAME : SOUNDS (Gestion audio)
// =============================================================
// Gestion complète des sons : chargement, lecture, volumes,
// musique de fond, effets sonores.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';

/* ============================================================
   CONFIGURATION
   ============================================================ */

const SOUNDS = {
    // Interface
    click: { src: '/assets/audio/click.mp3', volume: 0.3 },
    hover: { src: '/assets/audio/hover.mp3', volume: 0.15 },

    // Cartes
    cardPlace: { src: '/assets/audio/card-place.mp3', volume: 0.5 },
    cardDraw: { src: '/assets/audio/card-draw.mp3', volume: 0.5 },
    cardShuffle: { src: '/assets/audio/card-shuffle.mp3', volume: 0.6 },

    // Cartes spéciales
    specialJoker: { src: '/assets/audio/special-joker.mp3', volume: 0.6 },
    specialSeven: { src: '/assets/audio/special-seven.mp3', volume: 0.6 },
    specialAce: { src: '/assets/audio/special-ace.mp3', volume: 0.6 },
    specialJack: { src: '/assets/audio/special-jack.mp3', volume: 0.6 },
    specialKing: { src: '/assets/audio/special-king.mp3', volume: 0.6 },

    // Notification
    turnDing: { src: '/assets/audio/turn-ding.mp3', volume: 0.5 },
    notification: { src: '/assets/audio/notification.mp3', volume: 0.4 },
    error: { src: '/assets/audio/error.mp3', volume: 0.4 },

    // Victoire / Défaite
    win: { src: '/assets/audio/win.mp3', volume: 0.7 },
    lose: { src: '/assets/audio/lose.mp3', volume: 0.5 },
    champion: { src: '/assets/audio/champion.mp3', volume: 0.8 },

    // Musique (loop)
    music: { src: '/assets/audio/ambient.mp3', volume: 0.2, loop: true }
};

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    loaded: new Map(),       // name -> Audio
    playing: new Map(),      // name -> Audio (pour les loops)
    musicPlaying: false,
    musicElement: null,
    masterVolume: 1,
    audioContext: null,
    unlocked: false,
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('🔊 Initialisation audio');

    // Charger les préférences
    const settings = store.get('settings', {});
    state.masterVolume = settings.soundEnabled !== false ? 1 : 0;

    // Débloquer l'audio au premier clic
    setupAudioUnlock();

    state.initialized = true;
    console.log('✅ Audio initialisé');
}

/**
 * Débloque l'audio au premier geste utilisateur (obligation navigateur)
 */
function setupAudioUnlock() {
    const unlock = () => {
        if (state.unlocked) return;

        // Créer un AudioContext silencieux pour débloquer
        try {
            if (!state.audioContext) {
                state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            if (state.audioContext.state === 'suspended') {
                state.audioContext.resume();
            }

            state.unlocked = true;
            console.log('🔓 Audio débloqué');

            // Retirer les listeners
            document.removeEventListener('click', unlock);
            document.removeEventListener('touchstart', unlock);
            document.removeEventListener('keydown', unlock);

            // Démarrer la musique si activée
            const settings = store.get('settings', {});
            if (settings.musicEnabled) {
                playMusic();
            }
        } catch (error) {
            console.error('Erreur déblocage audio:', error);
        }
    };

    document.addEventListener('click', unlock);
    document.addEventListener('touchstart', unlock);
    document.addEventListener('keydown', unlock);
}

/* ============================================================
   CHARGEMENT
   ============================================================ */

/**
 * Précharge un son
 */
export function preload(name) {
    const config = SOUNDS[name];
    if (!config) {
        console.warn(`Son inconnu: ${name}`);
        return Promise.resolve();
    }

    if (state.loaded.has(name)) {
        return Promise.resolve(state.loaded.get(name));
    }

    return new Promise((resolve, reject) => {
        const audio = new Audio();

        audio.addEventListener('canplaythrough', () => {
            state.loaded.set(name, audio);
            resolve(audio);
        }, { once: true });

        audio.addEventListener('error', (error) => {
            // Silencieux : les sons ne sont pas critiques
            state.loaded.set(name, null);
            resolve(null);
        }, { once: true });

        audio.src = config.src;
        audio.preload = 'auto';
        audio.load();
    });
}

/**
 * Précharge tous les sons
 */
export async function preloadAll() {
    const promises = Object.keys(SOUNDS).map(name => preload(name));
    await Promise.allSettled(promises);
    console.log(`🔊 ${state.loaded.size} sons préchargés`);
}

/* ============================================================
   LECTURE
   ============================================================ */

/**
 * Joue un son
 * @param {string} name - Nom du son
 * @param {Object} options - { volume, loop, restart }
 */
export function play(name, options = {}) {
    const config = SOUNDS[name];
    if (!config) {
        console.warn(`Son inconnu: ${name}`);
        return null;
    }

    // Vérifier si les sons sont activés
    const settings = store.get('settings', {});
    if (settings.soundEnabled === false && !config.loop) {
        return null;
    }

    // Vérifier si l'audio est débloqué
    if (!state.unlocked) {
        // Réessayer après déblocage
        setTimeout(() => play(name, options), 500);
        return null;
    }

    try {
        // Pour les loops, vérifier si déjà en lecture
        if (config.loop && state.playing.has(name) && !options.restart) {
            return state.playing.get(name);
        }

        // Créer l'audio
        const audio = new Audio(config.src);

        // Appliquer le volume
        const volume = (options.volume ?? config.volume ?? 1) * state.masterVolume;
        audio.volume = Math.max(0, Math.min(1, volume));

        // Loop
        if (options.loop || config.loop) {
            audio.loop = true;
            state.playing.set(name, audio);
        }

        // Jouer
        const playPromise = audio.play();

        if (playPromise !== undefined) {
            playPromise.catch(error => {
                // Autoplay bloqué : ignorer silencieusement
            });
        }

        return audio;
    } catch (error) {
        console.error(`Erreur lecture son "${name}":`, error);
        return null;
    }
}

/**
 * Arrête un son en cours
 */
export function stop(name) {
    const audio = state.playing.get(name);
    if (audio) {
        audio.pause();
        audio.currentTime = 0;
        state.playing.delete(name);
    }
}

/**
 * Arrête tous les sons
 */
export function stopAll() {
    state.playing.forEach((audio, name) => {
        audio.pause();
        audio.currentTime = 0;
    });
    state.playing.clear();
}

/* ============================================================
   SONS PRÉDÉFINIS
   ============================================================ */

// Interface
export const playClick = () => play('click');
export const playHover = () => play('hover');

// Cartes
export const playCardPlace = () => play('cardPlace');
export const playCardDraw = () => play('cardDraw');
export const playCardShuffle = () => play('cardShuffle');

// Cartes spéciales
export const playSpecialJoker = () => play('specialJoker');
export const playSpecialSeven = () => play('specialSeven');
export const playSpecialAce = () => play('specialAce');
export const playSpecialJack = () => play('specialJack');
export const playSpecialKing = () => play('specialKing');

/**
 * Joue le son correspondant à une carte spéciale
 */
export function playSpecialCardSound(type) {
    switch (type) {
        case 'joker': return playSpecialJoker();
        case 'seven': return playSpecialSeven();
        case 'ace': return playSpecialAce();
        case 'jack': return playSpecialJack();
        case 'king': return playSpecialKing();
        default: return null;
    }
}

// Notification
export const playTurnDing = () => play('turnDing');
export const playNotification = () => play('notification');
export const playError = () => play('error');

// Victoire / Défaite
export const playWin = () => play('win');
export const playLose = () => play('lose');
export const playChampion = () => play('champion');

/* ============================================================
   MUSIQUE DE FOND
   ============================================================ */

/**
 * Démarre la musique de fond
 */
export function playMusic() {
    if (state.musicPlaying) return;

    const settings = store.get('settings', {});
    if (!settings.musicEnabled) return;

    const audio = play('music', { loop: true, restart: false });
    if (audio) {
        state.musicPlaying = true;
        state.musicElement = audio;
    }
}

/**
 * Arrête la musique de fond
 */
export function stopMusic() {
    if (!state.musicPlaying) return;

    stop('music');
    state.musicPlaying = false;
    state.musicElement = null;
}

/**
 * Toggle la musique
 */
export function toggleMusic() {
    if (state.musicPlaying) {
        stopMusic();
    } else {
        playMusic();
    }
}

/* ============================================================
   VOLUME
   ============================================================ */

/**
 * Définit le volume master (0 à 1)
 */
export function setMasterVolume(volume) {
    state.masterVolume = helpers.clamp(volume, 0, 1);

    // Appliquer à tous les sons en cours
    state.playing.forEach(audio => {
        const config = SOUNDS.music; // Par défaut
        audio.volume = state.masterVolume;
    });

    // Appliquer à la musique
    if (state.musicElement) {
        state.musicElement.volume = state.masterVolume * 0.2;
    }
}

export function getMasterVolume() {
    return state.masterVolume;
}

/**
 * Active/désactive tous les sons
 */
export function setSoundEnabled(enabled) {
    const settings = store.get('settings', {});
    store.set('settings.soundEnabled', enabled);
    store.persist();

    if (!enabled) {
        stopAll();
    }

    console.log(`🔊 Sons ${enabled ? 'activés' : 'désactivés'}`);
}

/* ============================================================
   PRÉCHARGEMENT SPÉCIFIQUE
   ============================================================ */

/**
 * Précharge les sons du jeu (essentiels)
 */
export function preloadGameSounds() {
    const essentials = ['cardPlace', 'cardDraw', 'turnDing', 'specialJoker', 'specialSeven'];
    essentials.forEach(name => preload(name));
}

/**
 * Précharge les sons de l'interface
 */
export function preloadUISounds() {
    const uiSounds = ['click', 'hover', 'notification', 'error'];
    uiSounds.forEach(name => preload(name));
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    stopAll();
    stopMusic();
    state.loaded.clear();
    state.playing.clear();
    state.initialized = false;
    console.log('🧹 Audio nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    preload,
    preloadAll,
    preloadGameSounds,
    preloadUISounds,
    play,
    stop,
    stopAll,

    // Raccourcis
    playClick,
    playHover,
    playCardPlace,
    playCardDraw,
    playCardShuffle,
    playSpecialJoker,
    playSpecialSeven,
    playSpecialAce,
    playSpecialJack,
    playSpecialKing,
    playSpecialCardSound,
    playTurnDing,
    playNotification,
    playError,
    playWin,
    playLose,
    playChampion,

    // Musique
    playMusic,
    stopMusic,
    toggleMusic,

    // Volume
    setMasterVolume,
    getMasterVolume,
    setSoundEnabled,

    // Config
    SOUNDS
};