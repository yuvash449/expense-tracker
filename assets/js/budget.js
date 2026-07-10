/**
 * budget.js – Budget planner page: CRUD for budgets, spending tracking,
 *             progress bars, and over-budget alerts.
 */

import db from './db.js';
import { formatCurrency, sumByType, getMonthName } from './utils.js';
import { showToast, confirmDialog } from './ui.js';

// ─── State ────────────────────────────────────────────────────────────────────

const state = {
  month: new Date().getMonth() + 1,
  year:  new Date().getFullYear(),
};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  populateYearSelects();
  setCurrentMonthYear();
  await populateBudgetCategorySelect();
  setupHandlers();
  await renderBudgets();
}

function populateYearSelects() {
  const year = new Date().getFullYear();
  const years = [year - 1, year, year + 1];
  ['budgetYearSelect', 'budgetFormYear'].forEach(id => {
    const sel = document.getElementById(id);
    if (!sel) return;
    sel.innerHTML = years.map(y => `<option value="${y}" ${y===year?'selected':''}>${y}</option>`).join('');
  });
}

function setCurrentMonthYear() {
  const monthSel = document.getElementById('budgetMonthSelect');
  const yearSel  = document.getElementById('budgetYearSelect');
  if (monthSel) monthSel.value = state.month;
  if (yearSel)  yearSel.value  = state.year;

  // Also set form defaults
  const formMonth = document.getElementById('budgetFormMonth');
  const formYear  = document.getElementById('budgetFormYear');
  if (formMonth) formMonth.value = state.month;
  if (formYear)  formYear.value  = state.year;

  updatePeriodLabel();
}

function updatePeriodLabel() {
  const el = document.getElementById('budgetPeriodLabel');
  if (el) el.textContent = `${getMonthName(state.month)} ${state.year}`;
}

async function populateBudgetCategorySelect() {
  const cats = await db.getCategoriesByType('Expense');
  const sel = document.getElementById('budgetCategory');
  if (!sel) return;
  sel.innerHTML = '<option value="">Select expense category...</option>';
  cats.sort((a,b)=>a.name.localeCompare(b.name)).forEach(c => {
    sel.insertAdjacentHTML('beforeend', `<option value="${c.name}">${c.name}</option>`);
  });
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

function setupHandlers() {
  document.getElementById('budgetMonthSelect')?.addEventListener('change', async (e) => {
    state.month = parseInt(e.target.value);
    updatePeriodLabel();
    await renderBudgets();
  });

  document.getElementById('budgetYearSelect')?.addEventListener('change', async (e) => {
    state.year = parseInt(e.target.value);
    updatePeriodLabel();
    await renderBudgets();
  });

  document.getElementById('saveBudgetBtn')?.addEventListener('click', saveBudget);

  document.getElementById('budgetModal')?.addEventListener('hidden.bs.modal', resetBudgetForm);
}

function resetBudgetForm() {
  document.getElementById('budgetForm')?.reset();
  document.getElementById('budgetId').value = '';
  document.getElementById('budgetModalLabel').textContent = 'Set Budget';
  document.getElementById('budgetFormMonth').value = state.month;
  document.getElementById('budgetFormYear').value  = state.year;
}

// ─── Save Budget ──────────────────────────────────────────────────────────────

async function saveBudget() {
  const form     = document.getElementById('budgetForm');
  const category = document.getElementById('budgetCategory')?.value;
  const amount   = parseFloat(document.getElementById('budgetAmount')?.value);
  const month    = parseInt(document.getElementById('budgetFormMonth')?.value);
  const year     = parseInt(document.getElementById('budgetFormYear')?.value);
  const idVal    = document.getElementById('budgetId')?.value;

  if (!category || !amount || amount <= 0 || !month || !year) {
    form.classList.add('was-validated');
    return;
  }

  try {
    // Check for existing budget for same category/month/year
    const existing = await db.getBudgetByCategoryMonthYear(category, month, year);

    if (idVal) {
      await db.updateBudget({ id: parseInt(idVal), category, amount, month, year });
      showToast('Budget updated', 'success');
    } else if (existing) {
      // Update existing
      await db.updateBudget({ ...existing, amount });
      showToast('Budget updated', 'success');
    } else {
      await db.addBudget({ category, amount, month, year });
      showToast('Budget added', 'success');
    }

    const modalEl = document.getElementById('budgetModal');
    bootstrap.Modal.getInstance(modalEl)?.hide();
    await renderBudgets();
  } catch (err) {
    showToast('Failed to save budget: ' + err.message, 'error');
  }
}

// ─── Render Budgets ───────────────────────────────────────────────────────────

async function renderBudgets() {
  const budgets = await db.getBudgetsByMonthYear(state.month, state.year);
  const txs     = await db.getTransactionsByMonth(state.year, state.month);
  const expenses = txs.filter(t => t.type === 'Expense');

  // Calculate spending per category
  const spentMap = expenses.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});

  const container = document.getElementById('budgetCardsContainer');
  const emptyEl   = document.getElementById('budgetEmptyState');
  if (!container) return;

  if (!budgets.length) {
    container.innerHTML = '';
    if (emptyEl) {
      emptyEl.style.display = 'block';
      container.appendChild(emptyEl);
    }
    updateOverallStats(budgets, spentMap);
    return;
  }

  if (emptyEl) emptyEl.style.display = 'none';

  // Check over-budget alerts
  budgets.forEach(budget => {
    const spent = spentMap[budget.category] || 0;
    if (spent > budget.amount) {
      showBudgetAlert(budget.category, spent, budget.amount);
    }
  });

  container.innerHTML = budgets.map(budget => {
    const spent     = spentMap[budget.category] || 0;
    const remaining = budget.amount - spent;
    const pct       = budget.amount > 0 ? Math.min(Math.round((spent / budget.amount) * 100), 100) : 0;
    const overBudget = spent > budget.amount;
    const barCls    = pct >= 100 ? 'bg-danger' : pct >= 80 ? 'bg-warning' : 'bg-success';

    return `
      <div class="col-12 col-md-6 col-xl-4">
        <div class="card border-0 shadow-sm budget-card h-100 ${overBudget?'border border-danger budget-alert':''}">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h6 class="fw-semibold mb-0">${budget.category}</h6>
                <small class="text-muted">Budget: ${formatCurrency(budget.amount)}</small>
              </div>
              <div class="d-flex gap-1">
                ${overBudget ? '<span class="badge bg-danger-subtle text-danger"><i class="bi bi-exclamation-triangle me-1"></i>Over</span>' : ''}
                <button class="btn btn-sm btn-outline-primary btn-icon edit-budget-btn" data-id="${budget.id}" title="Edit">
                  <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-sm btn-outline-danger btn-icon del-budget-btn" data-id="${budget.id}" title="Delete">
                  <i class="bi bi-trash3"></i>
                </button>
              </div>
            </div>

            <div class="mb-2">
              <div class="d-flex justify-content-between small mb-1">
                <span>Spent: <strong class="${overBudget?'text-danger':'text-body'}">${formatCurrency(spent)}</strong></span>
                <span>${pct}%</span>
              </div>
              <div class="progress budget-progress-bar" style="height:8px">
                <div class="progress-bar ${barCls}" role="progressbar"
                     style="width:${pct}%" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"></div>
              </div>
            </div>

            <div class="d-flex justify-content-between small">
              <span class="text-muted">Remaining</span>
              <span class="fw-semibold ${remaining>=0?'text-success':'text-danger'}">${formatCurrency(remaining)}</span>
            </div>
          </div>
        </div>
      </div>`;
  }).join('');

  // Delegate edit/delete
  container.querySelectorAll('.edit-budget-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditBudgetModal(parseInt(btn.dataset.id), budgets));
  });
  container.querySelectorAll('.del-budget-btn').forEach(btn => {
    btn.addEventListener('click', () => deleteBudget(parseInt(btn.dataset.id)));
  });

  updateOverallStats(budgets, spentMap);
}

