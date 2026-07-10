/**
 * sw.js – Service Worker for ExpenseTracker PWA
 * Cache-first for the full app shell so the app works completely offline.
 */

const CACHE_NAME = 'expense-tracker-v4';
const OFFLINE_URL = './offline.html';

const PRECACHE_ASSETS = [
  './',
  './index.html',
  './transactions.html',
  './reports.html',
  './budgets.html',
  './settings.html',
  './offline.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/db.js',
  './assets/js/utils.js',
  './assets/js/ui.js',
  './assets/js/pwa.js',
  './assets/js/transaction-form.js',
  './assets/js/transaction.js',
  './assets/js/dashboard.js',
  './assets/js/report.js',
  './assets/js/chart.js',
  './assets/js/settings.js',
  './assets/js/budget.js',
  './assets/vendor/bootstrap.min.css',
  './assets/vendor/bootstrap-icons.min.css',
  './assets/vendor/bootstrap-icons.woff2',
  './assets/vendor/bootstrap-icons.woff',
  './assets/vendor/bootstrap.bundle.min.js',
  './assets/vendor/chart.umd.min.js',
  './assets/vendor/jspdf.umd.min.js',
  './assets/vendor/jspdf.plugin.autotable.min.js',
  './assets/vendor/xlsx.full.min.js',
  './icons/icon-72.png',
  './icons/icon-96.png',
  './icons/icon-128.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching app shell');
      await Promise.allSettled(
        PRECACHE_ASSETS.map((url) =>
          cache.add(url).catch((err) => {
            console.warn('[SW] Failed to cache:', url, err);
          })
        )
      );
    })
  );
  // Do not skipWaiting here — let the client confirm via update banner
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== 'GET') return;
  if (!['http:', 'https:'].includes(url.protocol)) return;
  if (url.origin !== self.location.origin) return;

  // Navigations: network-first so updates land, cache/offline fallback
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(request));
    return;
  }

  event.respondWith(cacheFirstWithNetworkFallback(request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;
    return caches.match('./index.html');
  }
}

async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No network connection' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
