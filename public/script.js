// ===== ÉTAT GLOBAL =====
let socket = null;
let currentGame = null;
let myPlayerId = null;
let myGameId = null;
let myName = '';
let selectedCards = new Set();
let botDifficulty = 'medium';
let pendingImposedSuit = null;

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', () => {
    // Restaurer le nom
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
        document.getElementById('playerName').value = savedName;
    }

    // Vérifier si un gameId est dans l'URL
    const urlParams = new URLSearchParams(window.location.search);
    const gameFromUrl = urlParams.get('game');
    if (gameFromUrl) {
        document.getElementById('gameCodeInput').value = gameFromUrl;
    }

    // Événements
    setupEventListeners();

    // Connexion socket
    initSocket();
});

// ===== ÉVÉNEMENTS =====
function setupEventListeners() {
    document.getElementById('quickPlayBtn').addEventListener('click', quickPlay);
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    document.getElementById('joinGameBtn').addEventListener('click', joinGame);
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('copyCodeBtn').addEventListener('click', copyGameCode);
    document.getElementById('playSelectedBtn').addEventListener('click', playSelectedCards);
    document.getElementById('drawCardBtn').addEventListener('click', drawCard);
    document.getElementById('bankDisplay').addEventListener('click', drawCard);
    document.getElementById('leaveGameBtn').addEventListener('click', leaveGame);
    document.getElementById('backToLobbyBtn').addEventListener('click', leaveGame);
    document.getElementById('rulesBtn').addEventListener('click', () => openModal('rulesModal'));
    document.getElementById('logHeader').addEventListener('click', toggleLog);
    document.getElementById('addBotBtn').addEventListener('click', addBot);
    document.getElementById('botDifficulty').addEventListener('change', (e) => {
        botDifficulty = e.target.value;
    });

    // Modal suit
    document.querySelectorAll('.suit-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const suit = btn.dataset.suit;
            closeModal('suitModal');
            playSelectedCards(suit);
        });
    });

    // Fermer les modals en cliquant à l'extérieur
    document.querySelectorAll('.modal').forEach(modal => {
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('active');
            }
        });
    });
}

// ===== SOCKET =====
function initSocket() {
    socket = io();

    socket.on('connect', () => {
        console.log('✅ Connecté au serveur');
        myPlayerId = socket.id;
    });

    socket.on('gameCreated', ({ gameId, playerId, game }) => {
        myGameId = gameId;
        myPlayerId = playerId;
        currentGame = game;
        showScreen('waitingScreen');
        updateWaitingScreen();
        showNotification('✅ Partie créée !', 'success');
    });

    socket.on('gameJoined', ({ gameId, playerId, game }) => {
        myGameId = gameId;
        myPlayerId = playerId;
        currentGame = game;
        showScreen('waitingScreen');
        updateWaitingScreen();
        showNotification('✅ Partie rejointe !', 'success');
    });

    socket.on('playerJoined', ({ players, game }) => {
        currentGame = game;
        updateWaitingScreen();
    });

    socket.on('playerLeft', ({ players, game }) => {
        if (game) currentGame = game;
        showNotification('Un joueur a quitté la partie');
        updateWaitingScreen();
    });

    socket.on('gameStarted', ({ game }) => {
        currentGame = game;
        showScreen('gameScreen');
        renderGame();
        showNotification('🎮 La partie commence !', 'success');
    });

    socket.on('gameUpdate', ({ game }) => {
        currentGame = game;
        selectedCards.clear();
        renderGame();
    });

    socket.on('cardsDrawn', ({ cards }) => {
        if (cards && cards.length > 0) {
            showNotification(`📥 Vous avez pioché ${cards.length} carte(s)`);
        }
    });

    socket.on('error', ({ message }) => {
        showNotification(`❌ ${message}`, 'error');
    });

    socket.on('playerDisconnected', ({ playerName }) => {
        showNotification(`⚠️ ${playerName} s'est déconnecté`);
    });

    socket.on('disconnect', () => {
        console.log('❌ Déconnecté du serveur');
    });
}

