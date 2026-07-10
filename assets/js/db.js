/**
 * db.js – IndexedDB wrapper for ExpenseTracker
 * Database: ExpenseTrackerDB
 * Stores: transactions, categories, budgets, settings
 */

const DB_NAME = 'ExpenseTrackerDB';
const DB_VERSION = 1;

class ExpenseTrackerDB {
  constructor() {
    this.db = null;
  }

  /** Open (or create) the database */
  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // ── transactions ──────────────────────────────
        if (!db.objectStoreNames.contains('transactions')) {
          const txStore = db.createObjectStore('transactions', {
            keyPath: 'id',
            autoIncrement: true,
          });
          txStore.createIndex('date', 'date', { unique: false });
          txStore.createIndex('category', 'category', { unique: false });
          txStore.createIndex('type', 'type', { unique: false });
          txStore.createIndex('paymentMethod', 'paymentMethod', { unique: false });
        }

        // ── categories ────────────────────────────────
        if (!db.objectStoreNames.contains('categories')) {
          const catStore = db.createObjectStore('categories', {
            keyPath: 'id',
            autoIncrement: true,
          });
          catStore.createIndex('name', 'name', { unique: false });
          catStore.createIndex('type', 'type', { unique: false });
        }

        // ── budgets ───────────────────────────────────
        if (!db.objectStoreNames.contains('budgets')) {
          const budStore = db.createObjectStore('budgets', {
            keyPath: 'id',
            autoIncrement: true,
          });
          budStore.createIndex('category', 'category', { unique: false });
          budStore.createIndex('month', 'month', { unique: false });
          budStore.createIndex('year', 'year', { unique: false });
        }

