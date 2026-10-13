// =============================================================
// JEU DE CARTES — UI : LOBBY
// =============================================================
// Gère l'écran de login, le lobby principal, les stats,
// les parties publiques, le classement et les succès.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import { router, navigateTo, SCREENS } from '../router.js';
import helpers from '../utils/helpers.js';
import storage from '../utils/storage.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    avatars: [
        '🐉', '🦊', '🐺', '🦉', '🐯', '🦁', '🐸', '🐙',
        '🎩', '👑', '⚡', '🔥', '❄️', '🌊', '🌪️', '☀️',
        '🌟', '🌈', '🎯', '🎲', '🎪', '👾', '🤖', '🧠'
    ],
    selectedAvatar: '🐉',
    unsubscribers: [],
    initialized: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init() {
    if (state.initialized) return;

    console.log('🎨 Initialisation du lobby UI');

    // Restaurer les préférences
    const savedUsername = storage.getUsername();
    const savedAvatar = storage.getAvatar();

    if (savedUsername) {
        const input = helpers.$('#input-username');
        if (input) input.value = savedUsername;
    }

    state.selectedAvatar = savedAvatar || '🐉';

    // Attacher les événements
    attachLoginEvents();
    attachLobbyEvents();
    attachModalEvents();

    // Générer les avatars
    renderAvatarSelector();

    // S'abonner aux changements d'état
    setupSubscriptions();

    // Rafraîchir le UI
    refreshProfileUI();
    refreshStatsUI();

    state.initialized = true;
    console.log('✅ Lobby UI initialisé');
}

/* ============================================================
   ÉVÉNEMENTS LOGIN
   ============================================================ */

function attachLoginEvents() {
    // Bouton jouer
    const playBtn = helpers.$('#btn-login');
    if (playBtn) {
        playBtn.addEventListener('click', handleLogin);
    }

    // Input username (Enter pour valider)
    const usernameInput = helpers.$('#input-username');
    if (usernameInput) {
        usernameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleLogin();
            }
        });

        // Effacer l'erreur en tapant
        usernameInput.addEventListener('input', () => {
            hideUsernameError();
        });
    }

    // Bouton nom aléatoire
    const randomBtn = helpers.$('#btn-random-name');
    if (randomBtn) {
        randomBtn.addEventListener('click', generateRandomName);
    }

    // Avatar selector
    const avatarSelector = helpers.$('#avatar-selector');
    if (avatarSelector) {
        avatarSelector.addEventListener('click', (e) => {
            const option = e.target.closest('.avatar-option');
            if (option) {
                selectAvatar(option.dataset.avatar);
            }
        });
    }
}

/* ============================================================
   LOGIN
   ============================================================ */

async function handleLogin() {
    const input = helpers.$('#input-username');
    const username = input.value.trim();

    // Validation
    if (!username) {
        showUsernameError(i18n.t('login.error_empty'));
        input.focus();
        return;
    }

    if (username.length < 2) {
        showUsernameError(i18n.t('login.error_short'));
        input.focus();
        return;
    }

    if (username.length > 20) {
        showUsernameError(i18n.t('login.error_long'));
        input.focus();
        return;
    }

    hideUsernameError();

    // Désactiver le bouton
    const playBtn = helpers.$('#btn-login');
    playBtn.disabled = true;
    playBtn.innerHTML = `
    <span class="btn-shine"></span>
    <span class="btn-icon">⏳</span>
    <span class="btn-text">${i18n.t('common.loading')}</span>
  `;

    try {
        // Générer ou récupérer le player ID
        const playerId = storage.getPlayerId();

        // Sauvegarder en local
        storage.saveUsername(username);
        storage.saveAvatar(state.selectedAvatar);

        // Mettre à jour le store
        store.batch(() => {
            store.merge('player', {
                id: playerId,
                username: username,
                avatar: state.selectedAvatar,
                isAuthenticated: true
            });
        });

        // Se connecter au serveur
        if (!socket.isSocketConnected()) {
            await socket.connect();
        }

        // S'authentifier
        socket.authenticate(playerId, username, state.selectedAvatar);

        // Attendre la confirmation d'authentification
        await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                reject(new Error('Timeout authentification'));
            }, 5000);

            const unsub = socket.on('auth:success', (data) => {
                clearTimeout(timeout);
                unsub();
                resolve(data);
            });

            const unsubError = socket.on('server:error', (data) => {
                clearTimeout(timeout);
                unsubError();
                reject(new Error(data.message || 'Erreur serveur'));
            });
        });

        // Naviguer vers le lobby
        navigateTo(SCREENS.LOBBY);

        // Rafraîchir le UI
        refreshProfileUI();

        // Charger les données du lobby
        loadLobbyData();

    } catch (error) {
        console.error('❌ Erreur login:', error);
        showUsernameError(i18n.t('error.connection'));

        // Réactiver le bouton
        playBtn.disabled = false;
        playBtn.innerHTML = `
      <span class="btn-shine"></span>
      <span class="btn-icon">🚀</span>
      <span class="btn-text">${i18n.t('login.play_button')}</span>
    `;
    }
}

