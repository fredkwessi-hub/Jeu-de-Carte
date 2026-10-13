// ===== ÉTAT GLOBAL =====
let socket = null;
let currentGame = null;
let currentTournament = null;
let myPlayerId = null;
let myGameId = null;
let myTournamentId = null;
let myName = '';
let selectedCards = new Set();
let botDifficulty = 'medium';
let tournamentBotDifficulty = 'medium';

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
    // Lobby
    document.getElementById('quickPlayBtn').addEventListener('click', quickPlay);
    document.getElementById('createGameBtn').addEventListener('click', createGame);
    document.getElementById('createTournamentBtn').addEventListener('click', openTournamentModal);
    document.getElementById('joinGameBtn').addEventListener('click', joinGame);

    // Waiting game
    document.getElementById('startGameBtn').addEventListener('click', startGame);
    document.getElementById('copyCodeBtn').addEventListener('click', copyGameCode);
    document.getElementById('addBotBtn').addEventListener('click', addBot);
    document.getElementById('botDifficulty').addEventListener('change', function(e) {
        botDifficulty = e.target.value;
    });
    document.getElementById('backToLobbyBtn').addEventListener('click', leaveGame);

    // Tournament
    document.getElementById('copyTournamentCodeBtn').addEventListener('click', copyTournamentCode);
    document.getElementById('startTournamentBtn').addEventListener('click', startTournament);
    document.getElementById('addTournamentBotBtn').addEventListener('click', addTournamentBot);
    document.getElementById('tournamentBotDifficulty').addEventListener('change', function(e) {
        tournamentBotDifficulty = e.target.value;
    });
    document.getElementById('backToLobbyFromTournamentBtn').addEventListener('click', leaveTournament);

    // Game
    document.getElementById('playSelectedBtn').addEventListener('click', function() { playSelectedCards(); });
    document.getElementById('drawCardBtn').addEventListener('click', drawCard);
    document.getElementById('bankDisplay').addEventListener('click', drawCard);
    document.getElementById('leaveGameBtn').addEventListener('click', leaveGame);
    document.getElementById('rulesBtn').addEventListener('click', function() { openModal('rulesModal'); });
    document.getElementById('logHeader').addEventListener('click', toggleLog);

    // Suit modal
    document.querySelectorAll('.suit-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const suit = btn.dataset.suit;
            closeModal('suitModal');
            playSelectedCards(suit);
        });
    });

    // Tournament modal
    document.querySelectorAll('.tournament-option').forEach(function(btn) {
        btn.addEventListener('click', function() {
            const count = parseInt(btn.dataset.players);
            closeModal('tournamentModal');
            createTournament(count);
        });
    });

    // Fermer les modals au clic extérieur
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

    // --- Partie simple ---
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
        if (data.tournament) currentTournament = data.tournament;
        showScreen('gameScreen');
        renderGame();
        showNotification('🎮 La partie commence !', 'success');
    });

    socket.on('gameUpdate', function(data) {
        currentGame = data.game;
        selectedCards.clear();
        renderGame();
    });

    socket.on('gameOver', function(data) {
        currentGame = data.game;
        renderGame();
        showGameOver(data.finalRanking);
    });

    socket.on('cardsDrawn', function(data) {
        if (data.cards && data.cards.length > 0) {
            showNotification('📥 Vous avez pioché ' + data.cards.length + ' carte(s)');
        }
    });

    // --- Animations de cartes ---
    socket.on('cardAnimation', function(data) {
        playCardAnimation(data.type, data.color, data.playerName);
    });

    // --- Championnat ---
    socket.on('tournamentCreated', function(data) {
        myTournamentId = data.tournamentId;
        myPlayerId = data.playerId;
        currentTournament = data.tournament;
        showScreen('tournamentScreen');
        updateTournamentScreen();
        showNotification('🏆 Championnat créé !', 'success');
    });

    socket.on('tournamentJoined', function(data) {
        myTournamentId = data.tournamentId;
        myPlayerId = data.playerId;
        currentTournament = data.tournament;
        showScreen('tournamentScreen');
        updateTournamentScreen();
        showNotification('🏆 Championnat rejoint !', 'success');
    });

    socket.on('tournamentUpdate', function(data) {
        currentTournament = data.tournament;
        updateTournamentScreen();
    });

    socket.on('matchEnded', function(data) {
        currentTournament = data.tournament;
        updateTournamentScreen();
        showNotification('🏆 ' + data.match.winner.name + ' remporte le match !', 'success');
    });

    socket.on('tournamentFinished', function(data) {
        currentTournament = data.tournament;
        showTournamentEnd(data.champion, data.finalRanking);
    });

    // --- Erreurs / Déco ---
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
    if (!name) { showNotification('Veuillez entrer votre nom', 'error'); return; }
    myName = name;
    localStorage.setItem('playerName', name);
    socket.emit('createGame', { playerName: name, maxPlayers: 4 });
}

