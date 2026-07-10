/**
 * settings.js – Settings page: preferences, categories CRUD,
 *               backup/restore, and danger zone actions.
 */

import db from './db.js';
import { DEFAULT_CATEGORIES, downloadJSON, setCurrencyPrefs, setDateFormat } from './utils.js';
import { showToast, showLoading, hideLoading, confirmDialog } from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────
let currentCatTab = 'Expense';
let editingCatId = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadPreferences();
  await loadAboutStats();
  await renderCategories();
  setupPreferenceHandlers();
  setupCategoryHandlers();
  setupBackupHandlers();
  setupDangerZone();
}

// ─── Preferences ──────────────────────────────────────────────────────────────

async function loadPreferences() {
  const settings = await db.getAllSettings();

  const currencySel   = document.getElementById('settingCurrency');
  const dateFormatSel = document.getElementById('settingDateFormat');
  const decimalsSel   = document.getElementById('settingDecimals');
  const themeSel      = document.getElementById('settingTheme');

  if (currencySel)   currencySel.value   = settings.currency   || 'INR';
  if (dateFormatSel) dateFormatSel.value = settings.dateFormat || 'DD/MM/YYYY';
  if (decimalsSel)   decimalsSel.value   = settings.decimals   ?? 2;
  if (themeSel)      themeSel.value      = settings.theme      || 'light';
}

