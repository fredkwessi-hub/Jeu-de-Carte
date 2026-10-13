// ===== server/social/friends.js =====
// Système d'amis

const config = require('../config');
const logger = require('../utils/logger');
const helpers = require('../utils/helpers');
const profiles = require('../data/profiles');

// ===== STOCKAGE =====
// playerId -> { friends: Set<playerId>, pendingIncoming: Set, pendingOutgoing: Set, blocked: Set }
const friendships = new Map();

// ===== INITIALISATION =====
function getFriendship(playerId) {
    if (!friendships.has(playerId)) {
        friendships.set(playerId, {
            playerId,
            friends: new Set(),
            pendingIncoming: new Set(),
            pendingOutgoing: new Set(),
            blocked: new Set()
        });
    }
    return friendships.get(playerId);
}

// ===== DEMANDE D'AMI =====
function sendFriendRequest(fromId, toId) {
    if (fromId === toId) {
        return { success: false, reason: 'Vous ne pouvez pas vous ajouter vous-même' };
    }

    const fromProfile = profiles.getProfile(fromId);
    const toProfile = profiles.getProfile(toId);

    if (!fromProfile || !toProfile) {
        return { success: false, reason: 'Joueur introuvable' };
    }

    const fromFriendship = getFriendship(fromId);
    const toFriendship = getFriendship(toId);

    // Vérifier si bloqué
    if (toFriendship.blocked.has(fromId)) {
        return { success: false, reason: 'Action impossible' };
    }
    if (fromFriendship.blocked.has(toId)) {
        return { success: false, reason: 'Vous avez bloqué ce joueur' };
    }

    // Vérifier si déjà amis
    if (fromFriendship.friends.has(toId)) {
        return { success: false, reason: 'Vous êtes déjà amis' };
    }

    // Vérifier s'il y a déjà une demande
    if (fromFriendship.pendingOutgoing.has(toId)) {
        return { success: false, reason: 'Demande déjà envoyée' };
    }

    // Vérifier la limite
    if (fromFriendship.friends.size >= config.limits.maxFriendsPerPlayer) {
        return { success: false, reason: 'Limite d\'amis atteinte' };
    }

    // Si une demande inverse existe, accepter automatiquement
    if (fromFriendship.pendingIncoming.has(toId)) {
        return acceptFriendRequest(fromId, toId);
    }

    // Ajouter les demandes
    fromFriendship.pendingOutgoing.add(toId);
    toFriendship.pendingIncoming.add(fromId);

    logger.info(`👥 Demande d'ami: ${fromProfile.username} → ${toProfile.username}`);

    return {
        success: true,
        request: {
            fromId,
            fromName: fromProfile.username,
            fromAvatar: fromProfile.avatar,
            fromElo: fromProfile.elo,
            toId,
            toName: toProfile.username,
            sentAt: helpers.now()
        }
    };
}

// ===== ACCEPTER UNE DEMANDE =====
function acceptFriendRequest(playerId, requesterId) {
    const playerFriendship = getFriendship(playerId);
    const requesterFriendship = getFriendship(requesterId);

    // Vérifier que la demande existe
    if (!playerFriendship.pendingIncoming.has(requesterId)) {
        return { success: false, reason: 'Aucune demande en attente' };
    }

    // Vérifier la limite
    if (playerFriendship.friends.size >= config.limits.maxFriendsPerPlayer) {
        return { success: false, reason: 'Limite d\'amis atteinte' };
    }
    if (requesterFriendship.friends.size >= config.limits.maxFriendsPerPlayer) {
        return { success: false, reason: 'L\'autre joueur a atteint sa limite' };
    }

    // Retirer les demandes
    playerFriendship.pendingIncoming.delete(requesterId);
    requesterFriendship.pendingOutgoing.delete(playerId);

    // Ajouter les amis
    playerFriendship.friends.add(requesterId);
    requesterFriendship.friends.add(playerId);

    const playerProfile = profiles.getProfile(playerId);
    const requesterProfile = profiles.getProfile(requesterId);

    logger.info(`👥 Amitié: ${playerProfile.username} ↔ ${requesterProfile.username}`);

    return {
        success: true,
        friend: {
            id: requesterId,
            name: requesterProfile.username,
            avatar: requesterProfile.avatar,
            elo: requesterProfile.elo
        }
    };
}

