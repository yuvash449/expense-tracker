/**
 * report.js – Reports page: monthly, yearly, category, payment method reports
 *              with charts and PDF export.
 */

import db from './db.js';
import {
  formatCurrency, formatDate, sumByType, groupByCategory,
  groupByMonth, groupByPaymentMethod, getShortMonthName,
  getMonthName, getChartColor, getYearsFromTransactions,
  setText
} from './utils.js';
import { showToast, showLoading, hideLoading } from './ui.js';
import {
  createDoughnutChart, createIncomeExpenseBarChart,
  createHorizontalBarChart, createMultiLineChart, destroyChart
} from './chart.js';

// ─── State ────────────────────────────────────────────────────────────────────

let allTransactions = [];
let currentTab = 'monthly';
let rptChart1 = null;
let rptChart2 = null;
let rptPaymentChart = null;

// ─── Init ─────────────────────────────────────────────────────────────────────

async function init() {
  allTransactions = await db.getAllTransactions();
  populateYearSelect();
  setupTabHandlers();
  setupGenerateBtn();
  setupExportPDF();
  generateReport();
}

function populateYearSelect() {
  const sel = document.getElementById('reportYear');
  if (!sel) return;
  const years = getYearsFromTransactions(allTransactions);
  if (!years.length) years.push(new Date().getFullYear());
  sel.innerHTML = years.map(y => `<option value="${y}">${y}</option>`).join('');
  sel.value = years[0];
}

function setupTabHandlers() {
  document.querySelectorAll('#reportTabs button[data-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#reportTabs .nav-link').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTab = btn.dataset.tab;
      generateReport();
    });
  });
}

function setupGenerateBtn() {
  document.getElementById('generateReportBtn')?.addEventListener('click', async () => {
    allTransactions = await db.getAllTransactions();
    generateReport();
  });
}

function setupExportPDF() {
  document.getElementById('exportReportPDFBtn')?.addEventListener('click', exportReportPDF);
}

// ─── Generate Report ──────────────────────────────────────────────────────────

function generateReport() {
  const year  = parseInt(document.getElementById('reportYear')?.value) || new Date().getFullYear();
  const month = parseInt(document.getElementById('reportMonth')?.value) || 0;

  let filtered;
  if (month) {
    filtered = allTransactions.filter(tx => {
      const y = parseInt(tx.date.substring(0,4));
      const m = parseInt(tx.date.substring(5,7));
      return y === year && m === month;
    });
  } else {
    filtered = allTransactions.filter(tx => tx.date.startsWith(String(year)));
  }

  renderSummaryStats(filtered);
  renderInsightCards(filtered);

  switch (currentTab) {
    case 'monthly':   renderMonthlyReport(filtered, year);   break;
    case 'yearly':    renderYearlyReport(year);              break;
    case 'category':  renderCategoryReport(filtered);        break;
    case 'payment':   renderPaymentReport(filtered);         break;
  }
}

// ─── Summary Stats ────────────────────────────────────────────────────────────

function renderSummaryStats(txs) {
  const income  = sumByType(txs, 'Income');
  const expense = sumByType(txs, 'Expense');
  const savings = income - expense;
  const savingsRate = income > 0 ? Math.round((savings / income) * 100) : 0;

  setText('rptTotalIncome',  formatCurrency(income));
  setText('rptTotalExpense', formatCurrency(expense));
  setText('rptNetSavings',   formatCurrency(savings));
  setText('rptSavingsRate',  `${savingsRate}%`);
}

function renderInsightCards(txs) {
  const expenses = txs.filter(t => t.type === 'Expense');
  const incomes  = txs.filter(t => t.type === 'Income');

  const maxExp = expenses.reduce((max, t) => t.amount > (max?.amount||0) ? t : max, null);
  const maxInc = incomes.reduce((max, t) => t.amount > (max?.amount||0) ? t : max, null);

  const grouped = groupByMonth(txs);
  const monthlyExpenses = Object.values(grouped).map(m => m.expense);
  const avgMonthly = monthlyExpenses.length
    ? monthlyExpenses.reduce((s, v) => s + v, 0) / monthlyExpenses.length
    : 0;

  const expEl = document.getElementById('rptLargestExpense');
  const incEl = document.getElementById('rptLargestIncome');
  const avgEl = document.getElementById('rptAvgMonthlyExpense');

  if (expEl) expEl.innerHTML = maxExp
    ? `<strong>${formatCurrency(maxExp.amount)}</strong><br/>${maxExp.category} · ${formatDate(maxExp.date)}<br/>${maxExp.note||''}`
    : 'No expenses in period';

  if (incEl) incEl.innerHTML = maxInc
    ? `<strong>${formatCurrency(maxInc.amount)}</strong><br/>${maxInc.category} · ${formatDate(maxInc.date)}<br/>${maxInc.note||''}`
    : 'No income in period';

  if (avgEl) avgEl.innerHTML = `<strong>${formatCurrency(avgMonthly)}</strong><br/>Average per month`;
}

