// =============================================================
// JEU DE CARTES — UI : TOURNAMENT (Championnat)
// =============================================================
// Gère l'écran de championnat : salle d'attente, bracket visuel,
// suivi des matchs, animation du champion.
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
    tournamentId: null,
    isHost: false,
    isWaitingScreen: true,
    unsubscribers: [],
    initialized: false,
    lastMatchId: null
};

/* ============================================================
   INITIALISATION
   ============================================================ */

export function init(params = {}) {
    console.log('🏆 Initialisation de l\'écran de championnat');

    state.tournamentId = params.tournamentId || store.get('tournament.id');

    if (!state.tournamentId) {
        console.warn('⚠️ Pas de tournamentId, retour au lobby');
        navigateTo(SCREENS.LOBBY);
        return;
    }

    // Déterminer l'écran initial
    const status = store.get('tournament.status');
    state.isWaitingScreen = !status || status === 'lobby';

    // Attacher les événements
    attachEvents();

    // S'abonner aux changements
    setupSubscriptions();

    // Rendu initial
    render();

    state.initialized = true;
    console.log('✅ Championnat initialisé:', state.tournamentId);
}

/* ============================================================
   ÉVÉNEMENTS
   ============================================================ */

function attachEvents() {
    // Bouton retour (salle d'attente)
    const backBtn = helpers.$('#btn-back-lobby-tournament');
    if (backBtn) {
        backBtn.addEventListener('click', handleLeave);
    }

    // Bouton retour (bracket)
    const exitBtn = helpers.$('#btn-exit-tournament');
    if (exitBtn) {
        exitBtn.addEventListener('click', handleLeave);
    }

    // Bouton copier le code
    const copyBtn = helpers.$('#btn-copy-tournament-code');
    if (copyBtn) {
        copyBtn.addEventListener('click', copyTournamentCode);
    }

    // Bouton ajouter bot
    const addBotBtn = helpers.$('#btn-add-tournament-bot');
    if (addBotBtn) {
        addBotBtn.addEventListener('click', handleAddBot);
    }

    // Bouton démarrer
    const startBtn = helpers.$('#btn-start-tournament');
    if (startBtn) {
        startBtn.addEventListener('click', handleStart);
    }

    // Bouton retour au menu (fin de championnat)
    const endBtn = helpers.$('#btn-tournament-end-lobby');
    if (endBtn) {
        endBtn.addEventListener('click', handleQuitToLobby);
    }
}

/* ============================================================
   ACTIONS
   ============================================================ */

async function handleLeave() {
    const status = store.get('tournament.status');

    if (status === 'playing') {
        const confirmed = confirm('Quitter le championnat en cours ?');
        if (!confirmed) return;
    }

    try {
        await socketActions.leaveTournament(state.tournamentId);
    } catch (error) {
        console.error('Erreur quitter tournoi:', error);
    }

    store.reset('tournament');
    navigateTo(SCREENS.LOBBY);
}

function handleQuitToLobby() {
    helpers.$('#modal-tournament-end')?.classList.remove('active');
    store.reset('tournament');
    navigateTo(SCREENS.LOBBY);
}

async function copyTournamentCode() {
    if (!state.tournamentId) return;

    try {
        await navigator.clipboard.writeText(state.tournamentId);
        showToast(i18n.t('common.copied'), 'success');
    } catch (error) {
        showToast('Impossible de copier', 'error');
    }
}

async function handleAddBot() {
    if (!state.tournamentId) return;

    const select = helpers.$('#tournament-bot-difficulty');
    const difficulty = select ? select.value : 'medium';

    try {
        const response = await socketActions.addTournamentBot(state.tournamentId, difficulty);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur ajout bot');
        }

        showToast('🤖 Bot ajouté !', 'success');

    } catch (error) {
        console.error('Erreur ajout bot:', error);
        showToast(error.message, 'error');
    }
}

async function handleStart() {
    if (!state.tournamentId) return;

    const participants = store.get('tournament.participants', []);
    const requiredCount = store.get('tournament.playerCount', 4);

    if (participants.length !== requiredCount) {
        showToast(`Il faut ${requiredCount} participants (${participants.length} actuellement)`, 'warning');
        return;
    }

    if (!state.isHost) {
        showToast('Seul l\'hôte peut démarrer', 'warning');
        return;
    }

    try {
        const startBtn = helpers.$('#btn-start-tournament');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.innerHTML = `
        <span class="btn-shine"></span>
        <span class="btn-icon">⏳</span>
        <span class="btn-text">Démarrage...</span>
      `;
        }

        const response = await socketActions.startTournament(state.tournamentId);

        if (!response || !response.success) {
            throw new Error(response?.error || 'Erreur démarrage');
        }

    } catch (error) {
        console.error('Erreur démarrage:', error);
        showToast(error.message, 'error');

        const startBtn = helpers.$('#btn-start-tournament');
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = `
        <span class="btn-shine"></span>
        <span class="btn-icon">🚀</span>
        <span class="btn-text">${i18n.t('tournament.start')}</span>
      `;
        }
    }
}