function joinGame() {
    const name = document.getElementById('playerName').value.trim();
    const gameId = document.getElementById('gameCodeInput').value.trim();
    if (!name) { showNotification('Veuillez entrer votre nom', 'error'); return; }
    if (!gameId) { showNotification('Veuillez entrer un code', 'error'); return; }
    myName = name;
    localStorage.setItem('playerName', name);
    socket.emit('joinGame', { gameId: gameId, playerName: name });
}

// ===== PARTIE RAPIDE =====
function quickPlay() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { showNotification('Veuillez entrer votre nom', 'error'); return; }
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

// ===== CHAMPIONNAT =====
function openTournamentModal() {
    const name = document.getElementById('playerName').value.trim();
    if (!name) { showNotification('Veuillez entrer votre nom', 'error'); return; }
    openModal('tournamentModal');
}

function createTournament(playerCount) {
    const name = document.getElementById('playerName').value.trim();
    myName = name;
    localStorage.setItem('playerName', name);
    socket.emit('createTournament', { playerName: name, playerCount: playerCount });
}

function updateTournamentScreen() {
    if (!currentTournament) return;

    document.getElementById('displayTournamentCode').textContent = currentTournament.id;
    document.getElementById('tournamentPlayerCount').textContent = currentTournament.participants.length;
    document.getElementById('tournamentMaxPlayers').textContent = currentTournament.playerCount;

    const list = document.getElementById('tournamentPlayersList');
    list.innerHTML = currentTournament.participants.map(function(p) {
        let html = '<div class="player-item ' + (p.id === currentTournament.hostId ? 'host' : '') + ' ' + (p.isBot ? 'bot' : '') + '">';
        html += '<span>' + escapeHtml(p.name) + '</span>';
        if (p.isBot) html += '<span class="bot-badge">🤖 ' + (p.botDifficulty || 'bot') + '</span>';
        if (p.id === myPlayerId) html += '<span style="color:var(--primary);font-size:12px;">(vous)</span>';
        html += '</div>';
        return html;
    }).join('');

    // Contrôles bot
    const botControls = document.getElementById('tournamentBotControls');
    botControls.style.display =
        (currentTournament.hostId === myPlayerId && currentTournament.participants.length < currentTournament.playerCount)
            ? 'flex' : 'none';

    // Bouton démarrer
    const startBtn = document.getElementById('startTournamentBtn');
    const message = document.getElementById('tournamentWaitingMessage');

    if (currentTournament.hostId === myPlayerId &&
        currentTournament.participants.length === currentTournament.playerCount &&
        currentTournament.status === 'lobby') {
        startBtn.style.display = 'inline-block';
        message.style.display = 'none';
    } else if (currentTournament.hostId === myPlayerId && currentTournament.status === 'lobby') {
        startBtn.style.display = 'none';
        message.textContent = 'En attente de ' + (currentTournament.playerCount - currentTournament.participants.length) + ' participant(s)...';
        message.style.display = 'block';
    } else if (currentTournament.status === 'lobby') {
        startBtn.style.display = 'none';
        message.textContent = "En attente du lancement par l'hôte...";
        message.style.display = 'block';
    } else {
        startBtn.style.display = 'none';
        message.style.display = 'none';
    }
}

function copyTournamentCode() {
    if (!currentTournament) return;
    navigator.clipboard.writeText(currentTournament.id).then(function() {
        showNotification('📋 Code copié !', 'success');
    });
}

function startTournament() {
    if (!currentTournament) return;
    socket.emit('startTournament', { tournamentId: currentTournament.id });
}

function addTournamentBot() {
    if (!currentTournament) return;
    socket.emit('addTournamentBot', {
        tournamentId: currentTournament.id,
        difficulty: tournamentBotDifficulty
    });
}

function leaveTournament() {
    if (currentTournament && currentTournament.status === 'playing') {
        if (!confirm('Quitter le championnat en cours ?')) return;
    }
    if (currentTournament) {
        socket.emit('leaveTournament', { tournamentId: currentTournament.id });
    }
    currentTournament = null;
    myTournamentId = null;
    showScreen('lobbyScreen');
}

// ===== SALLE D'ATTENTE PARTIE =====
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

