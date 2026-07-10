/**
 * utils.js – Shared utility functions
 */

// ─── Default Categories ───────────────────────────────────────────────────────

export const DEFAULT_CATEGORIES = {
  Expense: [
    { name: 'Food', icon: 'bi-cup-hot' },
    { name: 'Groceries', icon: 'bi-cart' },
    { name: 'Fuel', icon: 'bi-fuel-pump' },
    { name: 'Transport', icon: 'bi-bus-front' },
    { name: 'Rent', icon: 'bi-house' },
    { name: 'Electricity', icon: 'bi-lightning' },
    { name: 'Internet', icon: 'bi-wifi' },
    { name: 'Mobile', icon: 'bi-phone' },
    { name: 'Shopping', icon: 'bi-bag' },
    { name: 'Health', icon: 'bi-heart-pulse' },
    { name: 'Medical', icon: 'bi-hospital' },
    { name: 'Education', icon: 'bi-book' },
    { name: 'Entertainment', icon: 'bi-controller' },
    { name: 'Travel', icon: 'bi-airplane' },
    { name: 'Insurance', icon: 'bi-shield-check' },
    { name: 'EMI', icon: 'bi-credit-card' },
    { name: 'Taxes', icon: 'bi-receipt' },
    { name: 'Donation', icon: 'bi-hand-thumbs-up' },
    { name: 'Subscription', icon: 'bi-repeat' },
    { name: 'Others', icon: 'bi-three-dots' },
  ],
  Income: [
    { name: 'Salary', icon: 'bi-briefcase' },
    { name: 'Business', icon: 'bi-shop' },
    { name: 'Interest', icon: 'bi-bank' },
    { name: 'Bonus', icon: 'bi-star' },
    { name: 'Investment', icon: 'bi-graph-up-arrow' },
    { name: 'Gift', icon: 'bi-gift' },
    { name: 'Refund', icon: 'bi-arrow-return-left' },
    { name: 'Other', icon: 'bi-three-dots' },
  ],
};

// ─── Currency Formatting ──────────────────────────────────────────────────────

const CURRENCY_CONFIG = {
  INR: { symbol: '₹', code: 'INR', locale: 'en-IN' },
  USD: { symbol: '$', code: 'USD', locale: 'en-US' },
  EUR: { symbol: '€', code: 'EUR', locale: 'de-DE' },
  GBP: { symbol: '£', code: 'GBP', locale: 'en-GB' },
};

let _currencyCode = 'INR';
let _decimals = 2;

export function setCurrencyPrefs(code, decimals) {
  _currencyCode = code || 'INR';
  _decimals = parseInt(decimals ?? 2);
}

export function formatCurrency(amount) {
  const cfg = CURRENCY_CONFIG[_currencyCode] || CURRENCY_CONFIG.INR;
  try {
    return new Intl.NumberFormat(cfg.locale, {
      style: 'currency',
      currency: cfg.code,
      minimumFractionDigits: _decimals,
      maximumFractionDigits: _decimals,
    }).format(amount || 0);
  } catch {
    return `${cfg.symbol}${Number(amount || 0).toFixed(_decimals)}`;
  }
}

export function getCurrencySymbol() {
  return (CURRENCY_CONFIG[_currencyCode] || CURRENCY_CONFIG.INR).symbol;
}

// ─── Date Formatting ──────────────────────────────────────────────────────────

let _dateFormat = 'DD/MM/YYYY';

export function setDateFormat(fmt) {
  _dateFormat = fmt || 'DD/MM/YYYY';
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  switch (_dateFormat) {
    case 'MM/DD/YYYY': return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD': return `${year}-${month}-${day}`;
    case 'DD MMM YYYY': return `${day} ${monthNames[d.getMonth()]} ${year}`;
    default: return `${day}/${month}/${year}`;
  }
}

