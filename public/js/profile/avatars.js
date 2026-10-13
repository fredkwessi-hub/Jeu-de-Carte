// =============================================================
// JEU DE CARTES — PROFILE : AVATARS (Sélection d'avatar)
// =============================================================
// Gestion des avatars : catalogue, sélection, sauvegarde.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';
import storage from '../utils/storage.js';

/* ============================================================
   CATALOGUE D'AVATARS
   ============================================================ */

const AVATARS = {
    // Animaux
    animals: [
        { id: 'dragon', emoji: '🐉', name: 'Dragon' },
        { id: 'fox', emoji: '🦊', name: 'Renard' },
        { id: 'wolf', emoji: '🐺', name: 'Loup' },
        { id: 'owl', emoji: '🦉', name: 'Hibou' },
        { id: 'tiger', emoji: '🐯', name: 'Tigre' },
        { id: 'lion', emoji: '🦁', name: 'Lion' },
        { id: 'frog', emoji: '🐸', name: 'Grenouille' },
        { id: 'octopus', emoji: '🐙', name: 'Poulpe' },
        { id: 'panda', emoji: '🐼', name: 'Panda' },
        { id: 'eagle', emoji: '🦅', name: 'Aigle' },
        { id: 'shark', emoji: '🦈', name: 'Requin' },
        { id: 'butterfly', emoji: '🦋', name: 'Papillon' }
    ],

    // Symboles
    symbols: [
        { id: 'crown', emoji: '👑', name: 'Couronne' },
        { id: 'tophat', emoji: '🎩', name: 'Chapeau' },
        { id: 'bolt', emoji: '⚡', name: 'Éclair' },
        { id: 'fire', emoji: '🔥', name: 'Feu' },
        { id: 'ice', emoji: '❄️', name: 'Glace' },
        { id: 'wave', emoji: '🌊', name: 'Vague' },
        { id: 'storm', emoji: '🌪️', name: 'Tempête' },
        { id: 'sun', emoji: '☀️', name: 'Soleil' },
        { id: 'star', emoji: '🌟', name: 'Étoile' },
        { id: 'rainbow', emoji: '🌈', name: 'Arc-en-ciel' },
        { id: 'target', emoji: '🎯', name: 'Cible' },
        { id: 'dice', emoji: '🎲', name: 'Dé' }
    ],

    // Personnages
    characters: [
        { id: 'robot', emoji: '🤖', name: 'Robot' },
        { id: 'alien', emoji: '👾', name: 'Alien' },
        { id: 'ghost', emoji: '👻', name: 'Fantôme' },
        { id: 'skull', emoji: '💀', name: 'Crâne' },
        { id: 'wizard', emoji: '🧙', name: 'Magicien' },
        { id: 'ninja', emoji: '🥷', name: 'Ninja' },
        { id: 'brain', emoji: '🧠', name: 'Cerveau' },
        { id: 'genie', emoji: '🧞', name: 'Génie' },
        { id: 'vampire', emoji: '🧛', name: 'Vampire' },
        { id: 'superhero', emoji: '🦸', name: 'Super-héros' },
        { id: 'mage', emoji: '🧚', name: 'Fée' },
        { id: 'pirate', emoji: '🏴‍☠️', name: 'Pirate' }
    ]
};

const DEFAULT_AVATAR = '🐉';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    selectedAvatar: DEFAULT_AVATAR,
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('🎭 Initialisation des avatars');

    // Charger la sélection sauvegardée
    const saved = storage.getAvatar();
    if (saved) {
        state.selectedAvatar = saved;
        store.set('player.avatar', saved);
    }

    state.initialized = true;
    console.log('✅ Avatars initialisés, sélection:', state.selectedAvatar);
}

/* ============================================================
   CATALOGUE
   ============================================================ */

/**
 * Récupère tous les avatars disponibles
 */
export function getAllAvatars() {
    return [
        ...AVATARS.animals,
        ...AVATARS.symbols,
        ...AVATARS.characters
    ];
}

/**
 * Récupère les avatars par catégorie
 */
export function getAvatarsByCategory(category) {
    return AVATARS[category] || [];
}

/**
 * Récupère un avatar par son ID
 */
export function getAvatarById(id) {
    const all = getAllAvatars();
    return all.find(a => a.id === id) || null;
}

/**
 * Récupère l'emoji d'un avatar par son ID
 */
export function getAvatarEmoji(id) {
    const avatar = getAvatarById(id);
    return avatar ? avatar.emoji : '👤';
}

/* ============================================================
   SÉLECTION
   ============================================================ */

/**
 * Sélectionne un avatar
 */
export function selectAvatar(avatarId) {
    const avatar = getAvatarById(avatarId);
    if (!avatar) {
        console.warn('Avatar inconnu:', avatarId);
        return false;
    }

    state.selectedAvatar = avatar.emoji;

    // Mettre à jour le store
    store.set('player.avatar', avatar.emoji);

    // Sauvegarder
    storage.saveAvatar(avatar.emoji);
    store.persist();

    console.log('🎭 Avatar sélectionné:', avatar.emoji, avatar.name);

    return true;
}

