/**
 * sw.js – Service Worker for ExpenseTracker PWA
 * Provides offline support via Cache-First strategy for static assets
 * and Network-First for dynamic content.
 */

const CACHE_NAME = 'expense-tracker-v2';
const OFFLINE_URL = './offline.html';

// Assets to precache on install
const PRECACHE_ASSETS = [
  './',
  './index.html',
  './transactions.html',
  './reports.html',
  './budgets.html',
  './settings.html',
  './manifest.json',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/db.js',
  './assets/js/utils.js',
  './assets/js/ui.js',
  './assets/js/transaction-form.js',
  './assets/js/transaction.js',
  './assets/js/dashboard.js',
  './assets/js/report.js',
  './assets/js/chart.js',
  './assets/js/settings.js',
  './assets/js/budget.js',
];

// CDN assets to cache on first use
const CDN_HOSTS = [
  'cdn.jsdelivr.net',
  'cdn.sheetjs.com',
];

// ─── Install ──────────────────────────────────────────────────────────────────

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Pre-caching app shell');
      // Cache each asset individually, don't fail on errors
      const results = await Promise.allSettled(
        PRECACHE_ASSETS.map(url => cache.add(url).catch(err => {
          console.warn('[SW] Failed to cache:', url, err);
        }))
      );
      return results;
    }).then(() => self.skipWaiting())
  );
});

// ─── Activate ─────────────────────────────────────────────────────────────────

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames
          .filter(name => name !== CACHE_NAME)
          .map(name => {
            console.log('[SW] Deleting old cache:', name);
            return caches.delete(name);
          })
      );
    }).then(() => self.clients.claim())
  );
});

// ─── Fetch ────────────────────────────────────────────────────────────────────

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and non-HTTP(S)
  if (request.method !== 'GET') return;
  if (!['http:', 'https:'].includes(url.protocol)) return;

  // CDN assets: Cache-First
  if (CDN_HOSTS.some(host => url.hostname.includes(host))) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Same-origin: Cache-First with network fallback
  if (url.origin === self.location.origin) {
    event.respondWith(cacheFirstWithNetworkFallback(request));
    return;
  }
});

// ─── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function cacheFirstWithNetworkFallback(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Return offline page for navigation requests
    if (request.mode === 'navigate') {
      const offlinePage = await caches.match('./index.html');
      if (offlinePage) return offlinePage;
    }
    return new Response(
      JSON.stringify({ error: 'Offline', message: 'No network connection' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// ─── Message Handler ──────────────────────────────────────────────────────────

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
  if (event.data?.type === 'GET_VERSION') {
    event.ports[0]?.postMessage({ version: CACHE_NAME });
  }
});