// ===== SCREENS =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(screenId).classList.add('active');
}

// ===== LOBBY =====
function createGame() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        showNotification('Veuillez entrer votre nom', 'error');
        return;
    }
    myName = name;
    localStorage.setItem('playerName', name);
    socket.emit('createGame', { playerName: name, maxPlayers: 4 });
}

function joinGame() {
    const name = document.getElementById('playerName').value.trim();
    const gameId = document.getElementById('gameCodeInput').value.trim();

    if (!name) {
        showNotification('Veuillez entrer votre nom', 'error');
        return;
    }
    if (!gameId) {
        showNotification('Veuillez entrer un code de partie', 'error');
        return;
    }

    myName = name;
    localStorage.setItem('playerName', name);
    socket.emit('joinGame', { gameId, playerName: name });
}

// ===== PARTIE RAPIDE CONTRE L'IA =====
function quickPlay() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        showNotification('Veuillez entrer votre nom', 'error');
        return;
    }

    myName = name;
    localStorage.setItem('playerName', name);

    // Créer la partie
    socket.emit('createGame', { playerName: name, maxPlayers: 4 });

    // Ajouter les bots dès que la partie est créée
    const handleCreated = () => {
        socket.off('gameCreated', handleCreated);

        // Ajouter 3 bots avec difficultés croissantes
        setTimeout(() => {
            socket.emit('addBot', { gameId: myGameId, difficulty: 'easy' });
            setTimeout(() => {
                socket.emit('addBot', { gameId: myGameId, difficulty: 'medium' });
                setTimeout(() => {
                    socket.emit('addBot', { gameId: myGameId, difficulty: 'hard' });
                    setTimeout(() => {
                        socket.emit('startGame', { gameId: myGameId });
                    }, 600);
                }, 400);
            }, 400);
        }, 400);
    };

    socket.on('gameCreated', handleCreated);
}

// ===== SALLE D'ATTENTE =====
function updateWaitingScreen() {
    if (!currentGame) return;

    document.getElementById('displayGameCode').textContent = currentGame.id;
    document.getElementById('playerCount').textContent = currentGame.players.length;
    document.getElementById('maxPlayers').textContent = currentGame.maxPlayers;

    const list = document.getElementById('waitingPlayersList');
    list.innerHTML = currentGame.players.map(p => `
    <div class="player-item ${p.id === currentGame.hostId ? 'host' : ''} ${p.isBot ? 'bot' : ''}">
      <span>${escapeHtml(p.name)}</span>
      ${p.isBot ? `<span class="bot-badge">🤖 ${p.botDifficulty || 'bot'}</span>` : ''}
      ${p.id === myPlayerId ? '<span style="color:var(--primary);font-size:12px;">(vous)</span>' : ''}
      ${p.isBot && currentGame.hostId === myPlayerId ?
        `<button onclick="removeBot('${p.id}')" style="margin-left:auto;background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;">×</button>`
        : ''}
    </div>
  `).join('');

    // Contrôles de bot
    const botControls = document.getElementById('botControls');
    botControls.style.display =
        (currentGame.hostId === myPlayerId && currentGame.players.length < currentGame.maxPlayers)
            ? 'flex' : 'none';

    // Bouton démarrer
    const startBtn = document.getElementById('startGameBtn');
    const message = document.getElementById('waitingMessage');

    if (currentGame.hostId === myPlayerId && currentGame.players.length >= 2) {
        startBtn.style.display = 'inline-block';
        message.style.display = 'none';
    } else if (currentGame.hostId === myPlayerId) {
        startBtn.style.display = 'none';
        message.textContent = 'Ajoutez un bot ou attendez un joueur...';
        message.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
        message.textContent = 'En attente du démarrage par l\'hôte...';
        message.style.display = 'block';
    }
}

function copyGameCode() {
    if (!currentGame) return;
    navigator.clipboard.writeText(currentGame.id).then(() => {
        showNotification('📋 Code copié !', 'success');
    });
}

