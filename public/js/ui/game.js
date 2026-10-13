// =============================================================
// JEU DE CARTES — UI : GAME (Écran de jeu principal)
// =============================================================
// Gère le rendu du jeu : adversaires, zone centrale, main,
// interactions, chat, journal, animations.
// =============================================================

import store from '../state.js';
import { socket, socketActions } from '../socket.js';
import { router, navigateTo, SCREENS } from '../router.js';
import helpers from '../utils/helpers.js';
import i18n from '../utils/i18n.js';

/* ============================================================
   ÉTAT LOCAL
   ============================================================ */

const state = {
    gameId: null,
    selectedCards: new Set(),
    unsubscribers: [],
    initialized: false,
    lastTurnPlayerId: null,
    pendingSuitChoice: null,
    isProcessing: false
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(params = {}) {
    console.log('🎮 Initialisation de l\'écran de jeu');

    state.gameId = params.gameId || store.get('game.id');

    if (!state.gameId) {
        console.warn('⚠️ Pas de gameId, retour au lobby');
        navigateTo(SCREENS.LOBBY);
        return;
    }

    // Attacher les événements
    attachEvents();

    // S'abonner aux changements
    setupSubscriptions();

    // Rendu initial
    renderGame();

    state.initialized = true;
    console.log('✅ Écran de jeu initialisé:', state.gameId);
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton quitter
    const exitBtn = helpers.$('#btn-exit-game');
    if (exitBtn) {
        exitBtn.addEventListener('click', handleQuit);
    }

    // Bouton chat
    const chatBtn = helpers.$('#btn-game-chat');
    if (chatBtn) {
        chatBtn.addEventListener('click', toggleChat);
    }

    // Bouton règles
    const rulesBtn = helpers.$('#btn-game-rules');
    if (rulesBtn) {
        rulesBtn.addEventListener('click', () => {
            helpers.$('#modal-rules')?.classList.add('active');
        });
    }

    // Bouton fermer le chat
    const closeChatBtn = helpers.$('#btn-close-chat');
    if (closeChatBtn) {
        closeChatBtn.addEventListener('click', toggleChat);
    }

    // Bouton envoyer message
    const sendChatBtn = helpers.$('#btn-send-chat');
    if (sendChatBtn) {
        sendChatBtn.addEventListener('click', sendChatMessage);
    }

    // Input chat (Enter)
    const chatInput = helpers.$('#chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendChatMessage();
            }
        });
    }

    // Bouton jouer la sélection
    const playBtn = helpers.$('#btn-play-selected');
    if (playBtn) {
        playBtn.addEventListener('click', handlePlaySelected);
    }

    // Bouton piocher
    const drawBtn = helpers.$('#btn-draw-card');
    if (drawBtn) {
        drawBtn.addEventListener('click', handleDrawCard);
    }

    // Banque (clic)
    const bankCard = helpers.$('#bank-display');
    if (bankCard) {
        bankCard.addEventListener('click', handleDrawCard);
    }

    // Journal (toggle)
    const logHeader = helpers.$('#log-header');
    if (logHeader) {
        logHeader.addEventListener('click', toggleLog);
    }

    // Modal choix de couleur (J)
    helpers.$$('.suit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const suit = btn.dataset.suit;
            confirmSuitChoice(suit);
        });
    });
}

/* ============================================================
   ACTIONS
   ============================================================ */

function handleQuit() {
    const confirmed = confirm(i18n.t('game.quit_confirm'));
    if (!confirmed) return;

    if (state.gameId) {
        socketActions.leaveGame(state.gameId);
    }

    store.reset('game');
    state.selectedCards.clear();
    navigateTo(SCREENS.LOBBY);
}

function toggleChat() {
    const panel = helpers.$('#game-chat-panel');
    if (panel) {
        panel.classList.toggle('hidden');

        // Focus sur l'input si on ouvre
        if (!panel.classList.contains('hidden')) {
            setTimeout(() => {
                helpers.$('#chat-input')?.focus();
            }, 100);
        }
    }
}