/* ============================================================
   RENDU PRINCIPAL
   ============================================================ */

function render() {
    const status = store.get('tournament.status');

    // Déterminer quel écran afficher
    if (status === 'playing' || status === 'finished') {
        state.isWaitingScreen = false;
        switchToBracketScreen();
        renderBracket();
    } else {
        state.isWaitingScreen = true;
        switchToWaitingScreen();
        renderWaiting();
    }
}

function switchToWaitingScreen() {
    const waitingEl = helpers.$('#screen-tournament-waiting');
    const bracketEl = helpers.$('#screen-tournament-bracket');

    if (waitingEl && !waitingEl.classList.contains('active')) {
        helpers.$$('.screen').forEach(s => s.classList.remove('active'));
        waitingEl.classList.add('active');
    }
}

function switchToBracketScreen() {
    const bracketEl = helpers.$('#screen-tournament-bracket');

    if (bracketEl && !bracketEl.classList.contains('active')) {
        helpers.$$('.screen').forEach(s => s.classList.remove('active'));
        bracketEl.classList.add('active');
    }
}

/* ============================================================
   RENDU — SALLE D'ATTENTE
   ============================================================ */

function renderWaiting() {
    renderTournamentCode();
    renderParticipantsList();
    renderBracketPreview();
    renderStartButton();
    renderBotControls();
}

function renderTournamentCode() {
    const codeEl = helpers.$('#display-tournament-code');
    if (codeEl) {
        codeEl.textContent = state.tournamentId || '---';
    }
}

function renderParticipantsList() {
    const container = helpers.$('#tournament-players-list');
    if (!container) return;

    const participants = store.get('tournament.participants', []);
    const hostId = store.get('tournament.hostId');
    const myId = store.get('player.id');

    // Compteurs
    const countEl = helpers.$('#tournament-player-count');
    const maxEl = helpers.$('#tournament-max-players');
    if (countEl) countEl.textContent = participants.length;
    if (maxEl) maxEl.textContent = store.get('tournament.playerCount', 4);

    if (participants.length === 0) {
        container.innerHTML = `
      <div class="empty-state-small">
        <p>En attente de participants...</p>
      </div>
    `;
        return;
    }

    container.innerHTML = participants.map(p => {
        const isHost = p.id === hostId;
        const isMe = p.id === myId;
        const isBot = p.isBot;

        let classes = 'player-item';
        if (isHost) classes += ' host';
        if (isBot) classes += ' bot';
        if (isMe) classes += ' me';

        return `
      <div class="${classes}">
        <span>${helpers.escapeHtml(p.name)}</span>
        ${isBot ? `<span class="bot-badge">🤖 ${p.botDifficulty || 'Bot'}</span>` : ''}
        ${isMe ? '<span style="color: var(--color-primary); font-size: 12px;">(vous)</span>' : ''}
      </div>
    `;
    }).join('');
}

function renderBracketPreview() {
    const container = helpers.$('#bracket-preview-content');
    if (!container) return;

    const playerCount = store.get('tournament.playerCount', 4);

    // Afficher un aperçu du bracket selon le nombre de joueurs
    const rounds = playerCount === 8
        ? ['Quarts', 'Demis', 'Finale']
        : ['Demis', 'Finale'];

    container.innerHTML = rounds.map((round, i) => {
        const matchCount = playerCount / Math.pow(2, i + 1);
        const matches = Array(matchCount).fill(0).map(() => `
      <div class="match-card pending" style="margin-bottom: 8px; min-height: 60px;">
        <div class="match-player bye" style="min-height: 24px;">
          <span class="match-player-name" style="font-size: 11px;">À déterminer</span>
        </div>
        <div class="match-player bye" style="min-height: 24px;">
          <span class="match-player-name" style="font-size: 11px;">À déterminer</span>
        </div>
      </div>
    `).join('');

        return `
      <div class="bracket-round" style="min-width: 160px;">
        <div class="bracket-round-header">${round}</div>
        ${matches}
      </div>
    `;
    }).join('');
}

