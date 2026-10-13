// =============================================================
// JEU DE CARTES — SERVICE WORKER (PWA)
// =============================================================
// Cache offline, notifications push, mise à jour automatique.
// =============================================================

const VERSION = '2.0.0';
const CACHE_NAME = `jeu-cartes-v${VERSION}`;
const RUNTIME_CACHE = `jeu-cartes-runtime-v${VERSION}`;
const AUDIO_CACHE = `jeu-cartes-audio-v${VERSION}`;

/* ============================================================
   FICHIERS À PRÉCACHER (App Shell)
   ============================================================ */

const PRECACHE_ASSETS = [
    // HTML
    '/',
    '/index.html',

    // CSS
    '/css/main.css',
    '/css/themes.css',
    '/css/components.css',
    '/css/animations.css',
    '/css/lobby.css',
    '/css/game.css',
    '/css/tournament.css',
    '/css/responsive.css',

    // JS (Modules principaux)
    '/js/app.js',
    '/js/state.js',
    '/js/socket.js',
    '/js/router.js',

    // JS Utils
    '/js/utils/helpers.js',
    '/js/utils/storage.js',
    '/js/utils/i18n.js',

    // JS UI
    '/js/ui/lobby.js',
    '/js/ui/waiting.js',
    '/js/ui/game.js',
    '/js/ui/tournament.js',
    '/js/ui/settings.js',
    '/js/ui/spectator.js',
    '/js/ui/replay.js',

    // JS Game
    '/js/game/cards.js',
    '/js/game/hand.js',
    '/js/game/animations.js',
    '/js/game/sounds.js',
    '/js/game/haptics.js',
    '/js/game/chat.js',

    // JS Tournament
    '/js/tournament/bracket.js',
    '/js/tournament/matches.js',

    // JS Social
    '/js/social/friends.js',
    '/js/social/reactions.js',
    '/js/social/rooms.js',

    // JS Profile
    '/js/profile/stats.js',
    '/js/profile/elo.js',
    '/js/profile/avatars.js',

    // Manifest
    '/manifest.json',

    // Icônes
    '/icon-192.png',
    '/icon-512.png'
];

/* ============================================================
   ROUTES QUI NE DOIVENT PAS ÊTRE CACHÉES
   ============================================================ */

const NETWORK_ONLY_ROUTES = [
    '/socket.io/',
    '/api/',
    '/health'
];

/* ============================================================
   INSTALLATION
   ============================================================ */

self.addEventListener('install', (event) => {
    console.log(`[SW ${VERSION}] Installation...`);

    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log(`[SW ${VERSION}] Précache de ${PRECACHE_ASSETS.length} fichiers`);

                // Précharger tous les fichiers, en ignorant les erreurs individuelles
                return Promise.allSettled(
                    PRECACHE_ASSETS.map(url =>
                        cache.add(url).catch(err => {
                            console.warn(`[SW] Impossible de cacher ${url}:`, err.message);
                        })
                    )
                );
            })
            .then(() => {
                console.log(`[SW ${VERSION}] Précache terminé`);
                // Activer immédiatement
                return self.skipWaiting();
            })
    );
});

/* ============================================================
   ACTIVATION
   ============================================================ */

self.addEventListener('activate', (event) => {
    console.log(`[SW ${VERSION}] Activation...`);

    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                // Supprimer les anciens caches
                return Promise.all(
                    cacheNames
                        .filter((cacheName) => {
                            return cacheName.startsWith('jeu-cartes-') &&
                                cacheName !== CACHE_NAME &&
                                cacheName !== RUNTIME_CACHE &&
                                cacheName !== AUDIO_CACHE;
                        })
                        .map((cacheName) => {
                            console.log(`[SW] Suppression ancien cache: ${cacheName}`);
                            return caches.delete(cacheName);
                        })
                );
            })
            .then(() => {
                // Prendre le contrôle de tous les clients
                return self.clients.claim();
            })
            .then(() => {
                console.log(`[SW ${VERSION}] Activé`);
                // Notifier les clients de la mise à jour
                return notifyClients('sw:activated', { version: VERSION });
            })
    );
});

/* ============================================================
   INTERCEPTION DES REQUÊTES (Fetch)
   ============================================================ */

