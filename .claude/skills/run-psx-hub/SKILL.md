---
name: run-psx-hub
description: Run, launch, smoke-test, or screenshot the PSX Hub "Card Empire" sports-card dashboard. Use when asked to run psx-hub, start the dashboard, verify the web app works, drive it, or check a change to index.html / assets/app.js / assets/styles.css.
---

# Run PSX Hub — Card Empire

PSX Hub is a **dependency-free static web app** (`index.html` + `assets/app.js` +
`assets/styles.css`). It has no build step and no server — a user just opens
`index.html` in a browser; data persists in `localStorage`.

Because there is no real browser available in this sandbox (see **Gotchas**), the
verified way to *drive* it here is **[driver.mjs](driver.mjs)**, which loads the
real `index.html` + `assets/app.js` into **jsdom** (a real DOM with real event
dispatch) and exercises the same code path a user clicks: boot → load demo →
navigate every section → open a modal → type into a form → assert the live
profit/ROI math → fail on any JS error.

All paths below are relative to the repo root (the `<unit>` dir).

## Prerequisites

Node 22 is already present. The driver needs jsdom (install ad hoc, do not commit):

```bash
npm i --no-save jsdom@24
```

## Run (agent path) — the driver

From the repo root:

```bash
node .claude/skills/run-psx-hub/driver.mjs
```

Expected tail on success (exit code `0`):

```
[5] JS errors during the whole run
  ✓ no JS errors (0)

PASS — all green ✅
```

Any assertion failure or in-page JS error prints `FAIL — …` and exits non-zero.
The driver is self-checking; you do not need to eyeball anything.

Want the rendered DOM as an artifact (closest thing to a screenshot available
here)? Add `--dump`; it writes the post-render HTML to `/tmp/psx-render.html`
(override with `PSX_OUT=/path`):

```bash
node .claude/skills/run-psx-hub/driver.mjs --dump
```

## Run (human path)

Open `index.html` in any browser (double-click, or drag into a tab) and click
**✨ Load Demo**. That is the exact flow the driver automates. Useless headless —
there is no CLI/server entry point.

## Gotchas

- **No real browser in this sandbox — pixel screenshots are not possible.**
  Two paths were both tried and both fail here:
  - `npx playwright install chromium` (and `chromium-headless-shell`) — the
    egress proxy **truncates the CDN download** ("server closed connection,
    size mismatch" around ~165 MB of ~185 MB), every attempt.
  - `apt-get install chromium-browser` — installs only Ubuntu's **snap stub**
    (`/usr/bin/chromium-browser` prints "requires the chromium snap"); snapd
    does not run in the container.

  So jsdom is the harness. If you are in an environment that *does* have a
  Chromium binary, you can screenshot the page directly, e.g.
  `chromium --headless=new --no-sandbox --screenshot=out.png --window-size=1400,1900 file://$PWD/index.html`
  — but that command is **not verified in this sandbox**, so don't assume it.
- **jsdom has no `localStorage` on a `file://` origin.** The driver shims
  `localStorage` (and `URL.createObjectURL`, used by the export buttons) in
  `beforeParse`. Without the shim, `save()` throws on first write.
- **`import { JSDOM } from "jsdom"` resolves up the tree.** The driver lives at
  `.claude/skills/run-psx-hub/driver.mjs`; ESM walks parent dirs and finds
  `node_modules/jsdom` at the repo root. Run it from the repo root (where you
  installed jsdom) and the bare import just works — no `NODE_PATH` needed.
- **"Load Demo" goes through a confirm modal.** Seeding is two clicks: the
  `[data-act='seed']` button, then `#modal-foot [data-ms]` to confirm. Firing
  only the first click does nothing.
- **Demo data is deterministic** — 4 deals, 3 inventory cards, 2 active
  listings, 3 sales, net worth `$9,806`. The driver asserts these exact counts,
  so a change to `seed()` in `app.js` will (correctly) trip them.
- **The live-calc text has no spaces between fields** when read via
  `textContent` (`Total Cost$100Est. Profit+$150ROI150% 🔥`) — it's flex-box
  layout, not whitespace. Match on substrings (`+$150`, `150%`), not exact text.

## Troubleshooting

- `ERR_MODULE_NOT_FOUND: Cannot find package 'jsdom'` → you didn't install it, or
  you're not running from the repo root. Run `npm i --no-save jsdom@24` at the
  repo root, then invoke the driver from there.
- Driver prints `FAIL` with assertion names → a change to `index.html` or
  `assets/app.js` altered behavior the driver checks (e.g. demo counts, KPI
  rendering, the calc preview). Read the `✗` lines; each names the broken flow.
