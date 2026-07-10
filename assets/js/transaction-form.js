/**
 * transaction-form.js – Shared Add/Edit transaction modal logic
 * Used on Dashboard and Transactions pages.
 */

import db from './db.js';
import { todayInputDate, validateTransaction } from './utils.js';
import { showToast } from './ui.js';

let editingId = null;
let initialized = false;

/** Set #txDate to today (updates both value and defaultValue for form.reset) */
function setTodayDate() {
  const txDate = document.getElementById('txDate');
  if (!txDate) return;
  const today = todayInputDate();
  txDate.defaultValue = today;
  txDate.value = today;
}

/** Populate category dropdown for the given type */
export async function populateModalCategories(type = 'Expense') {
  const select = document.getElementById('txCategory');
  if (!select) return;

  const cats = await db.getCategoriesByType(type);
  const current = select.value;

  select.innerHTML = '<option value="">Select category...</option>';
  cats
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.name;
      opt.textContent = c.name;
      select.appendChild(opt);
    });

  if (current && [...select.options].some(o => o.value === current)) {
    select.value = current;
  }
}

/** Reset the form to defaults for a new transaction */
export async function resetTransactionForm() {
  const form = document.getElementById('transactionForm');
  if (!form) return;

  form.classList.remove('was-validated');

  // Set date default BEFORE reset so form.reset() keeps today's date
  setTodayDate();
  form.reset();
  setTodayDate();

  const txId = document.getElementById('txId');
  const title = document.getElementById('transactionModalLabel');
  const typeExpense = document.getElementById('typeExpense');

  if (txId) txId.value = '';
  if (title) title.textContent = 'Add Transaction';
  if (typeExpense) typeExpense.checked = true;

  await populateModalCategories('Expense');
}

/** Open modal in edit mode */
export async function openEditTransaction(id) {
  const tx = await db.getTransaction(id);
  if (!tx) return;

  editingId = id;

  document.getElementById('txId').value = tx.id;
  document.getElementById('txAmount').value = tx.amount;
  document.getElementById('txDate').value = tx.date;
  document.getElementById('txNote').value = tx.note || '';

  const typeRadio = document.querySelector(`[name="txType"][value="${tx.type}"]`);
  if (typeRadio) typeRadio.checked = true;

  await populateModalCategories(tx.type);

  document.getElementById('txCategory').value = tx.category;
  document.getElementById('txPaymentMethod').value = tx.paymentMethod || 'Cash';
  document.getElementById('transactionModalLabel').textContent = 'Edit Transaction';

  const modalEl = document.getElementById('transactionModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

export function isEditingTransaction() {
  return editingId !== null;
}

/** Wire up modal events and save handler (safe to call once) */
export async function initTransactionForm({ onSaved } = {}) {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById('transactionModal');
  const form = document.getElementById('transactionForm');
  const saveBtn = document.getElementById('saveTransactionBtn');
  if (!modal || !form) return;

  // Type toggle refreshes categories
  document.querySelectorAll('[name="txType"]').forEach(radio => {
    radio.addEventListener('change', () => populateModalCategories(radio.value));
  });

  modal.addEventListener('show.bs.modal', async () => {
    if (!editingId) {
      await resetTransactionForm();
    }
  });

  // Fallback: ensure date is set after modal animation completes
  modal.addEventListener('shown.bs.modal', () => {
    if (!editingId) setTodayDate();
  });

  modal.addEventListener('hidden.bs.modal', async () => {
    editingId = null;
    await resetTransactionForm();
  });

  saveBtn?.addEventListener('click', () => saveTransaction(onSaved));
  form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTransaction(onSaved);
    }
  });

  // Pre-fill date & categories immediately
  await resetTransactionForm();
}

async function saveTransaction(onSaved) {
  const form = document.getElementById('transactionForm');
  if (!form) return;

  const type = document.querySelector('[name="txType"]:checked')?.value || 'Expense';
  const amount = document.getElementById('txAmount')?.value;
  const date = document.getElementById('txDate')?.value;
  const category = document.getElementById('txCategory')?.value;
  const paymentMethod = document.getElementById('txPaymentMethod')?.value || 'Cash';
  const note = document.getElementById('txNote')?.value?.trim() || '';
  const txId = document.getElementById('txId')?.value;

  const { valid } = validateTransaction({ type, amount, date, category });
  form.classList.add('was-validated');
  if (!valid) return;

  const txData = {
    type,
    amount: parseFloat(amount),
    date,
    category,
    paymentMethod,
    note,
  };

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

    window.dispatchEvent(new CustomEvent('transactionsChanged'));
    if (typeof onSaved === 'function') await onSaved();
  } catch (err) {
    showToast('Failed to save transaction', 'error');
    console.error(err);
  }
}