        // ── settings ──────────────────────────────────
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this);
      };

      request.onerror = (event) => {
        reject(new Error(`IndexedDB error: ${event.target.error}`));
      };
    });
  }

  // ────────────────────────────────────────────────────
  // Generic helpers
  // ────────────────────────────────────────────────────

  _tx(storeName, mode = 'readonly') {
    return this.db.transaction(storeName, mode);
  }

  _store(storeName, mode = 'readonly') {
    return this._tx(storeName, mode).objectStore(storeName);
  }

  _req(request) {
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  _getAll(storeName) {
    return this._req(this._store(storeName).getAll());
  }

  _get(storeName, key) {
    return this._req(this._store(storeName).get(key));
  }

  _add(storeName, item) {
    return this._req(this._store(storeName, 'readwrite').add(item));
  }

  _put(storeName, item) {
    return this._req(this._store(storeName, 'readwrite').put(item));
  }

  _delete(storeName, key) {
    return this._req(this._store(storeName, 'readwrite').delete(key));
  }

  _clear(storeName) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(storeName, 'readwrite');
      tx.objectStore(storeName).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error(`Failed to clear ${storeName}`));
      tx.onabort = () => reject(tx.error || new Error(`Clear aborted for ${storeName}`));
    });
  }

  // ────────────────────────────────────────────────────
  // Transactions
  // ────────────────────────────────────────────────────

  async addTransaction(tx) {
    const now = new Date().toISOString();
    const record = {
      ...tx,
      amount: parseFloat(tx.amount),
      createdAt: now,
      updatedAt: now,
    };
    delete record.id; // let autoIncrement assign
    const id = await this._add('transactions', record);
    return { ...record, id };
  }

  async updateTransaction(tx) {
    const now = new Date().toISOString();
    const record = { ...tx, amount: parseFloat(tx.amount), updatedAt: now };
    await this._put('transactions', record);
    return record;
  }

  async deleteTransaction(id) {
    return this._delete('transactions', id);
  }

  async getTransaction(id) {
    return this._get('transactions', id);
  }

  async getAllTransactions() {
    const txs = await this._getAll('transactions');
    return txs.sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getTransactionsByDateRange(startDate, endDate) {
    const all = await this._getAll('transactions');
    return all.filter(tx => tx.date >= startDate && tx.date <= endDate)
              .sort((a, b) => new Date(b.date) - new Date(a.date));
  }

  async getTransactionsByMonth(year, month) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const end = `${year}-${String(month).padStart(2, '0')}-31`;
    return this.getTransactionsByDateRange(start, end);
  }

  async getTransactionsByYear(year) {
    const start = `${year}-01-01`;
    const end = `${year}-12-31`;
    return this.getTransactionsByDateRange(start, end);
  }

  async getTransactionsByType(type) {
    const all = await this._getAll('transactions');
    return all.filter(tx => tx.type === type);
  }

  async getTransactionsByCategory(category) {
    const all = await this._getAll('transactions');
    return all.filter(tx => tx.category === category);
  }

  async bulkDeleteTransactions(ids) {
    const store = this._store('transactions', 'readwrite');
    const promises = ids.map(id => this._req(store.delete(id)));
    return Promise.all(promises);
  }

  async bulkAddTransactions(transactions) {
    const results = [];
    for (const tx of transactions) {
      const result = await this.addTransaction(tx);
      results.push(result);
    }
    return results;
  }

  // ────────────────────────────────────────────────────
  // Categories
  // ────────────────────────────────────────────────────

  async addCategory(cat) {
    const record = { ...cat };
    delete record.id;
    const id = await this._add('categories', record);
    return { ...record, id };
  }

  async updateCategory(cat) {
    await this._put('categories', cat);
    return cat;
  }

  async deleteCategory(id) {
    return this._delete('categories', id);
  }

  async getAllCategories() {
    return this._getAll('categories');
  }

  async getCategoriesByType(type) {
    const all = await this.getAllCategories();
    return all.filter(c => c.type === type);
  }

  async clearCategories() {
    return this._clear('categories');
  }

  // ────────────────────────────────────────────────────
  // Budgets
  // ────────────────────────────────────────────────────

  async addBudget(budget) {
    const record = {
      ...budget,
      amount: parseFloat(budget.amount),
      createdAt: new Date().toISOString(),
    };
    delete record.id;
    const id = await this._add('budgets', record);
    return { ...record, id };
  }

  async updateBudget(budget) {
    const record = { ...budget, amount: parseFloat(budget.amount) };
    await this._put('budgets', record);
    return record;
  }

  async deleteBudget(id) {
    return this._delete('budgets', id);
  }

  async getAllBudgets() {
    return this._getAll('budgets');
  }

  async getBudgetsByMonthYear(month, year) {
    const all = await this.getAllBudgets();
    return all.filter(b => b.month === parseInt(month) && b.year === parseInt(year));
  }

  async getBudgetByCategoryMonthYear(category, month, year) {
    const all = await this.getAllBudgets();
    return all.find(
      b => b.category === category &&
           b.month === parseInt(month) &&
           b.year === parseInt(year)
    ) || null;
  }

  async clearBudgets() {
    return this._clear('budgets');
  }

  // ────────────────────────────────────────────────────
  // Settings
  // ────────────────────────────────────────────────────

  async getSetting(key) {
    const record = await this._get('settings', key);
    return record ? record.value : null;
  }

  async setSetting(key, value) {
    return this._put('settings', { key, value });
  }

  async getAllSettings() {
    const records = await this._getAll('settings');
    return records.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
  }

  // ────────────────────────────────────────────────────
  // Backup & Restore
  // ────────────────────────────────────────────────────

  async exportBackup() {
    const [transactions, categories, budgets, settings] = await Promise.all([
      this.getAllTransactions(),
      this.getAllCategories(),
      this.getAllBudgets(),
      this.getAllSettings(),
    ]);
    return {
      version: 1,
      exportedAt: new Date().toISOString(),
      transactions,
      categories,
      budgets,
      settings,
    };
  }

  async importBackup(data, mode = 'merge') {
    if (mode === 'replace') {
      await this._clear('transactions');
      await this._clear('categories');
      await this._clear('budgets');
      await this._clear('settings');
    }

    if (data.transactions?.length) {
      for (const tx of data.transactions) {
        await this._put('transactions', tx);
      }
    }

    if (data.categories?.length) {
      for (const cat of data.categories) {
        await this._put('categories', cat);
      }
    }

    if (data.budgets?.length) {
      for (const b of data.budgets) {
        await this._put('budgets', b);
      }
    }

    if (data.settings) {
      for (const [key, value] of Object.entries(data.settings)) {
        await this.setSetting(key, value);
      }
    }

    return true;
  }

  // ────────────────────────────────────────────────────
  // Reset
  // ────────────────────────────────────────────────────

  async clearAllTransactions() {
    return this._clear('transactions');
  }

  async resetAll() {
    // Sequential — concurrent write transactions can silently abort in some browsers
    await this._clear('transactions');
    await this._clear('categories');
    await this._clear('budgets');
    await this._clear('settings');
  }
}

// Singleton instance
export const db = new ExpenseTrackerDB();
export default db;
