/**
 * app.js – Application bootstrap, theme management, sidebar,
 *          navigation state, PWA install, and sample data seeding.
 */

import db from './db.js';
import { DEFAULT_CATEGORIES, setCurrencyPrefs, setDateFormat, todayInputDate } from './utils.js';
import { initPWA } from './pwa.js';

// ─── App Init ─────────────────────────────────────────────────────────────────

async function initApp() {
  // 1. Open database
  await db.init();

  // 2. Seed default categories when empty (first launch or after full reset)
  const categories = await db.getAllCategories();
  if (categories.length === 0) {
    await seedDefaultCategories();
  }

  // 3. Load & apply settings
  await applySettings();

  // 5. Setup UI
  setupThemeToggle();
  setupSidebar();
  initPWA();
  updateCurrencySymbols();

  // 6. Mark current nav link active
  setActiveNav();

  // Expose db globally for other modules
  window.appDB = db;

  // Ensure transaction date defaults to today if modal is on this page
  const txDate = document.getElementById('txDate');
  if (txDate) {
    const today = todayInputDate();
    txDate.defaultValue = today;
    txDate.value = today;
  }

  window.dispatchEvent(new CustomEvent('appReady'));
}

// ─── Seed Default Categories ──────────────────────────────────────────────────

async function seedDefaultCategories() {
  for (const [type, cats] of Object.entries(DEFAULT_CATEGORIES)) {
    for (const cat of cats) {
      await db.addCategory({ name: cat.name, type, icon: cat.icon, isDefault: true });
    }
  }
}

// ─── Settings ─────────────────────────────────────────────────────────────────

async function applySettings() {
  const settings = await db.getAllSettings();

  const currency  = settings.currency  || 'INR';
  const decimals  = settings.decimals  ?? 2;
  const dateFormat = settings.dateFormat || 'DD/MM/YYYY';
  const theme     = settings.theme     || 'system';

  setCurrencyPrefs(currency, decimals);
  setDateFormat(dateFormat);
  applyTheme(theme);
}

function applyTheme(theme) {
  const html = document.documentElement;
  let resolved = theme;

  if (theme === 'system') {
    resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  html.setAttribute('data-bs-theme', resolved);
  updateThemeIcon(resolved);
  window._currentTheme = resolved;
}

function updateThemeIcon(theme) {
  const icon = document.getElementById('themeIcon');
  if (!icon) return;
  icon.className = theme === 'dark' ? 'bi bi-moon-fill fs-5' : 'bi bi-sun-fill fs-5';
}

function setupThemeToggle() {
  const btn = document.getElementById('themeToggle');
  if (!btn) return;

  btn.addEventListener('click', async () => {
    const current = document.documentElement.getAttribute('data-bs-theme') || 'light';
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-bs-theme', next);
    updateThemeIcon(next);
    await db.setSetting('theme', next);
  });
}

function updateCurrencySymbols() {
  document.querySelectorAll('#currencySymbol, #budgetCurrencySymbol').forEach(el => {
    db.getSetting('currency').then(code => {
      const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
      el.textContent = symbols[code] || '₹';
    });
  });
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

function setupSidebar() {
  const sidebar    = document.getElementById('appSidebar');
  const main       = document.getElementById('appMain');
  const desktopBtn = document.getElementById('sidebarToggle');
  const mobileBtn  = document.getElementById('mobileMenuBtn');
  if (!sidebar) return;

  // ── Desktop: collapse to icon-only ──
  let isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';
  if (isCollapsed) {
    sidebar.classList.add('collapsed');
    main?.classList.add('sidebar-collapsed');
  }

  desktopBtn?.addEventListener('click', () => {
    isCollapsed = !isCollapsed;
    sidebar.classList.toggle('collapsed', isCollapsed);
    main?.classList.toggle('sidebar-collapsed', isCollapsed);
    localStorage.setItem('sidebarCollapsed', isCollapsed);
  });

  // ── Overlay for mobile drawer ──
  if (!document.getElementById('sidebarOverlay')) {
    const overlay = document.createElement('div');
    overlay.id = 'sidebarOverlay';
    overlay.className = 'sidebar-overlay';
    document.body.appendChild(overlay);
    overlay.addEventListener('click', closeMobileSidebar);
  }

  // ── Mobile hamburger button ──
  mobileBtn?.addEventListener('click', openMobileSidebar);

  // ── Swipe-to-open (left edge swipe) ──
  setupSwipeGesture(sidebar);

  // ── Close sidebar when a nav link is tapped on mobile ──
  sidebar.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', () => {
      if (window.innerWidth < 992) closeMobileSidebar();
    });
  });
}

function openMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar?.classList.add('mobile-open');
  overlay?.classList.add('active');
  document.body.style.overflow = 'hidden'; // prevent background scroll
}

function closeMobileSidebar() {
  const sidebar = document.getElementById('appSidebar');
  const overlay = document.getElementById('sidebarOverlay');
  sidebar?.classList.remove('mobile-open');
  overlay?.classList.remove('active');
  document.body.style.overflow = '';
}

// ─── Swipe to open sidebar ────────────────────────────────────────────────────

function setupSwipeGesture(sidebar) {
  let startX = 0;
  let startY = 0;
  const SWIPE_THRESHOLD = 60;
  const EDGE_ZONE = 24; // px from left edge to trigger

  document.addEventListener('touchstart', (e) => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (window.innerWidth >= 992) return;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = Math.abs(e.changedTouches[0].clientY - startY);
    // Swipe right from left edge
    if (dx > SWIPE_THRESHOLD && dy < 60 && startX < EDGE_ZONE) {
      openMobileSidebar();
    }
    // Swipe left to close
    if (dx < -SWIPE_THRESHOLD && dy < 60 && sidebar?.classList.contains('mobile-open')) {
      closeMobileSidebar();
    }
  }, { passive: true });
}

window.closeMobileSidebar = closeMobileSidebar;
window.openMobileSidebar  = openMobileSidebar;

// ─── Active Navigation ────────────────────────────────────────────────────────

function setActiveNav() {
  const path = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.sidebar-nav .nav-link, .bottom-nav-item').forEach(link => {
    const href = link.getAttribute('href') || '';
    if (href === path || (path === '' && href === 'index.html')) {
      link.classList.add('active');
      if (link.hasAttribute('aria-current')) link.setAttribute('aria-current', 'page');
    } else {
      link.classList.remove('active');
    }
  });
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

initApp().catch(console.error);