function setupPreferenceHandlers() {
  document.getElementById('savePreferencesBtn')?.addEventListener('click', async () => {
    const currency   = document.getElementById('settingCurrency')?.value   || 'INR';
    const dateFormat = document.getElementById('settingDateFormat')?.value || 'DD/MM/YYYY';
    const decimals   = document.getElementById('settingDecimals')?.value   ?? 2;
    const theme      = document.getElementById('settingTheme')?.value      || 'light';

    await db.setSetting('currency',   currency);
    await db.setSetting('dateFormat', dateFormat);
    await db.setSetting('decimals',   parseInt(decimals));
    await db.setSetting('theme',      theme);

    // Apply immediately
    setCurrencyPrefs(currency, decimals);
    setDateFormat(dateFormat);

    let resolved = theme;
    if (theme === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-bs-theme', resolved);

    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = resolved === 'dark' ? 'bi bi-moon-fill fs-5' : 'bi bi-sun-fill fs-5';

    // Update currency symbols
    const symbols = { INR: '₹', USD: '$', EUR: '€', GBP: '£' };
    const sym = symbols[currency] || '₹';
    document.querySelectorAll('#currencySymbol, #budgetCurrencySymbol').forEach(el => {
      el.textContent = sym;
    });

    showToast('Preferences saved', 'success');
  });
}

// ─── Categories ───────────────────────────────────────────────────────────────

async function renderCategories() {
  const container = document.getElementById('categoriesList');
  if (!container) return;

  const cats = await db.getCategoriesByType(currentCatTab);
  cats.sort((a, b) => a.name.localeCompare(b.name));

  if (!cats.length) {
    container.innerHTML = `<p class="text-muted small text-center py-2">No ${currentCatTab} categories.</p>`;
    return;
  }

  container.innerHTML = cats.map(cat => `
    <div class="category-list-item" data-id="${cat.id}">
      <div class="d-flex align-items-center gap-2">
        <i class="bi ${cat.icon || 'bi-tag'} text-muted"></i>
        <span class="small">${cat.name}</span>
        ${cat.isDefault ? '<span class="badge bg-secondary-subtle text-secondary ms-1" style="font-size:.65rem">default</span>' : ''}
      </div>
      <div class="actions">
        <button class="btn btn-sm btn-link p-0 text-primary edit-cat-btn" data-id="${cat.id}" title="Edit">
          <i class="bi bi-pencil"></i>
        </button>
        ${!cat.isDefault ? `<button class="btn btn-sm btn-link p-0 text-danger del-cat-btn" data-id="${cat.id}" title="Delete">
          <i class="bi bi-trash3"></i>
        </button>` : ''}
      </div>
    </div>`).join('');
}

function setupCategoryHandlers() {
  // Tab toggle
  document.getElementById('catTabExpense')?.addEventListener('click', (e) => {
    currentCatTab = 'Expense';
    e.target.classList.add('active-tab-btn');
    document.getElementById('catTabIncome')?.classList.remove('active-tab-btn');
    document.getElementById('catTabExpense')?.classList.add('btn-outline-danger');
    document.getElementById('catTabIncome')?.classList.add('btn-outline-success');
    renderCategories();
  });

  document.getElementById('catTabIncome')?.addEventListener('click', (e) => {
    currentCatTab = 'Income';
    e.target.classList.add('active-tab-btn');
    document.getElementById('catTabExpense')?.classList.remove('active-tab-btn');
    renderCategories();
  });

  // Delegation for edit/delete
  document.getElementById('categoriesList')?.addEventListener('click', async (e) => {
    const editBtn = e.target.closest('.edit-cat-btn');
    const delBtn  = e.target.closest('.del-cat-btn');

    if (editBtn) {
      const id = parseInt(editBtn.dataset.id);
      await openEditCategoryModal(id);
    }
    if (delBtn) {
      const id = parseInt(delBtn.dataset.id);
      await deleteCategoryById(id);
    }
  });

  // Save category
  document.getElementById('saveCategoryBtn')?.addEventListener('click', saveCategory);

  // Reset modal on close
  document.getElementById('categoryModal')?.addEventListener('hidden.bs.modal', () => {
    editingCatId = null;
    document.getElementById('categoryForm')?.reset();
    document.getElementById('categoryId').value = '';
    document.getElementById('categoryModalTitle').textContent = 'Add Category';
  });

  // Pre-select type when opening modal
  document.getElementById('categoryModal')?.addEventListener('show.bs.modal', () => {
    if (!editingCatId) {
      document.getElementById('categoryType').value = currentCatTab;
    }
  });
}

async function openEditCategoryModal(id) {
  const cats = await db.getAllCategories();
  const cat = cats.find(c => c.id === id);
  if (!cat) return;

  editingCatId = id;
  document.getElementById('categoryId').value   = id;
  document.getElementById('categoryName').value = cat.name;
  document.getElementById('categoryType').value = cat.type;
  document.getElementById('categoryIcon').value = cat.icon || 'bi-tag';
  document.getElementById('categoryModalTitle').textContent = 'Edit Category';

  const modalEl = document.getElementById('categoryModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function saveCategory() {
  const form = document.getElementById('categoryForm');
  const name = document.getElementById('categoryName')?.value.trim();
  const type = document.getElementById('categoryType')?.value;
  const icon = document.getElementById('categoryIcon')?.value || 'bi-tag';
  const idVal = document.getElementById('categoryId')?.value;

  if (!name) {
    form.classList.add('was-validated');
    document.getElementById('categoryName').setCustomValidity('Required');
    return;
  }
  document.getElementById('categoryName').setCustomValidity('');

  try {
    if (idVal) {
      await db.updateCategory({ id: parseInt(idVal), name, type, icon });
      showToast('Category updated', 'success');
    } else {
      await db.addCategory({ name, type, icon, isDefault: false });
      showToast('Category added', 'success');
    }

    const modalEl = document.getElementById('categoryModal');
    bootstrap.Modal.getInstance(modalEl)?.hide();
    await renderCategories();
  } catch (err) {
    showToast('Failed to save category', 'error');
  }
}

async function deleteCategoryById(id) {
  const confirmed = await confirmDialog('Delete Category?', 'This will not delete existing transactions using this category.');
  if (!confirmed) return;

  try {
    await db.deleteCategory(id);
    showToast('Category deleted', 'success');
    await renderCategories();
  } catch {
    showToast('Failed to delete category', 'error');
  }
}

// ─── About Stats ──────────────────────────────────────────────────────────────

async function loadAboutStats() {
  const [txs, cats, budgets] = await Promise.all([
    db.getAllTransactions(),
    db.getAllCategories(),
    db.getAllBudgets(),
  ]);
  const setText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  setText('aboutTxCount',    txs.length);
  setText('aboutCatCount',   cats.length);
  setText('aboutBudgetCount',budgets.length);
}

// ─── Backup & Restore ─────────────────────────────────────────────────────────

function setupBackupHandlers() {
  document.getElementById('backupBtn')?.addEventListener('click', createBackup);
  document.getElementById('restoreBtn')?.addEventListener('click', () => {
    document.getElementById('restoreFileInput')?.click();
  });
  document.getElementById('restoreFileInput')?.addEventListener('change', restoreBackup);
}

async function createBackup() {
  showLoading();
  try {
    const data = await db.exportBackup();
    downloadJSON(data, `expense-tracker-backup-${new Date().toISOString().slice(0,10)}.json`);

    // Record last backup
    await db.setSetting('lastBackup', new Date().toISOString());
    const info = document.getElementById('lastBackupInfo');
    if (info) info.textContent = `Last backup: ${new Date().toLocaleString()}`;

    showToast('Backup created successfully', 'success');
  } catch (err) {
    showToast('Backup failed: ' + err.message, 'error');
  } finally {
    hideLoading();
  }
}

async function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;

  const confirmed = await confirmDialog(
    'Restore from Backup?',
    'This will merge the backup data with your existing data.'
  );
  if (!confirmed) return;

  showLoading();
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    await db.importBackup(data, 'merge');
    showToast('Backup restored successfully', 'success');
    await loadAboutStats();
  } catch (err) {
    showToast('Restore failed: ' + err.message, 'error');
  } finally {
    hideLoading();
    e.target.value = '';
  }
}

