/**
 * pwa.js – Install prompt, update banner, online/offline status,
 *          standalone detection, and cache management.
 */

import { showToast } from './ui.js';

const IS_STANDALONE =
  window.matchMedia('(display-mode: standalone)').matches ||
  window.navigator.standalone === true;

let deferredInstall = null;
let waitingWorker = null;

// ─── Public init ──────────────────────────────────────────────────────────────

export function initPWA() {
  document.body.classList.toggle('pwa-standalone', IS_STANDALONE);
  ensureChrome();
  setupInstall();
  setupConnectivity();
  setupServiceWorker();
  handleShareTarget();
  updateStatusUI();
}

export function isStandalone() {
  return IS_STANDALONE;
}

export function canInstall() {
  return Boolean(deferredInstall);
}

export async function promptInstall() {
  if (!deferredInstall) {
    showIOSInstallHelp();
    return false;
  }
  deferredInstall.prompt();
  const { outcome } = await deferredInstall.userChoice;
  deferredInstall = null;
  document.querySelectorAll('[data-pwa-install]').forEach((el) => el.classList.add('d-none'));
  if (outcome === 'accepted') {
    showToast('App installed successfully!', 'success');
    updateStatusUI();
    return true;
  }
  return false;
}

export async function applyUpdate() {
  if (waitingWorker) {
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    return;
  }
  const reg = await navigator.serviceWorker?.getRegistration();
  reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
}

export async function clearAppCache() {
  if (!('caches' in window)) return 0;
  const keys = await caches.keys();
  await Promise.all(keys.map((k) => caches.delete(k)));
  return keys.length;
}

export async function getCacheVersion() {
  const reg = await navigator.serviceWorker?.getRegistration();
  if (!reg?.active) return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = (e) => resolve(e.data?.version || null);
    reg.active.postMessage({ type: 'GET_VERSION' }, [channel.port2]);
    setTimeout(() => resolve(null), 1500);
  });
}

// ─── Chrome (banners / buttons injected once) ─────────────────────────────────