// ===== REFUSER UNE DEMANDE =====
function declineFriendRequest(playerId, requesterId) {
    const playerFriendship = getFriendship(playerId);
    const requesterFriendship = getFriendship(requesterId);

    playerFriendship.pendingIncoming.delete(requesterId);
    requesterFriendship.pendingOutgoing.delete(playerId);

    logger.info(`👥 Demande d'ami refusée: ${playerId} a refusé ${requesterId}`);

    return { success: true };
}

// ===== ANNULER UNE DEMANDE ENVOYÉE =====
function cancelFriendRequest(playerId, targetId) {
    const playerFriendship = getFriendship(playerId);
    const targetFriendship = getFriendship(targetId);

    playerFriendship.pendingOutgoing.delete(targetId);
    targetFriendship.pendingIncoming.delete(playerId);

    return { success: true };
}

// ===== SUPPRIMER UN AMI =====
function removeFriend(playerId, friendId) {
    const playerFriendship = getFriendship(playerId);
    const friendFriendship = getFriendship(friendId);

    playerFriendship.friends.delete(friendId);
    friendFriendship.friends.delete(playerId);

    logger.info(`👥 Amitié terminée: ${playerId} et ${friendId}`);

    return { success: true };
}

// ===== BLOQUER UN JOUEUR =====
function blockPlayer(playerId, targetId) {
    const playerFriendship = getFriendship(playerId);

    // Retirer des amis si nécessaire
    playerFriendship.friends.delete(targetId);
    playerFriendship.pendingIncoming.delete(targetId);
    playerFriendship.pendingOutgoing.delete(targetId);

    // Retirer des amis de l'autre côté aussi
    const targetFriendship = getFriendship(targetId);
    targetFriendship.friends.delete(playerId);
    targetFriendship.pendingIncoming.delete(playerId);
    targetFriendship.pendingOutgoing.delete(playerId);

    // Bloquer
    playerFriendship.blocked.add(targetId);

    logger.info(`🚫 ${playerId} a bloqué ${targetId}`);

    return { success: true };
}

function unblockPlayer(playerId, targetId) {
    const playerFriendship = getFriendship(playerId);
    playerFriendship.blocked.delete(targetId);
    return { success: true };
}

// ===== LISTER LES AMIS =====
function getFriends(playerId) {
    const friendship = getFriendship(playerId);
    const friendsList = [];

    friendship.friends.forEach(friendId => {
        const profile = profiles.getProfile(friendId);
        if (profile) {
            friendsList.push({
                id: friendId,
                name: profile.username,
                avatar: profile.avatar,
                elo: profile.elo,
                level: profile.level || 1,
                isOnline: profile.isOnline || false,
                lastSeen: profile.lastSeen || null
            });
        }
    });

    // Trier par statut en ligne puis par nom
    friendsList.sort((a, b) => {
        if (a.isOnline !== b.isOnline) return b.isOnline - a.isOnline;
        return a.name.localeCompare(b.name);
    });

    return friendsList;
}

function getFriendRequests(playerId) {
    const friendship = getFriendship(playerId);

    const incoming = [];
    friendship.pendingIncoming.forEach(fromId => {
        const profile = profiles.getProfile(fromId);
        if (profile) {
            incoming.push({
                id: fromId,
                name: profile.username,
                avatar: profile.avatar,
                elo: profile.elo,
                sentAt: helpers.now()
            });
        }
    });

    const outgoing = [];
    friendship.pendingOutgoing.forEach(toId => {
        const profile = profiles.getProfile(toId);
        if (profile) {
            outgoing.push({
                id: toId,
                name: profile.username,
                avatar: profile.avatar,
                elo: profile.elo,
                sentAt: helpers.now()
            });
        }
    });

    return { incoming, outgoing };
}