function renderStartButton() {
    const startBtn = helpers.$('#btn-start-tournament');
    const message = helpers.$('#tournament-waiting-message');
    if (!startBtn || !message) return;

    const participants = store.get('tournament.participants', []);
    const requiredCount = store.get('tournament.playerCount', 4);
    const status = store.get('tournament.status', 'lobby');

    if (status !== 'lobby') {
        startBtn.classList.add('hidden');
        message.style.display = 'none';
        return;
    }

    const canStart = state.isHost && participants.length === requiredCount;

    if (canStart) {
        startBtn.classList.remove('hidden');
        message.style.display = 'none';
        startBtn.disabled = false;
        startBtn.innerHTML = `
      <span class="btn-shine"></span>
      <span class="btn-icon">🚀</span>
      <span class="btn-text">${i18n.t('tournament.start')}</span>
    `;
    } else {
        startBtn.classList.add('hidden');
        message.style.display = 'block';

        if (!state.isHost) {
            message.textContent = 'En attente du lancement par l\'hôte...';
        } else if (participants.length < requiredCount) {
            const remaining = requiredCount - participants.length;
            message.textContent = `En attente de ${remaining} participant(s)...`;
        }
    }
}

function renderBotControls() {
    const controls = helpers.$('#tournament-bot-controls');
    if (!controls) return;

    const participants = store.get('tournament.participants', []);
    const requiredCount = store.get('tournament.playerCount', 4);
    const status = store.get('tournament.status', 'lobby');

    const canAddBot = state.isHost && participants.length < requiredCount && status === 'lobby';
    controls.classList.toggle('hidden', !canAddBot);
}

/* ============================================================
   RENDU — BRACKET
   ============================================================ */

function renderBracket() {
    renderBracketHeader();
    renderBracketDisplay();
}

function renderBracketHeader() {
    const codeEl = helpers.$('#bracket-tournament-code');
    if (codeEl) codeEl.textContent = state.tournamentId;

    const statusEl = helpers.$('#bracket-status');
    if (statusEl) {
        const status = store.get('tournament.status');
        statusEl.textContent = status === 'playing' ? '🟢 En cours' :
            status === 'finished' ? '🏁 Terminé' : '⏳ En attente';
    }

    const roundInfoEl = helpers.$('#bracket-round-info');
    if (roundInfoEl) {
        const currentRound = store.get('tournament.currentRound', 1);
        const totalRounds = store.get('tournament.totalRounds', 2);
        const roundName = getRoundName(currentRound, totalRounds);
        roundInfoEl.textContent = `Tour ${currentRound} — ${roundName}`;
    }
}

function renderBracketDisplay() {
    const container = helpers.$('#bracket-display');
    if (!container) return;

    const bracket = store.get('tournament.bracket');
    if (!bracket) {
        container.innerHTML = '<div class="empty-state-small">Chargement du bracket...</div>';
        return;
    }

    const rounds = bracket.rounds || [];
    const currentRound = bracket.currentRound || 1;

    container.innerHTML = rounds.map(round => {
        const isActive = round.number === currentRound;
        const isCompleted = round.completed;

        let roundClasses = 'bracket-round';
        if (isActive) roundClasses += ' active';
        if (isCompleted) roundClasses += ' completed';

        const matchesHtml = round.matches.map(match => renderMatchCard(match)).join('');

        return `
      <div class="${roundClasses}">
        <div class="bracket-round-header">${round.name}</div>
        ${matchesHtml}
      </div>
    `;
    }).join('');
}

function renderMatchCard(match) {
    const myId = store.get('player.id');

    let cardClasses = 'match-card';
    if (match.status === 'playing') cardClasses += ' playing';
    else if (match.status === 'finished') cardClasses += ' finished';
    else cardClasses += ' pending';

    const player1Html = renderMatchPlayer(match.player1, match.winner, myId);
    const player2Html = renderMatchPlayer(match.player2, match.winner, myId);

    return `
    <div class="${cardClasses}" data-match-id="${match.id}">
      ${player1Html}
      <div class="match-vs">VS</div>
      ${player2Html}
    </div>
  `;
}

function renderMatchPlayer(player, winner, myId) {
    if (!player) {
        return `
      <div class="match-player bye">
        <div class="match-player-avatar">❓</div>
        <span class="match-player-name">À déterminer</span>
      </div>
    `;
    }

    const isWinner = winner && winner.id === player.id;
    const isMe = player.id === myId;

    let classes = 'match-player';
    if (isWinner) classes += ' winner';
    if (isMe) classes += ' me';
    if (player.isBot) classes += ' bot';

    return `
    <div class="${classes}">
      <div class="match-player-avatar">${player.avatar || (player.isBot ? '🤖' : '👤')}</div>
      <span class="match-player-name">${helpers.escapeHtml(player.name)}</span>
      ${player.isBot ? '<span class="match-player-bot">BOT</span>' : ''}
      ${isWinner ? '<span class="match-player-score">✓</span>' : ''}
    </div>
  `;
}

