/* ═══════════════════════════════════════════════════════════
   ВАВИЛОН — Service Worker for Offline-First
   Caches all assets on first install, serves from cache.
   ═══════════════════════════════════════════════════════════ */

/* Автоматическая версия из конфига. При изменении VERSION в config.js
   обновите и здесь — SW не имеет доступа к BabelApp.config. */
const CACHE_NAME = 'babel-v14.0';

/* Активы для предзагрузки — без токенного словаря (4.86 MB).
   Словарь будет закэширован при первом запросе через fetch-обработчик.
   Это экономит ~5 MB трафика и ускоряет первичную установку. */
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/config.js',
  './js/utils.js',
  './js/words.js',
  './js/lib-prefix-codec.js',
  './js/lib-token-table.js',
  './js/lib-address-codec.js',
  './js/lib-coordinate-permutation.js',
  './js/lib-tokens.js',
  './js/lib-core.js',
  './js/lib-fillers.js',
  './js/lib-classifier.js',
  './js/lib-api.js',
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
  './js/worker.js',
  './js/hexweb.js',
  './404.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './screenshot-wide.png',
  './screenshot-mobile.png',
];

/* Install: pre-cache static assets (без словаря — он загрузится по запросу) */
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

/* Fetch: cache-first для статики, stale-while-revalidate для словаря,
   network-first для навигации (чтобы получать обновления). */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  /* Навигация (index.html): network-first — чтобы получать обновления */
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  /* Токенный словарь: stale-while-revalidate — отдаём кэш, обновляем фоном */
  if (url.pathname.endsWith('/tokens.ru-en.v2.json')) {
    event.respondWith(
      caches.open(CACHE_NAME).then((cache) =>
        cache.match(event.request).then((cached) => {
          const fetchPromise = fetch(event.request).then((response) => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);

          return cached || fetchPromise;
        })
      )
    );
    return;
  }

  /* Вся остальная статика: cache-first */
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, clone);
          });
        }
        return response;
      }).catch(() => caches.match('./index.html'));
    })
  );
});