function showUsernameError(message) {
    const errorEl = helpers.$('#username-error');
    if (errorEl) {
        errorEl.textContent = message;
        errorEl.classList.remove('hidden');
    }

    const input = helpers.$('#input-username');
    if (input) {
        input.classList.add('error');
    }
}

function hideUsernameError() {
    const errorEl = helpers.$('#username-error');
    if (errorEl) {
        errorEl.classList.add('hidden');
    }

    const input = helpers.$('#input-username');
    if (input) {
        input.classList.remove('error');
    }
}

function generateRandomName() {
    const adjectives = ['Dragon', 'Tigre', 'Aigle', 'Loup', 'Renard', 'Faucon', 'Lion', 'Panthère'];
    const nouns = ['Master', 'King', 'Lord', 'Hunter', 'Warrior', 'Champion', 'Legend', 'Hero'];
    const numbers = Math.floor(Math.random() * 99) + 1;

    const name = `${helpers.randomItem(adjectives)}${helpers.randomItem(nouns)}${numbers}`;

    const input = helpers.$('#input-username');
    if (input) {
        input.value = name;
        input.focus();
        hideUsernameError();
    }
}

/* ============================================================
   AVATAR SELECTOR
   ============================================================ */

function renderAvatarSelector() {
    const container = helpers.$('#avatar-selector');
    if (!container) return;

    container.innerHTML = state.avatars.map(emoji => `
    <div class="avatar-option ${emoji === state.selectedAvatar ? 'selected' : ''}" data-avatar="${emoji}">
      ${emoji}
    </div>
  `).join('');
}

function selectAvatar(emoji) {
    state.selectedAvatar = emoji;

    // Mettre à jour l'UI
    helpers.$$('.avatar-option').forEach(el => {
        el.classList.toggle('selected', el.dataset.avatar === emoji);
    });
}

/* ============================================================
   LOBBY — ÉVÉNEMENTS
   ============================================================ */

