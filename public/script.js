// ===== ÉTAT GLOBAL =====
let socket = null;
let currentGame = null;
let myPlayerId = null;
let myGameId = null;
let myName = '';
let selectedCards = new Set();
let botDifficulty = 'medium';

// ===== INITIALISATION =====
document.addEventListener('DOMContentLoaded', function() {
    const savedName = localStorage.getItem('playerName');
    if (savedName) {
        document.getElementById('playerName').value = savedName;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const gameFromUrl = urlParams.get('game');
    if (gameFromUrl) {
        document.getElementById('gameCodeInput').value = gameFromUrl;
    }

    setupEventListeners();
    initSocket();
});

// ===== ÉVÉNEMENTS =====
function setupEventListeners() {
    document.getElementById('quickPlayBtn').addEventListener('click', quickPlay);
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    document.getElementById('joinGameBtn').addEventListener('click', joinGame);
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('copyCodeBtn').addEventListener('click', copyGameCode);
    document.getElementById('playSelectedBtn').addEventListener('click', function() { playSelectedCards(); });
    document.getElementById('drawCardBtn').addEventListener('click', drawCard);
    document.getElementById('bankDisplay').addEventListener('click', drawCard);
    document.getElementById('leaveGameBtn').addEventListener('click', leaveGame);
    document.getElementById('backToLobbyBtn').addEventListener('click', leaveGame);
    document.getElementById('rulesBtn').addEventListener('click', function() { openModal('rulesModal'); });
    document.getElementById('logHeader').addEventListener('click', toggleLog);
    document.getElementById('addBotBtn').addEventListener('click', addBot);
    document.getElementById('botDifficulty').addEventListener('change', function(e) {
        botDifficulty = e.target.value;
    });

    document.querySelectorAll('.suit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const suit = btn.dataset.suit;
            closeModal('suitModal');
            playSelectedCards(suit);
        });
    });

    document.querySelectorAll('.modal').forEach(function(modal) {
        modal.addEventListener('click', function(e) {
            if (e.target === modal) modal.classList.remove('active');
        });
    });
}

// ===== SOCKET =====
function initSocket() {
    socket = io({
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000
    });

    socket.on('connect', function() {
        console.log('✅ Connecté au serveur');
        myPlayerId = socket.id;
    });

    socket.on('gameCreated', function(data) {
        myGameId = data.gameId;
        myPlayerId = data.playerId;
        currentGame = data.game;
        showScreen('waitingScreen');
        updateWaitingScreen();
        showNotification('✅ Partie créée !', 'success');
    });

    socket.on('gameJoined', function(data) {
        myGameId = data.gameId;
        myPlayerId = data.playerId;
        currentGame = data.game;
        showScreen('waitingScreen');
        updateWaitingScreen();
        showNotification('✅ Partie rejointe !', 'success');
    });

    socket.on('playerJoined', function(data) {
        currentGame = data.game;
        updateWaitingScreen();
    });

    socket.on('playerLeft', function(data) {
        if (data.game) currentGame = data.game;
        showNotification('Un joueur a quitté la partie');
        updateWaitingScreen();
    });

    socket.on('gameStarted', function(data) {
        currentGame = data.game;
        showScreen('gameScreen');
        renderGame();
        showNotification('🎮 La partie commence !', 'success');
    });

    socket.on('gameUpdate', function(data) {
        currentGame = data.game;
        selectedCards.clear();
        renderGame();
    });

    socket.on('cardsDrawn', function(data) {
        if (data.cards && data.cards.length > 0) {
            showNotification('📥 Vous avez pioché ' + data.cards.length + ' carte(s)');
        }
    });

    socket.on('error', function(data) {
        showNotification('❌ ' + data.message, 'error');
    });

    socket.on('playerDisconnected', function(data) {
        showNotification('⚠️ ' + data.playerName + " s'est déconnecté");
    });

    socket.on('disconnect', function() {
        console.log('❌ Déconnecté du serveur');
    });
}

