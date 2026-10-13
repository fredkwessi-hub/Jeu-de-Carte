// =============================================================
// JEU DE CARTES — I18N (Internationalisation FR/EN)
// =============================================================
// Système de traduction léger, sans dépendance externe.
// =============================================================

import storage from './storage.js';

/* ============================================================
   TRADUCTIONS
   ============================================================ */

const TRANSLATIONS = {
    fr: {
        // ===== Général =====
        'common.ok': 'OK',
        'common.cancel': 'Annuler',
        'common.confirm': 'Confirmer',
        'common.yes': 'Oui',
        'common.no': 'Non',
        'common.close': 'Fermer',
        'common.back': 'Retour',
        'common.next': 'Suivant',
        'common.previous': 'Précédent',
        'common.loading': 'Chargement...',
        'common.error': 'Erreur',
        'common.success': 'Succès',
        'common.warning': 'Attention',
        'common.info': 'Info',
        'common.copy': 'Copier',
        'common.copied': 'Copié !',
        'common.share': 'Partager',
        'common.refresh': 'Actualiser',
        'common.save': 'Enregistrer',
        'common.delete': 'Supprimer',
        'common.edit': 'Modifier',
        'common.add': 'Ajouter',
        'common.remove': 'Retirer',
        'common.search': 'Rechercher',
        'common.see_all': 'Voir tout',

        // ===== Login =====
        'login.title': 'Bienvenue',
        'login.subtitle': 'Choisis ton pseudo pour commencer',
        'login.username_label': 'Ton pseudo',
        'login.username_placeholder': 'Ex: DragonMaster',
        'login.avatar_label': 'Avatar',
        'login.play_button': 'Jouer',
        'login.info': 'Aucun compte requis — Ton profil est sauvegardé automatiquement',
        'login.error_empty': 'Veuillez entrer un pseudo',
        'login.error_short': 'Pseudo trop court (min 2 caractères)',
        'login.error_long': 'Pseudo trop long (max 20 caractères)',

        // ===== Lobby =====
        'lobby.online_players': 'joueurs en ligne',
        'lobby.quick_play': 'Partie rapide',
        'lobby.quick_play_desc': 'Affronte 3 bots avec des difficultés progressives',
        'lobby.create_game': 'Créer une partie',
        'lobby.create_game_desc': 'Invite tes amis avec un code',
        'lobby.join_game': 'Rejoindre',
        'lobby.join_game_desc': 'Entre un code de partie',
        'lobby.tournament': 'Championnat',
        'lobby.tournament_desc': 'Tournoi à élimination directe',
        'lobby.public_rooms': 'Parties publiques',
        'lobby.leaderboard': 'Classement',
        'lobby.achievements': 'Succès récents',

        // ===== Stats =====
        'stats.elo': 'ELO',
        'stats.streak': 'Série',
        'stats.games': 'Parties',
        'stats.wins': 'Victoires',

        // ===== Salle d'attente =====
        'waiting.title': 'Salle d\'attente',
        'waiting.game_code': 'Code de la partie',
        'waiting.players': 'Joueurs',
        'waiting.add_bot': 'Ajouter un bot',
        'waiting.start_game': 'Démarrer la partie',
        'waiting.awaiting_players': 'En attente d\'autres joueurs...',
        'waiting.you': '(vous)',
        'waiting.ready': 'Prêt',
        'waiting.not_ready': 'Pas prêt',

        // ===== Jeu =====
        'game.your_turn': '✨ À vous de jouer !',
        'game.waiting_turn': '⏳ Tour de {player}',
        'game.center': 'Centre',
        'game.bank': 'Banque',
        'game.cards_count': '{count} cartes',
        'game.my_hand': 'Ma main',
        'game.play': 'Jouer',
        'game.draw': 'Piocher',
        'game.selected': 'sélectionnée(s)',
        'game.imposed_suit': 'Couleur imposée : {suit}',
        'game.imposed_color': 'Joker {color} — {colorName} imposé',
        'game.pending_draw': '{count} cartes en attente',
        'game.attack': 'Attaque !',
        'game.blocked': 'Attaque bloquée !',
        'game.reversed': 'Sens inversé',
        'game.skip_next': '{player} est suspendu',
        'game.you_finished': 'Vous avez terminé #{rank} !',
        'game.log': 'Journal',
        'game.chat': 'Chat',
        'game.chat_placeholder': 'Écris un message...',
        'game.send': 'Envoyer',
        'game.quit_confirm': 'Quitter la partie en cours ?',
        'game.spectator': 'Spectateur',

        // ===== Fin de partie =====
        'game_over.title': 'Partie terminée !',
        'game_over.winner': '{player} remporte la partie !',
        'game_over.you_won': '🎉 Vous avez gagné !',
        'game_over.you_lost': '💀 Vous avez perdu',
        'game_over.rank': 'Votre rang : #{rank}',
        'game_over.elo_change': 'ELO : {old} → {new} ({change})',
        'game_over.back_lobby': 'Retour au menu',
        'game_over.replay': 'Rejouer',
        'game_over.ranking': 'Classement final',

        // ===== Championnat =====
        'tournament.title': 'Championnat',
        'tournament.create': 'Créer un championnat',
        'tournament.players_4': '4 joueurs',
        'tournament.players_8': '8 joueurs',
        'tournament.subtitle_4': 'Demi-finales + Finale',
        'tournament.subtitle_8': 'Quarts + Demis + Finale',
        'tournament.waiting': 'En attente des participants',
        'tournament.start': 'Démarrer le championnat',
        'tournament.bracket': 'Arbre du tournoi',
        'tournament.participants': 'Participants',
        'tournament.champion': 'CHAMPION',
        'tournament.final_ranking': 'Classement final',
        'tournament.round_final': 'Finale',
        'tournament.round_semi': 'Demi-finales',
        'tournament.round_quarter': 'Quarts de finale',
        'tournament.round_1': 'Tour 1',
        'tournament.next_match': 'Prochain match',

        // ===== Profil =====
        'profile.title': 'Profil',
        'profile.level': 'Niveau {level}',
        'profile.games_played': 'Parties jouées',
        'profile.wins': 'Victoires',
        'profile.win_rate': 'Taux de victoire',
        'profile.best_streak': 'Meilleure série',
        'profile.achievements': 'Succès',
        'profile.achievements_locked': 'Verrouillé',
        'profile.achievements_unlocked': 'Débloqué',
        'profile.edit': 'Modifier le profil',
        'profile.logout': 'Se déconnecter',

        // ===== Amis =====
        'friends.title': 'Amis',
        'friends.list': 'Mes amis',
        'friends.requests': 'Demandes',
        'friends.no_friends': 'Aucun ami pour le moment',
        'friends.no_requests': 'Aucune demande en attente',
        'friends.add': 'Ajouter un ami',
        'friends.search_placeholder': 'Rechercher un pseudo...',
        'friends.online': 'En ligne',
        'friends.offline': 'Hors ligne',
        'friends.in_game': 'En partie',
        'friends.invite': 'Inviter',
        'friends.remove': 'Retirer',
        'friends.accept': 'Accepter',
        'friends.decline': 'Refuser',
        'friends.block': 'Bloquer',
        'friends.unblock': 'Débloquer',

        // ===== Paramètres =====
        'settings.title': 'Paramètres',
        'settings.theme': 'Thème',
        'settings.theme_dark': 'Sombre',
        'settings.theme_light': 'Clair',
        'settings.theme_neon': 'Néon',
        'settings.theme_retro': 'Rétro',
        'settings.theme_classic': 'Classique',
        'settings.theme_cosmic': 'Cosmique',
        'settings.sound': 'Sons',
        'settings.music': 'Musique',
        'settings.haptic': 'Vibrations',
        'settings.notifications': 'Notifications',
        'settings.language': 'Langue',
        'settings.reset_data': 'Réinitialiser les données',
        'settings.reset_confirm': 'Tout effacer ? Cette action est irréversible.',

        // ===== Erreurs =====
        'error.connection': 'Erreur de connexion',
        'error.server': 'Erreur du serveur',
        'error.network': 'Pas de connexion internet',
        'error.timeout': 'Délai dépassé',
        'error.unknown': 'Erreur inconnue',
        'error.game_not_found': 'Partie introuvable',
        'error.game_full': 'La partie est complète',
        'error.not_your_turn': 'Ce n\'est pas votre tour',
        'error.invalid_move': 'Coup invalide',
        'error.invalid_card': 'Cette carte ne peut pas être jouée',
        'error.need_suit_choice': 'Vous devez choisir une couleur',

        // ===== Succès =====
        'achievement.first_win': 'Première victoire',
        'achievement.first_win_desc': 'Gagner sa première partie',
        'achievement.ten_wins': 'Dix sur dix',
        'achievement.ten_wins_desc': 'Gagner 10 parties',
        'achievement.hundred_wins': 'Centurion',
        'achievement.hundred_wins_desc': 'Gagner 100 parties',
        'achievement.streak_5': 'En feu',
        'achievement.streak_5_desc': '5 victoires consécutives',
        'achievement.streak_10': 'Invincible',
        'achievement.streak_10_desc': '10 victoires consécutives',
        'achievement.perfect_game': 'Sans faute',
        'achievement.perfect_game_desc': 'Gagner sans piocher',
        'achievement.comeback': 'Phénix',
        'achievement.comeback_desc': 'Gagner après avoir été dernier',
        'achievement.tournament_win': 'Champion',
        'achievement.tournament_win_desc': 'Remporter un tournoi',
        'achievement.level_5': 'Confirmé',
        'achievement.level_5_desc': 'Atteindre le niveau 5',
        'achievement.level_10': 'Légende',
        'achievement.level_10_desc': 'Atteindre le niveau 10',

        // ===== Règles =====
        'rules.title': 'Règles du jeu',
        'rules.goal': 'But du jeu',
        'rules.goal_desc': 'Se débarrasser de toutes ses cartes le premier.',
        'rules.stacking': 'Superposition',
        'rules.stacking_desc': 'On pose une carte si elle a le même numéro OU la même couleur de symbole que la carte centrale.',
        'rules.special_cards': 'Cartes spéciales',
        'rules.joker': 'Joker',
        'rules.joker_desc': '+4 cartes au joueur suivant et impose sa couleur (rouge/noir)',
        'rules.seven': 'Sept',
        'rules.seven_desc': '+2 cartes au joueur suivant',
        'rules.ace': 'As',
        'rules.ace_desc': 'Suspend le joueur suivant',
        'rules.jack': 'Valet (J)',
        'rules.jack_desc': 'Impose une couleur de symbole',
        'rules.king': 'Roi',
        'rules.king_desc': 'Inverse le sens du jeu',
        'rules.joker_color': 'Règle du Joker',
        'rules.joker_color_desc': 'Joker rouge → jouer du rouge. Joker noir → jouer du noir.',
        'rules.blocking': 'Blocage',
        'rules.blocking_desc': 'Bloquez avec un 7 ou Joker et renvoyez l\'attaque.',
        'rules.draw': 'Piocher',
        'rules.draw_desc': 'Si vous ne pouvez pas jouer, piochez. Piocher = passer son tour.',
        'rules.end': 'Fin de partie',
        'rules.end_desc': 'Le premier à ne plus avoir de cartes gagne.',

        // ===== Notifications =====
        'notif.game_started': 'La partie commence !',
        'notif.game_created': 'Partie créée !',
        'notif.game_joined': 'Partie rejointe !',
        'notif.player_joined': '{player} a rejoint',
        'notif.player_left': 'Un joueur a quitté',
        'notif.your_turn': 'C\'est à ton tour !',
        'notif.cards_drawn': 'Vous avez pioché {count} carte(s)',
        'notif.elo_updated': 'ELO mis à jour'
    },

    en: {
        // ===== General =====
        'common.ok': 'OK',
        'common.cancel': 'Cancel',
        'common.confirm': 'Confirm',
        'common.yes': 'Yes',
        'common.no': 'No',
        'common.close': 'Close',
        'common.back': 'Back',
        'common.next': 'Next',
        'common.previous': 'Previous',
        'common.loading': 'Loading...',
        'common.error': 'Error',
        'common.success': 'Success',
        'common.warning': 'Warning',
        'common.info': 'Info',
        'common.copy': 'Copy',
        'common.copied': 'Copied!',
        'common.share': 'Share',
        'common.refresh': 'Refresh',
        'common.save': 'Save',
        'common.delete': 'Delete',
        'common.edit': 'Edit',
        'common.add': 'Add',
        'common.remove': 'Remove',
        'common.search': 'Search',
        'common.see_all': 'See all',

        // ===== Login =====
        'login.title': 'Welcome',
        'login.subtitle': 'Choose your username to start',
        'login.username_label': 'Your username',
        'login.username_placeholder': 'Ex: DragonMaster',
        'login.avatar_label': 'Avatar',
        'login.play_button': 'Play',
        'login.info': 'No account needed — Your profile is saved automatically',
        'login.error_empty': 'Please enter a username',
        'login.error_short': 'Username too short (min 2 characters)',
        'login.error_long': 'Username too long (max 20 characters)',

        // ===== Lobby =====
        'lobby.online_players': 'players online',
        'lobby.quick_play': 'Quick play',
        'lobby.quick_play_desc': 'Face 3 bots with progressive difficulty',
        'lobby.create_game': 'Create game',
        'lobby.create_game_desc': 'Invite friends with a code',
        'lobby.join_game': 'Join',
        'lobby.join_game_desc': 'Enter a game code',
        'lobby.tournament': 'Tournament',
        'lobby.tournament_desc': 'Single elimination bracket',
        'lobby.public_rooms': 'Public rooms',
        'lobby.leaderboard': 'Leaderboard',
        'lobby.achievements': 'Recent achievements',

        // ===== Stats =====
        'stats.elo': 'ELO',
        'stats.streak': 'Streak',
        'stats.games': 'Games',
        'stats.wins': 'Wins',

        // ===== Waiting room =====
        'waiting.title': 'Waiting room',
        'waiting.game_code': 'Game code',
        'waiting.players': 'Players',
        'waiting.add_bot': 'Add a bot',
        'waiting.start_game': 'Start game',
        'waiting.awaiting_players': 'Waiting for other players...',
        'waiting.you': '(you)',
        'waiting.ready': 'Ready',
        'waiting.not_ready': 'Not ready',

        // ===== Game =====
        'game.your_turn': '✨ Your turn!',
        'game.waiting_turn': '⏳ {player}\'s turn',
        'game.center': 'Center',
        'game.bank': 'Bank',
        'game.cards_count': '{count} cards',
        'game.my_hand': 'My hand',
        'game.play': 'Play',
        'game.draw': 'Draw',
        'game.selected': 'selected',
        'game.imposed_suit': 'Imposed suit: {suit}',
        'game.imposed_color': '{color} Joker — {colorName} imposed',
        'game.pending_draw': '{count} cards pending',
        'game.attack': 'Attack!',
        'game.blocked': 'Attack blocked!',
        'game.reversed': 'Direction reversed',
        'game.skip_next': '{player} is skipped',
        'game.you_finished': 'You finished #{rank}!',
        'game.log': 'Log',
        'game.chat': 'Chat',
        'game.chat_placeholder': 'Type a message...',
        'game.send': 'Send',
        'game.quit_confirm': 'Quit current game?',
        'game.spectator': 'Spectator',

        // ===== Game over =====
        'game_over.title': 'Game over!',
        'game_over.winner': '{player} wins the game!',
        'game_over.you_won': '🎉 You won!',
        'game_over.you_lost': '💀 You lost',
        'game_over.rank': 'Your rank: #{rank}',
        'game_over.elo_change': 'ELO: {old} → {new} ({change})',
        'game_over.back_lobby': 'Back to menu',
        'game_over.replay': 'Play again',
        'game_over.ranking': 'Final ranking',

        // ===== Tournament =====
        'tournament.title': 'Tournament',
        'tournament.create': 'Create tournament',
        'tournament.players_4': '4 players',
        'tournament.players_8': '8 players',
        'tournament.subtitle_4': 'Semifinals + Final',
        'tournament.subtitle_8': 'Quarters + Semis + Final',
        'tournament.waiting': 'Waiting for participants',
        'tournament.start': 'Start tournament',
        'tournament.bracket': 'Tournament bracket',
        'tournament.participants': 'Participants',
        'tournament.champion': 'CHAMPION',
        'tournament.final_ranking': 'Final ranking',
        'tournament.round_final': 'Final',
        'tournament.round_semi': 'Semifinals',
        'tournament.round_quarter': 'Quarterfinals',
        'tournament.round_1': 'Round 1',
        'tournament.next_match': 'Next match',

        // ===== Profile =====
        'profile.title': 'Profile',
        'profile.level': 'Level {level}',
        'profile.games_played': 'Games played',
        'profile.wins': 'Wins',
        'profile.win_rate': 'Win rate',
        'profile.best_streak': 'Best streak',
        'profile.achievements': 'Achievements',
        'profile.achievements_locked': 'Locked',
        'profile.achievements_unlocked': 'Unlocked',
        'profile.edit': 'Edit profile',
        'profile.logout': 'Log out',

        // ===== Friends =====
        'friends.title': 'Friends',
        'friends.list': 'My friends',
        'friends.requests': 'Requests',
        'friends.no_friends': 'No friends yet',
        'friends.no_requests': 'No pending requests',
        'friends.add': 'Add a friend',
        'friends.search_placeholder': 'Search a username...',
        'friends.online': 'Online',
        'friends.offline': 'Offline',
        'friends.in_game': 'In game',
        'friends.invite': 'Invite',
        'friends.remove': 'Remove',
        'friends.accept': 'Accept',
        'friends.decline': 'Decline',
        'friends.block': 'Block',
        'friends.unblock': 'Unblock',

        // ===== Settings =====
        'settings.title': 'Settings',
        'settings.theme': 'Theme',
        'settings.theme_dark': 'Dark',
        'settings.theme_light': 'Light',
        'settings.theme_neon': 'Neon',
        'settings.theme_retro': 'Retro',
        'settings.theme_classic': 'Classic',
        'settings.theme_cosmic': 'Cosmic',
        'settings.sound': 'Sound',
        'settings.music': 'Music',
        'settings.haptic': 'Vibration',
        'settings.notifications': 'Notifications',
        'settings.language': 'Language',
        'settings.reset_data': 'Reset data',
        'settings.reset_confirm': 'Erase everything? This cannot be undone.',

        // ===== Errors =====
        'error.connection': 'Connection error',
        'error.server': 'Server error',
        'error.network': 'No internet connection',
        'error.timeout': 'Request timeout',
        'error.unknown': 'Unknown error',
        'error.game_not_found': 'Game not found',
        'error.game_full': 'Game is full',
        'error.not_your_turn': 'Not your turn',
        'error.invalid_move': 'Invalid move',
        'error.invalid_card': 'This card cannot be played',
        'error.need_suit_choice': 'You must choose a suit',

        // ===== Achievements =====
        'achievement.first_win': 'First win',
        'achievement.first_win_desc': 'Win your first game',
        'achievement.ten_wins': 'Perfect ten',
        'achievement.ten_wins_desc': 'Win 10 games',
        'achievement.hundred_wins': 'Centurion',
        'achievement.hundred_wins_desc': 'Win 100 games',
        'achievement.streak_5': 'On fire',
        'achievement.streak_5_desc': '5 consecutive wins',
        'achievement.streak_10': 'Invincible',
        'achievement.streak_10_desc': '10 consecutive wins',
        'achievement.perfect_game': 'Flawless',
        'achievement.perfect_game_desc': 'Win without drawing',
        'achievement.comeback': 'Phoenix',
        'achievement.comeback_desc': 'Win after being last',
        'achievement.tournament_win': 'Champion',
        'achievement.tournament_win_desc': 'Win a tournament',
        'achievement.level_5': 'Confirmed',
        'achievement.level_5_desc': 'Reach level 5',
        'achievement.level_10': 'Legend',
        'achievement.level_10_desc': 'Reach level 10',

        // ===== Rules =====
        'rules.title': 'Game rules',
        'rules.goal': 'Goal',
        'rules.goal_desc': 'Be the first to get rid of all your cards.',
        'rules.stacking': 'Stacking',
        'rules.stacking_desc': 'Play a card if it matches the center card\'s rank OR suit.',
        'rules.special_cards': 'Special cards',
        'rules.joker': 'Joker',
        'rules.joker_desc': '+4 cards to next player and imposes its color (red/black)',
        'rules.seven': 'Seven',
        'rules.seven_desc': '+2 cards to next player',
        'rules.ace': 'Ace',
        'rules.ace_desc': 'Skips the next player',
        'rules.jack': 'Jack (J)',
        'rules.jack_desc': 'Imposes a suit',
        'rules.king': 'King',
        'rules.king_desc': 'Reverses play direction',
        'rules.joker_color': 'Joker rule',
        'rules.joker_color_desc': 'Red Joker → play red. Black Joker → play black.',
        'rules.blocking': 'Blocking',
        'rules.blocking_desc': 'Block with a 7 or Joker and redirect the attack.',
        'rules.draw': 'Draw',
        'rules.draw_desc': 'If you can\'t play, draw. Drawing = skip turn.',
        'rules.end': 'End of game',
        'rules.end_desc': 'First to empty their hand wins.',

        // ===== Notifications =====
        'notif.game_started': 'Game started!',
        'notif.game_created': 'Game created!',
        'notif.game_joined': 'Game joined!',
        'notif.player_joined': '{player} joined',
        'notif.player_left': 'A player left',
        'notif.your_turn': 'Your turn!',
        'notif.cards_drawn': 'You drew {count} card(s)',
        'notif.elo_updated': 'ELO updated'
    }
};