function attachLobbyEvents() {
    // Bouton "Partie rapide"
    const quickPlayBtn = helpers.$('#btn-quick-play');
    if (quickPlayBtn) {
        quickPlayBtn.addEventListener('click', handleQuickPlay);
    }

    // Bouton "Créer une partie"
    const createBtn = helpers.$('#btn-create-game');
    if (createBtn) {
        createBtn.addEventListener('click', handleCreateGame);
    }

    // Bouton "Rejoindre"
    const joinBtn = helpers.$('#btn-join-game');
    if (joinBtn) {
        joinBtn.addEventListener('click', openJoinModal);
    }

    // Bouton "Championnat"
    const tournamentBtn = helpers.$('#btn-tournament');
    if (tournamentBtn) {
        tournamentBtn.addEventListener('click', openTournamentModal);
    }

    // Bouton "Changer de thème"
    const themeBtn = helpers.$('#btn-theme-toggle');
    if (themeBtn) {
        themeBtn.addEventListener('click', toggleTheme);
    }

    // Bouton "Paramètres"
    const settingsBtn = helpers.$('#btn-settings');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', () => {
            // Import dynamique pour éviter la dépendance circulaire
            import('./settings.js').then(module => {
                module.open();
            });
        });
    }

    // Bouton "Notifications"
    const notifBtn = helpers.$('#btn-notifications');
    if (notifBtn) {
        notifBtn.addEventListener('click', () => {
            helpers.$('#notifications-modal')?.classList.add('active');
        });
    }

    // Mini profil → ouvrir le profil
    const miniProfile = helpers.$('#player-mini-profile');
    if (miniProfile) {
        miniProfile.addEventListener('click', () => {
            navigateTo(SCREENS.PROFILE);
        });
    }

    // Bouton "Actualiser" les parties
    const refreshRoomsBtn = helpers.$('#btn-refresh-rooms');
    if (refreshRoomsBtn) {
        refreshRoomsBtn.addEventListener('click', loadPublicRooms);
    }

    // Bouton "Voir tout" classement
    const leaderboardBtn = helpers.$('#btn-view-leaderboard');
    if (leaderboardBtn) {
        leaderboardBtn.addEventListener('click', () => {
            loadFullLeaderboard();
        });
    }

    // Bouton "Voir tout" succès
    const achievementsBtn = helpers.$('#btn-view-achievements');
    if (achievementsBtn) {
        achievementsBtn.addEventListener('click', () => {
            navigateTo(SCREENS.PROFILE);
        });
    }

    // Bottom nav
    helpers.$$('.bottom-nav-item').forEach(item => {
        item.addEventListener('click', () => {
            const nav = item.dataset.nav;
            handleBottomNav(nav);
        });
    });
}

function handleBottomNav(nav) {
    switch (nav) {
        case 'home':
            // Déjà sur home
            break;
        case 'friends':
            navigateTo(SCREENS.FRIENDS);
            break;
        case 'stats':
            navigateTo(SCREENS.PROFILE);
            break;
        case 'profile':
            navigateTo(SCREENS.PROFILE);
            break;
    }
}

/* ============================================================
   ACTIONS LOBBY
   ============================================================ */

async function handleQuickPlay() {
    try {
        showLoading(i18n.t('common.loading'));

        // Créer une partie
        const response = await socketActions.createGame({
            maxPlayers: 4,
            mode: 'normal'
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur création partie');
        }

        // Ajouter 3 bots
        await helpers.sleep(300);
        await socketActions.addBot(response.gameId, 'easy');
        await helpers.sleep(300);
        await socketActions.addBot(response.gameId, 'medium');
        await helpers.sleep(300);
        await socketActions.addBot(response.gameId, 'hard');
        await helpers.sleep(500);

        // Démarrer la partie
        await socketActions.startGame(response.gameId);

        hideLoading();

    } catch (error) {
        console.error('❌ Erreur quick play:', error);
        hideLoading();
        showToast(i18n.t('error.server'), 'error');
    }
}

async function handleCreateGame() {
    try {
        showLoading(i18n.t('common.loading'));

        const response = await socketActions.createGame({
            maxPlayers: 4,
            mode: 'normal'
        });

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur création');
        }

        // Naviguer vers la salle d'attente
        navigateTo(SCREENS.WAITING, {
            params: { gameId: response.gameId }
        });

        hideLoading();

    } catch (error) {
        console.error('❌ Erreur création partie:', error);
        hideLoading();
        showToast(i18n.t('error.server'), 'error');
    }
}