self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorer les requêtes non-GET
    if (request.method !== 'GET') return;

    // Ignorer les requêtes cross-origin (sauf CDN autorisés)
    if (url.origin !== self.location.origin) {
        // Fonts Google : on cache
        if (url.origin === 'https://fonts.googleapis.com' ||
            url.origin === 'https://fonts.gstatic.com') {
            event.respondWith(cacheFirstStrategy(request, RUNTIME_CACHE));
        }
        return;
    }

    // Ignorer les routes réseau uniquement
    if (NETWORK_ONLY_ROUTES.some(route => url.pathname.startsWith(route))) {
        return;
    }

    // Stratégie selon le type de fichier
    if (isAudioFile(url.pathname)) {
        event.respondWith(cacheFirstStrategy(request, AUDIO_CACHE));
    } else if (isStaticAsset(url.pathname)) {
        event.respondWith(cacheFirstStrategy(request, CACHE_NAME));
    } else if (isHTMLRequest(request)) {
        event.respondWith(networkFirstStrategy(request, CACHE_NAME));
    } else {
        event.respondWith(staleWhileRevalidate(request, RUNTIME_CACHE));
    }
});

/* ============================================================
   STRATÉGIES DE CACHE
   ============================================================ */

/**
 * Cache en priorité (pour les assets statiques)
 */
async function cacheFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    if (cached) {
        return cached;
    }

    try {
        const response = await fetch(request);

        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.warn('[SW] Fetch échoué (cache-first):', error.message);

        // Fallback pour les images
        if (request.destination === 'image') {
            return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200"><rect width="200" height="200" fill="#1E1D35"/><text x="100" y="100" font-family="Arial" font-size="40" fill="#6C63FF" text-anchor="middle" dy=".3em">🃏</text></svg>',
                { headers: { 'Content-Type': 'image/svg+xml' } }
            );
        }

        throw error;
    }
}

/**
 * Réseau en priorité (pour le HTML)
 */
async function networkFirstStrategy(request, cacheName) {
    const cache = await caches.open(cacheName);

    try {
        const response = await fetch(request);

        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }

        return response;
    } catch (error) {
        console.warn('[SW] Réseau indisponible (network-first), fallback cache');

        const cached = await cache.match(request);

        if (cached) {
            return cached;
        }

        // Fallback : index.html
        const fallback = await cache.match('/index.html');
        if (fallback) return fallback;

        // Erreur offline
        return new Response(
            `<!DOCTYPE html>
      <html>
        <head>
          <title>Hors ligne</title>
          <meta charset="utf-8">
          <style>
            body {
              font-family: -apple-system, sans-serif;
              background: #0F0E1E;
              color: #F5F5FF;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
              text-align: center;
              padding: 20px;
            }
            .icon { font-size: 80px; margin-bottom: 20px; }
            h1 { color: #6C63FF; margin-bottom: 12px; }
            p { color: #A8A7BE; }
            button {
              margin-top: 24px;
              padding: 14px 32px;
              background: #6C63FF;
              color: white;
              border: none;
              border-radius: 12px;
              font-size: 16px;
              font-weight: 600;
              cursor: pointer;
            }
          </style>
        </head>
        <body>
          <div>
            <div class="icon">📴</div>
            <h1>Hors ligne</h1>
            <p>Vérifie ta connexion internet et réessaie.</p>
            <button onclick="window.location.reload()">🔄 Recharger</button>
          </div>
        </body>
      </html>`,
            { headers: { 'Content-Type': 'text/html; charset=utf-8' } }
        );
    }
}

/**
 * Stale-while-revalidate (pour les ressources dynamiques)
 */
async function staleWhileRevalidate(request, cacheName) {
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);

    const fetchPromise = fetch(request).then((response) => {
        if (response && response.status === 200) {
            cache.put(request, response.clone());
        }
        return response;
    }).catch(() => cached);

    return cached || fetchPromise;
}

/* ============================================================
   HELPERS
   ============================================================ */

function isAudioFile(pathname) {
    return /\.(mp3|wav|ogg|m4a)$/i.test(pathname);
}

function isStaticAsset(pathname) {
    return /\.(css|js|png|jpg|jpeg|svg|gif|webp|ico|woff|woff2|ttf|eot)$/i.test(pathname);
}

function isHTMLRequest(request) {
    return request.mode === 'navigate' ||
        (request.method === 'GET' &&
            request.headers.get('accept')?.includes('text/html'));
}

/* ============================================================
   NOTIFICATIONS
   ============================================================ */

/**
 * Notifie tous les clients
 */
async function notifyClients(type, data = {}) {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

    clients.forEach(client => {
        client.postMessage({
            type,
            data,
            timestamp: Date.now()
        });
    });
}

/* ============================================================
   ÉCOUTE DES MESSAGES DES CLIENTS
   ============================================================ */