function toggleLog() {
    const content = helpers.$('#log-content');
    const btn = helpers.$('#btn-toggle-log');
    if (!content) return;

    content.classList.toggle('collapsed');

    if (btn) {
        btn.textContent = content.classList.contains('collapsed') ? '▲' : '▼';
    }
}

function sendChatMessage() {
    const input = helpers.$('#chat-input');
    if (!input) return;

    const message = input.value.trim();
    if (!message) return;

    if (!state.gameId) return;

    socketActions.sendChatMessage(state.gameId, message);
    input.value = '';
}

/* ============================================================
   SÉLECTION DE CARTES
   ============================================================ */

function handleCardClick(cardId) {
    if (state.isProcessing) return;

    const hand = store.get('game.hand', []);
    const card = hand.find(c => c.id === cardId);

    if (!card) return;

    // Vérifier si la carte est jouable
    if (!isCardPlayable(card)) {
        showToast('Cette carte ne peut pas être jouée', 'warning');
        return;
    }

    // Vérifier la règle du même rang
    if (state.selectedCards.size > 0) {
        const firstCardId = Array.from(state.selectedCards)[0];
        const firstCard = hand.find(c => c.id === firstCardId);

        if (firstCard && firstCard.rank !== card.rank) {
            // Remplacer la sélection
            state.selectedCards.clear();
            state.selectedCards.add(cardId);
            updateCardSelection();
            return;
        }
    }

    // Toggle la sélection
    if (state.selectedCards.has(cardId)) {
        state.selectedCards.delete(cardId);
    } else {
        state.selectedCards.add(cardId);
    }

    updateCardSelection();
}

function updateCardSelection() {
    // Mettre à jour l'UI
    helpers.$$('.hand-card').forEach(cardEl => {
        const cardId = cardEl.dataset.cardId;
        cardEl.classList.toggle('selected', state.selectedCards.has(cardId));
    });

    // Mettre à jour l'état
    store.set('game.selectedCards', Array.from(state.selectedCards));

    // Mettre à jour le bouton Jouer
    updatePlayButton();
}

function updatePlayButton() {
    const btn = helpers.$('#btn-play-selected');
    if (!btn) return;

    const isMyTurn = store.get('game.isMyTurn', false);
    const hasSelection = state.selectedCards.size > 0;
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));

    btn.disabled = !isMyTurn || !hasSelection || (me && me.rank);
}

/* ============================================================
   JOUER DES CARTES
   ============================================================ */

async function handlePlaySelected() {
    if (state.isProcessing) return;
    if (state.selectedCards.size === 0) return;

    const hand = store.get('game.hand', []);
    const cardIds = Array.from(state.selectedCards);
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);

    // Vérifier s'il y a un J dans la sélection
    const hasJack = cards.some(c => c.rank === 'J');

    if (hasJack) {
        // Ouvrir le modal de choix de couleur
        state.pendingSuitChoice = cardIds;
        helpers.$('#modal-suit')?.classList.add('active');
        return;
    }

    // Jouer directement
    await playCards(cardIds, null);
}

async function playCards(cardIds, imposedSuit) {
    if (state.isProcessing) return;
    state.isProcessing = true;

    try {
        const response = await socketActions.playCards(state.gameId, cardIds, imposedSuit);

        if (response && !response.success) {
            throw new Error(response.error || 'Coup invalide');
        }

        // Vider la sélection
        state.selectedCards.clear();
        updateCardSelection();

    } catch (error) {
        console.error('Erreur jouer carte:', error);
        showToast(error.message || 'Coup invalide', 'error');
    } finally {
        state.isProcessing = false;
    }
}

function confirmSuitChoice(suit) {
    helpers.$('#modal-suit')?.classList.remove('active');

    if (state.pendingSuitChoice) {
        playCards(state.pendingSuitChoice, suit);
        state.pendingSuitChoice = null;
    }
}