function openJoinModal() {
    const modal = helpers.$('#modal-join-game');
    if (modal) {
        modal.classList.add('active');

        // Focus sur l'input
        const input = helpers.$('#input-game-code');
        if (input) {
            input.value = '';
            setTimeout(() => input.focus(), 100);
        }

        // Effacer l'erreur précédente
        const error = helpers.$('#join-game-error');
        if (error) error.classList.add('hidden');
    }
}

function openTournamentModal() {
    const modal = helpers.$('#modal-create-tournament');
    if (modal) {
        modal.classList.add('active');
    }
}

/* ============================================================
   MODALS
   ============================================================ */

function attachModalEvents() {
    // Boutons de fermeture
    helpers.$$('[data-close-modal]').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) modal.classList.remove('active');
        });
    });

    // Fermeture par clic extérieur
    helpers.$$('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });

    // Modal Rejoindre — Confirmer
    const confirmJoinBtn = helpers.$('#btn-confirm-join');
    if (confirmJoinBtn) {
        confirmJoinBtn.addEventListener('click', handleJoinGame);
    }

    // Modal Rejoindre — Enter
    const gameCodeInput = helpers.$('#input-game-code');
    if (gameCodeInput) {
        gameCodeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                handleJoinGame();
            }
        });
        gameCodeInput.addEventListener('input', () => {
            const error = helpers.$('#join-game-error');
            if (error) error.classList.add('hidden');
        });
    }

    // Modal Championnat — Options
    helpers.$$('.tournament-option').forEach(option => {
        option.addEventListener('click', () => {
            const playerCount = parseInt(option.dataset.players);
            handleCreateTournament(playerCount);
        });
    });
}

async function handleJoinGame() {
    const input = helpers.$('#input-game-code');
    const gameId = input.value.trim();

    if (!gameId) {
        showJoinError('Veuillez entrer un code');
        return;
    }

    try {
        showLoading(i18n.t('common.loading'));

        const response = await socketActions.joinGame(gameId);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur connexion');
        }

        // Fermer le modal
        helpers.$('#modal-join-game')?.classList.remove('active');

        // Naviguer vers la salle d'attente
        navigateTo(SCREENS.WAITING, {
            params: { gameId: response.gameId }
        });

        hideLoading();

    } catch (error) {
        console.error('❌ Erreur join game:', error);
        hideLoading();
        showJoinError(error.message || i18n.t('error.game_not_found'));
    }
}

function showJoinError(message) {
    const error = helpers.$('#join-game-error');
    if (error) {
        error.textContent = message;
        error.classList.remove('hidden');
    }
}

async function handleCreateTournament(playerCount) {
    try {
        showLoading(i18n.t('common.loading'));

        // Fermer le modal
        helpers.$('#modal-create-tournament')?.classList.remove('active');

        const response = await socketActions.createTournament(playerCount);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur création tournoi');
        }

        // Naviguer vers l'écran du tournoi
        navigateTo(SCREENS.TOURNAMENT_WAITING, {
            params: { tournamentId: response.tournamentId }
        });

        hideLoading();

    } catch (error) {
        console.error('❌ Erreur création tournoi:', error);
        hideLoading();
        showToast(i18n.t('error.server'), 'error');
    }
}

/* ============================================================
   CHARGEMENT DES DONNÉES
   ============================================================ */

async function loadLobbyData() {
    loadPublicRooms();
    loadLeaderboardPreview();
    loadAchievementsPreview();
}

async function loadPublicRooms() {
    const container = helpers.$('#public-rooms-list');
    if (!container) return;

    try {
        const response = await socketActions.getLobby();

        if (response && response.waitingGames) {
            renderPublicRooms(response.waitingGames);
        } else {
            renderEmptyState(container, 'Aucune partie publique');
        }

        if (response && response.onlinePlayers !== undefined) {
            store.set('social.onlineCount', response.onlinePlayers);
        }

    } catch (error) {
        console.error('Erreur chargement parties:', error);
        renderEmptyState(container, 'Erreur de chargement');
    }
}