/* ============================================================
   ÉTAT INTERNE
   ============================================================ */

let currentLanguage = 'fr';
const listeners = new Set();

/* ============================================================
   API
   ============================================================ */

/**
 * Initialise l'i18n (charge la langue sauvegardée)
 */
export function init() {
    const saved = storage.localStore.get(storage.KEYS.LANGUAGE);
    if (saved && TRANSLATIONS[saved]) {
        currentLanguage = saved;
    } else {
        // Détection auto depuis le navigateur
        const browserLang = (navigator.language || 'fr').slice(0, 2);
        currentLanguage = TRANSLATIONS[browserLang] ? browserLang : 'fr';
    }
    return currentLanguage;
}

/**
 * Récupère la langue actuelle
 */
export function getLanguage() {
    return currentLanguage;
}

/**
 * Change la langue
 */
export function setLanguage(lang) {
    if (!TRANSLATIONS[lang]) {
        console.warn(`Langue non supportée: ${lang}`);
        return false;
    }

    currentLanguage = lang;
    storage.localStore.set(storage.KEYS.LANGUAGE, lang, { expiry: 0 });

    // Mettre à jour l'attribut lang de <html>
    document.documentElement.setAttribute('lang', lang);

    // Notifier les listeners
    listeners.forEach(fn => {
        try {
            fn(lang);
        } catch (e) {
            console.error('Erreur dans listener i18n:', e);
        }
    });

    return true;
}

