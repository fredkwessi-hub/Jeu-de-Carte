// =============================================================
// JEU DE CARTES — GAME : ANIMATIONS
// =============================================================
// Toutes les animations d'UI : cartes spéciales, confettis,
// transitions, effets visuels.
// =============================================================

import helpers from '../utils/helpers.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    activeAnimations: new Set(),
    confettiTimeout: null
};

/* ============================================================
   ANIMATION DE CARTE SPÉCIALE
   ============================================================ */

const CARD_ANIMATIONS = {
    joker: {
        'red': {
            bgClass: 'joker-red',
            emoji: '🃏',
            title: 'JOKER ROUGE !',
            subtitle: '+4 cartes pour le suivant • Couleur imposée : 🔴 Rouge',
            particles: 15
        },
        'black': {
            bgClass: 'joker-black',
            emoji: '🃏',
            title: 'JOKER NOIR !',
            subtitle: '+4 cartes pour le suivant • Couleur imposée : ⚫ Noir',
            particles: 15
        }
    },
    seven: {
        'red': {
            bgClass: 'seven-red',
            emoji: '7️⃣',
            title: 'SEPT !',
            subtitle: '+2 cartes pour le suivant',
            particles: 10
        },
        'black': {
            bgClass: 'seven-black',
            emoji: '7️⃣',
            title: 'SEPT !',
            subtitle: '+2 cartes pour le suivant',
            particles: 10
        }
    },
    ace: {
        default: {
            bgClass: 'ace',
            emoji: '🅰️',
            title: 'AS !',
            subtitle: 'Le suivant est suspendu',
            particles: 12
        }
    },
    jack: {
        default: {
            bgClass: 'jack',
            emoji: '🎭',
            title: 'VALET COMMANDE !',
            subtitle: 'Une couleur est imposée',
            particles: 12
        }
    },
    king: {
        default: {
            bgClass: 'king',
            emoji: '👑',
            title: 'ROI !',
            subtitle: 'Sens du jeu inversé',
            particles: 10
        }
    }
};

/**
 * Joue une animation de carte spéciale
 * @param {string} type - 'joker', 'seven', 'ace', 'jack', 'king'
 * @param {Object} options - { color, playerName, duration }
 */
export function playCardAnimation(type, options = {}) {
    const { color = 'default', playerName = '', duration = 1500 } = options;

    // Récupérer la config
    const typeConfig = CARD_ANIMATIONS[type];
    if (!typeConfig) {
        console.warn(`Animation inconnue: ${type}`);
        return;
    }

    const config = typeConfig[color] || typeConfig.default;
    if (!config) {
        console.warn(`Couleur inconnue pour ${type}: ${color}`);
        return;
    }

    // Récupérer les éléments
    const overlay = helpers.$('#card-animation-overlay');
    const bg = helpers.$('#card-animation-bg');
    const content = helpers.$('#card-animation-content');

    if (!overlay || !bg || !content) {
        console.warn('Overlay d\'animation introuvable');
        return;
    }

    // Éviter les animations concurrentes du même type
    if (state.activeAnimations.has(type)) {
        return;
    }
    state.activeAnimations.add(type);

    // Configurer le fond
    bg.className = `card-animation-bg ${config.bgClass}`;

    // Créer les particules
    const particles = createParticles(config.emoji, config.particles);

    // Créer le contenu
    content.innerHTML = `
    ${particles}
    <div class="card-animation-emoji">${config.emoji}</div>
    <div class="card-animation-title">${config.title}</div>
    <div class="card-animation-subtitle">
      ${playerName ? playerName + ' • ' : ''}${config.subtitle}
    </div>
  `;

    // Afficher
    overlay.classList.remove('hidden');
    void overlay.offsetWidth; // Force reflow
    overlay.classList.add('active');

    // Cacher après la durée
    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => {
            overlay.classList.add('hidden');
            state.activeAnimations.delete(type);
        }, 300);
    }, duration);
}

/**
 * Crée le HTML des particules
 */
function createParticles(emoji, count = 12) {
    let html = '<div class="card-animation-particles">';

    for (let i = 0; i < count; i++) {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const size = 20 + Math.random() * 32;

        html += `
      <span
        class="card-particle"
        style="left: ${left}%; bottom: 30%; animation-delay: ${delay}s; font-size: ${size}px;"
      >${emoji}</span>
    `;
    }

    html += '</div>';
    return html;
}

/* ============================================================
   CONFETTIS
   ============================================================ */

const CONFETTI_COLORS = [
    '#6C63FF', '#FF6584', '#F39C12', '#2ECC71',
    '#00D4FF', '#FFD700', '#FF8FA3', '#9D6FFF'
];