function addBot() {
    if (!currentGame) return;
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

    // Pending draw
    const pendingDisplay = document.getElementById('pendingDrawDisplay');
    if (currentGame.pendingDraw > 0) {
        pendingDisplay.style.display = 'block';
        pendingDisplay.textContent = '⚠️ ' + currentGame.pendingDraw + ' cartes en attente !';
    } else {
        pendingDisplay.style.display = 'none';
    }

    // Couleur imposée
    const imposedDisplay = document.getElementById('imposedSuitDisplay');
    const symbols = { pique: '♠', carreau: '♦', coeur: '♥', trefle: '♣' };

    if (currentGame.imposedSuit) {
        imposedDisplay.style.display = 'block';
        imposedDisplay.textContent = '🎭 Couleur imposée : ' + symbols[currentGame.imposedSuit] + ' ' + currentGame.imposedSuit;
    } else if (currentGame.imposedColor) {
        imposedDisplay.style.display = 'block';
        imposedDisplay.textContent = currentGame.imposedColor === 'red'
            ? '🃏 Joker Rouge — Cartes rouges imposées 🔴'
            : '🃏 Joker Noir — Cartes noires imposées ⚫';
    } else if (currentGame.centerCard && currentGame.centerCard.type === 'joker') {
        imposedDisplay.style.display = 'block';
        imposedDisplay.textContent = currentGame.centerCard.color === 'red'
            ? '🃏 Centre = Joker Rouge — Jouez du rouge 🔴'
            : '🃏 Centre = Joker Noir — Jouez du noir ⚫';
    } else {
        imposedDisplay.style.display = 'none';
    }
}