function renderPublicRooms(games) {
    const container = helpers.$('#public-rooms-list');
    if (!container) return;

    if (!games || games.length === 0) {
        renderEmptyState(container, 'Aucune partie disponible');
        return;
    }

    container.innerHTML = games.slice(0, 6).map(game => `
    <div class="public-room-card" data-game-id="${game.id}">
      <div class="public-room-header">
        <div class="public-room-host">
          <div class="public-room-avatar">👤</div>
          <span class="public-room-name">${helpers.escapeHtml(game.host || 'Anonyme')}</span>
        </div>
        <span class="public-room-players">${game.playerCount}/${game.maxPlayers}</span>
      </div>
      <div class="public-room-footer">
        <span>🎮 ${game.mode || 'Normal'}</span>
        <span>${helpers.timeAgo(game.createdAt || new Date())}</span>
      </div>
    </div>
  `).join('');

    // Clic pour rejoindre
    container.querySelectorAll('.public-room-card').forEach(card => {
        card.addEventListener('click', () => {
            const gameId = card.dataset.gameId;
            helpers.$('#input-game-code').value = gameId;
            openJoinModal();
        });
    });
}

async function loadLeaderboardPreview() {
    const container = helpers.$('#leaderboard-preview');
    if (!container) return;

    try {
        const response = await fetch('/api/leaderboard?limit=5');
        const data = await response.json();

        if (!data || data.length === 0) {
            renderEmptyState(container, 'Classement vide');
            return;
        }

        container.innerHTML = data.map((entry, index) => `
      <div class="leaderboard-item top-${index + 1}">
        <span class="leaderboard-rank">
          ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
        </span>
        <div class="leaderboard-avatar">${entry.avatar || '👤'}</div>
        <span class="leaderboard-name">${helpers.escapeHtml(entry.username)}</span>
        <span class="leaderboard-elo">${entry.elo}</span>
      </div>
    `).join('');

    } catch (error) {
        console.error('Erreur chargement classement:', error);
        renderEmptyState(container, 'Erreur de chargement');
    }
}

function loadAchievementsPreview() {
    const container = helpers.$('#achievements-preview');
    if (!container) return;

    const achievements = [
        { id: 'first_win', emoji: '🥇', name: 'Première victoire', unlocked: false },
        { id: 'ten_wins', emoji: '🔟', name: 'Dix sur dix', unlocked: false },
        { id: 'streak_5', emoji: '🔥', name: 'En feu', unlocked: false },
        { id: 'perfect_game', emoji: '✨', name: 'Sans faute', unlocked: false }
    ];

    // Marquer ceux débloqués (depuis le store)
    const playerAchievements = store.get('player.achievements', []);
    achievements.forEach(a => {
        a.unlocked = playerAchievements.includes(a.id);
    });

    container.innerHTML = achievements.map(a => `
    <div class="achievement-badge ${a.unlocked ? '' : 'locked'}">
      <span class="achievement-badge-emoji">${a.emoji}</span>
      <span class="achievement-badge-name">${a.name}</span>
    </div>
  `).join('');
}

async function loadFullLeaderboard() {
    const modal = helpers.$('#modal-leaderboard');
    const container = helpers.$('#leaderboard-full');
    if (!modal || !container) return;

    modal.classList.add('active');
    container.innerHTML = '<div class="empty-state-small">Chargement...</div>';

    try {
        const response = await fetch('/api/leaderboard?limit=100');
        const data = await response.json();

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="empty-state-small">Classement vide</div>';
            return;
        }

        container.innerHTML = data.map((entry, index) => `
      <div class="leaderboard-item top-${index + 1}">
        <span class="leaderboard-rank">
          ${index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
        </span>
        <div class="leaderboard-avatar">${entry.avatar || '👤'}</div>
        <span class="leaderboard-name">${helpers.escapeHtml(entry.username)}</span>
        <span class="leaderboard-elo">${entry.elo}</span>
      </div>
    `).join('');

    } catch (error) {
        console.error('Erreur classement:', error);
        container.innerHTML = '<div class="empty-state-small">Erreur de chargement</div>';
    }
}

