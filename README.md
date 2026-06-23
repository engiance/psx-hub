# 💎 PSX Hub — Card Empire

A sports-card business command center built to make you the richest card flipper alive.
Track insane online deals, your full inventory, what's listed where, and your realized profit —
all in one fast, good-looking dashboard.

## 🚀 Run it

No install, no server, no account. Just open **`index.html`** in any modern browser
(double-click it, or drag it into a Chrome/Safari/Edge/Firefox tab).

Your data is saved automatically in that browser (via `localStorage`).
Use **Settings → Export backup** regularly to keep a copy.

> Want a shareable hosted version? Push this repo and turn on GitHub Pages
> (Settings → Pages → deploy from branch). The whole app is static files.

## 🧭 What's inside

| Section | What it does |
|---|---|
| **📊 Dashboard** | Empire net worth, unrealized & realized P/L, deal pipeline, sell-through rate, avg days-to-sell, 6-month profit chart, and an Action Center that flags insane deals, stale/underwater listings, and aging stock. |
| **🔥 Deal Hunter** | Log online deals with auto **profit / ROI / deal-score**. Anything above your ROI threshold gets a 🔥 *INSANE DEAL* flag. One click turns a bought deal into inventory. |
| **📦 Inventory** | Every card you own: cost basis, live market value, unrealized gains, grade, quantity, storage location, hold time. |
| **🏷️ Listings** | What's live, on which platform, with marketplace fees, projected **net proceeds**, projected profit, and listing age. |
| **💰 Sales** | Completed flips with realized profit, ROI, fees + shipping, and hold time. |
| **⚙️ Settings** | Editable per-platform fee presets (eBay, Whatnot, Mercari, COMC, StockX, …), ROI targets, CSV/JSON backup & restore, and demo data. |

## 🔁 The money workflow

```
Deal Hunter  →  [Buy →]  →  Inventory  →  [List 🏷️]  →  Listings  →  [Sold 💰]  →  Sales
```

Cost basis flows through every step, so your profit numbers are always real.

## 💡 Tips to get rich faster

- Set your **Insane Deal ROI threshold** in Settings (default 60%). Hunt the 🔥 flags first.
- Keep **Market / Comp value** current on inventory so unrealized P/L stays accurate.
- Watch the **Action Center** for stale (45d+) and underwater listings — drop prices or relist.
- Export a JSON backup before big changes; it's your only copy.

## 🗂️ Files

- `index.html` — app shell
- `assets/styles.css` — theme
- `assets/app.js` — all logic (vanilla JS, no dependencies)
- `main.lua` — **unrelated pre-existing file** that was already in this repo; left untouched.