// ─── Monthly Report ───────────────────────────────────────────────────────────

function renderMonthlyReport(txs, year) {
  // Chart 1: Expense by category (pie)
  const expenses = txs.filter(t => t.type === 'Expense');
  const catGrouped = groupByCategory(expenses);
  const catEntries = Object.entries(catGrouped).sort((a,b)=>b[1]-a[1]).slice(0,8);

  rptChart1 = destroyChart(rptChart1);
  const c1 = document.getElementById('rptChart1');
  if (c1 && catEntries.length) {
    document.getElementById('rptChart1Title').textContent = 'Expense by Category';
    rptChart1 = createDoughnutChart(c1, catEntries.map(([k])=>k), catEntries.map(([,v])=>v));
  }

  // Chart 2: Monthly income vs expense bar
  const months = Array.from({length:12}, (_,i) => `${year}-${String(i+1).padStart(2,'0')}`);
  const incomeData  = months.map(k => sumByType(txs.filter(tx=>tx.date.startsWith(k)), 'Income'));
  const expenseData = months.map(k => sumByType(txs.filter(tx=>tx.date.startsWith(k)), 'Expense'));

  rptChart2 = destroyChart(rptChart2);
  const c2 = document.getElementById('rptChart2');
  if (c2) {
    document.getElementById('rptChart2Title').textContent = 'Monthly Income vs Expense';
    rptChart2 = createIncomeExpenseBarChart(c2, months, incomeData, expenseData);
  }

  // Payment chart
  const payGrouped = groupByPaymentMethod(expenses);
  rptPaymentChart = destroyChart(rptPaymentChart);
  const cp = document.getElementById('rptPaymentChart');
  if (cp && Object.keys(payGrouped).length) {
    rptPaymentChart = createDoughnutChart(cp,
      Object.keys(payGrouped), Object.values(payGrouped),
      { legendPosition: 'bottom' }
    );
  }

  // Top expense categories
  renderTopExpenseCategories(expenses);

  // Table
  document.getElementById('rptTableTitle').textContent = `Monthly Breakdown – ${year}`;
  renderMonthlyTable(txs, year);
}

// ─── Yearly Report ────────────────────────────────────────────────────────────

function renderYearlyReport(selectedYear) {
  const years = getYearsFromTransactions(allTransactions).slice(0, 5);

  // Chart 1: Yearly income vs expense
  const incomeData  = years.map(y => sumByType(allTransactions.filter(tx=>tx.date.startsWith(y)), 'Income'));
  const expenseData = years.map(y => sumByType(allTransactions.filter(tx=>tx.date.startsWith(y)), 'Expense'));

  rptChart1 = destroyChart(rptChart1);
  const c1 = document.getElementById('rptChart1');
  if (c1) {
    document.getElementById('rptChart1Title').textContent = 'Yearly Income vs Expense';
    rptChart1 = createIncomeExpenseBarChart(c1, years.map(y=>`${y}-01`), incomeData, expenseData);
  }

  // Chart 2: Savings trend line
  const savings = years.map(y => {
    const inc = sumByType(allTransactions.filter(tx=>tx.date.startsWith(y)), 'Income');
    const exp = sumByType(allTransactions.filter(tx=>tx.date.startsWith(y)), 'Expense');
    return inc - exp;
  });

  rptChart2 = destroyChart(rptChart2);
  const c2 = document.getElementById('rptChart2');
  if (c2) {
    document.getElementById('rptChart2Title').textContent = 'Yearly Savings Trend';
    rptChart2 = createMultiLineChart(c2, years, [{
      label: 'Savings',
      data: savings,
      borderColor: 'rgb(13,110,253)',
      backgroundColor: 'rgba(13,110,253,.1)',
      fill: true,
      tension: 0.4,
      pointRadius: 4,
    }]);
  }

  // Expense by category for selected year
  const yearTxs = allTransactions.filter(tx=>tx.date.startsWith(String(selectedYear)));
  renderTopExpenseCategories(yearTxs.filter(t=>t.type==='Expense'));

  const payGrouped = groupByPaymentMethod(yearTxs.filter(t=>t.type==='Expense'));
  rptPaymentChart = destroyChart(rptPaymentChart);
  const cp = document.getElementById('rptPaymentChart');
  if (cp && Object.keys(payGrouped).length) {
    rptPaymentChart = createDoughnutChart(cp,
      Object.keys(payGrouped), Object.values(payGrouped), { legendPosition: 'bottom' }
    );
  }

  // Yearly table
  document.getElementById('rptTableTitle').textContent = 'Year-by-Year Summary';
  renderYearlyTable(years);
}

