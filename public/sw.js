const CACHE_NAME = 'jeu-cartes-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json'
];

self.addEventListener('install', function(event) {
    console.log('✅ Service Worker installé');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) { return cache.addAll(ASSETS); })
            .then(function() { return self.skipWaiting(); })
            .catch(function(err) { console.error('❌ Erreur cache:', err); })
    );
});

self.addEventListener('activate', function(event) {
    console.log('✅ Service Worker activé');
    event.waitUntil(
        caches.keys().then(function(keys) {
            return Promise.all(
                keys.filter(function(key) { return key !== CACHE_NAME; })
                    .map(function(key) { return caches.delete(key); })
            );
        }).then(function() { return clients.claim(); })
    );
});

self.addEventListener('fetch', function(event) {
    if (event.request.url.indexOf('/socket.io/') !== -1) return;

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                return response || fetch(event.request).catch(function() {
                    return caches.match('/index.html');
                });
            })
    );
});