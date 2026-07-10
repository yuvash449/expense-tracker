/**
 * transaction.js – Transactions page: CRUD, filtering, sorting, pagination,
 *                  bulk delete, import/export.
 */

import db from './db.js';
import {
  formatCurrency, formatDate, todayInputDate, validateTransaction,
  downloadJSON, downloadCSV, debounce, sumByType
} from './utils.js';
import {
  showToast, hideLoading, showLoading, emptyState,
  renderPagination, methodBadge, typeBadge, amountDisplay, confirmDialog
} from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  all: [],          // all transactions from DB
  filtered: [],     // after search + filters
  page: 1,
  pageSize: 25,
  selectedIds: new Set(),
  editingId: null,
  importFileType: null,
  importData: null,
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  await loadTransactions();
  populateFilterCategories();
  populateFilterYearsMonths();
  setupFormHandlers();
  setupFilterHandlers();
  setupTableHandlers();
  setupImportExport();
  renderTable();
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadTransactions() {
  state.all = await db.getAllTransactions();
  state.filtered = [...state.all];
}

// ─── Populate Filters ─────────────────────────────────────────────────────────

async function populateFilterCategories() {
  const cats = await db.getAllCategories();
  const select = document.getElementById('filterCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">All</option>';
  cats.sort((a, b) => a.name.localeCompare(b.name))
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
  if (current) select.value = current;
}

function populateFilterYearsMonths() {
  const years = [...new Set(state.all.map(t => t.date.substring(0, 4)))].sort((a, b) => b - a);
  const yearSel = document.getElementById('filterYear');
  if (yearSel) {
    yearSel.innerHTML = '<option value="">All Years</option>';
    years.forEach(y => yearSel.insertAdjacentHTML('beforeend', `<option value="${y}">${y}</option>`));
  }

  const months = ['January','February','March','April','May','June',
                   'July','August','September','October','November','December'];
  const monthSel = document.getElementById('filterMonth');
  if (monthSel) {
    monthSel.innerHTML = '<option value="">All Months</option>';
    months.forEach((m, i) =>
      monthSel.insertAdjacentHTML('beforeend', `<option value="${i+1}">${m}</option>`)
    );
  }
}

// ─── Populate Modal Category Select ──────────────────────────────────────────

async function populateModalCategories(type = 'Expense') {
  const cats = await db.getCategoriesByType(type);
  const select = document.getElementById('txCategory');
  if (!select) return;
  const current = select.value;
  select.innerHTML = '<option value="">Select category...</option>';
  cats.sort((a, b) => a.name.localeCompare(b.name))
      .forEach(c => {
        const opt = document.createElement('option');
        opt.value = c.name;
        opt.textContent = c.name;
        select.appendChild(opt);
      });
  if (current) select.value = current;
}

// ─── Filtering & Sorting ──────────────────────────────────────────────────────

function applyFilters() {
  const search  = document.getElementById('searchInput')?.value.toLowerCase().trim() || '';
  const dateFrom = document.getElementById('filterDateFrom')?.value || '';
  const dateTo   = document.getElementById('filterDateTo')?.value   || '';
  const type     = document.getElementById('filterType')?.value     || '';
  const category = document.getElementById('filterCategory')?.value || '';
  const method   = document.getElementById('filterPaymentMethod')?.value || '';
  const month    = document.getElementById('filterMonth')?.value    || '';
  const year     = document.getElementById('filterYear')?.value     || '';
  const sortBy   = document.getElementById('sortBy')?.value         || 'date-desc';

  state.filtered = state.all.filter(tx => {
    if (dateFrom && tx.date < dateFrom) return false;
    if (dateTo   && tx.date > dateTo)   return false;
    if (type     && tx.type !== type)   return false;
    if (category && tx.category !== category) return false;
    if (method   && tx.paymentMethod !== method) return false;
    if (month    && tx.date.substring(5, 7) !== String(month).padStart(2, '0')) return false;
    if (year     && tx.date.substring(0, 4) !== year) return false;
    if (search) {
      const hay = `${tx.note||''} ${tx.category} ${tx.amount} ${tx.date} ${tx.paymentMethod||''}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  // Sort
  state.filtered.sort((a, b) => {
    switch (sortBy) {
      case 'date-asc':    return a.date.localeCompare(b.date);
      case 'amount-desc': return b.amount - a.amount;
      case 'amount-asc':  return a.amount - b.amount;
      default:            return b.date.localeCompare(a.date);
    }
  });

  state.page = 1;
  state.selectedIds.clear();
  renderTable();
}

// ─── Render Table ─────────────────────────────────────────────────────────────

function renderTable() {
  const tbody    = document.getElementById('transactionsBody');
  const countEl  = document.getElementById('resultsCount');
  const infoEl   = document.getElementById('paginationInfo');
  const incomeEl = document.getElementById('filteredIncome');
  const expenseEl= document.getElementById('filteredExpense');

  if (!tbody) return;

  state.pageSize = parseInt(document.getElementById('pageSize')?.value || 25);
  const totalPages = Math.ceil(state.filtered.length / state.pageSize) || 1;
  if (state.page > totalPages) state.page = totalPages;

  const start = (state.page - 1) * state.pageSize;
  const end   = start + state.pageSize;
  const page  = state.filtered.slice(start, end);

  // Summary
  const totalIncome  = sumByType(state.filtered, 'Income');
  const totalExpense = sumByType(state.filtered, 'Expense');
  if (countEl)   countEl.textContent = `Showing ${page.length} of ${state.filtered.length} transactions`;
  if (incomeEl)  incomeEl.textContent  = formatCurrency(totalIncome);
  if (expenseEl) expenseEl.textContent = formatCurrency(totalExpense);
  if (infoEl)    infoEl.textContent = `Page ${state.page} of ${totalPages}`;

  // Render rows
  if (page.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8">${emptyState('bi-inbox', 'No transactions found', 'Try adjusting your filters.')}</td></tr>`;
  } else {
    tbody.innerHTML = page.map(tx => renderRow(tx)).join('');
  }

  // Checkbox sync
  document.getElementById('selectAllChk').checked = false;
  updateBulkDeleteBtn();

  // Pagination
  renderPagination('paginationControls', state.page, totalPages, (p) => {
    state.page = p;
    renderTable();
  });
}

function renderRow(tx) {
  const checked = state.selectedIds.has(tx.id) ? 'checked' : '';
  const amtHtml = amountDisplay(tx.amount, tx.type, formatCurrency);
  const dateStr = formatDate(tx.date);

  return `
    <tr class="fade-in" data-id="${tx.id}">
      <td class="ps-3 hide-mobile">
        <input type="checkbox" class="form-check-input row-chk" data-id="${tx.id}" ${checked} />
      </td>
      <td class="text-nowrap">${dateStr}</td>
      <td class="hide-mobile">${typeBadge(tx.type)}</td>
      <td>
        <span class="category-badge">
          <i class="bi ${getCategoryIcon(tx.category)}"></i>
          ${tx.category}
        </span>
      </td>
      <td class="text-truncate hide-mobile" style="max-width:160px" title="${tx.note || ''}">${tx.note || '—'}</td>
      <td class="hide-mobile">${methodBadge(tx.paymentMethod)}</td>
      <td class="text-end fw-semibold">${amtHtml}</td>
      <td class="text-end pe-3">
        <div class="d-flex gap-1 justify-content-end row-actions">
          <button class="btn btn-sm btn-outline-secondary btn-icon dup-btn" data-id="${tx.id}" title="Duplicate">
            <i class="bi bi-copy"></i>
          </button>
          <button class="btn btn-sm btn-outline-primary btn-icon edit-btn" data-id="${tx.id}" title="Edit">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger btn-icon del-btn" data-id="${tx.id}" title="Delete">
            <i class="bi bi-trash3"></i>
          </button>
        </div>
      </td>
    </tr>`;
}

// ─── Category Icons Cache ─────────────────────────────────────────────────────

let _iconCache = {};
async function buildIconCache() {
  const cats = await db.getAllCategories();
  _iconCache = cats.reduce((acc, c) => ({ ...acc, [c.name]: c.icon || 'bi-tag' }), {});
}
function getCategoryIcon(name) {
  return _iconCache[name] || 'bi-tag';
}

// ─── Form Handlers ────────────────────────────────────────────────────────────

function setupFormHandlers() {
  const modal   = document.getElementById('transactionModal');
  const form    = document.getElementById('transactionForm');
  const saveBtn = document.getElementById('saveTransactionBtn');
  const dateInput = document.getElementById('txDate');

  if (dateInput) dateInput.value = todayInputDate();

  // Type radio changes category list
  document.querySelectorAll('[name="txType"]').forEach(radio => {
    radio.addEventListener('change', () => populateModalCategories(radio.value));
  });

  // Reset form when modal opens for new tx
  modal?.addEventListener('show.bs.modal', (e) => {
    if (!state.editingId) {
      resetForm();
    }
  });

  modal?.addEventListener('hidden.bs.modal', () => {
    state.editingId = null;
    resetForm();
  });

  saveBtn?.addEventListener('click', saveTransaction);
  form?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') saveTransaction();
  });
}

function resetForm() {
  const form = document.getElementById('transactionForm');
  if (!form) return;
  form.classList.remove('was-validated');
  form.reset();
  document.getElementById('txId').value = '';
  document.getElementById('txDate').value = todayInputDate();
  document.getElementById('transactionModalLabel').textContent = 'Add Transaction';
  document.getElementById('typeExpense').checked = true;
  populateModalCategories('Expense');
}

async function saveTransaction() {
  const form = document.getElementById('transactionForm');
  if (!form) return;

  const type   = document.querySelector('[name="txType"]:checked')?.value || 'Expense';
  const amount = document.getElementById('txAmount')?.value;
  const date   = document.getElementById('txDate')?.value;
  const category = document.getElementById('txCategory')?.value;
  const paymentMethod = document.getElementById('txPaymentMethod')?.value || 'Cash';
  const note   = document.getElementById('txNote')?.value?.trim() || '';
  const txId   = document.getElementById('txId')?.value;

  const { valid } = validateTransaction({ type, amount, date, category });
  form.classList.add('was-validated');
  if (!valid) return;

  const txData = { type, amount: parseFloat(amount), date, category, paymentMethod, note };

  try {
    if (txId) {
      await db.updateTransaction({ ...txData, id: parseInt(txId) });
      showToast('Transaction updated successfully', 'success');
    } else {
      await db.addTransaction(txData);
      showToast('Transaction added successfully', 'success');
    }

    const modalEl = document.getElementById('transactionModal');
    bootstrap.Modal.getInstance(modalEl)?.hide();

    await loadTransactions();
    populateFilterYearsMonths();
    applyFilters();
    window.dispatchEvent(new CustomEvent('transactionsChanged'));
  } catch (err) {
    showToast('Failed to save transaction', 'error');
    console.error(err);
  }
}

// ─── Table Handlers ───────────────────────────────────────────────────────────

function setupTableHandlers() {
  const tbody = document.getElementById('transactionsBody');
  if (!tbody) return;

  tbody.addEventListener('click', async (e) => {
    const btn = e.target.closest('button[data-id]');
    if (!btn) return;
    const id = parseInt(btn.dataset.id);

    if (btn.classList.contains('edit-btn'))  await editTransaction(id);
    if (btn.classList.contains('del-btn'))   await deleteTransaction(id);
    if (btn.classList.contains('dup-btn'))   await duplicateTransaction(id);
  });

  // Row checkboxes
  tbody.addEventListener('change', (e) => {
    if (e.target.classList.contains('row-chk')) {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      updateBulkDeleteBtn();
      syncSelectAll();
    }
  });

  // Select All
  document.getElementById('selectAllChk')?.addEventListener('change', (e) => {
    const checked = e.target.checked;
    document.querySelectorAll('.row-chk').forEach(chk => {
      chk.checked = checked;
      const id = parseInt(chk.dataset.id);
      if (checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
    });
    updateBulkDeleteBtn();
  });

  // Bulk delete
  document.getElementById('bulkDeleteBtn')?.addEventListener('click', bulkDelete);
}

function syncSelectAll() {
  const all = document.querySelectorAll('.row-chk');
  const checked = document.querySelectorAll('.row-chk:checked');
  const selectAll = document.getElementById('selectAllChk');
  if (selectAll) selectAll.checked = all.length > 0 && all.length === checked.length;
}

function updateBulkDeleteBtn() {
  const btn      = document.getElementById('bulkDeleteBtn');
  const countEl  = document.getElementById('bulkDeleteCount');
  if (!btn) return;
  const hasItems = state.selectedIds.size > 0;
  btn.classList.toggle('d-none', !hasItems);
  if (countEl) countEl.textContent = state.selectedIds.size;
}

async function editTransaction(id) {
  const tx = await db.getTransaction(id);
  if (!tx) return;

  state.editingId = id;
  document.getElementById('txId').value     = tx.id;
  document.getElementById('txAmount').value = tx.amount;
  document.getElementById('txDate').value   = tx.date;
  document.getElementById('txNote').value   = tx.note || '';

  // Set type radio
  const typeRadio = document.querySelector(`[name="txType"][value="${tx.type}"]`);
  if (typeRadio) typeRadio.checked = true;
  await populateModalCategories(tx.type);
  document.getElementById('txCategory').value = tx.category;
  document.getElementById('txPaymentMethod').value = tx.paymentMethod || 'Cash';
  document.getElementById('transactionModalLabel').textContent = 'Edit Transaction';

  const modalEl = document.getElementById('transactionModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function deleteTransaction(id) {
  const confirmed = await confirmDialog('Delete Transaction?', 'This action cannot be undone.');
  if (!confirmed) return;

  try {
    await db.deleteTransaction(id);
    showToast('Transaction deleted', 'success');
    await loadTransactions();
    applyFilters();
    window.dispatchEvent(new CustomEvent('transactionsChanged'));
  } catch (err) {
    showToast('Failed to delete transaction', 'error');
  }
}

async function duplicateTransaction(id) {
  const tx = await db.getTransaction(id);
  if (!tx) return;
  const { id: _id, createdAt, updatedAt, ...data } = tx;
  data.date = todayInputDate();
  await db.addTransaction(data);
  showToast('Transaction duplicated', 'success');
  await loadTransactions();
  applyFilters();
  window.dispatchEvent(new CustomEvent('transactionsChanged'));
}

async function bulkDelete() {
  if (state.selectedIds.size === 0) return;
  const confirmed = await confirmDialog(
    `Delete ${state.selectedIds.size} Transactions?`,
    'This action cannot be undone.'
  );
  if (!confirmed) return;

  try {
    await db.bulkDeleteTransactions([...state.selectedIds]);
    state.selectedIds.clear();
    showToast(`${state.selectedIds.size || 'Selected'} transactions deleted`, 'success');
    await loadTransactions();
    applyFilters();
    window.dispatchEvent(new CustomEvent('transactionsChanged'));
  } catch (err) {
    showToast('Failed to delete transactions', 'error');
  }
}

// ─── Filter Handlers ──────────────────────────────────────────────────────────

function setupFilterHandlers() {
  document.getElementById('applyFiltersBtn')?.addEventListener('click', applyFilters);
  document.getElementById('clearFiltersBtn')?.addEventListener('click', clearFilters);
  document.getElementById('clearSearchBtn')?.addEventListener('click', () => {
    document.getElementById('searchInput').value = '';
    applyFilters();
  });

  // Live search (always-visible bar)
  document.getElementById('searchInput')?.addEventListener('input',
    debounce(applyFilters, 300)
  );

  document.getElementById('pageSize')?.addEventListener('change', () => {
    state.page = 1;
    renderTable();
  });

  document.getElementById('sortBy')?.addEventListener('change', applyFilters);

  // Quick-filter chips
  document.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.type !== undefined) {
        // Type chips: All / Income / Expense
        document.querySelectorAll('.chip-btn[data-type]').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const typeEl = document.getElementById('filterType');
        if (typeEl) typeEl.value = btn.dataset.type;
      } else if (btn.dataset.period) {
        // Period chips: This Month / Last Month
        document.querySelectorAll('.chip-btn[data-period]').forEach(b => b.classList.remove('active'));
        btn.classList.toggle('active');
        const now = new Date();
        const y = now.getFullYear();
        const m = now.getMonth() + 1;
        const fromEl = document.getElementById('filterDateFrom');
        const toEl   = document.getElementById('filterDateTo');
        if (btn.classList.contains('active')) {
          if (btn.dataset.period === 'thisMonth') {
            if (fromEl) fromEl.value = `${y}-${String(m).padStart(2,'0')}-01`;
            if (toEl)   toEl.value   = `${y}-${String(m).padStart(2,'0')}-31`;
          } else {
            const lm = m === 1 ? 12 : m - 1;
            const ly = m === 1 ? y - 1 : y;
            if (fromEl) fromEl.value = `${ly}-${String(lm).padStart(2,'0')}-01`;
            if (toEl)   toEl.value   = `${ly}-${String(lm).padStart(2,'0')}-31`;
          }
        } else {
          if (fromEl) fromEl.value = '';
          if (toEl)   toEl.value   = '';
        }
      }
      applyFilters();
    });
  });
}

