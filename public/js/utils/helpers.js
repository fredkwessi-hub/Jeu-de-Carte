// =============================================================
// JEU DE CARTES — HELPERS (Fonctions utilitaires)
// =============================================================
// Fonctions pures, sans dépendances, utilisables partout.
// Aucune manipulation du DOM ici.
// =============================================================

/* ============================================================
   SÉLECTION & DOM
   ============================================================ */

/**
 * Sélectionne un élément dans le DOM
 * @param {string} selector - Sélecteur CSS
 * @param {Element} parent - Parent (défaut: document)
 * @returns {Element|null}
 */
export function $(selector, parent = document) {
    return parent.querySelector(selector);
}

/**
 * Sélectionne plusieurs éléments
 * @param {string} selector - Sélecteur CSS
 * @param {Element} parent - Parent (défaut: document)
 * @returns {NodeList}
 */
export function $$(selector, parent = document) {
    return parent.querySelectorAll(selector);
}

/**
 * Crée un élément HTML avec attributs et enfants
 * @param {string} tag - Tag HTML
 * @param {Object} attrs - Attributs
 * @param {Array|string} children - Enfants
 * @returns {Element}
 */
export function createElement(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);

    // Attributs
    Object.entries(attrs).forEach(([key, value]) => {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key === 'dataset' && typeof value === 'object') {
            Object.entries(value).forEach(([k, v]) => {
                el.dataset[k] = v;
            });
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (value === true) {
            el.setAttribute(key, '');
        } else if (value !== false && value != null) {
            el.setAttribute(key, value);
        }
    });

    // Enfants
    const childrenArray = Array.isArray(children) ? children : [children];
    childrenArray.forEach(child => {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    });

    return el;
}

/**
 * Vide un élément
 * @param {Element} el
 */
export function empty(el) {
    if (!el) return;
    while (el.firstChild) {
        el.removeChild(el.firstChild);
    }
}

/**
 * Ajoute/retire une classe avec animation
 * @param {Element} el
 * @param {string} className
 * @param {boolean} add
 */
export function toggleClass(el, className, add) {
    if (!el) return;
    el.classList.toggle(className, add);
}

/* ============================================================
   STRING
   ============================================================ */

/**
 * Capitalise la première lettre
 */
export function capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

/**
 * Met en title case
 */
export function titleCase(str) {
    if (!str) return '';
    return str.split(' ').map(capitalize).join(' ');
}

/**
 * Tronque une chaîne
 */
export function truncate(str, maxLength = 30, suffix = '…') {
    if (!str) return '';
    if (str.length <= maxLength) return str;
    return str.slice(0, maxLength - suffix.length) + suffix;
}

/**
 * Échappe le HTML pour éviter les injections XSS
 */
export function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
}

/**
 * Slugifie une chaîne (URL-safe)
 */
export function slugify(str) {
    if (!str) return '';
    return str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/**
 * Génère un ID unique
 */
export function uid(prefix = 'id') {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
}

/* ============================================================
   NOMBRES
   ============================================================ */

/**
 * Formate un nombre avec séparateurs de milliers
 */
export function formatNumber(num, locale = 'fr-FR') {
    if (typeof num !== 'number') num = Number(num) || 0;
    return num.toLocaleString(locale);
}

/**
 * Formate un pourcentage
 */
export function formatPercent(value, decimals = 0) {
    if (typeof value !== 'number') value = 0;
    return `${value.toFixed(decimals)}%`;
}

/**
 * Clamp une valeur entre min et max
 */
export function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}

/**
 * Arrondit à N décimales
 */
export function round(value, decimals = 0) {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
}

/**
 * Nombre aléatoire entre min et max (inclus)
 */
export function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Élément aléatoire dans un tableau
 */
export function randomItem(array) {
    if (!array || array.length === 0) return null;
    return array[Math.floor(Math.random() * array.length)];
}

/* ============================================================
   DATE & TEMPS
   ============================================================ */

/**
 * Formate une date
 */
export function formatDate(date, options = {}) {
    const d = date instanceof Date ? date : new Date(date);
    const defaultOptions = {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        ...options
    };
    return d.toLocaleDateString('fr-FR', defaultOptions);
}

/**
 * Formate une heure
 */
export function formatTime(date, withSeconds = false) {
    const d = date instanceof Date ? date : new Date(date);
    const options = {
        hour: '2-digit',
        minute: '2-digit'
    };
    if (withSeconds) options.second = '2-digit';
    return d.toLocaleTimeString('fr-FR', options);
}

/**
 * Formate une durée en millisecondes → "2h 30m" ou "45s"
 */
export function formatDuration(ms) {
    if (!ms || ms < 0) return '0s';

    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}j ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
}

/**
 * Temps relatif ("il y a 5 min")
 */