export function toInputDate(dateStr) {
  if (!dateStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function todayInputDate() {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export function getMonthName(monthNum) {
  const names = ['January','February','March','April','May','June',
                 'July','August','September','October','November','December'];
  return names[parseInt(monthNum) - 1] || '';
}

export function getShortMonthName(monthNum) {
  const names = ['Jan','Feb','Mar','Apr','May','Jun',
                 'Jul','Aug','Sep','Oct','Nov','Dec'];
  return names[parseInt(monthNum) - 1] || '';
}

// ─── Number Formatting ────────────────────────────────────────────────────────

export function formatNumber(n) {
  return new Intl.NumberFormat('en-IN').format(n || 0);
}

export function formatPercent(value, total) {
  if (!total) return '0%';
  return `${Math.round((value / total) * 100)}%`;
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateTransaction(data) {
  const errors = {};
  if (!data.amount || isNaN(data.amount) || parseFloat(data.amount) <= 0) {
    errors.amount = 'Amount must be a positive number.';
  }
  if (!data.date) {
    errors.date = 'Date is required.';
  }
  if (!data.category) {
    errors.category = 'Category is required.';
  }
  if (!data.type || !['Income', 'Expense'].includes(data.type)) {
    errors.type = 'Type must be Income or Expense.';
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

// ─── Statistics helpers ───────────────────────────────────────────────────────

export function sumByType(transactions, type) {
  return transactions
    .filter(tx => tx.type === type)
    .reduce((sum, tx) => sum + (tx.amount || 0), 0);
}

export function groupByCategory(transactions) {
  return transactions.reduce((acc, tx) => {
    acc[tx.category] = (acc[tx.category] || 0) + tx.amount;
    return acc;
  }, {});
}

export function groupByMonth(transactions) {
  return transactions.reduce((acc, tx) => {
    const key = tx.date.substring(0, 7); // YYYY-MM
    if (!acc[key]) acc[key] = { income: 0, expense: 0 };
    if (tx.type === 'Income') acc[key].income += tx.amount;
    else acc[key].expense += tx.amount;
    return acc;
  }, {});
}

export function groupByPaymentMethod(transactions) {
  return transactions.reduce((acc, tx) => {
    const method = tx.paymentMethod || 'Cash';
    acc[method] = (acc[method] || 0) + tx.amount;
    return acc;
  }, {});
}

/** Returns last N months as YYYY-MM strings */
export function getLastNMonths(n = 6) {
  const months = [];
  const d = new Date();
  for (let i = n - 1; i >= 0; i--) {
    const m = new Date(d.getFullYear(), d.getMonth() - i, 1);
    const month = String(m.getMonth() + 1).padStart(2, '0');
    months.push(`${m.getFullYear()}-${month}`);
  }
  return months;
}

/** Get unique years from transactions */
export function getYearsFromTransactions(transactions) {
  const years = new Set(transactions.map(tx => tx.date.substring(0, 4)));
  return [...years].sort((a, b) => b - a);
}

// ─── Chart Colors ─────────────────────────────────────────────────────────────

export const CHART_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2',
  '#59a14f', '#edc948', '#b07aa1', '#ff9da7',
  '#9c755f', '#bab0ac', '#54a24b', '#88d27a',
  '#b79a20', '#439894', '#e45756', '#72b7b2',
];

export function getChartColor(index) {
  return CHART_COLORS[index % CHART_COLORS.length];
}

// ─── DOM Helpers ──────────────────────────────────────────────────────────────

export function el(id) {
  return document.getElementById(id);
}

export function setText(id, text) {
  const element = el(id);
  if (element) element.textContent = text ?? '—';
}

export function setHTML(id, html) {
  const element = el(id);
  if (element) element.innerHTML = html;
}

export function show(id) {
  const element = el(id);
  if (element) element.classList.remove('d-none');
}

export function hide(id) {
  const element = el(id);
  if (element) element.classList.add('d-none');
}

// ─── Debounce ─────────────────────────────────────────────────────────────────

export function debounce(fn, delay = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

// ─── Download helpers ─────────────────────────────────────────────────────────

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  downloadBlob(blob, filename);
}

export function downloadCSV(rows, filename) {
  const csv = rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  downloadBlob(blob, filename);
}

// ─── Sample Data Generator ───────────────────────────────────────────────────

export function generateSampleTransactions(count = 100) {
  const expenseCategories = DEFAULT_CATEGORIES.Expense.map(c => c.name);
  const incomeCategories = DEFAULT_CATEGORIES.Income.map(c => c.name);
  const methods = ['Cash', 'Bank', 'UPI', 'Card', 'Wallet'];
  const year = new Date().getFullYear();
  const transactions = [];

  const notes = {
    Food: ['Lunch at cafe', 'Dinner out', 'Coffee & snacks', 'Pizza order', 'Restaurant'],
    Groceries: ['Weekly groceries', 'Supermarket', 'Vegetables & fruits', 'Dairy products'],
    Fuel: ['Petrol refill', 'CNG top-up', 'Diesel'],
    Transport: ['Uber ride', 'Auto rickshaw', 'Metro card recharge', 'Bus pass'],
    Rent: ['Monthly rent', 'House rent'],
    Electricity: ['Electricity bill', 'Power bill'],
    Internet: ['Broadband bill', 'WiFi plan'],
    Mobile: ['Mobile recharge', 'Phone bill'],
    Shopping: ['Clothes', 'Amazon order', 'Electronics', 'Home decor'],
    Health: ['Gym membership', 'Health checkup'],
    Medical: ['Medicine', 'Doctor visit', 'Lab tests'],
    Education: ['Online course', 'Books', 'Tuition'],
    Entertainment: ['Movie tickets', 'Netflix', 'OTT subscription', 'Gaming'],
    Travel: ['Flight ticket', 'Hotel stay', 'Taxi'],
    Insurance: ['Life insurance', 'Health insurance', 'Car insurance'],
    EMI: ['Loan EMI', 'Credit card EMI'],
    Taxes: ['Income tax', 'GST payment'],
    Donation: ['Charity donation', 'NGO contribution'],
    Subscription: ['Spotify', 'Software subscription', 'Adobe plan'],
    Others: ['Miscellaneous', 'Other expense'],
    Salary: ['Monthly salary', 'Salary credited'],
    Business: ['Client payment', 'Project income', 'Consulting fee'],
    Interest: ['FD interest', 'Savings interest'],
    Bonus: ['Performance bonus', 'Festival bonus', 'Annual bonus'],
    Investment: ['Dividend income', 'Mutual fund returns'],
    Gift: ['Birthday gift', 'Wedding gift received'],
    Refund: ['Product refund', 'Insurance claim', 'Tax refund'],
    Other: ['Miscellaneous income'],
  };

  for (let i = 0; i < count; i++) {
    const isExpense = Math.random() < 0.72;
    const type = isExpense ? 'Expense' : 'Income';
    const categories = isExpense ? expenseCategories : incomeCategories;
    const category = categories[Math.floor(Math.random() * categories.length)];

    const month = Math.floor(Math.random() * 7) + 1; // Jan-Jul of current year
    const day = Math.floor(Math.random() * 28) + 1;
    const date = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;

    let amount;
    if (type === 'Income') {
      const ranges = { Salary: [25000,80000], Business: [5000,50000], Interest: [500,5000],
        Bonus: [5000,30000], Investment: [1000,20000], Gift: [500,5000],
        Refund: [100,3000], Other: [500,5000] };
      const r = ranges[category] || [1000,10000];
      amount = Math.floor(Math.random() * (r[1] - r[0])) + r[0];
    } else {
      const ranges = { Food: [50,500], Groceries: [200,3000], Fuel: [200,2000],
        Transport: [20,500], Rent: [5000,25000], Electricity: [500,3000],
        Internet: [300,1000], Mobile: [100,1000], Shopping: [200,10000],
        Health: [500,3000], Medical: [200,5000], Education: [500,10000],
        Entertainment: [100,2000], Travel: [500,20000], Insurance: [1000,10000],
        EMI: [2000,20000], Taxes: [500,10000], Donation: [100,2000],
        Subscription: [99,999], Others: [50,2000] };
      const r = ranges[category] || [100,2000];
      amount = Math.floor(Math.random() * (r[1] - r[0])) + r[0];
    }

    const noteOptions = notes[category] || ['Transaction'];
    const note = noteOptions[Math.floor(Math.random() * noteOptions.length)];
    const method = methods[Math.floor(Math.random() * methods.length)];

    transactions.push({ date, type, category, amount, paymentMethod: method, note });
  }

  return transactions.sort((a, b) => new Date(b.date) - new Date(a.date));
}