// ─── Danger Zone ──────────────────────────────────────────────────────────────

function setupDangerZone() {
  document.getElementById('clearTransactionsBtn')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Clear All Transactions?',
      'All transaction data will be permanently deleted. Categories and budgets will be kept.'
    );
    if (!confirmed) return;
    showLoading();
    try {
      await db.clearAllTransactions();
      const remaining = await db.getAllTransactions();
      if (remaining.length > 0) {
        throw new Error(`Clear incomplete — ${remaining.length} transactions still remain`);
      }
      showToast('All transactions cleared', 'success');
      await loadAboutStats();
    } catch (err) {
      console.error('Clear transactions failed:', err);
      showToast('Failed to clear: ' + err.message, 'error');
    } finally {
      hideLoading();
    }
  });

  document.getElementById('resetAppBtn')?.addEventListener('click', async () => {
    const confirmed = await confirmDialog(
      'Reset All Data?',
      'All transactions, budgets, custom categories, and settings will be deleted. Default categories will be restored on restart.'
    );
    if (!confirmed) return;
    showLoading();
    try {
      await db.resetAll();

      // Verify every store is empty before continuing
      const [txs, cats, budgets, settings] = await Promise.all([
        db.getAllTransactions(),
        db.getAllCategories(),
        db.getAllBudgets(),
        db.getAllSettings(),
      ]);
      if (txs.length || cats.length || budgets.length || Object.keys(settings).length) {
        throw new Error('Reset incomplete — some data still remains. Try again.');
      }

      localStorage.clear();
      sessionStorage.clear();
      showToast('All data cleared. Restarting...', 'success');
      setTimeout(() => { window.location.href = 'index.html'; }, 1000);
    } catch (err) {
      console.error('Reset failed:', err);
      showToast('Reset failed: ' + err.message, 'error');
      hideLoading();
    }
  });
}

// ─── Start ────────────────────────────────────────────────────────────────────

window.addEventListener('appReady', init);
