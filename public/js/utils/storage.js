// =============================================================
// JEU DE CARTES — STORAGE (LocalStorage / SessionStorage)
// =============================================================
// Wrapper avec préfixe, expiration, sérialisation sécurisée.
// =============================================================

const PREFIX = 'jdc_'; // Jeu De Cartes
const DEFAULT_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 jours

/* ============================================================
   UTILITAIRES INTERNES
   ============================================================ */

function getFullKey(key) {
    return `${PREFIX}${key}`;
}

function isStorageAvailable(type) {
    try {
        const storage = window[type];
        const testKey = '__storage_test__';
        storage.setItem(testKey, 'test');
        storage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
}

/* ============================================================
   STORAGE API
   ============================================================ */

class StorageManager {
    constructor(storageType = 'localStorage') {
        this.storage = window[storageType];
        this.available = isStorageAvailable(storageType);
        this.memoryFallback = new Map();

        if (!this.available) {
            console.warn(`⚠️ ${storageType} non disponible, utilisation d'un fallback en mémoire`);
        }
    }

    /**
     * Définit une valeur
     * @param {string} key
     * @param {*} value
     * @param {Object} options - { expiry: ms, } (expiry = durée de vie en ms)
     */
    set(key, value, options = {}) {
        const fullKey = getFullKey(key);
        const expiry = options.expiry || DEFAULT_EXPIRY;

        const wrapper = {
            value,
            createdAt: Date.now(),
            expiresAt: expiry > 0 ? Date.now() + expiry : null
        };

        const serialized = JSON.stringify(wrapper);

        if (this.available) {
            try {
                this.storage.setItem(fullKey, serialized);
            } catch (e) {
                console.error(`Erreur écriture ${key}:`, e);
                // Fallback mémoire si quota dépassé
                this.memoryFallback.set(fullKey, serialized);
            }
        } else {
            this.memoryFallback.set(fullKey, serialized);
        }

        return true;
    }

    /**
     * Récupère une valeur
     * @param {string} key
     * @param {*} defaultValue
     */
    get(key, defaultValue = null) {
        const fullKey = getFullKey(key);

        let serialized;
        if (this.available) {
            serialized = this.storage.getItem(fullKey);
        }
        if (!serialized) {
            serialized = this.memoryFallback.get(fullKey);
        }

        if (!serialized) return defaultValue;

        try {
            const wrapper = JSON.parse(serialized);

            // Vérifier l'expiration
            if (wrapper.expiresAt && Date.now() > wrapper.expiresAt) {
                this.remove(key);
                return defaultValue;
            }

            return wrapper.value;
        } catch (e) {
            console.error(`Erreur lecture ${key}:`, e);
            return defaultValue;
        }
    }

    /**
     * Vérifie l'existence d'une clé
     */
    has(key) {
        const fullKey = getFullKey(key);

        let serialized;
        if (this.available) {
            serialized = this.storage.getItem(fullKey);
        }
        if (!serialized) {
            serialized = this.memoryFallback.get(fullKey);
        }

        if (!serialized) return false;

        try {
            const wrapper = JSON.parse(serialized);
            if (wrapper.expiresAt && Date.now() > wrapper.expiresAt) {
                this.remove(key);
                return false;
            }
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * Supprime une clé
     */
    remove(key) {
        const fullKey = getFullKey(key);
        if (this.available) {
            this.storage.removeItem(fullKey);
        }
        this.memoryFallback.delete(fullKey);
    }

    /**
     * Vide tout le storage de l'app (uniquement nos clés)
     */
    clear() {
        if (this.available) {
            const keysToRemove = [];
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key && key.startsWith(PREFIX)) {
                    keysToRemove.push(key);
                }
            }
            keysToRemove.forEach(key => this.storage.removeItem(key));
        }
        this.memoryFallback.clear();
    }

    /**
     * Récupère toutes les clés de l'app
     */
    keys() {
        const keys = [];
        if (this.available) {
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key && key.startsWith(PREFIX)) {
                    keys.push(key.slice(PREFIX.length));
                }
            }
        }
        // Ajouter celles du fallback mémoire
        this.memoryFallback.forEach((_, key) => {
            if (key.startsWith(PREFIX)) {
                const cleanKey = key.slice(PREFIX.length);
                if (!keys.includes(cleanKey)) keys.push(cleanKey);
            }
        });
        return keys;
    }

    /**
     * Récupère tout sous forme d'objet
     */
    getAll() {
        const result = {};
        this.keys().forEach(key => {
            result[key] = this.get(key);
        });
        return result;
    }

    /**
     * Taille utilisée (en octets)
     */
    size() {
        let total = 0;
        if (this.available) {
            for (let i = 0; i < this.storage.length; i++) {
                const key = this.storage.key(i);
                if (key && key.startsWith(PREFIX)) {
                    const value = this.storage.getItem(key);
                    total += key.length + (value ? value.length : 0);
                }
            }
        }
        return total;
    }

    /**
     * Nettoie les clés expirées
     */
    cleanExpired() {
        let cleaned = 0;
        this.keys().forEach(key => {
            if (!this.has(key)) cleaned++;
        });
        return cleaned;
    }
}

