/**
 * dashboard.js – Dashboard stats, recent transactions, and chart data prep.
 */

import db from './db.js';
import {
  formatCurrency, formatDate, formatPercent, sumByType,
  groupByCategory, groupByMonth, getLastNMonths,
  getShortMonthName, getChartColor, setText
} from './utils.js';
import { emptyState, methodBadge, amountDisplay } from './ui.js';
import { initTransactionForm } from './transaction-form.js';

// ─── Chart instances ──────────────────────────────────────────────────────────
let charts = {};

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  setDashboardDate();
  await initTransactionForm();
  await refresh();

  document.getElementById('dashboardPeriod')?.addEventListener('change', refresh);
  window.addEventListener('transactionsChanged', refresh);
}

function setDashboardDate() {
  const el = document.getElementById('dashboardDate');
  if (el) {
    el.textContent = new Date().toLocaleDateString('en-IN', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    });
  }
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

async function refresh() {
  const period = document.getElementById('dashboardPeriod')?.value || 'thisMonth';
  const all = await db.getAllTransactions();

  const now = new Date();
  const thisYear  = now.getFullYear();
  const thisMonth = now.getMonth() + 1;

  let filtered;
  switch (period) {
    case 'lastMonth': {
      const lm = thisMonth === 1 ? 12 : thisMonth - 1;
      const ly = thisMonth === 1 ? thisYear - 1 : thisYear;
      filtered = all.filter(tx => {
        const y = parseInt(tx.date.substring(0,4));
        const m = parseInt(tx.date.substring(5,7));
        return y === ly && m === lm;
      });
      break;
    }
    case 'thisYear':
      filtered = all.filter(tx => tx.date.startsWith(String(thisYear)));
      break;
    case 'all':
      filtered = all;
      break;
    default: // thisMonth
      filtered = all.filter(tx => {
        const y = parseInt(tx.date.substring(0,4));
        const m = parseInt(tx.date.substring(5,7));
        return y === thisYear && m === thisMonth;
      });
  }

  const monthFiltered = all.filter(tx => {
    const y = parseInt(tx.date.substring(0,4));
    const m = parseInt(tx.date.substring(5,7));
    return y === thisYear && m === thisMonth;
  });

  renderStats(filtered, monthFiltered, all);
  renderRecentTransactions(all.slice(0, 10));
  renderCharts(filtered, all);
  renderTopCategories(filtered);
}

// ─── Stats ────────────────────────────────────────────────────────────────────

function renderStats(filtered, monthly, all) {
  const totalIncome   = sumByType(filtered, 'Income');
  const totalExpense  = sumByType(filtered, 'Expense');
  const balance       = sumByType(all, 'Income') - sumByType(all, 'Expense');
  const savings       = totalIncome - totalExpense;
  const savingsRate   = totalIncome > 0 ? Math.round((savings / totalIncome) * 100) : 0;

  const monthIncome   = sumByType(monthly, 'Income');
  const monthExpense  = sumByType(monthly, 'Expense');

  // Calculate average daily expense (for current month)
  const daysInMonth = new Date().getDate();
  const avgDaily = daysInMonth > 0 ? monthExpense / daysInMonth : 0;

  setText('statBalance',  formatCurrency(balance));
  setText('statIncome',   formatCurrency(totalIncome));
  setText('statExpense',  formatCurrency(totalExpense));
  setText('statSavings',  formatCurrency(savings));

  setText('statBalanceSub',  `All time net balance`);
  setText('statIncomeSub',   `${filtered.filter(t=>t.type==='Income').length} income entries`);
  setText('statExpenseSub',  `${filtered.filter(t=>t.type==='Expense').length} expense entries`);
  setText('statSavingsSub',  `${savingsRate}% savings rate`);

  setText('statMonthlyIncome',  formatCurrency(monthIncome));
  setText('statMonthlyExpense', formatCurrency(monthExpense));
  setText('statAvgDaily',       formatCurrency(avgDaily));
  setText('statSavingsRate',    `${savingsRate}%`);
}

// ─── Recent Transactions ──────────────────────────────────────────────────────

function renderRecentTransactions(txs) {
  const tbody = document.getElementById('recentTransactionsBody');
  if (!tbody) return;

  if (!txs.length) {
    tbody.innerHTML = `<tr><td colspan="5">${emptyState('bi-inbox','No transactions yet','Add your first transaction to get started.')}</td></tr>`;
    return;
  }

  tbody.innerHTML = txs.map(tx => `
    <tr class="fade-in">
      <td class="ps-3 text-nowrap">${formatDate(tx.date)}</td>
      <td>
        <span class="category-badge">
          <i class="bi bi-tag"></i> ${tx.category}
        </span>
      </td>
      <td class="text-truncate" style="max-width:160px">${tx.note || '—'}</td>
      <td>${methodBadge(tx.paymentMethod)}</td>
      <td class="text-end pe-3">${amountDisplay(tx.amount, tx.type, formatCurrency)}</td>
    </tr>`).join('');
}