// ===== SCREENS =====
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) { s.classList.remove('active'); });
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
    socket.emit('joinGame', { gameId: gameId, playerName: name });
}

// ===== PARTIE RAPIDE =====
function quickPlay() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) {
        showNotification('Veuillez entrer votre nom', 'error');
        return;
    }

    myName = name;
    localStorage.setItem('playerName', name);

    const handleCreated = function() {
        socket.off('gameCreated', handleCreated);

        setTimeout(function() {
            socket.emit('addBot', { gameId: myGameId, difficulty: 'easy' });
            setTimeout(function() {
                socket.emit('addBot', { gameId: myGameId, difficulty: 'medium' });
                setTimeout(function() {
                    socket.emit('addBot', { gameId: myGameId, difficulty: 'hard' });
                    setTimeout(function() {
                        socket.emit('startGame', { gameId: myGameId });
                    }, 600);
                }, 400);
            }, 400);
        }, 400);
    };

    socket.on('gameCreated', handleCreated);
    socket.emit('createGame', { playerName: name, maxPlayers: 4 });
}

// ===== SALLE D'ATTENTE =====
function updateWaitingScreen() {
    if (!currentGame) return;

    document.getElementById('displayGameCode').textContent = currentGame.id;
    document.getElementById('playerCount').textContent = currentGame.players.length;
    document.getElementById('maxPlayers').textContent = currentGame.maxPlayers;

    const list = document.getElementById('waitingPlayersList');
    list.innerHTML = currentGame.players.map(function(p) {
        let html = '<div class="player-item ' + (p.id === currentGame.hostId ? 'host' : '') + ' ' + (p.isBot ? 'bot' : '') + '">';
        html += '<span>' + escapeHtml(p.name) + '</span>';
        if (p.isBot) html += '<span class="bot-badge">🤖 ' + (p.botDifficulty || 'bot') + '</span>';
        if (p.id === myPlayerId) html += '<span style="color:var(--primary);font-size:12px;">(vous)</span>';
        if (p.isBot && currentGame.hostId === myPlayerId) {
            html += '<button onclick="removeBot(\'' + p.id + '\')" style="margin-left:auto;background:none;border:none;color:var(--danger);cursor:pointer;font-size:18px;">×</button>';
        }
        html += '</div>';
        return html;
    }).join('');

    const botControls = document.getElementById('botControls');
    botControls.style.display =
        (currentGame.hostId === myPlayerId && currentGame.players.length < currentGame.maxPlayers)
            ? 'flex' : 'none';

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
        message.textContent = "En attente du démarrage par l'hôte...";
        message.style.display = 'block';
    }
}