function clearFilters() {
  document.getElementById('searchInput').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value   = '';
  document.getElementById('filterType').value     = '';
  document.getElementById('filterCategory').value = '';
  document.getElementById('filterPaymentMethod').value = '';
  document.getElementById('filterMonth').value    = '';
  document.getElementById('filterYear').value     = '';
  applyFilters();
}

// ─── Import / Export ──────────────────────────────────────────────────────────

function setupImportExport() {
  // Export (desktop + mobile variants)
  ['exportPDFBtn','exportPDFBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', exportPDF));
  ['exportExcelBtn','exportExcelBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', exportExcel));
  ['exportCSVBtn','exportCSVBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', exportCSVData));
  ['exportJSONBtn','exportJSONBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', exportJSONData));

  // Import triggers (desktop + mobile variants)
  ['importJSONBtn','importJSONBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', () => triggerImport('json')));
  ['importExcelBtn','importExcelBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', () => triggerImport('excel')));
  ['importCSVBtn','importCSVBtnM'].forEach(id =>
    document.getElementById(id)?.addEventListener('click', () => triggerImport('csv')));

  // File input
  const fileInput = document.getElementById('importFileInput');
  fileInput?.addEventListener('change', handleFileSelected);

  // Import modal buttons
  document.getElementById('importMergeBtn')?.addEventListener('click', () => processImport('merge'));
  document.getElementById('importReplaceBtn')?.addEventListener('click', () => processImport('replace'));
}