function renderEmptyState(container, message) {
    container.innerHTML = `
    <div class="empty-state-small">
      <p>${message}</p>
    </div>
  `;
}

/* ============================================================
   UI — RAFRAÎCHISSEMENT
   ============================================================ */

function refreshProfileUI() {
    const username = store.get('player.username') || 'Joueur';
    const avatar = store.get('player.avatar') || '👤';
    const elo = store.get('player.elo', 1000);

    helpers.$('#lobby-username') && (helpers.$('#lobby-username').textContent = username);
    helpers.$('#lobby-avatar') && (helpers.$('#lobby-avatar').textContent = avatar);
    helpers.$('#profile-username') && (helpers.$('#profile-username').textContent = username);
    helpers.$('#profile-avatar') && (helpers.$('#profile-avatar').textContent = avatar);
    helpers.$('#profile-elo') && (helpers.$('#profile-elo').textContent = elo);
    helpers.$('#stat-elo') && (helpers.$('#stat-elo').textContent = elo);
}

function refreshStatsUI() {
    const wins = store.get('player.wins', 0);
    const gamesPlayed = store.get('player.gamesPlayed', 0);
    const streak = store.get('player.currentStreak', 0);

    helpers.$('#stat-wins') && (helpers.$('#stat-wins').textContent = wins);
    helpers.$('#stat-games') && (helpers.$('#stat-games').textContent = gamesPlayed);
    helpers.$('#stat-streak') && (helpers.$('#stat-streak').textContent = streak);
}

/* ============================================================
   THÈME
   ============================================================ */

function toggleTheme() {
    const themes = ['dark', 'light', 'neon', 'retro', 'classic', 'cosmic'];
    const current = store.get('ui.theme', 'dark');
    const currentIndex = themes.indexOf(current);
    const nextTheme = themes[(currentIndex + 1) % themes.length];

    store.set('ui.theme', nextTheme);
    store.set('settings.theme', nextTheme);
    document.documentElement.setAttribute('data-theme', nextTheme);
    storage.saveSettings({ ...storage.getSettings(), theme: nextTheme });

    // Mettre à jour l'icône du bouton
    const icons = {
        dark: '🌙',
        light: '☀️',
        neon: '💫',
        retro: '📼',
        classic: '🎩',
        cosmic: '🌌'
    };
    const btn = helpers.$('#btn-theme-toggle');
    if (btn) btn.textContent = icons[nextTheme] || '🌙';

    showToast(`Thème : ${nextTheme}`, 'success');
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // Profil
    state.unsubscribers.push(
        store.subscribe('player.username', () => refreshProfileUI()),
        store.subscribe('player.avatar', () => refreshProfileUI()),
        store.subscribe('player.elo', () => refreshProfileUI()),
        store.subscribe('player.wins', () => refreshStatsUI()),
        store.subscribe('player.gamesPlayed', () => refreshStatsUI())
    );

    // Socket events
    socket.on('game:created', (data) => {
        console.log('🎮 Partie créée depuis le lobby:', data.gameId);
    });

    socket.on('game:joined', (data) => {
        console.log('🎮 Partie rejointe depuis le lobby:', data.gameId);
    });

    socket.on('tournament:created', (data) => {
        console.log('🏆 Tournoi créé depuis le lobby:', data.tournamentId);
    });
}

/* ============================================================
   UTILITAIRES UI
   ============================================================ */

function showLoading(message = 'Chargement...') {
    const overlay = helpers.$('#loading-overlay');
    if (overlay) {
        const textEl = overlay.querySelector('.loading-text');
        if (textEl) textEl.textContent = message;
        overlay.classList.remove('hidden');
    }
}

function hideLoading() {
    const overlay = helpers.$('#loading-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

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
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.initialized = false;
    console.log('🧹 Lobby UI nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy
};