// ─── Category Report ──────────────────────────────────────────────────────────

function renderCategoryReport(txs) {
  const expenses = txs.filter(t => t.type === 'Expense');
  const catGrouped = groupByCategory(expenses);
  const sorted = Object.entries(catGrouped).sort((a,b)=>b[1]-a[1]);

  rptChart1 = destroyChart(rptChart1);
  const c1 = document.getElementById('rptChart1');
  if (c1 && sorted.length) {
    document.getElementById('rptChart1Title').textContent = 'Expense by Category';
    rptChart1 = createHorizontalBarChart(c1,
      sorted.slice(0,10).map(([k])=>k),
      sorted.slice(0,10).map(([,v])=>v)
    );
  }

  const incGrouped = groupByCategory(txs.filter(t=>t.type==='Income'));
  const incSorted = Object.entries(incGrouped).sort((a,b)=>b[1]-a[1]);
  rptChart2 = destroyChart(rptChart2);
  const c2 = document.getElementById('rptChart2');
  if (c2 && incSorted.length) {
    document.getElementById('rptChart2Title').textContent = 'Income by Category';
    rptChart2 = createDoughnutChart(c2, incSorted.map(([k])=>k), incSorted.map(([,v])=>v));
  }

  renderTopExpenseCategories(expenses);

  const payGrouped = groupByPaymentMethod(expenses);
  rptPaymentChart = destroyChart(rptPaymentChart);
  const cp = document.getElementById('rptPaymentChart');
  if (cp && Object.keys(payGrouped).length) {
    rptPaymentChart = createDoughnutChart(cp,
      Object.keys(payGrouped), Object.values(payGrouped), { legendPosition: 'bottom' }
    );
  }

  // Category table
  document.getElementById('rptTableTitle').textContent = 'Category Breakdown';
  renderCategoryTable(txs);
}

// ─── Payment Method Report ────────────────────────────────────────────────────

function renderPaymentReport(txs) {
  const expenses = txs.filter(t => t.type === 'Expense');
  const payGrouped = groupByPaymentMethod(expenses);
  const total = Object.values(payGrouped).reduce((s,v)=>s+v, 0);

  rptChart1 = destroyChart(rptChart1);
  const c1 = document.getElementById('rptChart1');
  if (c1) {
    document.getElementById('rptChart1Title').textContent = 'Expense by Payment Method';
    rptChart1 = createDoughnutChart(c1, Object.keys(payGrouped), Object.values(payGrouped));
  }

  const incPayGrouped = groupByPaymentMethod(txs.filter(t=>t.type==='Income'));
  rptChart2 = destroyChart(rptChart2);
  const c2 = document.getElementById('rptChart2');
  if (c2) {
    document.getElementById('rptChart2Title').textContent = 'Income by Payment Method';
    rptChart2 = createDoughnutChart(c2, Object.keys(incPayGrouped), Object.values(incPayGrouped));
  }

  rptPaymentChart = destroyChart(rptPaymentChart);

  renderTopExpenseCategories(expenses);

  // Payment method table
  document.getElementById('rptTableTitle').textContent = 'Payment Method Breakdown';
  renderPaymentTable(txs);
}

// ─── Top Categories ───────────────────────────────────────────────────────────

function renderTopExpenseCategories(expenses) {
  const container = document.getElementById('rptTopExpenseCategories');
  if (!container) return;
  const total = expenses.reduce((s,t)=>s+t.amount, 0);
  const grouped = groupByCategory(expenses);
  const top = Object.entries(grouped).sort((a,b)=>b[1]-a[1]).slice(0,5);

  container.innerHTML = top.map(([cat, amt], i) => {
    const pct = total > 0 ? Math.round((amt/total)*100) : 0;
    const color = getChartColor(i);
    return `
      <div class="mb-2">
        <div class="d-flex justify-content-between small mb-1">
          <span><i class="bi bi-circle-fill me-1" style="color:${color};font-size:.5rem"></i>${cat}</span>
          <span class="fw-semibold">${formatCurrency(amt)} <span class="text-muted">(${pct}%)</span></span>
        </div>
        <div class="progress" style="height:5px">
          <div class="progress-bar" style="width:${pct}%;background:${color}"></div>
        </div>
      </div>`;
  }).join('') || '<p class="text-muted small">No expense data.</p>';
}