/**
 * Lance une explosion de confettis
 * @param {number} count - Nombre de confettis
 * @param {Object} options - { duration, colors, spread }
 */
export function launchConfetti(count = 150, options = {}) {
    const {
        duration = 5000,
        colors = CONFETTI_COLORS,
        spread = 100
    } = options;

    const overlay = helpers.$('#confetti-overlay');
    const container = helpers.$('#confetti-container');

    if (!overlay || !container) {
        console.warn('Container confettis introuvable');
        return;
    }

    overlay.classList.remove('hidden');

    for (let i = 0; i < count; i++) {
        const piece = createConfettiPiece(colors, duration, spread);
        container.appendChild(piece);

        // Nettoyer après l'animation
        setTimeout(() => {
            if (piece.parentNode) piece.parentNode.removeChild(piece);
        }, duration + 1000);
    }

    // Cacher l'overlay quand tout est fini
    if (state.confettiTimeout) clearTimeout(state.confettiTimeout);
    state.confettiTimeout = setTimeout(() => {
        if (container.children.length === 0) {
            overlay.classList.add('hidden');
        }
    }, duration + 2000);
}

/**
 * Crée un morceau de confetti
 */
function createConfettiPiece(colors, duration, spread) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';

    const color = helpers.randomItem(colors);
    const left = Math.random() * spread;
    const animDuration = (duration / 1000) * (0.6 + Math.random() * 0.4);
    const delay = Math.random() * 0.5;
    const size = 6 + Math.random() * 10;
    const isCircle = Math.random() > 0.5;

    piece.style.left = `${left}%`;
    piece.style.background = color;
    piece.style.animationDuration = `${animDuration}s`;
    piece.style.animationDelay = `${delay}s`;
    piece.style.width = `${size}px`;
    piece.style.height = `${size * 1.6}px`;
    piece.style.borderRadius = isCircle ? '50%' : '2px';
    piece.style.boxShadow = `0 0 6px ${color}40`;

    return piece;
}

/**
 * Lance une explosion massive (champion)
 */
export function launchChampionConfetti() {
    launchConfetti(300, { duration: 6000 });

    setTimeout(() => launchConfetti(200, { duration: 5000 }), 800);
    setTimeout(() => launchConfetti(150, { duration: 4000 }), 1600);
    setTimeout(() => launchConfetti(100, { duration: 3000 }), 2400);
}

/* ============================================================
   TRANSITIONS D'ÉCRAN
   ============================================================ */

/**
 * Fait une transition de fondu entre deux éléments
 */
export function fadeTransition(fromEl, toEl, duration = 400) {
    return new Promise(resolve => {
        if (!fromEl || !toEl) {
            resolve();
            return;
        }

        fromEl.classList.add('exiting');

        setTimeout(() => {
            fromEl.classList.remove('active', 'exiting');
            toEl.classList.add('active');

            setTimeout(resolve, duration);
        }, duration / 2);
    });
}

/* ============================================================
   ANIMATIONS D'ÉLÉMENTS
   ============================================================ */

/**
 * Fait pulser un élément
 */
export function pulseElement(el, duration = 2000) {
    if (!el) return;

    el.classList.add('animate-pulse');

    setTimeout(() => {
        el.classList.remove('animate-pulse');
    }, duration);
}

/**
 * Fait briller un élément
 */
export function shineElement(el, duration = 2000) {
    if (!el) return;

    el.classList.add('animate-shine');

    setTimeout(() => {
        el.classList.remove('animate-shine');
    }, duration);
}

/**
 * Fait "wiggle" un élément
 */
export function wiggleElement(el, duration = 800) {
    if (!el) return;

    el.classList.add('animate-wiggle');

    setTimeout(() => {
        el.classList.remove('animate-wiggle');
    }, duration);
}

/**
 * Bounce un élément
 */
export function bounceElement(el, duration = 1000) {
    if (!el) return;

    el.classList.add('animate-bounce');

    setTimeout(() => {
        el.classList.remove('animate-bounce');
    }, duration);
}

/**
 * Fait apparaître un élément en fondu
 */
export function fadeInElement(el, duration = 400) {
    if (!el) return Promise.resolve();

    return new Promise(resolve => {
        el.style.opacity = '0';
        el.style.display = '';

        requestAnimationFrame(() => {
            el.style.transition = `opacity ${duration}ms ease`;
            el.style.opacity = '1';

            setTimeout(() => {
                el.style.transition = '';
                resolve();
            }, duration);
        });
    });
}

