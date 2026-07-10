/**
 * chart.js – Shared Chart.js configuration helpers and chart factory functions.
 * Used by dashboard.js and report.js for consistent chart styling.
 */

import { formatCurrency, getChartColor, getShortMonthName } from './utils.js';

// ─── Global Chart Defaults ───────────────────────────────────────────────────

export function applyChartDefaults() {
  if (!window.Chart) return;

  Chart.defaults.font.family = "'Segoe UI', system-ui, sans-serif";
  Chart.defaults.font.size = 12;
  Chart.defaults.color = getCSSVar('--bs-body-color', '#666');
  Chart.defaults.plugins.legend.labels.usePointStyle = true;
  Chart.defaults.plugins.legend.labels.pointStyleWidth = 10;
  Chart.defaults.animation.duration = 400;
}

function getCSSVar(name, fallback) {
  try {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
  } catch { return fallback; }
}

function isDark() {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark';
}

function gridColor() {
  return isDark() ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.05)';
}

function borderColor() {
  return isDark() ? '#212529' : '#fff';
}

// ─── Doughnut / Pie Chart ─────────────────────────────────────────────────────

/**
 * Create a doughnut chart
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @param {object} options
 */
export function createDoughnutChart(canvas, labels, data, options = {}) {
  const colors = labels.map((_, i) => getChartColor(i));

  return new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderColor: borderColor(),
        borderWidth: 2,
        hoverOffset: 6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: true,
      cutout: '65%',
      plugins: {
        legend: {
          position: options.legendPosition || 'right',
          labels: { boxWidth: 12, font: { size: 11 }, padding: 8 },
        },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.label}: ${formatCurrency(ctx.parsed)} (${
              Math.round(ctx.parsed / ctx.dataset.data.reduce((a,b)=>a+b,0)*100)
            }%)`
          }
        }
      },
      ...options.overrides,
    }
  });
}

// ─── Bar Chart ────────────────────────────────────────────────────────────────

/**
 * Create an income vs expense bar chart for given months
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} months – YYYY-MM strings
 * @param {number[]} incomeData
 * @param {number[]} expenseData
 */
export function createIncomeExpenseBarChart(canvas, months, incomeData, expenseData) {
  const labels = months.map(k => {
    const [y, m] = k.split('-');
    return getShortMonthName(parseInt(m)) + " '" + y.substring(2);
  });

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Income',
          data: incomeData,
          backgroundColor: 'rgba(25,135,84,.75)',
          borderRadius: 4,
          borderSkipped: false,
        },
        {
          label: 'Expense',
          data: expenseData,
          backgroundColor: 'rgba(220,53,69,.75)',
          borderRadius: 4,
          borderSkipped: false,
        },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}`
          }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 11 },
            callback: v => abbreviateCurrency(v)
          }
        }
      }
    }
  });
}

// ─── Line Chart ───────────────────────────────────────────────────────────────

/**
 * Create a line trend chart
 * @param {HTMLCanvasElement} canvas
 * @param {string[]} labels
 * @param {number[]} data
 * @param {string} label
 * @param {string} color
 */
export function createLineChart(canvas, labels, data, label = 'Amount', color = 'rgb(13,110,253)') {
  return new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        label,
        data,
        borderColor: color,
        backgroundColor: color.replace('rgb', 'rgba').replace(')', ',.1)'),
        fill: true,
        tension: 0.4,
        pointRadius: 3,
        pointHoverRadius: 6,
        pointBackgroundColor: color,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${label}: ${formatCurrency(ctx.raw)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 11 },
            callback: v => abbreviateCurrency(v)
          }
        }
      }
    }
  });
}

// ─── Horizontal Bar Chart ─────────────────────────────────────────────────────

/**
 * Create a horizontal bar chart for category breakdown
 */
export function createHorizontalBarChart(canvas, labels, data) {
  const colors = labels.map((_, i) => getChartColor(i));

  return new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: colors,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: ctx => ` ${formatCurrency(ctx.raw)}` }
        }
      },
      scales: {
        x: {
          grid: { color: gridColor() },
          ticks: { font: { size: 11 }, callback: v => abbreviateCurrency(v) }
        },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

// ─── Multi-line Chart ─────────────────────────────────────────────────────────

/**
 * Income vs Expense line chart for yearly view
 */
export function createMultiLineChart(canvas, labels, datasets) {
  return new Chart(canvas, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: { label: ctx => ` ${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: {
          grid: { color: gridColor() },
          ticks: {
            font: { size: 11 },
            callback: v => abbreviateCurrency(v)
          }
        }
      }
    }
  });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function abbreviateCurrency(v) {
  if (v >= 1_00_000) return '₹' + (v / 1_00_000).toFixed(1) + 'L';
  if (v >= 1000) return '₹' + (v / 1000).toFixed(0) + 'K';
  return '₹' + v;
}

export function destroyChart(chartInstance) {
  if (chartInstance) {
    try { chartInstance.destroy(); } catch {}
  }
  return null;
}