function getRoundName(round, totalRounds) {
    const remaining = totalRounds - round + 1;
    const names = {
        1: 'Finale',
        2: 'Demi-finales',
        3: 'Quarts de finale',
        4: 'Huitièmes de finale'
    };
    return names[remaining] || `Tour ${round}`;
}

/* ============================================================
   ABONNEMENTS
   ============================================================ */

function setupSubscriptions() {
    // État du championnat
    state.unsubscribers.push(
        store.subscribe('tournament.participants', () => {
            if (state.isWaitingScreen) {
                renderParticipantsList();
                renderStartButton();
                renderBotControls();
            }
        }),
        store.subscribe('tournament.status', () => {
            render();
        }),
        store.subscribe('tournament.bracket', () => {
            if (!state.isWaitingScreen) {
                renderBracketDisplay();
            }
        }),
        store.subscribe('tournament.currentRound', () => {
            if (!state.isWaitingScreen) {
                renderBracketHeader();
                renderBracketDisplay();
            }
        })
    );

    // Socket events
    socket.on('tournament:update', (data) => {
        if (data.tournament) {
            updateTournamentFromServer(data.tournament);
        }
    });

    socket.on('tournament:started', (data) => {
        console.log('🏆 Championnat démarré');
        if (data.tournament) {
            updateTournamentFromServer(data.tournament);
        }
        state.isWaitingScreen = false;
        render();
    });

    socket.on('tournament:match_started', (data) => {
        console.log('⚔️ Match démarré:', data.matchId);
        showToast('⚔️ Match en cours...', 'info');
    });

    socket.on('tournament:match_ended', (data) => {
        console.log('🏁 Match terminé:', data.match);
        if (data.match && data.match.winner) {
            showToast(`🏆 ${data.match.winner.name} remporte le match !`, 'success');
        }
        if (data.tournament) {
            updateTournamentFromServer(data.tournament);
        }
    });

    socket.on('tournament:finished', (data) => {
        console.log('🎉 Championnat terminé');
        if (data.tournament) {
            updateTournamentFromServer(data.tournament);
        }
        handleTournamentEnd(data);
    });
}

/* ============================================================
   MISE À JOUR DEPUIS LE SERVEUR
   ============================================================ */

function updateTournamentFromServer(tournament) {
    if (!tournament) return;

    const myId = store.get('player.id');

    store.batch(() => {
        store.set('tournament.id', tournament.id);
        store.set('tournament.status', tournament.status);
        store.set('tournament.hostId', tournament.hostId);
        store.set('tournament.playerCount', tournament.playerCount);
        store.set('tournament.participants', tournament.participants || []);
        store.set('tournament.bracket', tournament.bracket);
        store.set('tournament.currentRound', tournament.currentRound || 0);
        store.set('tournament.totalRounds', tournament.totalRounds || 0);
        store.set('tournament.matches', tournament.matches || []);
        store.set('tournament.winner', tournament.winner);
        store.set('tournament.finalRanking', tournament.finalRanking || []);
    });

    state.isHost = tournament.hostId === myId;
}

/* ============================================================
   FIN DE CHAMPIONNAT
   ============================================================ */

function handleTournamentEnd(data) {
    const modal = helpers.$('#modal-tournament-end');
    const championName = helpers.$('#champion-name');
    const ranking = helpers.$('#tournament-final-ranking');

    if (!modal || !championName || !ranking) return;

    const champion = data.champion;
    const finalRanking = data.finalRanking || [];

    // Nom du champion
    championName.textContent = champion ? champion.name : '—';

    // Classement final
    ranking.innerHTML = finalRanking.map((p, index) => {
        const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
        const isMe = p.id === store.get('player.id');

        return `
      <div class="ranking-item ${index === 0 ? 'winner' : ''} ${isMe ? 'me' : ''}">
        <span class="ranking-position">${medal}</span>
        <span class="ranking-name">${helpers.escapeHtml(p.name)}</span>
        ${isMe ? '<span style="color: var(--color-primary); font-size: 12px;">(vous)</span>' : ''}
      </div>
    `;
    }).join('');

    modal.classList.add('active');

    // Confettis massifs
    if (champion && champion.id === store.get('player.id')) {
        launchConfetti(300);
        setTimeout(() => launchConfetti(200), 500);
        setTimeout(() => launchConfetti(150), 1000);
    } else if (champion) {
        launchConfetti(150);
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
    state.initialized = false;
    state.tournamentId = null;
    state.lastMatchId = null;
    console.log('🧹 Championnat nettoyé');
}

/* ============================================================
   EXPORT DEFAULT
   ============================================================ */

export default {
    init,
    destroy
};