/**
 * Fait disparaître un élément en fondu
 */
export function fadeOutElement(el, duration = 300) {
    if (!el) return Promise.resolve();

    return new Promise(resolve => {
        el.style.transition = `opacity ${duration}ms ease`;
        el.style.opacity = '0';

        setTimeout(() => {
            el.style.display = 'none';
            el.style.transition = '';
            el.style.opacity = '';
            resolve();
        }, duration);
    });
}

/* ============================================================
   ANIMATIONS DE TEXTE
   ============================================================ */

/**
 * Effet machine à écrire
 */
export function typeWriter(el, text, speed = 50) {
    if (!el) return Promise.resolve();

    return new Promise(resolve => {
        el.textContent = '';
        let i = 0;

        const interval = setInterval(() => {
            if (i < text.length) {
                el.textContent += text[i];
                i++;
            } else {
                clearInterval(interval);
                resolve();
            }
        }, speed);
    });
}

/**
 * Compte de 0 à N
 */
export function countUp(el, target, duration = 1000) {
    if (!el) return Promise.resolve();

    return new Promise(resolve => {
        const start = 0;
        const startTime = Date.now();

        const update = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const current = Math.floor(start + (target - start) * progress);

            el.textContent = current;

            if (progress < 1) {
                requestAnimationFrame(update);
            } else {
                el.textContent = target;
                resolve();
            }
        };

        requestAnimationFrame(update);
    });
}

/* ============================================================
   ANIMATIONS DE CARTES (spécifiques)
   ============================================================ */

/**
 * Animation d'attaque (pending draw)
 */
export function playAttackAnimation() {
    const overlay = helpers.$('#card-animation-overlay');
    if (!overlay) return;

    // Animation shake sur tout l'écran
    document.body.classList.add('animate-shake');
    setTimeout(() => document.body.classList.remove('animate-shake'), 600);
}

/**
 * Animation de blocage réussi
 */
export function playBlockAnimation() {
    const indicator = helpers.$('#current-player-indicator');
    if (indicator) {
        indicator.classList.add('animate-pulse');
        setTimeout(() => indicator.classList.remove('animate-pulse'), 1500);
    }
}

/**
 * Animation de tour (à toi de jouer)
 */
export function playTurnAnimation() {
    const indicator = helpers.$('#current-player-indicator');
    if (indicator) {
        indicator.classList.add('animate-bounce-strong');
        setTimeout(() => indicator.classList.remove('animate-bounce-strong'), 1500);
    }
}

/* ============================================================
   ANIMATIONS DE VICTOIRE / DÉFAITE
   ============================================================ */

/**
 * Animation de victoire
 */
export function playVictoryAnimation() {
    launchConfetti(200, { duration: 5000 });

    // Vibration
    if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100, 50, 200]);
    }
}

/**
 * Animation de défaite
 */
export function playDefeatAnimation() {
    // Vibration courte
    if (navigator.vibrate) {
        navigator.vibrate([200]);
    }

    // Fade gris
    document.body.classList.add('defeat-overlay');
    setTimeout(() => document.body.classList.remove('defeat-overlay'), 1500);
}

/* ============================================================
   UTILITAIRES
   ============================================================ */

/**
 * Vérifie si une animation est active
 */
export function isAnimating(type) {
    return state.activeAnimations.has(type);
}

/**
 * Annule toutes les animations
 */
export function cancelAll() {
    state.activeAnimations.clear();

    const overlay = helpers.$('#card-animation-overlay');
    if (overlay) {
        overlay.classList.remove('active');
        overlay.classList.add('hidden');
    }

    const confettiOverlay = helpers.$('#confetti-overlay');
    const confettiContainer = helpers.$('#confetti-container');
    if (confettiOverlay && confettiContainer) {
        confettiContainer.innerHTML = '';
        confettiOverlay.classList.add('hidden');
    }

    if (state.confettiTimeout) {
        clearTimeout(state.confettiTimeout);
        state.confettiTimeout = null;
    }
}

/**
 * Attend la fin d'une animation
 */
export function waitForAnimation(duration) {
    return helpers.sleep(duration);
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    playCardAnimation,
    launchConfetti,
    launchChampionConfetti,
    fadeTransition,
    pulseElement,
    shineElement,
    wiggleElement,
    bounceElement,
    fadeInElement,
    fadeOutElement,
    typeWriter,
    countUp,
    playAttackAnimation,
    playBlockAnimation,
    playTurnAnimation,
    playVictoryAnimation,
    playDefeatAnimation,
    isAnimating,
    cancelAll,
    waitForAnimation,
    CARD_ANIMATIONS
};