/**
 * Sélectionne un avatar par emoji directement
 */
export function selectAvatarByEmoji(emoji) {
    const avatar = getAllAvatars().find(a => a.emoji === emoji);
    if (avatar) {
        return selectAvatar(avatar.id);
    }

    // Fallback : accepter n'importe quel emoji
    state.selectedAvatar = emoji;
    store.set('player.avatar', emoji);
    storage.saveAvatar(emoji);
    store.persist();

    return true;
}

/**
 * Récupère l'avatar actuellement sélectionné
 */
export function getSelectedAvatar() {
    return state.selectedAvatar;
}

/**
 * Récupère l'ID de l'avatar sélectionné
 */
export function getSelectedAvatarId() {
    const avatar = getAllAvatars().find(a => a.emoji === state.selectedAvatar);
    return avatar ? avatar.id : null;
}

/**
 * Sélectionne un avatar aléatoire
 */
export function selectRandomAvatar() {
    const all = getAllAvatars();
    const random = helpers.randomItem(all);
    return selectAvatar(random.id);
}

/* ============================================================
   RENDU
   ============================================================ */

/**
 * Rend le sélecteur d'avatars (liste plate)
 */
export function renderSelector(containerSelector = '#avatar-selector', options = {}) {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const {
        showCategories = false,
        columns = 'auto',
        limit = null
    } = options;

    let avatars = getAllAvatars();
    if (limit) avatars = avatars.slice(0, limit);

    container.innerHTML = avatars.map(avatar => {
        const isSelected = avatar.emoji === state.selectedAvatar;

        return `
      <div
        class="avatar-option ${isSelected ? 'selected' : ''}"
        data-avatar-id="${avatar.id}"
        data-avatar-emoji="${avatar.emoji}"
        title="${avatar.name}"
      >
        ${avatar.emoji}
      </div>
    `;
    }).join('');

    // Attacher les clics
    container.querySelectorAll('.avatar-option').forEach(option => {
        option.addEventListener('click', () => {
            const avatarId = option.dataset.avatarId;
            selectAvatar(avatarId);
            updateSelectorUI();
        });
    });
}

/**
 * Rend le sélecteur avec catégories
 */
export function renderCategorizedSelector(containerSelector = '#avatar-selector') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    const categories = [
        { key: 'animals', label: '🐾 Animaux', emoji: '🐾' },
        { key: 'symbols', label: '⭐ Symboles', emoji: '⭐' },
        { key: 'characters', label: '🎭 Personnages', emoji: '🎭' }
    ];

    container.innerHTML = categories.map(cat => `
    <div class="avatar-category">
      <div class="avatar-category-header">${cat.label}</div>
      <div class="avatar-category-grid">
        ${getAvatarsByCategory(cat.key).map(avatar => {
        const isSelected = avatar.emoji === state.selectedAvatar;
        return `
            <div
              class="avatar-option ${isSelected ? 'selected' : ''}"
              data-avatar-id="${avatar.id}"
              data-avatar-emoji="${avatar.emoji}"
              title="${avatar.name}"
            >
              ${avatar.emoji}
            </div>
          `;
    }).join('')}
      </div>
    </div>
  `).join('');

    // Attacher les clics
    container.querySelectorAll('.avatar-option').forEach(option => {
        option.addEventListener('click', () => {
            const avatarId = option.dataset.avatarId;
            selectAvatar(avatarId);
            updateSelectorUI();
        });
    });
}

/**
 * Met à jour l'UI du sélecteur (marque le sélectionné)
 */
function updateSelectorUI() {
    helpers.$$('.avatar-option').forEach(option => {
        option.classList.toggle('selected', option.dataset.avatarEmoji === state.selectedAvatar);
    });
}

/**
 * Rend un aperçu de l'avatar sélectionné
 */
export function renderPreview(containerSelector = '#avatar-preview') {
    const container = helpers.$(containerSelector);
    if (!container) return;

    container.textContent = state.selectedAvatar;
    container.className = 'avatar-preview';
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

/**
 * S'abonne aux changements d'avatar
 */
export function onChange(callback) {
    const unsub = store.subscribe('player.avatar', (newAvatar) => {
        state.selectedAvatar = newAvatar;
        callback(newAvatar);
    });

    state.unsubscribers.push(unsub);
    return unsub;
}

/* ============================================================
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 Avatars nettoyés');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy,
    getAllAvatars,
    getAvatarsByCategory,
    getAvatarById,
    getAvatarEmoji,
    selectAvatar,
    selectAvatarByEmoji,
    getSelectedAvatar,
    getSelectedAvatarId,
    selectRandomAvatar,
    renderSelector,
    renderCategorizedSelector,
    renderPreview,
    onChange,
    AVATARS,
    DEFAULT_AVATAR
};