function ensureChrome() {
  if (!document.getElementById('pwaUpdateBanner')) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div id="pwaUpdateBanner" class="pwa-update-banner d-none" role="status">
        <div class="pwa-update-inner">
          <i class="bi bi-arrow-repeat me-2"></i>
          <span>A new version is available.</span>
          <button type="button" class="btn btn-sm btn-light ms-auto" id="pwaReloadBtn">Update</button>
          <button type="button" class="btn btn-sm btn-link text-white p-1 ms-1" id="pwaDismissUpdate" aria-label="Dismiss">
            <i class="bi bi-x-lg"></i>
          </button>
        </div>
      </div>`
    );
    document.getElementById('pwaReloadBtn')?.addEventListener('click', () => applyUpdate());
    document.getElementById('pwaDismissUpdate')?.addEventListener('click', () => {
      document.getElementById('pwaUpdateBanner')?.classList.add('d-none');
    });
  }

  if (!document.getElementById('pwaOfflineBar')) {
    document.body.insertAdjacentHTML(
      'afterbegin',
      `<div id="pwaOfflineBar" class="pwa-offline-bar d-none" role="status" aria-live="polite">
        <i class="bi bi-wifi-off me-2"></i>You're offline — data stays on this device
      </div>`
    );
  }

  // Navbar install button (if navbar exists and button missing)
  const navActions = document.querySelector('#mainNavbar .ms-auto');
  if (navActions && !document.getElementById('installPWABtn')) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'installPWABtn';
    btn.className = 'btn btn-outline-primary btn-sm d-none align-items-center gap-1 me-1';
    btn.setAttribute('data-pwa-install', '');
    btn.title = 'Install app';
    btn.innerHTML = '<i class="bi bi-download"></i><span class="d-none d-sm-inline">Install</span>';
    btn.addEventListener('click', () => promptInstall());
    navActions.insertBefore(btn, navActions.firstChild);
  }

  // Settings page install / status hooks
  document.getElementById('settingsInstallBtn')?.addEventListener('click', () => promptInstall());
  document.getElementById('settingsUpdateBtn')?.addEventListener('click', () => applyUpdate());
  document.getElementById('settingsClearCacheBtn')?.addEventListener('click', async () => {
    const n = await clearAppCache();
    showToast(`Cleared ${n} cache${n === 1 ? '' : 's'}. Reload to refresh.`, 'info');
  });
}

// ─── Install ──────────────────────────────────────────────────────────────────

function setupInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    document.querySelectorAll('[data-pwa-install]').forEach((el) => {
      el.classList.remove('d-none');
      el.classList.add('d-inline-flex');
    });
    updateStatusUI();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    document.querySelectorAll('[data-pwa-install]').forEach((el) => el.classList.add('d-none'));
    showToast('ExpenseTracker installed!', 'success');
    updateStatusUI();
  });

  // iOS / browsers without beforeinstallprompt: still show install help in Settings
  if (!IS_STANDALONE && isIOS()) {
    document.getElementById('settingsInstallBtn')?.classList.remove('d-none');
    document.getElementById('iosInstallHint')?.classList.remove('d-none');
  }
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function showIOSInstallHelp() {
  if (isIOS()) {
    showToast('Tap Share → Add to Home Screen to install', 'info', 6000);
    return;
  }
  if (IS_STANDALONE) {
    showToast('App is already installed', 'info');
    return;
  }
  showToast('Install is not available in this browser yet', 'warning');
}

// ─── Connectivity ─────────────────────────────────────────────────────────────

function setupConnectivity() {
  const sync = () => {
    const offline = !navigator.onLine;
    document.body.classList.toggle('is-offline', offline);
    const bar = document.getElementById('pwaOfflineBar');
    bar?.classList.toggle('d-none', !offline);
    updateStatusUI();
    if (!offline) showToast('Back online', 'success', 2000);
  };

  window.addEventListener('online', sync);
  window.addEventListener('offline', () => {
    document.body.classList.add('is-offline');
    document.getElementById('pwaOfflineBar')?.classList.remove('d-none');
    updateStatusUI();
  });

  if (!navigator.onLine) {
    document.body.classList.add('is-offline');
    document.getElementById('pwaOfflineBar')?.classList.remove('d-none');
  }
}

// ─── Service Worker ───────────────────────────────────────────────────────────

function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register('./sw.js');
      console.log('[SW] Registered:', reg.scope);

      if (reg.waiting) showUpdateBanner(reg.waiting);

      reg.addEventListener('updatefound', () => {
        const worker = reg.installing;
        if (!worker) return;
        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateBanner(worker);
          }
        });
      });

      // Periodic update check when tab is visible
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);

      const version = await getCacheVersion();
      const verEl = document.getElementById('pwaCacheVersion');
      if (verEl && version) verEl.textContent = version;
    } catch (err) {
      console.warn('[SW] Registration failed:', err);
    }
  });

  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (refreshing) return;
    refreshing = true;
    window.location.reload();
  });
}

function showUpdateBanner(worker) {
  waitingWorker = worker;
  document.getElementById('pwaUpdateBanner')?.classList.remove('d-none');
  document.getElementById('settingsUpdateBtn')?.classList.remove('d-none');
  showToast('Update available — tap Update to reload', 'info', 5000);
}

// ─── Status UI (Settings) ─────────────────────────────────────────────────────

function updateStatusUI() {
  const modeEl = document.getElementById('pwaDisplayMode');
  const netEl = document.getElementById('pwaNetworkStatus');
  const installBtn = document.getElementById('settingsInstallBtn');

  if (modeEl) {
    modeEl.textContent = IS_STANDALONE ? 'Installed (standalone)' : 'Browser tab';
    modeEl.className = IS_STANDALONE ? 'badge bg-success-subtle text-success' : 'badge bg-secondary-subtle text-secondary';
  }
  if (netEl) {
    const online = navigator.onLine;
    netEl.textContent = online ? 'Online' : 'Offline';
    netEl.className = online ? 'badge bg-success-subtle text-success' : 'badge bg-warning-subtle text-warning-emphasis';
  }
  if (installBtn) {
    if (IS_STANDALONE) {
      installBtn.classList.add('d-none');
    } else if (deferredInstall || isIOS()) {
      installBtn.classList.remove('d-none');
    }
  }
}

// ─── Web Share Target (GET) ───────────────────────────────────────────────────

function handleShareTarget() {
  const params = new URLSearchParams(window.location.search);
  const title = params.get('title');
  const text = params.get('text');
  const url = params.get('url');
  if (!title && !text && !url) return;

  const bits = [title, text, url].filter(Boolean).join('\n');
  if (bits && window.location.pathname.endsWith('settings.html')) {
    showToast('Shared content received — use Import to add data files', 'info', 5000);
  }
  // Clean query so refresh doesn't re-toast
  if (window.history.replaceState) {
    window.history.replaceState({}, '', window.location.pathname);
  }
}