self.addEventListener('message', (event) => {
    const { type, data } = event.data || {};

    console.log(`[SW] Message reçu: ${type}`);

    switch (type) {
        case 'SKIP_WAITING':
            self.skipWaiting();
            break;

        case 'CACHE_URLS':
            cacheUrls(data.urls);
            break;

        case 'CLEAR_CACHE':
            clearAllCaches();
            break;

        case 'SHOW_NOTIFICATION':
            showNotification(data);
            break;

        case 'GET_VERSION':
            event.ports[0]?.postMessage({ version: VERSION });
            break;

        default:
            console.warn(`[SW] Type de message inconnu: ${type}`);
    }
});

async function cacheUrls(urls) {
    if (!Array.isArray(urls)) return;

    const cache = await caches.open(RUNTIME_CACHE);
    await Promise.allSettled(urls.map(url => cache.add(url)));
}

async function clearAllCaches() {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames.map(name => caches.delete(name)));
    console.log('[SW] Tous les caches supprimés');
}

/* ============================================================
   NOTIFICATIONS PUSH
   ============================================================ */

self.addEventListener('push', (event) => {
    console.log('[SW] Push reçu');

    let data = {
        title: '🃏 Jeu de Cartes',
        body: 'C\'est ton tour !',
        icon: '/icon-192.png',
        badge: '/icon-192.png'
    };

    if (event.data) {
        try {
            const parsed = event.data.json();
            data = { ...data, ...parsed };
        } catch (e) {
            data.body = event.data.text();
        }
    }

    const options = {
        body: data.body,
        icon: data.icon || '/icon-192.png',
        badge: data.badge || '/icon-192.png',
        vibrate: [200, 100, 200, 100, 400],
        tag: data.tag || 'jdc-notification',
        renotify: true,
        requireInteraction: data.requireInteraction !== false,
        silent: false,
        data: {
            url: data.url || '/',
            action: data.action || null,
            ...data.data
        },
        actions: data.actions || [
            { action: 'open', title: '🎮 Ouvrir' },
            { action: 'dismiss', title: '✕ Fermer' }
        ]
    };

    event.waitUntil(
        self.registration.showNotification(data.title, options)
    );
});

/* ============================================================
   GESTION DES CLICS SUR NOTIFICATIONS
   ============================================================ */

self.addEventListener('notificationclick', (event) => {
    const notification = event.notification;
    const action = event.action;
    const data = notification.data || {};

    notification.close();

    console.log(`[SW] Notification cliquée: action="${action}"`);

    if (action === 'dismiss') return;

    // Ouvrir l'app
    const urlToOpen = data.url || '/';

    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true })
            .then((clients) => {
                // Chercher un client déjà ouvert
                const existingClient = clients.find(c => c.url.includes(self.location.origin));

                if (existingClient) {
                    existingClient.focus();

                    // Envoyer un message au client pour qu'il navigue
                    existingClient.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        data: { url: urlToOpen, action: data.action }
                    });

                    return;
                }

                // Sinon, ouvrir une nouvelle fenêtre
                return self.clients.openWindow(urlToOpen);
            })
    );
});

self.addEventListener('notificationclose', (event) => {
    console.log('[SW] Notification fermée');
});

/* ============================================================
   SYNCHRONISATION EN ARRIÈRE-PLAN
   ============================================================ */

self.addEventListener('sync', (event) => {
    console.log(`[SW] Sync: ${event.tag}`);

    if (event.tag === 'sync-games') {
        event.waitUntil(syncPendingGames());
    }
});

async function syncPendingGames() {
    // À implémenter : synchroniser les parties en attente
    console.log('[SW] Synchronisation des parties...');
}

/* ============================================================
   PERIODIC SYNC (si supporté)
   ============================================================ */

self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'check-tournaments') {
        event.waitUntil(checkTournaments());
    }
});

async function checkTournaments() {
    console.log('[SW] Vérification des tournois...');
}

/* ============================================================
   RÉSEAU PERDU / RETROUVÉ
   ============================================================ */

self.addEventListener('online', () => {
    console.log('[SW] En ligne');
    notifyClients('sw:online');
});

self.addEventListener('offline', () => {
    console.log('[SW] Hors ligne');
    notifyClients('sw:offline');
});

/* ============================================================
   EXPORT (pour tests)
   ============================================================ */

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VERSION,
        CACHE_NAME,
        PRECACHE_ASSETS
    };
}

console.log(`[SW] Service Worker v${VERSION} chargé`);