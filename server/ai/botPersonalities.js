// ===== server/ai/botPersonalities.js =====
// Définition des personnalités de bots

// ===== PERSONNALITÉS DISPONIBLES =====
const PERSONALITIES = {
    // ===== ÉQUILIBRÉ =====
    balanced: {
        id: 'balanced',
        name: 'Équilibré',
        emoji: '⚖️',
        description: 'Joue de manière équilibrée, sans excès',
        attackStyle: 'balanced',      // aggressive | defensive | balanced
        playStyle: 'balanced',        // aggressive | defensive | balanced
        preferSpecial: false,          // Préfère jouer les cartes spéciales
        riskLevel: 0.5,                // 0 = prudent, 1 = audacieux
        memoryWeight: 0.3,             // Importance de la mémoire
        chatFrequency: 0.3,            // Probabilité de chatter
        emojis: ['👍', '🙂', '😎', '🎯']
    },

    // ===== AGRESSIF =====
    aggressive: {
        id: 'aggressive',
        name: 'Agressif',
        emoji: '🔥',
        description: 'Attaque sans relâche, n\'hésite pas à utiliser ses cartes spéciales',
        attackStyle: 'aggressive',
        playStyle: 'aggressive',
        preferSpecial: true,
        riskLevel: 0.9,
        memoryWeight: 0.2,
        chatFrequency: 0.6,
        emojis: ['😈', '🔥', '💥', '😤', '👊']
    },

    // ===== DÉFENSIF =====
    defensive: {
        id: 'defensive',
        name: 'Défensif',
        emoji: '🛡️',
        description: 'Garde ses cartes précieuses et contre-attaque quand il faut',
        attackStyle: 'defensive',
        playStyle: 'defensive',
        preferSpecial: false,
        riskLevel: 0.2,
        memoryWeight: 0.6,
        chatFrequency: 0.2,
        emojis: ['🤔', '🧐', '💭', '🛡️']
    },

    // ===== TACTICIEN =====
    tactician: {
        id: 'tactician',
        name: 'Tacticien',
        emoji: '🧠',
        description: 'Analyse chaque coup, garde ses meilleures cartes pour la fin',
        attackStyle: 'balanced',
        playStyle: 'defensive',
        preferSpecial: false,
        riskLevel: 0.4,
        memoryWeight: 0.9,
        chatFrequency: 0.1,
        emojis: ['🧠', '♟️', '🎯', '📊']
    },

    // ===== IMITATEUR =====
    imitator: {
        id: 'imitator',
        name: 'Imitateur',
        emoji: '🪞',
        description: 'Copie les stratégies de ses adversaires',
        attackStyle: 'adaptive',
        playStyle: 'adaptive',
        preferSpecial: false,
        riskLevel: 0.5,
        memoryWeight: 1.0,
        chatFrequency: 0.4,
        emojis: ['🪞', '👀', '🤝', '😏']
    },

    // ===== CHANCEUX =====
    lucky: {
        id: 'lucky',
        name: 'Chanceux',
        emoji: '🍀',
        description: 'Joue de manière imprévisible et surprenante',
        attackStyle: 'random',
        playStyle: 'random',
        preferSpecial: true,
        riskLevel: 0.7,
        memoryWeight: 0.1,
        chatFrequency: 0.5,
        emojis: ['🍀', '🎲', '✨', '🌟']
    },

    // ===== SILENCIEUX =====
    silent: {
        id: 'silent',
        name: 'Silencieux',
        emoji: '🤫',
        description: 'Ne parle pas, joue efficacement',
        attackStyle: 'balanced',
        playStyle: 'balanced',
        preferSpecial: false,
        riskLevel: 0.5,
        memoryWeight: 0.5,
        chatFrequency: 0.0,
        emojis: []
    },

    // ===== BAVARD =====
    talkative: {
        id: 'talkative',
        name: 'Bavard',
        emoji: '💬',
        description: 'Commente chaque coup et taquine ses adversaires',
        attackStyle: 'balanced',
        playStyle: 'balanced',
        preferSpecial: false,
        riskLevel: 0.5,
        memoryWeight: 0.3,
        chatFrequency: 0.9,
        emojis: ['😂', '😜', '🤪', '💬', '🎉']
    },

    // ===== AGRESSIF-DÉFENSIF (contre-attaquant) =====
    counterAttacker: {
        id: 'counterAttacker',
        name: 'Contre-Attaquant',
        emoji: '⚔️',
        description: 'Se défend puis attaque violemment',
        attackStyle: 'defensive',
        playStyle: 'aggressive',
        preferSpecial: true,
        riskLevel: 0.6,
        memoryWeight: 0.7,
        chatFrequency: 0.3,
        emojis: ['⚔️', '🛡️', '💢', '😠']
    },

    // ===== MAÎTRE =====
    master: {
        id: 'master',
        name: 'Maître',
        emoji: '👑',
        description: 'Stratégie parfaite, aucune erreur',
        attackStyle: 'balanced',
        playStyle: 'defensive',
        preferSpecial: false,
        riskLevel: 0.3,
        memoryWeight: 1.0,
        chatFrequency: 0.2,
        emojis: ['👑', '🎩', '✨', '🏆']
    }
};