function updateOverallStats(budgets, spentMap) {
  const totalBudget = budgets.reduce((s,b)=>s+b.amount, 0);
  const totalSpent  = budgets.reduce((s,b)=>s+(spentMap[b.category]||0), 0);
  const totalRem    = totalBudget - totalSpent;
  const pct         = totalBudget > 0 ? Math.min(Math.round((totalSpent/totalBudget)*100), 100) : 0;

  const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  setText('budgetTotal',     formatCurrency(totalBudget));
  setText('budgetSpent',     formatCurrency(totalSpent));
  setText('budgetRemaining', formatCurrency(totalRem));
  setText('budgetUsage',     `${pct}%`);
  setText('budgetOverallPct', `${pct}%`);

  const bar = document.getElementById('budgetOverallBar');
  if (bar) {
    bar.style.width = `${pct}%`;
    bar.className = `progress-bar ${pct>=100?'bg-danger':pct>=80?'bg-warning':'bg-success'}`;
  }
}

let _shownAlerts = new Set();
function showBudgetAlert(category, spent, budget) {
  const key = `${category}-${state.month}-${state.year}`;
  if (_shownAlerts.has(key)) return;
  _shownAlerts.add(key);
  showToast(
    `Budget exceeded for <strong>${category}</strong>! Spent ${formatCurrency(spent)} of ${formatCurrency(budget)}`,
    'warning',
    5000
  );
}

async function openEditBudgetModal(id, budgets) {
  const budget = budgets.find(b => b.id === id);
  if (!budget) return;

  document.getElementById('budgetId').value     = budget.id;
  document.getElementById('budgetCategory').value = budget.category;
  document.getElementById('budgetAmount').value = budget.amount;
  document.getElementById('budgetFormMonth').value = budget.month;
  document.getElementById('budgetFormYear').value  = budget.year;
  document.getElementById('budgetModalLabel').textContent = 'Edit Budget';

  const modalEl = document.getElementById('budgetModal');
  bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

async function deleteBudget(id) {
  const confirmed = await confirmDialog('Delete Budget?', 'This will remove the budget for this category.');
  if (!confirmed) return;
  try {
    await db.deleteBudget(id);
    showToast('Budget deleted', 'success');
    await renderBudgets();
  } catch {
    showToast('Failed to delete budget', 'error');
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────

window.addEventListener('appReady', init);
