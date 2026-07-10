/**
 * ui.js – Toast notifications, loading overlay, and UI helpers
 */

// ─── Toast Notifications ──────────────────────────────────────────────────────

const TOAST_COLORS = {
  success: { bg: 'bg-success', icon: 'bi-check-circle-fill' },
  error:   { bg: 'bg-danger',  icon: 'bi-x-circle-fill' },
  warning: { bg: 'bg-warning', icon: 'bi-exclamation-triangle-fill' },
  info:    { bg: 'bg-primary', icon: 'bi-info-circle-fill' },
};

/**
 * Show a Bootstrap toast notification
 * @param {string} message
 * @param {'success'|'error'|'warning'|'info'} type
 * @param {number} duration – ms before auto-hide (0 = manual)
 */
export function showToast(message, type = 'success', duration = 3500) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const cfg = TOAST_COLORS[type] || TOAST_COLORS.info;
  const id = `toast-${Date.now()}`;

  const html = `
    <div id="${id}" class="toast align-items-center text-white ${cfg.bg} border-0"
         role="alert" aria-live="assertive" aria-atomic="true"
         data-bs-delay="${duration}">
      <div class="d-flex">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${cfg.icon}"></i>
          <span>${message}</span>
        </div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto"
                data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>`;

  container.insertAdjacentHTML('beforeend', html);
  const toastEl = document.getElementById(id);
  const toast = new bootstrap.Toast(toastEl, { autohide: duration > 0 });
  toast.show();

  toastEl.addEventListener('hidden.bs.toast', () => toastEl.remove());
}

// ─── Loading Overlay ──────────────────────────────────────────────────────────

export function showLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.remove('d-none');
}

export function hideLoading() {
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) overlay.classList.add('d-none');
}

// ─── Modal Helpers ────────────────────────────────────────────────────────────

export function showModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const m = bootstrap.Modal.getOrCreateInstance(el);
  m.show();
}

export function hideModal(id) {
  const el = document.getElementById(id);
  if (!el) return;
  const m = bootstrap.Modal.getInstance(el);
  if (m) m.hide();
}

// ─── Empty State ──────────────────────────────────────────────────────────────

export function emptyState(icon = 'bi-inbox', title = 'No data found', subtitle = '') {
  return `
    <div class="empty-state fade-in">
      <i class="bi ${icon}"></i>
      <p class="fw-semibold mb-1">${title}</p>
      ${subtitle ? `<small class="text-muted">${subtitle}</small>` : ''}
    </div>`;
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────

/**
 * Show a confirmation modal and return a Promise<boolean>
 * Uses #confirmModal (settings) or #deleteModal (other pages)
 */
export function confirmDialog(title = 'Delete?', body = 'This action cannot be undone.') {
  return new Promise(resolve => {
    const modalEl = document.getElementById('confirmModal') ||
                    document.getElementById('deleteModal');
    if (!modalEl) { resolve(window.confirm(title)); return; }

    const titleEl = modalEl.querySelector('#confirmModalTitle, #deleteModalTitle, .modal-title, h6.fw-bold');
    const bodyEl  = modalEl.querySelector('#confirmModalBody, .text-muted.small');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl)  bodyEl.textContent  = body;

    const confirmBtn = modalEl.querySelector('#confirmActionBtn, #confirmDeleteBtn');
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      confirmBtn?.removeEventListener('click', onConfirm);
      modalEl.removeEventListener('hidden.bs.modal', onHide);
      if (value) modal.hide();
      resolve(value);
    };

    const onConfirm = () => finish(true);
    const onHide    = () => finish(false);

    confirmBtn?.addEventListener('click', onConfirm);
    modalEl.addEventListener('hidden.bs.modal', onHide);
    modal.show();
  });
}

// ─── Pagination ───────────────────────────────────────────────────────────────

/**
 * Render Bootstrap pagination
 * @param {number} currentPage – 1-based
 * @param {number} totalPages
 * @param {function} onPageChange – (page) => void
 */
export function renderPagination(containerId, currentPage, totalPages, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  if (totalPages <= 1) { container.innerHTML = ''; return; }

  const maxVisible = 5;
  let pages = [];

  if (totalPages <= maxVisible + 2) {
    pages = Array.from({ length: totalPages }, (_, i) => i + 1);
  } else {
    pages = [1];
    const start = Math.max(2, currentPage - 1);
    const end   = Math.min(totalPages - 1, currentPage + 1);
    if (start > 2) pages.push('...');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('...');
    pages.push(totalPages);
  }

  const items = pages.map(p => {
    if (p === '...') return `<li class="page-item disabled"><span class="page-link">…</span></li>`;
    const active = p === currentPage ? 'active' : '';
    return `<li class="page-item ${active}">
      <button class="page-link" data-page="${p}">${p}</button>
    </li>`;
  });

  const prev = `<li class="page-item ${currentPage === 1 ? 'disabled' : ''}">
    <button class="page-link" data-page="${currentPage - 1}"><i class="bi bi-chevron-left"></i></button>
  </li>`;

  const next = `<li class="page-item ${currentPage === totalPages ? 'disabled' : ''}">
    <button class="page-link" data-page="${currentPage + 1}"><i class="bi bi-chevron-right"></i></button>
  </li>`;

  container.innerHTML = prev + items.join('') + next;

  container.querySelectorAll('[data-page]').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = parseInt(btn.dataset.page);
      if (!isNaN(page) && page >= 1 && page <= totalPages) {
        onPageChange(page);
      }
    });
  });
}

// ─── Payment Method Badge ─────────────────────────────────────────────────────

const METHOD_ICONS = {
  Cash: 'bi-cash',
  Bank: 'bi-bank',
  UPI:  'bi-phone',
  Card: 'bi-credit-card',
  Wallet: 'bi-wallet2',
};

export function methodBadge(method) {
  const icon = METHOD_ICONS[method] || 'bi-cash';
  return `<span class="badge bg-secondary-subtle text-secondary fw-normal">
    <i class="bi ${icon} me-1"></i>${method || 'Cash'}
  </span>`;
}

// ─── Type Badge ───────────────────────────────────────────────────────────────

export function typeBadge(type) {
  if (type === 'Income') {
    return `<span class="badge badge-income"><i class="bi bi-arrow-down-circle me-1"></i>Income</span>`;
  }
  return `<span class="badge badge-expense"><i class="bi bi-arrow-up-circle me-1"></i>Expense</span>`;
}

// ─── Amount Display ───────────────────────────────────────────────────────────

export function amountDisplay(amount, type, formatFn) {
  const sign = type === 'Income' ? '+' : '-';
  const cls  = type === 'Income' ? 'amount-income' : 'amount-expense';
  return `<span class="${cls}">${sign}${formatFn(amount)}</span>`;
}

// ─── Progress Bar Color ───────────────────────────────────────────────────────

export function progressBarClass(pct) {
  if (pct >= 100) return 'bg-danger over-budget';
  if (pct >= 80)  return 'bg-warning near-budget';
  return 'bg-success';
}