function startGame() {
    if (!currentGame) return;
    socket.emit('startGame', { gameId: currentGame.id });
}

// ===== BOTS =====
function addBot() {
    if (!currentGame) return;
    if (currentGame.hostId !== myPlayerId) {
        showNotification('Seul l\'hôte peut ajouter des bots', 'error');
        return;
    }
    if (currentGame.players.length >= currentGame.maxPlayers) {
        showNotification('La partie est complète', 'error');
        return;
    }

    socket.emit('addBot', {
        gameId: currentGame.id,
        difficulty: botDifficulty
    });
}

function removeBot(botId) {
    if (!currentGame) return;
    socket.emit('removeBot', { gameId: currentGame.id, botId });
}

window.removeBot = removeBot;

// ===== ÉCRAN DE JEU =====
function renderGame() {
    if (!currentGame) return;

    // Header
    document.getElementById('gameCodeDisplay').textContent = currentGame.id;
    document.getElementById('gameStatus').textContent =
        currentGame.status === 'playing' ? '🟢 En cours' :
            currentGame.status === 'finished' ? '🏁 Terminée' : '⏳ En attente';

    // Adversaires
    renderOpponents();

    // Carte centrale
    renderCenterCard();

    // Banque
    document.getElementById('bankCount').textContent = `${currentGame.bankCount} cartes`;
    document.getElementById('pileCount').textContent = `${currentGame.pileCount} cartes`;

    // Tour
    renderTurnInfo();

    // Ma main
    renderMyHand();

    // Journal
    renderLog();

    // PendingDraw
    const pendingDisplay = document.getElementById('pendingDrawDisplay');
    if (currentGame.pendingDraw > 0) {
        pendingDisplay.style.display = 'block';
        pendingDisplay.textContent = `⚠️ ${currentGame.pendingDraw} cartes en attente !`;
    } else {
        pendingDisplay.style.display = 'none';
    }

    // Couleur imposée
    const imposedDisplay = document.getElementById('imposedSuitDisplay');
    if (currentGame.imposedSuit) {
        const symbols = { pique: '♠', carreau: '♦', coeur: '♥', trefle: '♣' };
        imposedDisplay.style.display = 'block';
        imposedDisplay.textContent = `🎭 Couleur imposée : ${symbols[currentGame.imposedSuit]} ${currentGame.imposedSuit}`;
    } else {
        imposedDisplay.style.display = 'none';
    }

    // Fin de partie
    if (currentGame.status === 'finished') {
        showGameOver();
    }
}

function renderOpponents() {
    const zone = document.getElementById('opponentsZone');
    const opponents = currentGame.players.filter(p => p.id !== myPlayerId);

    if (opponents.length === 0) {
        zone.innerHTML = '';
        return;
    }

    zone.innerHTML = opponents.map(p => {
        const isCurrent = p.id === currentGame.currentPlayerId;
        const miniCards = Array(Math.min(p.cardCount, 8)).fill('<div class="mini-card"></div>').join('');

        return `
      <div class="opponent ${isCurrent ? 'current' : ''} ${!p.isConnected ? 'disconnected' : ''} ${p.rank ? 'finished' : ''} ${p.isBot ? 'bot-opponent' : ''}">
        <div class="opponent-name">${escapeHtml(p.name)}</div>
        ${p.isBot ? `<div class="opponent-bot-badge">🤖 ${p.botDifficulty || 'bot'}</div>` : ''}
        <div class="opponent-cards">🖐️ ${p.cardCount} cartes</div>
        ${p.rank ? `<div class="opponent-rank">🏆 ${p.rank}${p.rank === 1 ? 'er' : 'ème'}</div>` : ''}
        <div class="mini-cards">${miniCards}</div>
      </div>
    `;
    }).join('');
}