export function timeAgo(date) {
    const d = date instanceof Date ? date : new Date(date);
    const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

    if (seconds < 5) return 'à l\'instant';
    if (seconds < 60) return `il y a ${seconds}s`;
    if (seconds < 3600) return `il y a ${Math.floor(seconds / 60)} min`;
    if (seconds < 86400) return `il y a ${Math.floor(seconds / 3600)} h`;
    if (seconds < 604800) return `il y a ${Math.floor(seconds / 86400)} j`;
    return formatDate(d);
}

/**
 * Compte à rebours formaté (mm:ss)
 */
export function formatCountdown(ms) {
    if (ms < 0) ms = 0;
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

/* ============================================================
   ARRAYS & OBJECTS
   ============================================================ */

/**
 * Mélange un tableau (Fisher-Yates)
 */
export function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

/**
 * Groupe un tableau par clé
 */
export function groupBy(array, keyFn) {
    return array.reduce((acc, item) => {
        const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
        if (!acc[key]) acc[key] = [];
        acc[key].push(item);
        return acc;
    }, {});
}

/**
 * Retire les doublons
 */
export function unique(array) {
    return [...new Set(array)];
}

/**
 * Retire les doublons par clé
 */
export function uniqueBy(array, keyFn) {
    const seen = new Set();
    return array.filter(item => {
        const key = typeof keyFn === 'function' ? keyFn(item) : item[keyFn];
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/**
 * Trie par propriété
 */
export function sortBy(array, keyFn, order = 'asc') {
    const sorted = [...array].sort((a, b) => {
        const aVal = typeof keyFn === 'function' ? keyFn(a) : a[keyFn];
        const bVal = typeof keyFn === 'function' ? keyFn(b) : b[keyFn];
        if (aVal < bVal) return -1;
        if (aVal > bVal) return 1;
        return 0;
    });
    return order === 'desc' ? sorted.reverse() : sorted;
}

/**
 * Divise en chunks
 */
export function chunk(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
        chunks.push(array.slice(i, i + size));
    }
    return chunks;
}

/**
 * Somme des éléments (avec mapper optionnel)
 */
export function sum(array, mapper) {
    return array.reduce((total, item) => {
        const value = mapper ? mapper(item) : item;
        return total + (Number(value) || 0);
    }, 0);
}

/**
 * Moyenne
 */
export function average(array, mapper) {
    if (array.length === 0) return 0;
    return sum(array, mapper) / array.length;
}

/* ============================================================
   OBJETS
   ============================================================ */

/**
 * Clone profond
 */
export function deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj);
    if (Array.isArray(obj)) return obj.map(deepClone);

    const clone = {};
    Object.keys(obj).forEach(key => {
        clone[key] = deepClone(obj[key]);
    });
    return clone;
}

/**
 * Fusion profonde
 */
export function deepMerge(target, source) {
    const output = { ...target };

    Object.keys(source).forEach(key => {
        const sourceVal = source[key];
        const targetVal = target[key];

        if (isObject(sourceVal) && isObject(targetVal)) {
            output[key] = deepMerge(targetVal, sourceVal);
        } else {
            output[key] = sourceVal;
        }
    });

    return output;
}

/**
 * Vérifie si c'est un objet simple
 */
export function isObject(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Pick des clés d'un objet
 */
export function pick(obj, keys) {
    const result = {};
    keys.forEach(key => {
        if (key in obj) result[key] = obj[key];
    });
    return result;
}

/**
 * Omit des clés d'un objet
 */
export function omit(obj, keys) {
    const result = { ...obj };
    keys.forEach(key => delete result[key]);
    return result;
}

/* ============================================================
   ASYNC
   ============================================================ */

/**
 * Attend N millisecondes
 */
export function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry une fonction async
 */
export async function retry(fn, maxAttempts = 3, delay = 1000) {
    let lastError;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await fn();
        } catch (error) {
            lastError = error;
            if (attempt < maxAttempts) {
                await sleep(delay * attempt);
            }
        }
    }
    throw lastError;
}

/**
 * Debounce
 */
export function debounce(fn, delay = 300) {
    let timeoutId;
    return function(...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => fn.apply(this, args), delay);
    };
}

/**
 * Throttle
 */
export function throttle(fn, limit = 300) {
    let inThrottle = false;
    return function(...args) {
        if (!inThrottle) {
            fn.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

/* ============================================================
   URL & QUERY
   ============================================================ */

/**
 * Récupère un paramètre d'URL
 */
export function getUrlParam(name) {
    return new URLSearchParams(window.location.search).get(name);
}

/**
 * Récupère tous les paramètres d'URL
 */
export function getUrlParams() {
    const params = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
        params[key] = value;
    });
    return params;
}

/**
 * Met à jour l'URL sans recharger
 */
export function setUrlParam(name, value) {
    const url = new URL(window.location);
    if (value === null || value === undefined) {
        url.searchParams.delete(name);
    } else {
        url.searchParams.set(name, value);
    }
    window.history.replaceState({}, '', url);
}

/* ============================================================
   VALIDATION
   ============================================================ */

/**
 * Vérifie si c'est un email valide
 */
export function isEmail(str) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
}