async function handleDrawCard() {
    if (state.isProcessing) return;

    const isMyTurn = store.get('game.isMyTurn', false);
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));

    if (!isMyTurn || (me && me.rank)) {
        showToast('Ce n\'est pas votre tour', 'warning');
        return;
    }

    state.isProcessing = true;

    try {
        socketActions.drawCard(state.gameId);
    } catch (error) {
        console.error('Erreur pioche:', error);
        showToast(error.message, 'error');
    } finally {
        setTimeout(() => { state.isProcessing = false; }, 500);
    }
}

/* ============================================================
   RENDU PRINCIPAL
   ============================================================ */

function renderGame() {
    renderHeader();
    renderOpponents();
    renderCenterCard();
    renderTurnInfo();
    renderMyHand();
    renderIndicators();
    renderLog();
    renderChat();
}

function renderHeader() {
    const codeEl = helpers.$('#game-code-display');
    if (codeEl) codeEl.textContent = state.gameId;

    const statusEl = helpers.$('#game-status');
    if (statusEl) {
        const status = store.get('game.status', 'waiting');
        statusEl.textContent = status === 'playing' ? '🟢 En cours' :
            status === 'finished' ? '🏁 Terminée' : '⏳ En attente';
    }
}

function renderOpponents() {
    const container = helpers.$('#opponents-zone');
    if (!container) return;

    const myId = store.get('player.id');
    const players = store.get('game.players', []);
    const currentPlayerId = store.get('game.currentPlayerId');

    const opponents = players.filter(p => p.id !== myId);

    if (opponents.length === 0) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = opponents.map(player => {
        const isCurrent = player.id === currentPlayerId;
        const isFinished = player.rank !== null && player.rank !== undefined;

        let classes = 'opponent';
        if (isCurrent) classes += ' current';
        if (!player.isConnected && !player.isBot) classes += ' disconnected';
        if (isFinished) classes += ' finished';
        if (player.isBot) classes += ' bot-opponent';

        // Mini-cartes
        const miniCardsCount = Math.min(player.cardCount || 0, 8);
        const miniCards = Array(miniCardsCount).fill('<div class="mini-card"></div>').join('');

        return `
      <div class="${classes}">
        <div class="opponent-name">
          ${player.avatar || '👤'} ${helpers.escapeHtml(player.name)}
        </div>
        ${player.isBot ? `<div class="opponent-bot-badge">🤖 ${player.botDifficulty || 'Bot'}</div>` : ''}
        <div class="opponent-cards">
          🖐️ ${player.cardCount || 0} cartes
        </div>
        ${isFinished ? `<div class="opponent-rank">🏆 #${player.rank}</div>` : ''}
        <div class="mini-cards">${miniCards}</div>
      </div>
    `;
    }).join('');
}

function renderCenterCard() {
    const container = helpers.$('#center-card-display');
    if (!container) return;

    const card = store.get('game.centerCard');

    if (!card) {
        container.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">En attente...</div>';
        return;
    }

    container.innerHTML = renderCardHTML(card);

    // Appliquer les classes CSS
    let classes = 'card center-card';
    if (card.type === 'joker') {
        classes += ' joker';
        if (card.jokerColor === 'noir') classes += ' joker-black';
    } else {
        classes += ` ${card.color || 'black'}`;
    }
    container.className = classes;

    // Compteurs
    const bankCountEl = helpers.$('#bank-count');
    if (bankCountEl) {
        bankCountEl.textContent = `${store.get('game.bankCount', 0)} cartes`;
    }

    const pileCountEl = helpers.$('#pile-count');
    if (pileCountEl) {
        pileCountEl.textContent = `${store.get('game.pileCount', 0)} cartes`;
    }
}

function renderTurnInfo() {
    const indicator = helpers.$('#current-player-indicator');
    if (!indicator) return;

    const isMyTurn = store.get('game.isMyTurn', false);
    const myId = store.get('player.id');
    const me = store.get('game.players', []).find(p => p.id === myId);

    if (me && me.rank) {
        indicator.textContent = `🏆 Vous avez terminé #${me.rank} !`;
        indicator.classList.remove('my-turn');
    } else if (isMyTurn) {
        indicator.textContent = i18n.t('game.your_turn');
        indicator.classList.add('my-turn');
    } else {
        const currentPlayer = store.get('game.players', []).find(
            p => p.id === store.get('game.currentPlayerId')
        );
        indicator.textContent = currentPlayer
            ? i18n.t('game.waiting_turn', { player: currentPlayer.name })
            : '⏳ En attente...';
        indicator.classList.remove('my-turn');
    }
}

function renderIndicators() {
    // Couleur imposée
    const imposedEl = helpers.$('#imposed-display');
    if (imposedEl) {
        const imposedSuit = store.get('game.imposedSuit');
        const imposedColor = store.get('game.imposedColor');
        const centerCard = store.get('game.centerCard');

        if (imposedSuit) {
            const symbols = { pique: '♠', carreau: '♦', coeur: '♥', trefle: '♣' };
            imposedEl.classList.remove('hidden');
            imposedEl.textContent = `🎭 Couleur imposée : ${symbols[imposedSuit]} ${imposedSuit}`;
        } else if (imposedColor) {
            imposedEl.classList.remove('hidden');
            imposedEl.textContent = imposedColor === 'red'
                ? '🃏 Joker Rouge — Jouez du rouge 🔴'
                : '🃏 Joker Noir — Jouez du noir ⚫';
        } else if (centerCard && centerCard.type === 'joker') {
            imposedEl.classList.remove('hidden');
            imposedEl.textContent = centerCard.color === 'red'
                ? '🃏 Centre = Joker Rouge — Jouez du rouge 🔴'
                : '🃏 Centre = Joker Noir — Jouez du noir ⚫';
        } else {
            imposedEl.classList.add('hidden');
        }
    }

    // Attaque en cours
    const pendingEl = helpers.$('#pending-draw-display');
    if (pendingEl) {
        const pendingDraw = store.get('game.pendingDraw', 0);
        if (pendingDraw > 0) {
            pendingEl.classList.remove('hidden');
            pendingEl.textContent = `⚠️ ${pendingDraw} cartes en attente !`;
        } else {
            pendingEl.classList.add('hidden');
        }
    }
}

/* ============================================================
   RENDU DE LA MAIN
   ============================================================ */

function renderMyHand() {
    const container = helpers.$('#my-hand');
    if (!container) return;

    const hand = store.get('game.hand', []);
    const isMyTurn = store.get('game.isMyTurn', false);
    const me = store.get('game.players', []).find(p => p.id === store.get('player.id'));

    // Compteur
    const countEl = helpers.$('#my-card-count');
    if (countEl) countEl.textContent = hand.length;

    if (hand.length === 0) {
        container.innerHTML = `
      <div class="hand-empty">
        ${me && me.rank ? `🎉 Vous avez terminé #${me.rank} !` : 'Aucune carte en main'}
      </div>
    `;
        updatePlayButton();
        return;
    }

    const canPlay = isMyTurn && !(me && me.rank);

    container.innerHTML = hand.map(card => {
        const playable = canPlay && isCardPlayable(card);
        const selected = state.selectedCards.has(card.id);

        let classes = 'hand-card';
        if (selected) classes += ' selected';
        if (playable) classes += ' playable';
        else if (canPlay) classes += ' not-playable';

        return `
      <div class="${classes}" data-card-id="${card.id}">
        <div class="card ${card.type === 'joker' ? 'joker' : card.color || 'black'}${card.jokerColor === 'noir' ? ' joker-black' : ''}">
          ${renderCardHTML(card)}
        </div>
      </div>
    `;
    }).join('');

    // Attacher les handlers de clic
    container.querySelectorAll('.hand-card').forEach(cardEl => {
        cardEl.addEventListener('click', () => handleCardClick(cardEl.dataset.cardId));
    });

    updatePlayButton();
}

function renderCardHTML(card) {
    if (!card) return '';

    if (card.type === 'joker') {
        return `
      <div class="card-corner top-left">🃏</div>
      <div class="card-symbol">${card.jokerColor === 'rouge' ? '🔴' : '⚫'}</div>
      <div class="card-rank">JOKER</div>
      <div class="card-corner bottom-right">🃏</div>
    `;
    }

    const symbol = card.symbol || helpers.getSuitSymbol(card.suit);

    return `
    <div class="card-corner top-left">${card.rank}<br>${symbol}</div>
    <div class="card-symbol">${symbol}</div>
    <div class="card-rank">${card.rank}</div>
    <div class="card-corner bottom-right">${card.rank}<br>${symbol}</div>
  `;
}

/* ============================================================
   VÉRIFICATION DE JOUABILITÉ
   ============================================================ */

function isCardPlayable(card) {
    if (!card) return false;

    const pendingDraw = store.get('game.pendingDraw', 0);
    const imposedSuit = store.get('game.imposedSuit');
    const imposedColor = store.get('game.imposedColor');
    const centerCard = store.get('game.centerCard');

    // Attaque en cours : seuls 7 et Joker
    if (pendingDraw > 0) {
        return card.type === 'joker' || card.rank === '7';
    }

    // Joker passe toujours
    if (card.type === 'joker') return true;

    // Couleur imposée par un J
    if (imposedSuit) {
        return card.suit === imposedSuit;
    }

    // Couleur imposée par un Joker
    if (imposedColor) {
        return card.color === imposedColor;
    }

    // Centre = Joker → même couleur
    if (centerCard && centerCard.type === 'joker') {
        return card.color === centerCard.color;
    }

    // Cas normal
    if (!centerCard) return true;

    return card.rank === centerCard.rank || card.suit === centerCard.suit;
}

/* ============================================================
   JOURNAL & CHAT
   ============================================================ */

function renderLog() {
    const container = helpers.$('#log-content');
    if (!container) return;

    const log = store.get('game.log', []);

    if (log.length === 0) {
        container.innerHTML = '<div class="log-entry" style="opacity:0.5;">Aucun événement</div>';
        return;
    }

    container.innerHTML = log.slice().reverse().map(entry => {
        const message = typeof entry === 'string' ? entry : entry.message || '';
        return `<div class="log-entry">${helpers.escapeHtml(message)}</div>`;
    }).join('');
}

function renderChat() {
    const container = helpers.$('#chat-messages');
    if (!container) return;

    const chat = store.get('game.chat', []);
    const myId = store.get('player.id');

    if (chat.length === 0) {
        container.innerHTML = '<div style="opacity:0.5;text-align:center;padding:20px;font-size:13px;">Aucun message</div>';
        return;
    }

    container.innerHTML = chat.map(msg => {
        const isMe = msg.playerId === myId;
        let classes = 'chat-message';
        if (isMe) classes += ' me';
        if (msg.isBot) classes += ' bot';
        if (msg.isSystem) classes += ' system';

        return `
      <div class="${classes}">
        <div class="chat-message-header">
          ${msg.avatar || '👤'} ${helpers.escapeHtml(msg.playerName || 'Système')}
        </div>
        <div class="chat-message-body">${helpers.escapeHtml(msg.message || '')}</div>
      </div>
    `;
    }).join('');

    // Auto-scroll
    container.scrollTop = container.scrollHeight;
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // État du jeu
    state.unsubscribers.push(
        store.subscribe('game.centerCard', renderCenterCard),
        store.subscribe('game.players', () => {
            renderOpponents();
            renderTurnInfo();
            renderMyHand();
        }),
        store.subscribe('game.currentPlayerId', () => {
            renderOpponents();
            renderTurnInfo();
            renderMyHand();
        }),
        store.subscribe('game.isMyTurn', () => {
            renderTurnInfo();
            renderMyHand();
            updatePlayButton();
            playTurnSound();
        }),
        store.subscribe('game.hand', renderMyHand),
        store.subscribe('game.imposedSuit', renderIndicators),
        store.subscribe('game.imposedColor', renderIndicators),
        store.subscribe('game.pendingDraw', renderIndicators),
        store.subscribe('game.log', renderLog),
        store.subscribe('game.chat', renderChat)
    );

    // Socket events
    socket.on('game:update', (data) => {
        if (data.game) {
            store.set('game', normalizeGameState(data.game));
        }
    });

    socket.on('game:cards_drawn', (data) => {
        if (data.cards && data.cards.length > 0) {
            showToast(i18n.t('notif.cards_drawn', { count: data.cards.length }), 'info');
        }
    });

    socket.on('game:card_animation', (data) => {
        triggerCardAnimation(data);
    });

    socket.on('game:over', (data) => {
        handleGameOver(data);
    });

    socket.on('chat:message', (data) => {
        const chat = store.get('game.chat', []);
        store.set('game.chat', [...chat, data]);
    });

    socket.on('game:bot_chat', (data) => {
        const chat = store.get('game.chat', []);
        store.set('game.chat', [...chat, {
            playerId: data.botId,
            playerName: data.botName,
            avatar: '🤖',
            message: data.message,
            isBot: true
        }]);
    });
}

/* ============================================================
   NORMALISATION DU STATE
   ============================================================ */

function normalizeGameState(game) {
    const myId = store.get('player.id');
    const myPlayer = game.players?.find(p => p.id === myId);

    return {
        id: game.id,
        status: game.status,
        mode: game.mode,
        players: game.players || [],
        centerCard: game.centerCard,
        bankCount: game.bankCount || 0,
        pileCount: game.pileCount || 0,
        currentPlayerId: game.currentPlayerId,
        currentPlayerIndex: game.currentPlayerIndex || 0,
        imposedSuit: game.imposedSuit,
        imposedColor: game.imposedColor,
        pendingDraw: game.pendingDraw || 0,
        skipNext: game.skipNext || false,
        direction: game.direction || 1,
        turnCount: game.turnCount || 0,
        hand: myPlayer?.hand || [],
        finishedPlayers: game.finishedPlayers || [],
        log: game.log || [],
        chat: game.chat || store.get('game.chat', []),
        isMyTurn: game.currentPlayerId === myId,
        myRank: myPlayer?.rank || null
    };
}

/* ============================================================
   ANIMATIONS
   ============================================================ */

function triggerCardAnimation(data) {
    const { type, color, playerName } = data;

    const overlay = helpers.$('#card-animation-overlay');
    const bg = helpers.$('#card-animation-bg');
    const content = helpers.$('#card-animation-content');

    if (!overlay || !bg || !content) return;

    // Déterminer la config selon le type
    let bgClass = '';
    let emoji = '';
    let title = '';
    let subtitle = '';

    switch (type) {
        case 'joker':
            bgClass = color === 'red' ? 'joker-red' : 'joker-black';
            emoji = '🃏';
            title = color === 'red' ? 'JOKER ROUGE !' : 'JOKER NOIR !';
            subtitle = '+4 cartes pour le suivant';
            break;
        case 'seven':
            bgClass = color === 'red' ? 'seven-red' : 'seven-black';
            emoji = '7️⃣';
            title = 'SEPT !';
            subtitle = '+2 cartes pour le suivant';
            break;
        case 'ace':
            bgClass = 'ace';
            emoji = '🅰️';
            title = 'AS !';
            subtitle = 'Le suivant est suspendu';
            break;
        case 'jack':
            bgClass = 'jack';
            emoji = '🎭';
            title = 'VALET COMMANDE !';
            subtitle = 'Une couleur est imposée';
            break;
        default:
            return;
    }

    // Configurer le fond
    bg.className = `card-animation-bg ${bgClass}`;

    // Particules
    let particles = '<div class="card-animation-particles">';
    for (let i = 0; i < 12; i++) {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const size = 24 + Math.random() * 24;
        particles += `<span class="card-particle" style="left:${left}%; bottom: 30%; animation-delay:${delay}s; font-size:${size}px;">${emoji}</span>`;
    }
    particles += '</div>';

    // Contenu
    content.innerHTML = `
    ${particles}
    <div class="card-animation-emoji">${emoji}</div>
    <div class="card-animation-title">${title}</div>
    <div class="card-animation-subtitle">${playerName ? playerName + ' • ' : ''}${subtitle}</div>
  `;

    // Afficher
    overlay.classList.remove('hidden');
    void overlay.offsetWidth;
    overlay.classList.add('active');

    // Cacher après l'animation
    setTimeout(() => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }, 1300);
}

/* ============================================================
   FIN DE PARTIE
   ============================================================ */

function handleGameOver(data) {
    console.log('🏁 Partie terminée');

    const modal = helpers.$('#modal-game-over');
    const ranking = helpers.$('#game-over-ranking');

    if (!modal || !ranking) return;

    const finalRanking = data.finalRanking || store.get('game.finishedPlayers', []);

    ranking.innerHTML = finalRanking.map((player, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        const isMe = player.id === store.get('player.id');

        return `
      <div class="ranking-item ${index === 0 ? 'winner' : ''} ${isMe ? 'me' : ''}">
        <span class="ranking-position">${medal}</span>
        <span class="ranking-name">${helpers.escapeHtml(player.name)}</span>
        ${isMe ? '<span style="color: var(--color-primary); font-size: 12px;">(vous)</span>' : ''}
      </div>
    `;
    }).join('');

    modal.classList.add('active');

    // Confettis si le joueur a gagné
    const winner = finalRanking[0];
    if (winner && winner.id === store.get('player.id')) {
        launchConfetti(200);
    }
}

function launchConfetti(count = 150) {
    const overlay = helpers.$('#confetti-overlay');
    const container = helpers.$('#confetti-container');

    if (!overlay || !container) return;

    overlay.classList.remove('hidden');

    const colors = ['#6C63FF', '#FF6584', '#F39C12', '#2ECC71', '#00D4FF', '#FFD700', '#FF8FA3'];

    for (let i = 0; i < count; i++) {
        const piece = helpers.createElement('div', {
            className: 'confetti-piece',
            style: {
                left: Math.random() * 100 + '%',
                background: colors[Math.floor(Math.random() * colors.length)],
                animationDuration: (2 + Math.random() * 3) + 's',
                animationDelay: (Math.random() * 0.5) + 's',
                width: (6 + Math.random() * 10) + 'px',
                height: (10 + Math.random() * 12) + 'px',
                borderRadius: Math.random() > 0.5 ? '50%' : '2px'
            }
        });

        container.appendChild(piece);

        setTimeout(() => {
            if (piece.parentNode) piece.parentNode.removeChild(piece);
        }, 6000);
    }

    setTimeout(() => {
        if (container.children.length === 0) {
            overlay.classList.add('hidden');
        }
    }, 7000);
}

/* ============================================================
   SONS
   ============================================================ */

function playTurnSound() {
    const isMyTurn = store.get('game.isMyTurn', false);
    const previousTurn = state.lastTurnPlayerId;
    const currentTurn = store.get('game.currentPlayerId');

    if (currentTurn !== previousTurn && isMyTurn) {
        // Jouer un son si activé
        const settings = store.get('settings', {});
        if (settings.soundEnabled) {
            playSound('/assets/audio/turn-ding.mp3');
        }
        // Vibration
        if (settings.hapticEnabled && navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    state.lastTurnPlayerId = currentTurn;
}

function playSound(src, volume = 0.5) {
    try {
        const audio = new Audio(src);
        audio.volume = volume;
        audio.play().catch(() => {});
    } catch (error) {
        // Ignore silencieusement
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
   NETTOYAGE
   ============================================================ */

export function destroy() {
    state.unsubscribers.forEach(unsub => unsub && unsub());
    state.unsubscribers = [];
    state.selectedCards.clear();
    state.initialized = false;
    state.gameId = null;
    state.lastTurnPlayerId = null;
    console.log('🧹 Écran de jeu nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy
};