function renderCenterCard() {
    const display = document.getElementById('centerCardDisplay');
    const card = currentGame.centerCard;

    if (!card) {
        display.innerHTML = '<div style="color:var(--text-secondary);font-size:12px;">En attente...</div>';
        return;
    }

    display.innerHTML = renderCardHTML(card);
    display.className = `card center-card ${card.type === 'joker' ? 'joker' : card.color}`;
}

function renderTurnInfo() {
    const indicator = document.getElementById('currentPlayerIndicator');
    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const me = currentGame.players.find(p => p.id === myPlayerId);

    if (me?.rank) {
        indicator.textContent = `🏆 Vous avez terminé ${me.rank}${me.rank === 1 ? 'er' : 'ème'} !`;
        indicator.classList.remove('my-turn');
    } else if (isMyTurn) {
        indicator.textContent = '✨ À vous de jouer !';
        indicator.classList.add('my-turn');
    } else {
        const currentPlayer = currentGame.players.find(p => p.id === currentGame.currentPlayerId);
        indicator.textContent = `⏳ Tour de ${currentPlayer?.name || '?'}`;
        indicator.classList.remove('my-turn');
    }
}

function renderMyHand() {
    const me = currentGame.players.find(p => p.id === myPlayerId);
    const hand = me?.hand || [];
    const container = document.getElementById('myHand');

    document.getElementById('myCardCount').textContent = hand.length;

    if (hand.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;width:100%;padding:20px;">Vous n\'avez plus de cartes ! 🎉</div>';
        document.getElementById('playSelectedBtn').disabled = true;
        return;
    }

    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const canPlay = isMyTurn && !me?.rank;

    container.innerHTML = hand.map(card => {
        const playable = canPlay && isCardPlayable(card);
        const selected = selectedCards.has(card.id);

        return `
      <div class="hand-card ${selected ? 'selected' : ''} ${playable ? 'playable' : 'not-playable'}"
           data-card-id="${card.id}"
           onclick="toggleCardSelection('${card.id}')">
        <div class="card ${card.type === 'joker' ? 'joker' : card.color}">
          ${renderCardHTML(card)}
        </div>
      </div>
    `;
    }).join('');

    updatePlayButton();
}

function renderCardHTML(card) {
    if (card.type === 'joker') {
        return `
      <div class="card-corner top-left">🃏</div>
      <div class="card-symbol">${card.jokerColor === 'rouge' ? '🔴' : '⚫'}</div>
      <div class="card-rank">JOKER</div>
      <div class="card-corner bottom-right">🃏</div>
    `;
    }

    return `
    <div class="card-corner top-left">
      ${card.rank}<br>${card.symbol}
    </div>
    <div class="card-symbol">${card.symbol}</div>
    <div class="card-rank">${card.rank}</div>
    <div class="card-corner bottom-right">
      ${card.rank}<br>${card.symbol}
    </div>
  `;
}

function isCardPlayable(card) {
    if (currentGame.pendingDraw > 0) {
        return card.type === 'joker' || card.rank === '7';
    }

    if (currentGame.imposedSuit) {
        if (card.type === 'joker') return true;
        return card.suit === currentGame.imposedSuit;
    }

    if (card.type === 'joker') return true;

    const center = currentGame.centerCard;
    if (!center) return true;

    return card.rank === center.rank || card.suit === center.suit;
}

function toggleCardSelection(cardId) {
    const me = currentGame.players.find(p => p.id === myPlayerId);
    const hand = me?.hand || [];
    const card = hand.find(c => c.id === cardId);

    if (!card || !isCardPlayable(card)) return;

    // Vérifier la règle : plusieurs cartes du même rang
    if (selectedCards.size > 0) {
        const firstCard = hand.find(c => c.id === [...selectedCards][0]);
        if (firstCard.rank !== card.rank) {
            selectedCards.clear();
            selectedCards.add(cardId);
            renderMyHand();
            return;
        }
    }

    if (selectedCards.has(cardId)) {
        selectedCards.delete(cardId);
    } else {
        selectedCards.add(cardId);
    }

    renderMyHand();
}