// ─── Charts ───────────────────────────────────────────────────────────────────

function renderCharts(filtered, all) {
  renderExpensePieChart(filtered);
  renderMonthlyBarChart(all);
  renderMonthTrendChart(all);
}

function renderExpensePieChart(txs) {
  const expenses = txs.filter(t => t.type === 'Expense');
  const grouped  = groupByCategory(expenses);
  const entries  = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 8);

  const labels = entries.map(([k]) => k);
  const data   = entries.map(([, v]) => v);
  const colors = labels.map((_, i) => getChartColor(i));

  const canvas = document.getElementById('chartExpenseCategory');
  if (!canvas) return;

  if (charts.pie) charts.pie.destroy();

  if (!data.length) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const isMobile = window.innerWidth < 768;
  charts.pie = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data, backgroundColor: colors, borderWidth: 2,
        borderColor: document.documentElement.getAttribute('data-bs-theme') === 'dark' ? '#212529' : '#fff'
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: true,
      plugins: {
        legend: {
          position: isMobile ? 'bottom' : 'right',
          labels: { boxWidth: 12, font: { size: 11 }, padding: isMobile ? 6 : 8 }
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)}`
          }
        }
      },
      cutout: '65%',
    }
  });
}

function renderMonthlyBarChart(all) {
  const months = getLastNMonths(6);
  const incomeData  = [];
  const expenseData = [];

  months.forEach(key => {
    const [y, m] = key.split('-');
    const txs = all.filter(tx => tx.date.substring(0,7) === key);
    incomeData.push(sumByType(txs, 'Income'));
    expenseData.push(sumByType(txs, 'Expense'));
  });

  const labels = months.map(k => {
    const [y, m] = k.split('-');
    return getShortMonthName(parseInt(m)) + ' ' + y.substring(2);
  });

  const canvas = document.getElementById('chartMonthlyOverview');
  if (!canvas) return;
  if (charts.bar) charts.bar.destroy();

  charts.bar = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Income',  data: incomeData,  backgroundColor: 'rgba(25,135,84,.75)',
          borderRadius: 4, borderSkipped: false },
        { label: 'Expense', data: expenseData, backgroundColor: 'rgba(220,53,69,.75)',
          borderRadius: 4, borderSkipped: false },
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: {
          font: { size: 11 },
          callback: v => formatCurrency(v).replace(/\.00$/, '')
        }}
      }
    }
  });
}

function renderMonthTrendChart(all) {
  const now = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const days  = new Date(year, month, 0).getDate();

  const daily = Array.from({ length: days }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    const dateKey = `${year}-${String(month).padStart(2,'0')}-${d}`;
    const txs = all.filter(tx => tx.date === dateKey && tx.type === 'Expense');
    return txs.reduce((s, t) => s + t.amount, 0);
  });

  const labels = Array.from({ length: days }, (_, i) => i + 1);

  const canvas = document.getElementById('chartMonthTrend');
  if (!canvas) return;
  if (charts.trend) charts.trend.destroy();

  charts.trend = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label: 'Daily Expense',
        data: daily,
        borderColor: 'rgb(13,110,253)',
        backgroundColor: 'rgba(13,110,253,.1)',
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 5,
      }]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 } } },
        y: { grid: { color: 'rgba(0,0,0,.05)' }, ticks: {
          font: { size: 10 },
          callback: v => formatCurrency(v).replace(/\.00$/, '')
        }}
      }
    }
  });
}

// ─── Top Categories ───────────────────────────────────────────────────────────

function renderTopCategories(txs) {
  const container = document.getElementById('topCategories');
  if (!container) return;

  const expenses = txs.filter(t => t.type === 'Expense');
  const grouped  = groupByCategory(expenses);
  const total    = Object.values(grouped).reduce((s, v) => s + v, 0);
  const top5     = Object.entries(grouped).sort((a, b) => b[1] - a[1]).slice(0, 5);

  if (!top5.length) {
    container.innerHTML = `<p class="text-muted text-center small py-3">No expense data available.</p>`;
    return;
  }

  container.innerHTML = top5.map(([cat, amt], i) => {
    const pct = total > 0 ? Math.round((amt / total) * 100) : 0;
    const color = getChartColor(i);
    return `
      <div class="top-category-item mb-2">
        <div class="label text-truncate" title="${cat}">
          <span class="badge rounded-pill me-1" style="background:${color};width:8px;height:8px;display:inline-block;vertical-align:middle;"></span>
          ${cat}
        </div>
        <div class="bar-wrap">
          <div class="progress" style="height:6px;border-radius:3px">
            <div class="progress-bar" style="width:${pct}%;background:${color};border-radius:3px"></div>
          </div>
        </div>
        <div class="amount small">${formatCurrency(amt)}</div>
      </div>`;
  }).join('');
}

// ─── Start ────────────────────────────────────────────────────────────────────

window.addEventListener('appReady', init);
