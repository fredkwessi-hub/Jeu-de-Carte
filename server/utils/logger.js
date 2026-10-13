// ===== server/utils/logger.js =====
// Système de logs structurés avec niveaux et couleurs

const config = require('../config');

// ===== Codes couleur ANSI =====
const COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    gray: '\x1b[90m'
};

// ===== Niveaux de log =====
const LEVELS = {
    error: 0,
    warn: 1,
    info: 2,
    success: 3,
    debug: 4,
    trace: 5
};

// ===== Configuration =====
const currentLevel = LEVELS[config.logs.level] || LEVELS.info;

// ===== Utilitaires =====
function getTimestamp() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
}

function colorize(text, color) {
    if (!config.logs.colors) return text;
    return `${COLORS[color]}${text}${COLORS.reset}`;
}

function formatMessage(level, message, meta) {
    const timestamp = colorize(`[${getTimestamp()}]`, 'gray');
    const levelTag = getLevelTag(level);
    const baseMsg = `${timestamp} ${levelTag} ${message}`;

    if (meta && Object.keys(meta).length > 0) {
        return `${baseMsg} ${colorize(JSON.stringify(meta), 'dim')}`;
    }
    return baseMsg;
}

function getLevelTag(level) {
    const tags = {
        error: colorize('[ERROR]', 'red'),
        warn: colorize('[WARN]', 'yellow'),
        info: colorize('[INFO]', 'cyan'),
        success: colorize('[OK]', 'green'),
        debug: colorize('[DEBUG]', 'magenta'),
        trace: colorize('[TRACE]', 'gray')
    };
    return tags[level] || '[LOG]';
}

// ===== API principale =====
const logger = {
    error(message, meta = {}) {
        if (currentLevel >= LEVELS.error) {
            console.error(formatMessage('error', message, meta));
        }
    },

    warn(message, meta = {}) {
        if (currentLevel >= LEVELS.warn) {
            console.warn(formatMessage('warn', message, meta));
        }
    },

    info(message, meta = {}) {
        if (currentLevel >= LEVELS.info) {
            console.log(formatMessage('info', message, meta));
        }
    },

    success(message, meta = {}) {
        if (currentLevel >= LEVELS.success) {
            console.log(formatMessage('success', message, meta));
        }
    },

    debug(message, meta = {}) {
        if (currentLevel >= LEVELS.debug) {
            console.log(formatMessage('debug', message, meta));
        }
    },

    trace(message, meta = {}) {
        if (currentLevel >= LEVELS.trace) {
            console.log(formatMessage('trace', message, meta));
        }
    },

    // ===== Logs spéciaux (avec emojis) =====
    game(message, meta = {}) {
        console.log(`${colorize('🎮', 'cyan')} ${message}`, meta);
    },

    tournament(message, meta = {}) {
        console.log(`${colorize('🏆', 'yellow')} ${message}`, meta);
    },

    player(message, meta = {}) {
        console.log(`${colorize('👤', 'blue')} ${message}`, meta);
    },

    bot(message, meta = {}) {
        console.log(`${colorize('🤖', 'magenta')} ${message}`, meta);
    },

    card(message, meta = {}) {
        console.log(`${colorize('🃏', 'white')} ${message}`, meta);
    },

    // ===== Sections (pour séparer dans la console) =====
    section(title) {
        const line = '═'.repeat(50);
        console.log(`\n${colorize(line, 'blue')}`);
        console.log(colorize(`  ${title}`, 'bright'));
        console.log(`${colorize(line, 'blue')}\n`);
    },

    // ===== Banner de démarrage =====
    banner() {
        const banner = `
╔═══════════════════════════════════════════════════╗
║                                                   ║
║     🃏  JEU DE CARTES MEGA  🃏                    ║
║                                                   ║
║     Version ${config.version}                              ║
║     Environnement : ${config.server.env.padEnd(20)}        ║
║     Port : ${String(config.server.port).padEnd(35)}        ║
║                                                   ║
╚═══════════════════════════════════════════════════╝
`;
        console.log(colorize(banner, 'cyan'));
    }
};

module.exports = logger;