// ─── Tables ───────────────────────────────────────────────────────────────────

function renderMonthlyTable(txs, year) {
  const head = document.getElementById('rptTableHead');
  const body = document.getElementById('rptTableBody');
  const foot = document.getElementById('rptTableFoot');
  if (!head || !body) return;

  head.innerHTML = `<tr><th class="ps-3">Month</th><th class="text-end">Income</th><th class="text-end">Expense</th><th class="text-end">Savings</th><th class="text-end pe-3">Rate</th></tr>`;

  const months = Array.from({length:12}, (_,i)=>i+1);
  let totalInc = 0, totalExp = 0;

  body.innerHTML = months.map(m => {
    const prefix = `${year}-${String(m).padStart(2,'0')}`;
    const mTxs = txs.filter(tx => tx.date.startsWith(prefix));
    if (!mTxs.length) return '';
    const inc = sumByType(mTxs, 'Income');
    const exp = sumByType(mTxs, 'Expense');
    const sav = inc - exp;
    const rate = inc > 0 ? Math.round((sav/inc)*100) : 0;
    totalInc += inc; totalExp += exp;
    return `<tr>
      <td class="ps-3">${getMonthName(m)}</td>
      <td class="text-end text-success">${formatCurrency(inc)}</td>
      <td class="text-end text-danger">${formatCurrency(exp)}</td>
      <td class="text-end ${sav>=0?'text-success':'text-danger'}">${formatCurrency(sav)}</td>
      <td class="text-end pe-3">${rate}%</td>
    </tr>`;
  }).filter(Boolean).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No data available</td></tr>';

  const totalSav = totalInc - totalExp;
  const totalRate = totalInc > 0 ? Math.round((totalSav/totalInc)*100) : 0;
  foot.innerHTML = `<tr>
    <td class="ps-3">Total</td>
    <td class="text-end text-success">${formatCurrency(totalInc)}</td>
    <td class="text-end text-danger">${formatCurrency(totalExp)}</td>
    <td class="text-end">${formatCurrency(totalSav)}</td>
    <td class="text-end pe-3">${totalRate}%</td>
  </tr>`;
}

function renderYearlyTable(years) {
  const head = document.getElementById('rptTableHead');
  const body = document.getElementById('rptTableBody');
  const foot = document.getElementById('rptTableFoot');
  if (!head || !body) return;

  head.innerHTML = `<tr><th class="ps-3">Year</th><th class="text-end">Income</th><th class="text-end">Expense</th><th class="text-end">Savings</th><th class="text-end pe-3">Transactions</th></tr>`;

  body.innerHTML = years.map(y => {
    const yTxs = allTransactions.filter(tx => tx.date.startsWith(String(y)));
    const inc = sumByType(yTxs, 'Income');
    const exp = sumByType(yTxs, 'Expense');
    const sav = inc - exp;
    return `<tr>
      <td class="ps-3 fw-semibold">${y}</td>
      <td class="text-end text-success">${formatCurrency(inc)}</td>
      <td class="text-end text-danger">${formatCurrency(exp)}</td>
      <td class="text-end ${sav>=0?'text-success':'text-danger'}">${formatCurrency(sav)}</td>
      <td class="text-end pe-3">${yTxs.length}</td>
    </tr>`;
  }).join('');

  foot.innerHTML = '';
}

function renderCategoryTable(txs) {
  const head = document.getElementById('rptTableHead');
  const body = document.getElementById('rptTableBody');
  const foot = document.getElementById('rptTableFoot');
  if (!head || !body) return;

  head.innerHTML = `<tr><th class="ps-3">Category</th><th>Type</th><th class="text-end">Amount</th><th class="text-end">Transactions</th><th class="text-end pe-3">% of Total</th></tr>`;

  const grouped = {};
  txs.forEach(tx => {
    if (!grouped[tx.category]) grouped[tx.category] = { type: tx.type, amount: 0, count: 0 };
    grouped[tx.category].amount += tx.amount;
    grouped[tx.category].count++;
  });
  const total = txs.reduce((s,t)=>s+t.amount,0);
  const sorted = Object.entries(grouped).sort((a,b)=>b[1].amount-a[1].amount);

  body.innerHTML = sorted.map(([cat, data]) => {
    const pct = total > 0 ? Math.round((data.amount/total)*100) : 0;
    const cls = data.type === 'Income' ? 'text-success' : 'text-danger';
    return `<tr>
      <td class="ps-3">${cat}</td>
      <td><span class="badge ${data.type==='Income'?'bg-success-subtle text-success':'bg-danger-subtle text-danger'}">${data.type}</span></td>
      <td class="text-end ${cls} fw-semibold">${formatCurrency(data.amount)}</td>
      <td class="text-end">${data.count}</td>
      <td class="text-end pe-3">${pct}%</td>
    </tr>`;
  }).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No data</td></tr>';

  foot.innerHTML = `<tr><td class="ps-3">Total</td><td></td><td class="text-end">${formatCurrency(total)}</td><td class="text-end">${txs.length}</td><td class="text-end pe-3">100%</td></tr>`;
}