function updatePlayButton() {
    const btn = document.getElementById('playSelectedBtn');
    const me = currentGame.players.find(p => p.id === myPlayerId);
    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const hasSelection = selectedCards.size > 0;

    btn.disabled = !isMyTurn || !hasSelection || !!me?.rank;
}

// ===== JOUER =====
function playSelectedCards(imposedSuit = null) {
    if (selectedCards.size === 0) return;

    const me = currentGame.players.find(p => p.id === myPlayerId);
    const hand = me?.hand || [];
    const selectedArray = [...selectedCards];
    const selectedCardObjects = selectedArray.map(id => hand.find(c => c.id === id));

    // Si un J est sélectionné et qu'on n'a pas encore imposé de couleur
    const hasJack = selectedCardObjects.some(c => c?.rank === 'J');
    if (hasJack && !imposedSuit) {
        openModal('suitModal');
        return;
    }

    socket.emit('playCards', {
        gameId: currentGame.id,
        cardIds: selectedArray,
        imposedSuit: imposedSuit
    });

    selectedCards.clear();
}

// ===== PIOCHER =====
function drawCard() {
    if (!currentGame) return;
    const me = currentGame.players.find(p => p.id === myPlayerId);
    if (currentGame.currentPlayerId !== myPlayerId || me?.rank) {
        showNotification('Ce n\'est pas votre tour', 'error');
        return;
    }
    socket.emit('drawCard', { gameId: currentGame.id });
}

// ===== JOURNAL =====
function renderLog() {
    const content = document.getElementById('logContent');
    if (!currentGame.log) return;

    content.innerHTML = currentGame.log.slice().reverse().map(entry => `
    <div class="log-entry">${escapeHtml(entry.message)}</div>
  `).join('');
}

function toggleLog() {
    const content = document.getElementById('logContent');
    const btn = document.getElementById('toggleLogBtn');
    content.classList.toggle('collapsed');
    btn.textContent = content.classList.contains('collapsed') ? '▲' : '▼';
}

// ===== FIN DE PARTIE =====
function showGameOver() {
    const modal = document.getElementById('gameOverModal');
    const ranking = document.getElementById('finalRanking');

    if (!currentGame.finishedPlayers || currentGame.finishedPlayers.length === 0) return;

    ranking.innerHTML = currentGame.finishedPlayers.map(p => {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '🏅';
        return `
      <div class="ranking-item ${p.rank === 1 ? 'winner' : ''}">
        <span class="ranking-position">${medal}</span>
        <span class="ranking-name">${escapeHtml(p.name)}</span>
        <span style="color:var(--text-secondary);font-size:13px;">#${p.rank}</span>
      </div>
    `;
    }).join('');

    modal.classList.add('active');
}

function returnToLobby() {
    document.getElementById('gameOverModal').classList.remove('active');
    if (currentGame) {
        socket.emit('leaveGame', { gameId: currentGame.id });
    }
    currentGame = null;
    myGameId = null;
    selectedCards.clear();
    showScreen('lobbyScreen');
}

// ===== QUITTER =====
function leaveGame() {
    if (currentGame && currentGame.status === 'playing') {
        if (!confirm('Quitter la partie en cours ?')) return;
    }
    if (currentGame) {
        socket.emit('leaveGame', { gameId: currentGame.id });
    }
    currentGame = null;
    myGameId = null;
    selectedCards.clear();
    showScreen('lobbyScreen');
}

// ===== MODALS =====
function openModal(id) {
    document.getElementById(id).classList.add('active');
}

function closeModal(id) {
    document.getElementById(id).classList.remove('active');
}

window.closeModal = closeModal;

// ===== NOTIFICATION =====
let notifTimeout = null;

function showNotification(message, type = 'info') {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = `notification ${type}`;

    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(() => {
        notif.classList.add('hidden');
    }, 3500);
}

// ===== UTILITAIRES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Exposer globalement
window.toggleCardSelection = toggleCardSelection;
window.returnToLobby = returnToLobby;