function renderOpponents() {
    const zone = document.getElementById('opponentsZone');
    const opponents = currentGame.players.filter(function(p) { return p.id !== myPlayerId; });

    if (opponents.length === 0) { zone.innerHTML = ''; return; }

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
    if (card.type === 'joker') return true;
    if (currentGame.imposedSuit) return card.suit === currentGame.imposedSuit;
    if (currentGame.imposedColor) return card.color === currentGame.imposedColor;
    if (currentGame.centerCard && currentGame.centerCard.type === 'joker') {
        return card.color === currentGame.centerCard.color;
    }
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

function drawCard() {
    if (!currentGame) return;
    const me = currentGame.players.find(function(p) { return p.id === myPlayerId; });
    if (currentGame.currentPlayerId !== myPlayerId || (me && me.rank)) {
        showNotification("Ce n'est pas votre tour", 'error');
        return;
    }
    socket.emit('drawCard', { gameId: currentGame.id });
}

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
function showGameOver(ranking) {
    const modal = document.getElementById('gameOverModal');
    const rankingDiv = document.getElementById('finalRanking');

    const list = ranking || (currentGame ? currentGame.finishedPlayers : []);

    if (!list || list.length === 0) return;

    rankingDiv.innerHTML = list.map(function(p) {
        const medal = p.rank === 1 ? '🥇' : p.rank === 2 ? '🥈' : p.rank === 3 ? '🥉' : '🏅';
        return '<div class="ranking-item ' + (p.rank === 1 ? 'winner' : '') + '">' +
            '<span class="ranking-position">' + medal + '</span>' +
            '<span class="ranking-name">' + escapeHtml(p.name) + '</span>' +
            '<span style="color:var(--text-secondary);font-size:13px;">#' + p.rank + '</span>' +
            '</div>';
    }).join('');

    modal.classList.add('active');

    // Confettis pour la victoire
    const winner = list.find(function(p) { return p.rank === 1; });
    if (winner && winner.id === myPlayerId) {
        // Le joueur actuel a gagné → confettis
        launchConfetti(150);
    } else if (winner) {
        // Un autre a gagné → petit burst
        launchConfetti(80);
    }
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

// ===== FIN DE CHAMPIONNAT =====
function showTournamentEnd(champion, finalRanking) {
    const modal = document.getElementById('tournamentEndModal');
    const nameDiv = document.getElementById('championName');
    const rankingDiv = document.getElementById('tournamentFinalRanking');

    nameDiv.textContent = champion.name;
    nameDiv.style.animation = 'none';
    setTimeout(function() { nameDiv.style.animation = ''; }, 10);

    // Classement final (par ordre d'élimination)
    if (finalRanking && finalRanking.length > 0) {
        rankingDiv.innerHTML = finalRanking.map(function(p, i) {
            const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '🏅';
            return '<div class="ranking-item ' + (i === 0 ? 'winner' : '') + '">' +
                '<span class="ranking-position">' + medal + '</span>' +
                '<span class="ranking-name">' + escapeHtml(p.name) + '</span>' +
                '</div>';
        }).join('');
    } else {
        rankingDiv.innerHTML = '';
    }

    modal.classList.add('active');

    // Grosse explosion de confettis
    launchConfetti(300);
    setTimeout(function() { launchConfetti(200); }, 500);
    setTimeout(function() { launchConfetti(150); }, 1000);
}

function returnToLobbyFromChampion() {
    document.getElementById('tournamentEndModal').classList.remove('active');
    if (currentTournament) {
        socket.emit('leaveTournament', { tournamentId: currentTournament.id });
    }
    currentTournament = null;
    myTournamentId = null;
    showScreen('lobbyScreen');
}
window.returnToLobbyFromChampion = returnToLobbyFromChampion;

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

// ===== ANIMATIONS =====

// Animation de carte (Joker, 7, J, As)
function playCardAnimation(type, color, playerName) {
    const overlay = document.getElementById('cardAnimationOverlay');
    const bg = document.getElementById('cardAnimationBg');
    const content = document.getElementById('cardAnimationContent');

    let bgClass = '';
    let emoji = '';
    let title = '';
    let subtitle = '';

    if (type === 'joker') {
        bgClass = color === 'red' ? 'joker-red' : 'joker-black';
        emoji = '🃏';
        title = color === 'red' ? 'JOKER ROUGE !' : 'JOKER NOIR !';
        subtitle = '+4 cartes pour le suivant • Couleur imposée : ' + (color === 'red' ? '🔴 Rouge' : '⚫ Noir');
    } else if (type === 'seven') {
        bgClass = color === 'red' ? 'seven-red' : 'seven-black';
        emoji = '7️⃣';
        title = 'SEPT !';
        subtitle = '+2 cartes pour le suivant';
    } else if (type === 'ace') {
        bgClass = 'ace';
        emoji = '🅰️';
        title = 'AS !';
        subtitle = 'Le suivant est suspendu';
    } else if (type === 'jack') {
        bgClass = 'jack';
        emoji = '🎭';
        title = 'VALET COMMANDE !';
        subtitle = 'Une couleur est imposée';
    }

    bg.className = 'card-animation-bg ' + bgClass;

    // Générer des particules
    let particles = '<div class="card-animation-particles">';
    for (let i = 0; i < 12; i++) {
        const left = Math.random() * 100;
        const delay = Math.random() * 0.3;
        const emojiParticle = emoji;
        particles += '<span class="card-particle" style="left:' + left + '%; bottom: 30%; animation-delay:' + delay + 's; font-size:' + (24 + Math.random() * 24) + 'px;">' + emojiParticle + '</span>';
    }
    particles += '</div>';

    content.innerHTML =
        particles +
        '<div class="card-animation-emoji">' + emoji + '</div>' +
        '<div class="card-animation-title">' + title + '</div>' +
        '<div class="card-animation-subtitle">' + (playerName ? playerName + ' • ' : '') + subtitle + '</div>';

    overlay.classList.remove('hidden');
    // Force reflow
    void overlay.offsetWidth;
    overlay.classList.add('active');

    setTimeout(function() {
        overlay.classList.remove('active');
        setTimeout(function() {
            overlay.classList.add('hidden');
        }, 300);
    }, 1300);
}

// Confettis
function launchConfetti(count) {
    const overlay = document.getElementById('confettiOverlay');
    const container = document.getElementById('confettiContainer');

    overlay.classList.remove('hidden');

    const colors = ['#6C63FF', '#FF6584', '#F39C12', '#2ECC71', '#00D4FF', '#FFD700', '#FF8FA3'];

    for (let i = 0; i < count; i++) {
        const piece = document.createElement('div');
        piece.className = 'confetti-piece';
        piece.style.left = Math.random() * 100 + '%';
        piece.style.background = colors[Math.floor(Math.random() * colors.length)];
        piece.style.animationDuration = (2 + Math.random() * 3) + 's';
        piece.style.animationDelay = (Math.random() * 0.5) + 's';
        piece.style.width = (6 + Math.random() * 10) + 'px';
        piece.style.height = (10 + Math.random() * 12) + 'px';
        piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
        container.appendChild(piece);

        setTimeout(function() {
            if (piece.parentNode) piece.parentNode.removeChild(piece);
        }, 6000);
    }

    // Cacher l'overlay après un moment
    setTimeout(function() {
        if (container.children.length === 0) {
            overlay.classList.add('hidden');
        }
    }, 7000);
}

// ===== UTILITAIRES =====
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

window.toggleCardSelection = toggleCardSelection;