# ExpenseTracker

A complete **offline** personal finance Progressive Web App. No backend, no account, no cloud — all data lives in your browser via IndexedDB.

## Features

- Dashboard with balance, income, expense, and charts
- Transactions (add, edit, delete, search, filter, export)
- Reports with PDF / Excel / CSV / JSON export
- Monthly budgets with overspend alerts
- Settings (currency, theme, date format, backup/restore)
- Installable PWA with full offline support

## Offline by design

| Layer | How it works |
| --- | --- |
| UI & libraries | Bundled under `assets/vendor/` (Bootstrap, Chart.js, jsPDF, SheetJS, icons) |
| App shell | Precached by the service worker (`sw.js`) |
| Your data | Stored in IndexedDB (`ExpenseTrackerDB`) on this device |
| Backup | Export/import JSON from Settings — no server sync |

After the first visit (so the service worker can install), you can use the full app with no network.

## PWA features

- **Install** — browser install prompt + Install button in the navbar and Settings
- **iOS** — Add to Home Screen guidance (Share → Add to Home Screen)
- **Offline bar** — status when the network drops
- **Update banner** — prompts to reload when a new service worker is ready
- **Standalone mode** — runs full-screen when installed
- **Shortcuts** — Add Transaction, Reports, Budgets from the app icon
- **Share target** — receive shared text/links into Settings
- **Cache controls** — clear cache and view cache version in Settings

## Run locally

Serve the folder over HTTP (service workers need a secure origin or `localhost`):

```bash
# Python
python -m http.server 8080

# Node
npx serve .
```

Then open `http://localhost:8080` and optionally **Install** from the browser for a standalone app.

## Tech stack

HTML5 · Bootstrap 5 · Vanilla JS · IndexedDB · Chart.js · jsPDF · SheetJS · Service Worker · Web App Manifest