// ===== MESSAGES DE CHAT =====
const CHAT_MESSAGES = {
    // Quand le bot joue un Joker
    joker_play: [
        '🃏 Boum !',
        '🃏 Prends ça !',
        '🃏 Surprise !',
        '🃏 Et voilà le travail !',
        '🃏 Tu vas aimer celle-là...'
    ],

    // Quand le bot joue un 7
    seven_play: [
        '7️⃣ Tiens, cadeau !',
        '7️⃣ Prends deux cartes 😏',
        '7️⃣ Un petit bonus pour toi !',
        '7️⃣ Ça fait mal hein ?'
    ],

    // Quand le bot joue un As
    ace_play: [
        '🅰️ Passe ton tour !',
        '🅰️ À moi de rejouer 😎',
        '🅰️ Désolé, c\'est mon tour !',
        '🅰️ Tu sautes !'
    ],

    // Quand le bot joue un J
    jack_play: [
        '🎭 Et maintenant, on joue à mon jeu !',
        '🎭 Nouvelle règle !',
        '🎭 Suis le guide !',
        '🎭 Adapte-toi !'
    ],

    // Quand le bot bloque une attaque
    block: [
        '🛡️ Raté !',
        '🛡️ Contre-attaque !',
        '🛡️ Je renvoie l\'ascenseur !',
        '🛡️ Tu pensais m\'avoir ?'
    ],

    // Quand le bot pioche
    draw: [
        '📥 Bon... je pioche',
        '📥 Pas de chance',
        '📥 Une carte de plus',
        '📥 Tant pis pour moi'
    ],

    // Quand le bot gagne
    win: [
        '🏆 Victoire !',
        '🏆 GG à tous !',
        '🏆 Facile 😎',
        '🏆 Merci pour la partie !',
        '🏆 À la prochaine !'
    ],

    // Quand le bot perd
    lose: [
        '💀 Bien joué !',
        '💀 Tu m\'as eu !',
        '💀 Revanche !',
        '💀 Félicitations !',
        '💀 Je m\'incline'
    ],

    // Général
    general: [
        '😊 Bonne chance !',
        '👋 Salut !',
        '🎮 Prêts ?',
        '🚀 C\'est parti !'
    ]
};

// ===== FONCTIONS =====
function getPersonality(id) {
    return PERSONALITIES[id] || PERSONALITIES.balanced;
}

function getAllPersonalities() {
    return Object.values(PERSONALITIES);
}

function getRandomPersonality() {
    const ids = Object.keys(PERSONALITIES);
    return PERSONALITIES[ids[Math.floor(Math.random() * ids.length)]];
}

function getChatMessage(type) {
    const messages = CHAT_MESSAGES[type] || CHAT_MESSAGES.general;
    return messages[Math.floor(Math.random() * messages.length)];
}

function shouldChat(persona) {
    return Math.random() < persona.chatFrequency;
}

function getRandomEmoji(persona) {
    if (!persona.emojis || persona.emojis.length === 0) return null;
    return persona.emojis[Math.floor(Math.random() * persona.emojis.length)];
}

// ===== ADAPTER LA PERSONNALITÉ À LA DIFFICULTÉ =====
function adaptPersonalityToDifficulty(personality, difficulty) {
    const adapted = { ...personality };

    switch (difficulty) {
        case 'easy':
            adapted.memoryWeight = 0;
            adapted.riskLevel = 0.3;
            break;
        case 'medium':
            adapted.memoryWeight = Math.min(adapted.memoryWeight, 0.5);
            adapted.riskLevel = 0.5;
            break;
        case 'hard':
            adapted.memoryWeight = Math.min(adapted.memoryWeight, 0.8);
            adapted.riskLevel = 0.7;
            break;
        case 'expert':
            adapted.memoryWeight = 1.0;
            adapted.riskLevel = 0.8;
            break;
    }

    return adapted;
}

// ===== EXPORT =====
module.exports = {
    PERSONALITIES,
    CHAT_MESSAGES,
    getPersonality,
    getAllPersonalities,
    getRandomPersonality,
    getChatMessage,
    shouldChat,
    getRandomEmoji,
    adaptPersonalityToDifficulty
};