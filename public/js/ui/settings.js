// =============================================================
// JEU DE CARTES — UI : SETTINGS (Paramètres)
// =============================================================
// Gère le modal de paramètres : thème, langue, son, musique,
// vibrations, notifications, réinitialisation.
// =============================================================

import store from '../state.js';
import helpers from '../utils/helpers.js';
import storage from '../utils/storage.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    initialized: false
};

const THEMES = [
    { id: 'dark', label: 'Sombre', emoji: '🌙' },
    { id: 'light', label: 'Clair', emoji: '☀️' },
    { id: 'neon', label: 'Néon', emoji: '💫' },
    { id: 'retro', label: 'Rétro', emoji: '📼' },
    { id: 'classic', label: 'Classique', emoji: '🎩' },
    { id: 'cosmic', label: 'Cosmique', emoji: '🌌' }
];

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('⚙️ Initialisation des paramètres');

    attachEvents();
    syncUIWithSettings();

    state.initialized = true;
    console.log('✅ Paramètres initialisés');
}

/* ============================================================
   OUVERTURE / FERMETURE
   ============================================================ */

export function open() {
    const modal = helpers.$('#modal-settings');
    if (!modal) return;

    syncUIWithSettings();
    modal.classList.add('active');
}

export function close() {
    const modal = helpers.$('#modal-settings');
    if (modal) modal.classList.remove('active');
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Thème
    const themeSelect = helpers.$('#setting-theme');
    if (themeSelect) {
        // Remplir les options
        themeSelect.innerHTML = THEMES.map(t =>
            `<option value="${t.id}">${t.emoji} ${t.label}</option>`
        ).join('');

        themeSelect.addEventListener('change', (e) => {
            setTheme(e.target.value);
        });
    }

    // Sons
    const soundToggle = helpers.$('#setting-sound');
    if (soundToggle) {
        soundToggle.addEventListener('change', (e) => {
            store.set('settings.soundEnabled', e.target.checked);
            store.persist();
        });
    }

    // Musique
    const musicToggle = helpers.$('#setting-music');
    if (musicToggle) {
        musicToggle.addEventListener('change', (e) => {
            store.set('settings.musicEnabled', e.target.checked);
            store.persist();
        });
    }

    // Vibrations
    const hapticToggle = helpers.$('#setting-haptic');
    if (hapticToggle) {
        hapticToggle.addEventListener('change', (e) => {
            store.set('settings.hapticEnabled', e.target.checked);
            store.persist();

            // Test de vibration
            if (e.target.checked && navigator.vibrate) {
                navigator.vibrate(100);
            }
        });
    }

    // Notifications
    const notifToggle = helpers.$('#setting-notifications');
    if (notifToggle) {
        notifToggle.addEventListener('change', async (e) => {
            const enabled = e.target.checked;

            if (enabled && 'Notification' in window) {
                // Demander la permission
                try {
                    const permission = await Notification.requestPermission();
                    if (permission !== 'granted') {
                        e.target.checked = false;
                        showToast('Permission refusée par le navigateur', 'warning');
                        return;
                    }
                } catch (error) {
                    console.error('Erreur permission:', error);
                    e.target.checked = false;
                    return;
                }
            }

            store.set('settings.notificationsEnabled', enabled);
            store.persist();
        });
    }

    // Langue
    const langSelect = helpers.$('#setting-language');
    if (langSelect) {
        // Remplir les options
        const languages = i18n.getAvailableLanguages();
        langSelect.innerHTML = languages.map(l =>
            `<option value="${l.code}">${l.flag} ${l.name}</option>`
        ).join('');

        langSelect.value = i18n.getLanguage();

        langSelect.addEventListener('change', (e) => {
            const lang = e.target.value;
            i18n.setLanguage(lang);
            i18n.translateDOM();

            store.set('settings.language', lang);
            store.persist();

            showToast('Langue changée : ' + lang.toUpperCase(), 'success');
        });
    }

    // Reset des données
    const resetBtn = helpers.$('#btn-reset-data');
    if (resetBtn) {
        resetBtn.addEventListener('click', handleResetData);
    }
}

/* ============================================================
   ACTIONS
   ============================================================ */

function setTheme(themeId) {
    const theme = THEMES.find(t => t.id === themeId);
    if (!theme) return;

    // Mettre à jour le store
    store.set('settings.theme', themeId);
    store.set('ui.theme', themeId);

    // Appliquer au DOM
    document.documentElement.setAttribute('data-theme', themeId);

    // Sauvegarder
    store.persist();

    // Mettre à jour le bouton de toggle (dans le lobby)
    const themeBtn = helpers.$('#btn-theme-toggle');
    if (themeBtn) {
        themeBtn.textContent = theme.emoji;
    }

    showToast(`Thème : ${theme.label}`, 'success');
}

function handleResetData() {
    const confirmed = confirm(
        '⚠️ Réinitialiser TOUTES les données ?\n\n' +
        'Cela effacera :\n' +
        '- Ton profil\n' +
        '- Tes statistiques\n' +
        '- Tes préférences\n' +
        '- Ton historique\n\n' +
        'Cette action est IRRÉVERSIBLE.'
    );

    if (!confirmed) return;

    // Double confirmation
    const reallyConfirmed = confirm('Vraiment sûr ? Cette action ne peut pas être annulée.');
    if (!reallyConfirmed) return;

    // Effacer les données
    storage.resetPlayerData();

    // Recharger la page
    showToast('Données réinitialisées. Redémarrage...', 'success');

    setTimeout(() => {
        window.location.reload();
    }, 1500);
}

/* ============================================================
   SYNCHRONISATION UI ↔ SETTINGS
   ============================================================ */

function syncUIWithSettings() {
    const settings = store.get('settings', {});

    // Thème
    const themeSelect = helpers.$('#setting-theme');
    if (themeSelect) {
        themeSelect.value = settings.theme || 'dark';
    }

    // Sons
    const soundToggle = helpers.$('#setting-sound');
    if (soundToggle) {
        soundToggle.checked = settings.soundEnabled !== false;
    }

    // Musique
    const musicToggle = helpers.$('#setting-music');
    if (musicToggle) {
        musicToggle.checked = settings.musicEnabled === true;
    }

    // Vibrations
    const hapticToggle = helpers.$('#setting-haptic');
    if (hapticToggle) {
        hapticToggle.checked = settings.hapticEnabled !== false;
    }

    // Notifications
    const notifToggle = helpers.$('#setting-notifications');
    if (notifToggle) {
        notifToggle.checked = settings.notificationsEnabled !== false;
    }

    // Langue
    const langSelect = helpers.$('#setting-language');
    if (langSelect) {
        langSelect.value = settings.language || 'fr';
    }
}

/* ============================================================
   UTILITAIRES UI
   ============================================================ */

function showToast(message, type = 'info') {
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
    }, 3500);
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    open,
    close,
    setTheme,
    THEMES
};