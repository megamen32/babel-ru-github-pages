/* ═══════════════════════════════════════════════════════════
   ВАВИЛОН — Service Worker for Offline-First
   Caches all assets on first install, serves from cache.
   ═══════════════════════════════════════════════════════════ */

const CACHE_NAME = 'babel-v13.0-fix-buildTokenTable';

const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/lib-tokens.js',
  './js/lib-token-table.js',
  './js/lib-prefix-codec.js',
  './js/lib-address-codec.js',
  './js/lib-coordinate-permutation.js',
  './js/lib-core.js',
  './js/lib-fillers.js',
  './js/lib-classifier.js',
  './js/lib-api.js',
  './data/tokens.ru-en.v2.json',
  './js/storage.js',
  './js/worker-bridge.js',
  './js/theme-helpers.js',
  './js/theme-bookshelf.js',
  './js/theme-cosmos.js',
  './js/theme-messenger.js',
  './js/theme-feed.js',
  './js/theme-terminal.js',
  './js/theme-views.js',
  './js/app.js',
  './js/words.js',
  './js/worker.js',
  './404.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './screenshot-wide.png',
  './screenshot-mobile.png',
];

/* Install: pre-cache all static assets */
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    }).then(() => self.skipWaiting())
  );
});

/* Activate: clean up old caches */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    }).then(() => self.clients.claim())
  );
});

/* Fetch: cache-first strategy for all static assets */
self.addEventListener('fetch', (event) => {
  /* Only handle GET requests */
  if (event.request.method !== 'GET') return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      /* For navigation requests (HTML pages), serve cached index.html */
      if (event.request.mode === 'navigate') {
        return caches.match('./index.html');
      }

      /* Try network, cache on success */
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => {
        /* If offline and not cached, serve index.html for SPA routing */
        return caches.match('./index.html');
      });
    })
  );
});