/**
 * Vérifie si c'est un pseudo valide
 */
export function isValidUsername(str) {
    if (typeof str !== 'string') return false;
    const len = str.trim().length;
    return len >= 2 && len <= 20;
}

/**
 * Vérifie si un objet est vide
 */
export function isEmpty(obj) {
    if (obj == null) return true;
    if (Array.isArray(obj) || typeof obj === 'string') return obj.length === 0;
    if (obj instanceof Map || obj instanceof Set) return obj.size === 0;
    return Object.keys(obj).length === 0;
}

/* ============================================================
   COULEURS & VISUEL
   ============================================================ */

/**
 * Récupère une variable CSS
 */
export function getCSSVar(name, element = document.documentElement) {
    return getComputedStyle(element).getPropertyValue(name).trim();
}

/**
 * Définit une variable CSS
 */
export function setCSSVar(name, value, element = document.documentElement) {
    element.style.setProperty(name, value);
}

/**
 * Génère une couleur HSL aléatoire
 */
export function randomColor(saturation = 70, lightness = 60) {
    const hue = Math.floor(Math.random() * 360);
    return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

/**
 * Convertit un hex en rgb
 */
export function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return null;
    return {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    };
}

/* ============================================================
   PERFORMANCE
   ============================================================ */

/**
 * Mesure le temps d'exécution d'une fonction
 */
export function measure(label, fn) {
    const start = performance.now();
    const result = fn();
    const duration = performance.now() - start;
    console.log(`⏱️ ${label}: ${duration.toFixed(2)}ms`);
    return result;
}

/**
 * Prépare une fonction pour requestAnimationFrame
 */
export function rafThrottle(fn) {
    let scheduled = false;
    return function(...args) {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            fn.apply(this, args);
            scheduled = false;
        });
    };
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

/**
 * Crée un EventEmitter simple
 */
export class EventEmitter {
    constructor() {
        this.events = new Map();
    }

    on(event, listener) {
        if (!this.events.has(event)) {
            this.events.set(event, []);
        }
        this.events.get(event).push(listener);
        return () => this.off(event, listener);
    }

    off(event, listener) {
        if (!this.events.has(event)) return;
        const listeners = this.events.get(event);
        const index = listeners.indexOf(listener);
        if (index > -1) listeners.splice(index, 1);
    }

    once(event, listener) {
        const wrapper = (...args) => {
            listener(...args);
            this.off(event, wrapper);
        };
        return this.on(event, wrapper);
    }

    emit(event, ...args) {
        if (!this.events.has(event)) return;
        this.events.get(event).forEach(listener => {
            try {
                listener(...args);
            } catch (error) {
                console.error(`Erreur dans l'écouteur "${event}":`, error);
            }
        });
    }

    removeAllListeners(event) {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }
}

/* ============================================================
   EMOJI
   ============================================================ */

/**
 * Récupère le symbole d'une couleur
 */
export function getSuitSymbol(suit) {
    const symbols = {
        pique: '♠',
        carreau: '♦',
        coeur: '♥',
        trefle: '♣'
    };
    return symbols[suit] || '?';
}

/**
 * Récupère la couleur (red/black) d'une couleur
 */
export function getSuitColor(suit) {
    const colors = {
        pique: 'black',
        carreau: 'red',
        coeur: 'red',
        trefle: 'black'
    };
    return colors[suit] || 'black';
}

/**
 * Récupère l'emoji d'un rang
 */
export function getRankEmoji(rank) {
    const emojis = {
        'JOKER': '🃏',
        'A': '🅰️',
        '7': '7️⃣',
        'J': '🎭',
        'K': '👑',
        'Q': '👸'
    };
    return emojis[rank] || null;
}

/* ============================================================
   EXPORT DEFAULT (objet global)
   ============================================================ */

export default {
    // DOM
    $,
    $$,
    createElement,
    empty,
    toggleClass,

    // String
    capitalize,
    titleCase,
    truncate,
    escapeHtml,
    slugify,
    uid,

    // Nombres
    formatNumber,
    formatPercent,
    clamp,
    round,
    randomInt,
    randomItem,

    // Date
    formatDate,
    formatTime,
    formatDuration,
    timeAgo,
    formatCountdown,

    // Arrays
    shuffle,
    groupBy,
    unique,
    uniqueBy,
    sortBy,
    chunk,
    sum,
    average,

    // Objects
    deepClone,
    deepMerge,
    isObject,
    pick,
    omit,

    // Async
    sleep,
    retry,
    debounce,
    throttle,

    // URL
    getUrlParam,
    getUrlParams,
    setUrlParam,

    // Validation
    isEmail,
    isValidUsername,
    isEmpty,

    // Couleurs & visuel
    getCSSVar,
    setCSSVar,
    randomColor,
    hexToRgb,

    // Performance
    measure,
    rafThrottle,

    // Events
    EventEmitter,

    // Jeu de cartes
    getSuitSymbol,
    getSuitColor,
    getRankEmoji
};