// public/sw.js - Service Worker

const CACHE_NAME = 'jeu-cartes-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/script.js',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png'
];

// Installation
self.addEventListener('install', (event) => {
    console.log('✅ Service Worker installé');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS))
            .then(() => self.skipWaiting())
            .catch(err => console.error('❌ Erreur cache:', err))
    );
});

// Activation
self.addEventListener('activate', (event) => {
    console.log('✅ Service Worker activé');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
            ))
            .then(() => clients.claim())
    );
});

// Fetch (offline)
self.addEventListener('fetch', (event) => {
    // Ne pas intercepter les requêtes Socket.io
    if (event.request.url.includes('/socket.io/')) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => response || fetch(event.request))
            .catch(() => caches.match('/index.html'))
    );
});