/* ============================================================
   INSTANCES
   ============================================================ */

export const localStore = new StorageManager('localStorage');
export const sessionStore = new StorageManager('sessionStorage');

/* ============================================================
   HELPERS SPÉCIFIQUES AU JEU
   ============================================================ */

/**
 * Clés utilisées dans le storage
 */
export const KEYS = {
    PLAYER_ID: 'player_id',
    USERNAME: 'username',
    AVATAR: 'avatar',
    THEME: 'theme',
    SETTINGS: 'settings',
    LANGUAGE: 'language',
    LAST_GAME: 'last_game',
    FRIENDS: 'friends',
    STATS: 'stats',
    ACHIEVEMENTS: 'achievements',
    SOUND_ENABLED: 'sound_enabled',
    MUSIC_ENABLED: 'music_enabled',
    HAPTIC_ENABLED: 'haptic_enabled',
    NOTIFICATIONS_ENABLED: 'notifications_enabled',
    FIRST_LAUNCH: 'first_launch',
    TUTORIAL_SEEN: 'tutorial_seen'
};

/**
 * Récupère ou crée un player ID persistant
 */
export function getPlayerId() {
    let id = localStore.get(KEYS.PLAYER_ID);
    if (!id) {
        id = `player_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
        localStore.set(KEYS.PLAYER_ID, id, { expiry: 0 }); // Permanent
    }
    return id;
}

/**
 * Récupère les préférences utilisateur
 */
export function getSettings() {
    return localStore.get(KEYS.SETTINGS, {
        theme: 'dark',
        soundEnabled: true,
        musicEnabled: false,
        hapticEnabled: true,
        notificationsEnabled: true,
        language: 'fr'
    });
}

/**
 * Sauvegarde les préférences
 */
export function saveSettings(settings) {
    localStore.set(KEYS.SETTINGS, settings, { expiry: 0 });
}

/**
 * Récupère le pseudo sauvegardé
 */
export function getUsername() {
    return localStore.get(KEYS.USERNAME, '');
}

/**
 * Sauvegarde le pseudo
 */
export function saveUsername(username) {
    localStore.set(KEYS.USERNAME, username, { expiry: 0 });
}

/**
 * Récupère l'avatar sauvegardé
 */
export function getAvatar() {
    return localStore.get(KEYS.AVATAR, 'default');
}

/**
 * Sauvegarde l'avatar
 */
export function saveAvatar(avatar) {
    localStore.set(KEYS.AVATAR, avatar, { expiry: 0 });
}

/**
 * Marque la première visite
 */
export function isFirstLaunch() {
    return !localStore.has(KEYS.FIRST_LAUNCH);
}

export function markFirstLaunch() {
    localStore.set(KEYS.FIRST_LAUNCH, false, { expiry: 0 });
}

/**
 * Efface toutes les données du joueur
 */
export function resetPlayerData() {
    Object.values(KEYS).forEach(key => {
        localStore.remove(key);
    });
    sessionStore.clear();
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    localStore,
    sessionStore,
    KEYS,
    getPlayerId,
    getSettings,
    saveSettings,
    getUsername,
    saveUsername,
    getAvatar,
    saveAvatar,
    isFirstLaunch,
    markFirstLaunch,
    resetPlayerData
};