function copyGameCode() {
    if (!currentGame) return;
    navigator.clipboard.writeText(currentGame.id).then(function() {
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
        showNotification("Seul l'hôte peut ajouter des bots", 'error');
        return;
    }
    if (currentGame.players.length >= currentGame.maxPlayers) {
        showNotification('La partie est complète', 'error');
        return;
    }

    socket.emit('addBot', { gameId: currentGame.id, difficulty: botDifficulty });
}

function removeBot(botId) {
    if (!currentGame) return;
    socket.emit('removeBot', { gameId: currentGame.id, botId: botId });
}

window.removeBot = removeBot;

// ===== ÉCRAN DE JEU =====
function renderGame() {
    if (!currentGame) return;

    document.getElementById('gameCodeDisplay').textContent = currentGame.id;
    document.getElementById('gameStatus').textContent =
        currentGame.status === 'playing' ? '🟢 En cours' :
            currentGame.status === 'finished' ? '🏁 Terminée' : '⏳ En attente';

    renderOpponents();
    renderCenterCard();

    document.getElementById('bankCount').textContent = currentGame.bankCount + ' cartes';
    document.getElementById('pileCount').textContent = currentGame.pileCount + ' cartes';

    renderTurnInfo();
    renderMyHand();
    renderLog();

    const pendingDisplay = document.getElementById('pendingDrawDisplay');
    if (currentGame.pendingDraw > 0) {
        pendingDisplay.style.display = 'block';
        pendingDisplay.textContent = '⚠️ ' + currentGame.pendingDraw + ' cartes en attente !';
    } else {
        pendingDisplay.style.display = 'none';
    }

    const imposedDisplay = document.getElementById('imposedSuitDisplay');
    if (currentGame.imposedSuit) {
        const symbols = { pique: '♠', carreau: '♦', coeur: '♥', trefle: '♣' };
        imposedDisplay.style.display = 'block';
        imposedDisplay.textContent = '🎭 Couleur imposée : ' + symbols[currentGame.imposedSuit] + ' ' + currentGame.imposedSuit;
    } else {
        imposedDisplay.style.display = 'none';
    }

    if (currentGame.status === 'finished') {
        showGameOver();
    }
}

function renderOpponents() {
    const zone = document.getElementById('opponentsZone');
    const opponents = currentGame.players.filter(function(p) { return p.id !== myPlayerId; });

    if (opponents.length === 0) {
        zone.innerHTML = '';
        return;
    }

    zone.innerHTML = opponents.map(function(p) {
        const isCurrent = p.id === currentGame.currentPlayerId;
        let miniCards = '';
        for (let i = 0; i < Math.min(p.cardCount, 8); i++) {
            miniCards += '<div class="mini-card"></div>';
        }

        let html = '<div class="opponent ' + (isCurrent ? 'current' : '') + ' ' + (!p.isConnected ? 'disconnected' : '') + ' ' + (p.rank ? 'finished' : '') + ' ' + (p.isBot ? 'bot-opponent' : '') + '">';
        html += '<div class="opponent-name">' + escapeHtml(p.name) + '</div>';
        if (p.isBot) html += '<div class="opponent-bot-badge">🤖 ' + (p.botDifficulty || 'bot') + '</div>';
        html += '<div class="opponent-cards">🖐️ ' + p.cardCount + ' cartes</div>';
        if (p.rank) html += '<div class="opponent-rank">🏆 ' + p.rank + (p.rank === 1 ? 'er' : 'ème') + '</div>';
        html += '<div class="mini-cards">' + miniCards + '</div>';
        html += '</div>';
        return html;
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
    display.className = 'card center-card ' + (card.type === 'joker' ? 'joker' : card.color);
}

function renderTurnInfo() {
    const indicator = document.getElementById('currentPlayerIndicator');
    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });

    if (me && me.rank) {
        indicator.textContent = '🏆 Vous avez terminé ' + me.rank + (me.rank === 1 ? 'er' : 'ème') + ' !';
        indicator.classList.remove('my-turn');
    } else if (isMyTurn) {
        indicator.textContent = '✨ À vous de jouer !';
        indicator.classList.add('my-turn');
    } else {
        const currentPlayer = currentGame.players.find(function(p) { return p.id === currentGame.currentPlayerId; });
        indicator.textContent = '⏳ Tour de ' + (currentPlayer ? currentPlayer.name : '?');
        indicator.classList.remove('my-turn');
    }
}

function renderMyHand() {
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    const hand = (me && me.hand) ? me.hand : [];
    const container = document.getElementById('myHand');

    document.getElementById('myCardCount').textContent = hand.length;

    if (hand.length === 0) {
        container.innerHTML = '<div style="color:var(--text-secondary);text-align:center;width:100%;padding:20px;">Vous n\'avez plus de cartes ! 🎉</div>';
        document.getElementById('playSelectedBtn').disabled = true;
        return;
    }

    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const canPlay = isMyTurn && !(me && me.rank);

    container.innerHTML = hand.map(function(card) {
        const playable = canPlay && isCardPlayable(card);
        const selected = selectedCards.has(card.id);

        return '<div class="hand-card ' + (selected ? 'selected' : '') + ' ' + (playable ? 'playable' : 'not-playable') + '" data-card-id="' + card.id + '" onclick="toggleCardSelection(\'' + card.id + '\')">' +
            '<div class="card ' + (card.type === 'joker' ? 'joker' : card.color) + '">' +
            renderCardHTML(card) +
            '</div></div>';
    }).join('');

    updatePlayButton();
}

function renderCardHTML(card) {
    if (card.type === 'joker') {
        return '<div class="card-corner top-left">🃏</div>' +
            '<div class="card-symbol">' + (card.jokerColor === 'rouge' ? '🔴' : '⚫') + '</div>' +
            '<div class="card-rank">JOKER</div>' +
            '<div class="card-corner bottom-right">🃏</div>';
    }

    return '<div class="card-corner top-left">' + card.rank + '<br>' + card.symbol + '</div>' +
        '<div class="card-symbol">' + card.symbol + '</div>' +
        '<div class="card-rank">' + card.rank + '</div>' +
        '<div class="card-corner bottom-right">' + card.rank + '<br>' + card.symbol + '</div>';
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
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    const hand = (me && me.hand) ? me.hand : [];
    const card = hand.find(function(c) { return c.id === cardId; });

    if (!card || !isCardPlayable(card)) return;

    if (selectedCards.size > 0) {
        const firstCard = hand.find(function(c) { return c.id === Array.from(selectedCards)[0]; });
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
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    const isMyTurn = currentGame.currentPlayerId === myPlayerId;
    const hasSelection = selectedCards.size > 0;

    btn.disabled = !isMyTurn || !hasSelection || !!(me && me.rank);
}

// ===== JOUER =====
function playSelectedCards(imposedSuit) {
    if (selectedCards.size === 0) return;

    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    const hand = (me && me.hand) ? me.hand : [];
    const selectedArray = Array.from(selectedCards);
    const selectedCardObjects = selectedArray.map(function(id) {
        return hand.find(function(c) { return c.id === id; });
    });

    const hasJack = selectedCardObjects.some(function(c) { return c && c.rank === 'J'; });
    if (hasJack && !imposedSuit) {
        openModal('suitModal');
        return;
    }

    socket.emit('playCards', {
        gameId: currentGame.id,
        cardIds: selectedArray,
        imposedSuit: imposedSuit || null
    });

    selectedCards.clear();
}

// ===== PIOCHER =====
function drawCard() {
    if (!currentGame) return;
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    if (currentGame.currentPlayerId !== myPlayerId || (me && me.rank)) {
        showNotification("Ce n'est pas votre tour", 'error');
        return;
    }
    socket.emit('drawCard', { gameId: currentGame.id });
}

// ===== JOURNAL =====
function renderLog() {
    const content = document.getElementById('logContent');
    if (!currentGame.log) return;

    content.innerHTML = currentGame.log.slice().reverse().map(function(entry) {
        return '<div class="log-entry">' + escapeHtml(entry.message) + '</div>';
    }).join('');
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

    ranking.innerHTML = currentGame.finishedPlayers.map(function(p) {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '🏅';
        return '<div class="ranking-item ' + (p.rank === 1 ? 'winner' : '') + '">' +
            '<span class="ranking-position">' + medal + '</span>' +
            '<span class="ranking-name">' + escapeHtml(p.name) + '</span>' +
            '<span style="color:var(--text-secondary);font-size:13px;">#' + p.rank + '</span>' +
            '</div>';
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

window.returnToLobby = returnToLobby;

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

function showNotification(message, type) {
    type = type || 'info';
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.className = 'notification ' + type;

    clearTimeout(notifTimeout);
    notifTimeout = setTimeout(function() {
        notif.classList.add('hidden');
    }, 3500);
}

// ===== UTILITAIRES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.toggleCardSelection = toggleCardSelection;