function renderPaymentTable(txs) {
  const head = document.getElementById('rptTableHead');
  const body = document.getElementById('rptTableBody');
  const foot = document.getElementById('rptTableFoot');
  if (!head || !body) return;

  head.innerHTML = `<tr><th class="ps-3">Payment Method</th><th class="text-end">Income</th><th class="text-end">Expense</th><th class="text-end">Transactions</th><th class="text-end pe-3">% of Expense</th></tr>`;

  const methods = ['Cash','Bank','UPI','Card','Wallet'];
  const totalExpense = txs.filter(t=>t.type==='Expense').reduce((s,t)=>s+t.amount,0);

  body.innerHTML = methods.map(m => {
    const mTxs = txs.filter(tx => (tx.paymentMethod||'Cash') === m);
    if (!mTxs.length) return '';
    const inc = sumByType(mTxs, 'Income');
    const exp = sumByType(mTxs, 'Expense');
    const pct = totalExpense > 0 ? Math.round((exp/totalExpense)*100) : 0;
    return `<tr>
      <td class="ps-3"><i class="bi bi-${m==='Cash'?'cash':m==='Bank'?'bank':m==='UPI'?'phone':m==='Card'?'credit-card':'wallet2'} me-2 text-muted"></i>${m}</td>
      <td class="text-end text-success">${formatCurrency(inc)}</td>
      <td class="text-end text-danger">${formatCurrency(exp)}</td>
      <td class="text-end">${mTxs.length}</td>
      <td class="text-end pe-3">${pct}%</td>
    </tr>`;
  }).filter(Boolean).join('') || '<tr><td colspan="5" class="text-center text-muted py-3">No data</td></tr>';

  foot.innerHTML = '';
}

// ─── PDF Export ───────────────────────────────────────────────────────────────

function exportReportPDF() {
  if (!window.jspdf) { showToast('jsPDF not available', 'error'); return; }
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  const year = document.getElementById('reportYear')?.value || new Date().getFullYear();

  doc.setFontSize(18);
  doc.setTextColor(13, 110, 253);
  doc.text('ExpenseTracker – Report', 14, 18);

  doc.setFontSize(11);
  doc.setTextColor(100);
  doc.text(`Year: ${year} | Tab: ${currentTab.charAt(0).toUpperCase()+currentTab.slice(1)} | Generated: ${new Date().toLocaleDateString()}`, 14, 26);

  const totalInc = sumByType(allTransactions.filter(tx=>tx.date.startsWith(year)), 'Income');
  const totalExp = sumByType(allTransactions.filter(tx=>tx.date.startsWith(year)), 'Expense');
  const savings  = totalInc - totalExp;

  doc.setFontSize(12);
  doc.setTextColor(0);
  doc.text(`Total Income:  ${formatCurrency(totalInc)}`, 14, 38);
  doc.text(`Total Expense: ${formatCurrency(totalExp)}`, 14, 46);
  doc.text(`Net Savings:   ${formatCurrency(savings)}`, 14, 54);

  const bodyEl = document.getElementById('rptTableBody');
  const headEl = document.getElementById('rptTableHead');

  if (doc.autoTable && bodyEl) {
    const headers = [...(headEl?.querySelectorAll('th')||[])].map(th => th.textContent.trim());
    const rows = [...bodyEl.querySelectorAll('tr')].map(tr =>
      [...tr.querySelectorAll('td')].map(td => td.textContent.trim())
    ).filter(r => r.length);

    doc.autoTable({
      head: [headers],
      body: rows,
      startY: 62,
      styles: { fontSize: 9 },
      headStyles: { fillColor: [13, 110, 253] },
    });
  }

  doc.save(`report_${year}_${currentTab}_${new Date().toISOString().slice(0,10)}.pdf`);
  showToast('Report PDF exported', 'success');
}

// ─── Start ────────────────────────────────────────────────────────────────────

window.addEventListener('appReady', init);