function transactionsToRows(txs) {
  const headers = ['ID','Date','Type','Category','Amount','Payment Method','Note'];
  const rows = txs.map(tx => [
    tx.id, tx.date, tx.type, tx.category, tx.amount, tx.paymentMethod||'Cash', tx.note||''
  ]);
  return [headers, ...rows];
}

function exportCSVData() {
  const rows = transactionsToRows(state.filtered);
  downloadCSV(rows, `transactions_${new Date().toISOString().slice(0,10)}.csv`);
  showToast('CSV exported', 'success');
}

function exportJSONData() {
  downloadJSON(state.filtered, `transactions_${new Date().toISOString().slice(0,10)}.json`);
  showToast('JSON exported', 'success');
}

function exportExcel() {
  if (!window.XLSX) { showToast('SheetJS not loaded', 'error'); return; }
  const rows = transactionsToRows(state.filtered);
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
  XLSX.writeFile(wb, `transactions_${new Date().toISOString().slice(0,10)}.xlsx`);
  showToast('Excel exported', 'success');
}

function exportPDF() {
  if (!window.jspdf) { showToast('jsPDF not loaded', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'landscape' });

  doc.setFontSize(16);
  doc.text('Transaction Report', 14, 15);
  doc.setFontSize(10);
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, 14, 22);

  const head = [['Date','Type','Category','Note','Method','Amount']];
  const body = state.filtered.map(tx => [
    tx.date, tx.type, tx.category, tx.note||'',
    tx.paymentMethod||'Cash', formatCurrency(tx.amount)
  ]);

  if (doc.autoTable) {
    doc.autoTable({
      head, body, startY: 28,
      styles: { fontSize: 8 },
      headStyles: { fillColor: [13, 110, 253] },
    });
  }

  doc.save(`transactions_${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('PDF exported', 'success');
}

function triggerImport(type) {
  state.importFileType = type;
  const input = document.getElementById('importFileInput');
  const accept = type === 'json' ? '.json' : type === 'csv' ? '.csv' : '.xlsx,.xls';
  input.accept = accept;
  input.value = '';
  input.click();
}

async function handleFileSelected(e) {
  const file = e.target.files[0];
  if (!file) return;

  try {
    if (state.importFileType === 'json') {
      const text = await file.text();
      state.importData = JSON.parse(text);
    } else if (state.importFileType === 'csv') {
      const text = await file.text();
      state.importData = parseCSVToTransactions(text);
    } else {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
      state.importData = parseRowsToTransactions(rows);
    }

    if (!Array.isArray(state.importData) || state.importData.length === 0) {
      showToast('No valid transactions found in file', 'warning');
      return;
    }

    const modalEl = document.getElementById('importModal');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  } catch (err) {
    showToast('Failed to read file: ' + err.message, 'error');
  }
}

function parseCSVToTransactions(text) {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.replace(/"/g,'').trim().toLowerCase());
  return lines.slice(1).map(line => {
    const vals = line.split(',').map(v => v.replace(/"/g,'').trim());
    const row = {};
    headers.forEach((h, i) => row[h] = vals[i]);
    return {
      date: row.date || '',
      type: row.type || 'Expense',
      category: row.category || 'Others',
      amount: parseFloat(row.amount) || 0,
      paymentMethod: row['payment method'] || row.paymentmethod || 'Cash',
      note: row.note || '',
    };
  }).filter(tx => tx.date && tx.amount > 0);
}

function parseRowsToTransactions(rows) {
  if (rows.length < 2) return [];
  const headers = rows[0].map(h => String(h).toLowerCase().trim());
  return rows.slice(1).map(row => {
    const obj = {};
    headers.forEach((h, i) => obj[h] = row[i]);
    return {
      date: String(obj.date || '').substring(0, 10),
      type: obj.type || 'Expense',
      category: obj.category || 'Others',
      amount: parseFloat(obj.amount) || 0,
      paymentMethod: obj['payment method'] || obj.paymentmethod || 'Cash',
      note: obj.note || '',
    };
  }).filter(tx => tx.date && tx.amount > 0);
}

async function processImport(mode) {
  const modalEl = document.getElementById('importModal');
  bootstrap.Modal.getInstance(modalEl)?.hide();

  if (!state.importData?.length) return;

  showLoading();
  try {
    if (mode === 'replace') {
      await db.clearAllTransactions();
    }
    await db.bulkAddTransactions(state.importData);
    showToast(`${state.importData.length} transactions imported successfully`, 'success');
    await loadTransactions();
    populateFilterYearsMonths();
    applyFilters();
    window.dispatchEvent(new CustomEvent('transactionsChanged'));
  } catch (err) {
    showToast('Import failed: ' + err.message, 'error');
  } finally {
    hideLoading();
    state.importData = null;
  }
}

// ─── Wait for app ready ────────────────────────────────────────────────────────

window.addEventListener('appReady', async () => {
  await buildIconCache();
  await init();
});