/**
 * Récupère une traduction
 * @param {string} key
 * @param {Object} params - Variables à interpoler
 */
export function t(key, params = {}) {
    const translations = TRANSLATIONS[currentLanguage] || TRANSLATIONS.fr;
    let text = translations[key] || key;

    // Interpolation des variables {var}
    Object.keys(params).forEach(param => {
        const regex = new RegExp(`\\{${param}\\}`, 'g');
        text = text.replace(regex, params[param]);
    });

    return text;
}

/**
 * Traduit un élément HTML avec data-i18n
 * @param {Element} root - Élément racine (défaut: document)
 */
export function translateDOM(root = document) {
    // data-i18n → textContent
    root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        el.textContent = t(key);
    });

    // data-i18n-placeholder → placeholder
    root.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
        const key = el.getAttribute('data-i18n-placeholder');
        el.placeholder = t(key);
    });

    // data-i18n-title → title
    root.querySelectorAll('[data-i18n-title]').forEach(el => {
        const key = el.getAttribute('data-i18n-title');
        el.title = t(key);
    });

    // data-i18n-html → innerHTML
    root.querySelectorAll('[data-i18n-html]').forEach(el => {
        const key = el.getAttribute('data-i18n-html');
        el.innerHTML = t(key);
    });
}

/**
 * Ajoute un listener de changement de langue
 */
export function onLanguageChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/**
 * Langues disponibles
 */
export function getAvailableLanguages() {
    return [
        { code: 'fr', name: 'Français', flag: '🇫🇷' },
        { code: 'en', name: 'English', flag: '🇬🇧' }
    ];
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    t,
    setLanguage,
    getLanguage,
    getAvailableLanguages,
    translateDOM,
    onLanguageChange,
    TRANSLATIONS
};