function getBlockedPlayers(playerId) {
    const friendship = getFriendship(playerId);
    const blocked = [];

    friendship.blocked.forEach(blockedId => {
        const profile = profiles.getProfile(blockedId);
        if (profile) {
            blocked.push({
                id: blockedId,
                name: profile.username,
                avatar: profile.avatar
            });
        }
    });

    return blocked;
}

// ===== VÉRIFICATIONS =====
function areFriends(playerId1, playerId2) {
    const friendship = getFriendship(playerId1);
    return friendship.friends.has(playerId2);
}

function hasPendingRequest(fromId, toId) {
    const friendship = getFriendship(fromId);
    return friendship.pendingOutgoing.has(toId);
}

function hasIncomingRequest(playerId, fromId) {
    const friendship = getFriendship(playerId);
    return friendship.pendingIncoming.has(fromId);
}

function isBlocked(playerId, targetId) {
    const friendship = getFriendship(playerId);
    return friendship.blocked.has(targetId);
}

function canInteract(playerId1, playerId2) {
    if (isBlocked(playerId1, playerId2) || isBlocked(playerId2, playerId1)) {
        return false;
    }
    return true;
}

// ===== INVITATIONS =====
function inviteFriendToGame(playerId, friendId, gameId) {
    if (!areFriends(playerId, friendId)) {
        return { success: false, reason: 'Vous n\'êtes pas amis' };
    }

    if (!canInteract(playerId, friendId)) {
        return { success: false, reason: 'Interaction impossible' };
    }

    const playerProfile = profiles.getProfile(playerId);

    logger.info(`📨 ${playerProfile.username} invite ${friendId} à rejoindre ${gameId}`);

    return {
        success: true,
        invitation: {
            fromId: playerId,
            fromName: playerProfile.username,
            fromAvatar: playerProfile.avatar,
            gameId,
            sentAt: helpers.now()
        }
    };
}

// ===== STATISTIQUES =====
function getStats(playerId) {
    const friendship = getFriendship(playerId);
    return {
        friendsCount: friendship.friends.size,
        pendingIncoming: friendship.pendingIncoming.size,
        pendingOutgoing: friendship.pendingOutgoing.size,
        blockedCount: friendship.blocked.size,
        maxFriends: config.limits.maxFriendsPerPlayer
    };
}

function getGlobalStats() {
    let totalFriendships = 0;
    let totalPending = 0;
    let totalBlocked = 0;

    friendships.forEach(f => {
        totalFriendships += f.friends.size;
        totalPending += f.pendingIncoming.size + f.pendingOutgoing.size;
        totalBlocked += f.blocked.size;
    });

    return {
        totalPlayers: friendships.size,
        totalFriendships: totalFriendships / 2, // Divisé par 2 car compté dans les deux sens
        totalPendingRequests: totalPending / 2,
        totalBlocked: totalBlocked,
        averageFriendsPerPlayer: friendships.size > 0
            ? Math.round((totalFriendships / friendships.size) * 10) / 10
            : 0
    };
}

// ===== NETTOYAGE =====
function cleanupInactiveFriendships() {
    // Optionnel : nettoyer les relations avec des joueurs inactifs
    logger.info('Nettoyage des amitiés inactives (à implémenter)');
}

// ===== EXPORT =====
module.exports = {
    // Demandes
    sendFriendRequest,
    acceptFriendRequest,
    declineFriendRequest,
    cancelFriendRequest,

    // Gestion
    removeFriend,
    blockPlayer,
    unblockPlayer,

    // Listes
    getFriends,
    getFriendRequests,
    getBlockedPlayers,

    // Vérifications
    areFriends,
    hasPendingRequest,
    hasIncomingRequest,
    isBlocked,
    canInteract,

    // Invitations
    inviteFriendToGame,

    // Stats
    getStats,
    getGlobalStats,

    // Nettoyage
    cleanupInactiveFriendships,

    // Storage (debug)
    friendships
};