/* ============================================================================
   PSX Hub — Card Empire
   Sports-card business command center. Vanilla JS, no dependencies, file://-safe.
   Data persists in localStorage. Built to make you rich and keep you organized.
   ============================================================================ */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ utils */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const uid = () => "id_" + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const num = (v) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, "")); return isNaN(n) ? 0 : n; };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const todayISO = () => new Date().toISOString().slice(0, 10);
  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  function money(n, cents) {
    n = Number(n) || 0;
    const opt = cents ? { minimumFractionDigits: 2, maximumFractionDigits: 2 } : { maximumFractionDigits: 0 };
    return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("en-US", opt);
  }
  const pct = (n) => (Number(n) || 0).toFixed(0) + "%";
  const signMoney = (n) => (n > 0 ? "+" : "") + money(n);
  function daysBetween(iso, to) {
    if (!iso) return 0;
    const a = new Date(iso + "T00:00:00"); const b = to ? new Date(to + "T00:00:00") : new Date();
    return Math.max(0, Math.round((b - a) / 86400000));
  }
  function fmtDate(iso) { return iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" }) : "—"; }

  /* --------------------------------------------------------------- platforms */
  // Default marketplace fee presets (editable in Settings). feePct = % of sale, feeFixed = $ per sale.
  const DEFAULT_PLATFORMS = {
    eBay:     { feePct: 13.25, feeFixed: 0.40 },
    Whatnot:  { feePct: 11.0,  feeFixed: 0.30 },
    Mercari:  { feePct: 10.0,  feeFixed: 0.50 },
    COMC:     { feePct: 20.0,  feeFixed: 0.00 },
    StockX:   { feePct: 9.0,   feeFixed: 0.00 },
    Goldin:   { feePct: 14.0,  feeFixed: 0.00 },
    PWCC:     { feePct: 20.0,  feeFixed: 0.00 },
    MySlabs:  { feePct: 0.0,   feeFixed: 0.00 },
    Facebook: { feePct: 0.0,   feeFixed: 0.00 },
    "In Person": { feePct: 0.0, feeFixed: 0.00 },
    Other:    { feePct: 12.0,  feeFixed: 0.30 },
  };
  const SOURCE_PLATFORMS = ["eBay", "Facebook", "Whatnot", "Mercari", "COMC", "OfferUp", "Craigslist", "Card Show", "Auction", "Goldin", "PWCC", "Instagram", "Other"];
  const GRADES = ["Raw", "PSA 10", "PSA 9", "PSA 8", "PSA 7", "BGS 9.5", "BGS 9", "SGC 10", "SGC 9", "CGC 10", "CGC 9", "Other"];

  /* ------------------------------------------------------------------ store */
  const KEY = "psxhub_v1";
  const DEFAULT_SETTINGS = { insaneRoi: 60, targetRoi: 35, defaultPlatform: "eBay", platforms: {} };
  let store = load();

  function blank() {
    return { deals: [], inventory: [], listings: [], sales: [], settings: { ...DEFAULT_SETTINGS, platforms: { ...DEFAULT_PLATFORMS } }, meta: { created: todayISO() } };
  }
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blank();
      const d = JSON.parse(raw);
      d.deals ||= []; d.inventory ||= []; d.listings ||= []; d.sales ||= [];
      d.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
      d.settings.platforms = { ...DEFAULT_PLATFORMS, ...(d.settings.platforms || {}) };
      return d;
    } catch (e) { console.warn("load failed", e); return blank(); }
  }
  let saveTimer;
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) { toast("Save failed: storage full?", "err"); }
    const el = $("#autosave"); if (el) { el.textContent = "Saved ✓ " + new Date().toLocaleTimeString(); el.classList.add("flash"); clearTimeout(saveTimer); saveTimer = setTimeout(() => el.classList.remove("flash"), 900); }
  }
  function platform(name) { return store.settings.platforms[name] || DEFAULT_PLATFORMS.Other; }

  /* ------------------------------------------------------------ computations */
  function dealMetrics(d) {
    const cost = num(d.askPrice) + num(d.shippingCost);
    const profit = num(d.marketValue) - cost;
    const roi = cost > 0 ? profit / cost : 0;
    const score = clamp(Math.round(roi * 60 + 40), 0, 100);
    return { cost, profit, roi: roi * 100, score };
  }
  function feesFor(platformName, salePrice, feePctOverride, feeFixedOverride) {
    const p = platform(platformName);
    const fp = feePctOverride != null && feePctOverride !== "" ? num(feePctOverride) : p.feePct;
    const ff = feeFixedOverride != null && feeFixedOverride !== "" ? num(feeFixedOverride) : p.feeFixed;
    return num(salePrice) * (fp / 100) + ff;
  }
  function listingMetrics(l) {
    const inv = store.inventory.find((i) => i.id === l.inventoryId);
    const basis = inv ? num(inv.costBasis) : num(l.costBasis);
    const fees = feesFor(l.platform, l.listPrice, l.feePct, l.feeFixed);
    const net = num(l.listPrice) - fees - num(l.shippingCost);
    const profit = net - basis;
    const roi = basis > 0 ? (profit / basis) * 100 : 0;
    return { basis, fees, net, profit, roi, age: daysBetween(l.listedDate) };
  }
  function saleMetrics(s) {
    const fees = feesFor(s.platform, s.salePrice, s.feePct, s.feeFixed);
    const net = num(s.salePrice) - fees - num(s.shippingCost);
    const profit = net - num(s.costBasis);
    const roi = num(s.costBasis) > 0 ? (profit / num(s.costBasis)) * 100 : 0;
    const held = s.acquiredDate ? daysBetween(s.acquiredDate, s.soldDate) : null;
    return { fees, net, profit, roi, held };
  }

  function empireStats() {
    const inv = store.inventory.filter((i) => i.status !== "sold");
    const invCost = inv.reduce((a, i) => a + num(i.costBasis) * (num(i.qty) || 1), 0);
    const invValue = inv.reduce((a, i) => a + num(i.marketValue || i.costBasis) * (num(i.qty) || 1), 0);
    const active = store.listings.filter((l) => l.status === "active" || l.status === "pending");
    const listValue = active.reduce((a, l) => a + num(l.listPrice), 0);
    const projNet = active.reduce((a, l) => a + listingMetrics(l).net, 0);
    const realized = store.sales.reduce((a, s) => a + saleMetrics(s).profit, 0);
    const revenue = store.sales.reduce((a, s) => a + num(s.salePrice), 0);
    const feesPaid = store.sales.reduce((a, s) => a + saleMetrics(s).fees + num(s.shippingCost), 0);
    const spent = store.sales.reduce((a, s) => a + num(s.costBasis), 0) + invCost;
    const watching = store.deals.filter((d) => d.status === "watching" || d.status === "hot");
    const dealPotential = watching.reduce((a, d) => a + Math.max(0, dealMetrics(d).profit), 0);
    const soldCount = store.sales.length;
    const sellThrough = soldCount + active.length > 0 ? (soldCount / (soldCount + active.length)) * 100 : 0;
    const avgDays = (() => { const h = store.sales.map((s) => saleMetrics(s).held).filter((x) => x != null); return h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : null; })();
    const netWorth = invValue + listValue + realized;
    return { inv, invCost, invValue, unrealized: invValue - invCost, active, listValue, projNet, realized, revenue, feesPaid, spent, watching, dealPotential, soldCount, sellThrough, avgDays, netWorth };
  }

  /* ------------------------------------------------------------------- toast */
  function toast(msg, type = "ok") {
    const host = $("#toast-host");
    const t = document.createElement("div");
    t.className = "toast " + (type === "err" ? "err" : type === "info" ? "info" : "");
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(() => { t.style.opacity = "0"; t.style.transition = ".3s"; setTimeout(() => t.remove(), 300); }, 2600);
  }

  /* ------------------------------------------------------------------- modal */
  let modalSubmit = null;
  function openModal({ title, body, footer, onSubmit }) {
    $("#modal-title").textContent = title;
    $("#modal-body").innerHTML = body;
    $("#modal-foot").innerHTML = footer || `<button class="btn ghost" data-mc>Cancel</button><button class="btn primary" data-ms>Save</button>`;
    modalSubmit = onSubmit || null;
    $("#modal-overlay").hidden = false;
    const first = $("#modal-body input,#modal-body select,#modal-body textarea"); if (first) setTimeout(() => first.focus(), 50);
  }
  function closeModal() { $("#modal-overlay").hidden = true; modalSubmit = null; }
  function gatherForm() {
    const data = {};
    $$("#modal-body [name]").forEach((el) => { data[el.name] = el.type === "checkbox" ? el.checked : el.value.trim(); });
    return data;
  }
  function confirmAction(msg, onYes, danger) {
    openModal({
      title: "Please confirm",
      body: `<p style="margin:0;color:var(--txt)">${esc(msg)}</p>`,
      footer: `<button class="btn ghost" data-mc>Cancel</button><button class="btn ${danger ? "danger" : "primary"}" data-ms>Yes, continue</button>`,
      onSubmit: () => { closeModal(); onYes(); },
    });
  }

  /* ------------------------------------------------------- form field helper */
  function field(label, name, opts = {}) {
    const { type = "text", value = "", options, required, placeholder = "", step, col2, hint } = opts;
    let input;
    if (options) {
      input = `<select name="${name}">${options.map((o) => { const v = typeof o === "object" ? o.v : o; const l = typeof o === "object" ? o.l : o; return `<option value="${esc(v)}" ${String(value) === String(v) ? "selected" : ""}>${esc(l)}</option>`; }).join("")}</select>`;
    } else if (type === "textarea") {
      input = `<textarea name="${name}" rows="2" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`;
    } else {
      input = `<input class="input" type="${type}" name="${name}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${step ? `step="${step}"` : ""} ${type === "number" ? 'inputmode="decimal"' : ""}/>`;
    }
    return `<label class="field ${col2 ? "col-2" : ""}"><span>${esc(label)}${required ? " <b>*</b>" : ""}</span>${input}${hint ? `<span class="tiny" style="color:var(--muted-2)">${esc(hint)}</span>` : ""}</label>`;
  }

  /* -------------------------------------------------------------- table util */
  const sortState = {}; // view -> {key, dir}
  function sortRows(view, rows, cols) {
    const st = sortState[view]; if (!st) return rows;
    const col = cols.find((c) => c.key === st.key); if (!col) return rows;
    const get = col.sortVal || ((r) => r[st.key]);
    return [...rows].sort((a, a2) => { let x = get(a), y = get(a2); if (typeof x === "string" && typeof y === "string") return st.dir * x.localeCompare(y); return st.dir * ((x || 0) - (y || 0)); });
  }
  function renderTable(view, cols, rows, search) {
    if (search) { const q = search.toLowerCase(); rows = rows.filter((r) => cols.some((c) => { const sv = c.search ? c.search(r) : r[c.key]; return String(sv == null ? "" : sv).toLowerCase().includes(q); })); }
    rows = sortRows(view, rows, cols);
    if (!rows.length) return `<div class="empty"><div class="big">📭</div><h3>Nothing here yet</h3><p>Add your first record to start tracking.</p></div>`;
    const st = sortState[view];
    const head = cols.map((c) => `<th class="${c.cls || ""} ${c.sortable === false ? "no-sort" : ""}" data-sort="${c.key}">${esc(c.label)}${st && st.key === c.key ? ` <span class="arrow">${st.dir > 0 ? "▲" : "▼"}</span>` : ""}</th>`).join("");
    const bodyRows = rows.map((r) => `<tr data-id="${r.id}">${cols.map((c) => `<td class="${c.cls || ""}">${c.render(r)}</td>`).join("")}</tr>`).join("");
    return `<div class="panel"><div class="table-wrap"><table><thead><tr>${head}</tr></thead><tbody>${bodyRows}</tbody></table></div></div>`;
  }
  function scoreBar(score) {
    const color = score >= 80 ? "var(--green)" : score >= 60 ? "var(--gold)" : score >= 45 ? "var(--blue)" : "var(--red)";
    return `<div class="score"><div class="bar"><i style="width:${score}%;background:${color}"></i></div><b style="color:${color}">${score}</b></div>`;
  }
  function rowActions(btns) { return `<div class="row-actions">${btns}</div>`; }

  /* ===========================================================================
                                     VIEWS
     =========================================================================== */
  let current = "dashboard";
  const viewSearch = {};

  const TITLES = {
    dashboard: ["Dashboard", "Your empire at a glance"],
    deals: ["Deal Hunter", "Track insane online deals before anyone else"],
    inventory: ["Inventory", "Everything you own and what it's worth"],
    listings: ["Listings", "What's live, where, and the net you'll pocket"],
    sales: ["Sales", "Realized profit and your best flips"],
    settings: ["Settings", "Fees, targets, and data backup"],
  };

  function setView(v) {
    current = v;
    $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
    $("#view-title").textContent = TITLES[v][0];
    $("#view-sub").textContent = TITLES[v][1];
    render();
  }

  function render() {
    updateBadges();
    const c = $("#content");
    const actions = $("#topbar-actions");
    actions.innerHTML = "";
    if (current === "dashboard") { c.innerHTML = viewDashboard(); actions.innerHTML = `<button class="btn" data-act="seed">✨ Load Demo</button><button class="btn primary" data-act="add-deal">＋ Log Deal</button>`; }
    else if (current === "deals") { c.innerHTML = viewDeals(); actions.innerHTML = `<button class="btn primary" data-act="add-deal">＋ Log Deal</button>`; }
    else if (current === "inventory") { c.innerHTML = viewInventory(); actions.innerHTML = `<button class="btn primary" data-act="add-inv">＋ Add Card</button>`; }
    else if (current === "listings") { c.innerHTML = viewListings(); actions.innerHTML = `<button class="btn primary" data-act="add-listing">＋ New Listing</button>`; }
    else if (current === "sales") { c.innerHTML = viewSales(); actions.innerHTML = `<button class="btn primary" data-act="add-sale">＋ Log Sale</button>`; }
    else if (current === "settings") { c.innerHTML = viewSettings(); }
    $("#side-networth").textContent = money(empireStats().netWorth);
  }

  function updateBadges() {
    $("#badge-deals").textContent = store.deals.filter((d) => d.status === "watching" || d.status === "hot").length || "";
    $("#badge-inventory").textContent = store.inventory.filter((i) => i.status !== "sold").length || "";
    $("#badge-listings").textContent = store.listings.filter((l) => l.status === "active" || l.status === "pending").length || "";
    $("#badge-sales").textContent = store.sales.length || "";
  }

  /* ------------------------------------------------------------- DASHBOARD */
  function viewDashboard() {
    const s = empireStats();
    if (!store.deals.length && !store.inventory.length && !store.sales.length) {
      return `<div class="panel panel-pad empty"><div class="big">💎</div><h3>Welcome to your Card Empire</h3>
        <p style="max-width:460px;margin:0 auto 18px">Log online deals, track every card you own, manage listings, and watch your realized profit grow. Everything saves automatically in this browser.</p>
        <div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">
          <button class="btn primary" data-act="add-deal">＋ Log your first deal</button>
          <button class="btn" data-act="seed">✨ Load demo data</button>
        </div></div>`;
    }
    const kpi = (cls, label, value, sub, glow) => `<div class="kpi ${cls}" style="--glow:${glow || "rgba(244,197,66,.16)"}"><div class="k-label">${label}</div><div class="k-value">${value}</div><div class="k-sub">${sub}</div></div>`;

    const kpis = `<div class="kpis">
      ${kpi("good", "💎 Inventory Value", money(s.invValue), `${s.inv.length} cards · cost ${money(s.invCost)}`, "rgba(39,209,141,.18)")}
      ${kpi(s.unrealized >= 0 ? "good" : "bad", "📈 Unrealized P/L", signMoney(s.unrealized), `if you sold today`, "rgba(74,168,255,.18)")}
      ${kpi("gold", "💰 Realized Profit", signMoney(s.realized), `${s.soldCount} flips · ${money(s.revenue)} revenue`, "rgba(244,197,66,.2)")}
      ${kpi("", "🏷️ Live Listings", money(s.listValue), `${s.active.length} active · ${money(s.projNet)} projected net`, "rgba(157,123,255,.18)")}
    </div>
    <div class="kpis">
      ${kpi("gold", "🔥 Deal Pipeline", money(s.dealPotential), `${s.watching.length} deals · potential profit`, "rgba(255,122,60,.2)")}
      ${kpi("", "🔁 Sell-Through", pct(s.sellThrough), `sold vs listed`, "rgba(74,168,255,.14)")}
      ${kpi("", "⏱️ Avg Days to Sell", s.avgDays == null ? "—" : s.avgDays + "d", `velocity of your flips`, "rgba(157,123,255,.14)")}
      ${kpi(s.netWorth >= 0 ? "good" : "bad", "👑 Empire Net Worth", money(s.netWorth), `inventory + listings + realized`, "rgba(244,197,66,.22)")}
    </div>`;

    // best live deals
    const bestDeals = [...s.watching].map((d) => ({ d, m: dealMetrics(d) })).sort((a, b) => b.m.roi - a.m.roi).slice(0, 5);
    const dealsPanel = `<div class="panel"><div class="panel-head"><h3>🔥 Hottest Live Deals</h3><button class="btn sm ghost" data-goto="deals">View all →</button></div>
      <div class="panel-pad" style="padding-top:8px">${bestDeals.length ? bestDeals.map(({ d, m }) => `
        <div class="alert ${m.roi >= store.settings.insaneRoi ? "hot" : ""}">
          <div class="ico">${m.roi >= store.settings.insaneRoi ? "🤑" : "👀"}</div>
          <div class="txt"><b>${esc(d.card || "Untitled")}</b> on ${esc(d.source || "—")} — buy ${money(m.cost)}, worth ${money(num(d.marketValue))}
            <div class="tiny muted">Potential profit ${signMoney(m.profit)} · ROI ${pct(m.roi)}</div></div>
          <div>${scoreBar(m.score)}</div>
        </div>`).join("") : `<div class="muted tiny">No deals being watched. Log one to start hunting. 🏹</div>`}</div></div>`;

    // profit by month chart
    const months = lastMonths(6);
    const profByMonth = months.map((mk) => store.sales.filter((x) => (x.soldDate || "").slice(0, 7) === mk.key).reduce((a, x) => a + saleMetrics(x).profit, 0));
    const maxP = Math.max(1, ...profByMonth.map(Math.abs));
    const chart = `<div class="panel"><div class="panel-head"><h3>📈 Realized Profit (6 mo)</h3><span class="tiny muted">Total ${signMoney(profByMonth.reduce((a, b) => a + b, 0))}</span></div>
      <div class="panel-pad"><div class="bar-chart">${months.map((mk, i) => { const v = profByMonth[i]; const h = (Math.abs(v) / maxP) * 100; return `<div class="bar-col"><div class="val">${v ? money(v) : ""}</div><div class="bwrap"><div class="b ${v >= 0 ? "green" : ""}" style="height:${h}%;${v < 0 ? "background:linear-gradient(180deg,var(--red),#7a0f1f)" : ""}"></div></div><div class="lbl">${mk.label}</div></div>`; }).join("")}</div></div></div>`;

    // inventory by grade legend + alerts
    const alerts = buildAlerts(s);
    const alertsPanel = `<div class="panel"><div class="panel-head"><h3>🛎️ Action Center</h3></div><div class="panel-pad"><div class="alerts">${alerts.length ? alerts.join("") : `<div class="muted tiny">All clear. Go find more deals. 🚀</div>`}</div></div></div>`;

    return kpis + `<div class="dash-grid">${dealsPanel}${alertsPanel}<div class="full">${chart}</div></div>`;
  }

  function lastMonths(n) {
    const out = []; const d = new Date();
    for (let i = n - 1; i >= 0; i--) { const m = new Date(d.getFullYear(), d.getMonth() - i, 1); out.push({ key: m.toISOString().slice(0, 7), label: m.toLocaleDateString("en-US", { month: "short" }) }); }
    return out;
  }
  function buildAlerts(s) {
    const a = [];
    // insane deals
    s.watching.forEach((d) => { const m = dealMetrics(d); if (m.roi >= store.settings.insaneRoi) a.push(`<div class="alert hot"><div class="ico">🤑</div><div class="txt"><b>INSANE DEAL:</b> ${esc(d.card)} — ${pct(m.roi)} ROI (${signMoney(m.profit)}). Snag it!</div></div>`); });
    // stale listings
    s.active.forEach((l) => { const m = listingMetrics(l); if (m.age >= 45) { const inv = store.inventory.find((i) => i.id === l.inventoryId); a.push(`<div class="alert"><div class="ico">🐌</div><div class="txt"><b>Stale listing:</b> ${esc(inv ? inv.card : l.platform)} listed ${m.age}d on ${esc(l.platform)}. Consider a price drop.</div></div>`); } });
    // losing money on a listing
    s.active.forEach((l) => { const m = listingMetrics(l); if (m.profit < 0) { const inv = store.inventory.find((i) => i.id === l.inventoryId); a.push(`<div class="alert"><div class="ico">⚠️</div><div class="txt"><b>Underwater:</b> ${esc(inv ? inv.card : l.platform)} would net ${signMoney(m.profit)} at list price.</div></div>`); } });
    // unlisted inventory aging
    s.inv.filter((i) => i.status === "in_stock" && daysBetween(i.acquiredDate) >= 30).forEach((i) => a.push(`<div class="alert"><div class="ico">📦</div><div class="txt"><b>Sitting in stock:</b> ${esc(i.card)} held ${daysBetween(i.acquiredDate)}d and not listed. Get it live.</div></div>`));
    return a.slice(0, 8);
  }

  /* ------------------------------------------------------------------ DEALS */
  function dealStatusPill(st) {
    return { watching: '<span class="pill blue">👀 Watching</span>', hot: '<span class="pill fire">🔥 Hot</span>', bought: '<span class="pill green">✅ Bought</span>', passed: '<span class="pill gray">✖ Passed</span>' }[st] || st;
  }
  function viewDeals() {
    const cols = [
      { key: "card", label: "Card", search: (r) => `${r.card} ${r.player} ${r.year} ${r.set}`, render: (r) => `<div class="cell-main">${esc(r.card || "Untitled")}</div><div class="cell-sub">${esc([r.year, r.set, r.grade].filter(Boolean).join(" · ")) || "—"}</div>` },
      { key: "source", label: "Source", render: (r) => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.source || "link")} ↗</a>` : esc(r.source || "—") },
      { key: "askPrice", label: "Ask", cls: "right", sortVal: (r) => num(r.askPrice), render: (r) => `<span class="money">${money(num(r.askPrice))}</span>` },
      { key: "marketValue", label: "Market", cls: "right", sortVal: (r) => num(r.marketValue), render: (r) => `<span class="money">${money(num(r.marketValue))}</span>` },
      { key: "profit", label: "Profit", cls: "right", sortVal: (r) => dealMetrics(r).profit, render: (r) => { const m = dealMetrics(r); return `<span class="money ${m.profit >= 0 ? "pos" : "neg"}">${signMoney(m.profit)}</span>`; } },
      { key: "roi", label: "ROI", cls: "right", sortVal: (r) => dealMetrics(r).roi, render: (r) => { const m = dealMetrics(r); return `<span class="money ${m.roi >= store.settings.insaneRoi ? "pos" : ""}">${pct(m.roi)} ${m.roi >= store.settings.insaneRoi ? "🔥" : ""}</span>`; } },
      { key: "score", label: "Deal Score", sortVal: (r) => dealMetrics(r).score, render: (r) => scoreBar(dealMetrics(r).score) },
      { key: "status", label: "Status", render: (r) => dealStatusPill(r.status) },
      { key: "act", label: "", sortable: false, cls: "right", render: (r) => rowActions(`${r.status !== "bought" ? `<button class="btn sm green" data-act="buy-deal" data-id="${r.id}">Buy →</button>` : ""}<button class="icon-btn" data-act="edit-deal" data-id="${r.id}">✏️</button><button class="icon-btn" data-act="del-deal" data-id="${r.id}">🗑️</button>`) },
    ];
    return toolbar("deals", "Search deals…") + renderTable("deals", cols, store.deals, viewSearch.deals);
  }
  function dealForm(d = {}) {
    return `<div class="form-grid">
      ${field("Card / Title", "card", { value: d.card, required: true, placeholder: "2018 Luka Doncic Prizm RC", col2: true })}
      ${field("Player", "player", { value: d.player })}
      ${field("Year", "year", { value: d.year, placeholder: "2018" })}
      ${field("Set / Product", "set", { value: d.set, placeholder: "Panini Prizm" })}
      ${field("Grade", "grade", { value: d.grade || "Raw", options: GRADES })}
      ${field("Source", "source", { value: d.source || "eBay", options: SOURCE_PLATFORMS })}
      ${field("Status", "status", { value: d.status || "watching", options: [{ v: "watching", l: "👀 Watching" }, { v: "hot", l: "🔥 Hot" }, { v: "bought", l: "✅ Bought" }, { v: "passed", l: "✖ Passed" }] })}
      ${field("Ask Price ($)", "askPrice", { value: d.askPrice, type: "number", step: "0.01" })}
      ${field("Shipping ($)", "shippingCost", { value: d.shippingCost, type: "number", step: "0.01" })}
      ${field("Market / Comp Value ($)", "marketValue", { value: d.marketValue, type: "number", step: "0.01", hint: "What it really sells for" })}
      ${field("Listing URL", "url", { value: d.url, placeholder: "https://…", col2: true })}
      ${field("Notes", "notes", { value: d.notes, type: "textarea", col2: true })}
    </div>
    <div class="calc-preview" id="deal-calc"></div>`;
  }
  function wireDealCalc() {
    const upd = () => { const d = gatherForm(); const m = dealMetrics(d); const el = $("#deal-calc"); if (!el) return;
      el.innerHTML = `<div class="ci"><span>Total Cost</span><b>${money(m.cost)}</b></div><div class="ci"><span>Est. Profit</span><b class="${m.profit >= 0 ? "pos" : "neg"}">${signMoney(m.profit)}</b></div><div class="ci"><span>ROI</span><b class="${m.roi >= store.settings.insaneRoi ? "pos" : ""}">${pct(m.roi)} ${m.roi >= store.settings.insaneRoi ? "🔥" : ""}</b></div>`; };
    $$("#modal-body [name]").forEach((el) => el.addEventListener("input", upd)); upd();
  }
  function openDeal(id) {
    const d = id ? store.deals.find((x) => x.id === id) : {};
    openModal({ title: id ? "Edit Deal" : "Log a Deal", body: dealForm(d), onSubmit: () => {
      const f = gatherForm(); if (!f.card) return toast("Card name required", "err");
      if (id) Object.assign(d, f); else store.deals.push({ id: uid(), createdAt: todayISO(), ...f });
      save(); closeModal(); render(); toast(id ? "Deal updated" : "Deal logged 🔥");
    } });
    wireDealCalc();
  }

  /* -------------------------------------------------------------- INVENTORY */
  function invStatusPill(st) { return { in_stock: '<span class="pill gold">📦 In Stock</span>', listed: '<span class="pill blue">🏷️ Listed</span>', sold: '<span class="pill gray">💰 Sold</span>' }[st] || st; }
  function viewInventory() {
    const cols = [
      { key: "card", label: "Card", search: (r) => `${r.card} ${r.player} ${r.year} ${r.set} ${r.location}`, render: (r) => `<div class="cell-main">${esc(r.card || "Untitled")}</div><div class="cell-sub">${esc([r.year, r.set, r.grade].filter(Boolean).join(" · ")) || "—"}${(num(r.qty) || 1) > 1 ? ` · ×${num(r.qty)}` : ""}</div>` },
      { key: "grade", label: "Grade", render: (r) => `<span class="pill gray">${esc(r.grade || "Raw")}</span>` },
      { key: "costBasis", label: "Cost", cls: "right", sortVal: (r) => num(r.costBasis), render: (r) => `<span class="money">${money(num(r.costBasis))}</span>` },
      { key: "marketValue", label: "Market", cls: "right", sortVal: (r) => num(r.marketValue), render: (r) => `<span class="money">${money(num(r.marketValue || r.costBasis))}</span>` },
      { key: "gain", label: "Unrealized", cls: "right", sortVal: (r) => (num(r.marketValue || r.costBasis) - num(r.costBasis)) * (num(r.qty) || 1), render: (r) => { const g = (num(r.marketValue || r.costBasis) - num(r.costBasis)) * (num(r.qty) || 1); return `<span class="money ${g >= 0 ? "pos" : "neg"}">${signMoney(g)}</span>`; } },
      { key: "acquiredDate", label: "Held", cls: "right", sortVal: (r) => -daysBetween(r.acquiredDate), render: (r) => `<span class="tiny muted">${r.acquiredDate ? daysBetween(r.acquiredDate) + "d" : "—"}</span>` },
      { key: "location", label: "Location", render: (r) => esc(r.location || "—") },
      { key: "status", label: "Status", render: (r) => invStatusPill(r.status) },
      { key: "act", label: "", sortable: false, cls: "right", render: (r) => rowActions(`${r.status === "in_stock" ? `<button class="btn sm" data-act="list-inv" data-id="${r.id}">List 🏷️</button>` : ""}${r.status !== "sold" ? `<button class="btn sm green" data-act="sell-inv" data-id="${r.id}">Sell 💰</button>` : ""}<button class="icon-btn" data-act="edit-inv" data-id="${r.id}">✏️</button><button class="icon-btn" data-act="del-inv" data-id="${r.id}">🗑️</button>`) },
    ];
    const s = empireStats();
    const summary = `<div class="kpis" style="margin-bottom:16px"><div class="kpi good"><div class="k-label">Total Cost Basis</div><div class="k-value">${money(s.invCost)}</div></div><div class="kpi good"><div class="k-label">Market Value</div><div class="k-value">${money(s.invValue)}</div></div><div class="kpi ${s.unrealized >= 0 ? "good" : "bad"}"><div class="k-label">Unrealized P/L</div><div class="k-value">${signMoney(s.unrealized)}</div></div><div class="kpi"><div class="k-label">Cards Owned</div><div class="k-value">${s.inv.length}</div></div></div>`;
    return summary + toolbar("inventory", "Search inventory…") + renderTable("inventory", cols, store.inventory, viewSearch.inventory);
  }
  function invForm(d = {}) {
    return `<div class="form-grid">
      ${field("Card / Title", "card", { value: d.card, required: true, col2: true, placeholder: "2003 LeBron James Topps Chrome RC" })}
      ${field("Player", "player", { value: d.player })}
      ${field("Year", "year", { value: d.year })}
      ${field("Set / Product", "set", { value: d.set })}
      ${field("Grade", "grade", { value: d.grade || "Raw", options: GRADES })}
      ${field("Quantity", "qty", { value: d.qty || 1, type: "number", step: "1" })}
      ${field("Cost Basis ($ each)", "costBasis", { value: d.costBasis, type: "number", step: "0.01", required: true })}
      ${field("Market Value ($ each)", "marketValue", { value: d.marketValue, type: "number", step: "0.01", hint: "Current comp" })}
      ${field("Acquired Date", "acquiredDate", { value: d.acquiredDate || todayISO(), type: "date" })}
      ${field("Storage Location", "location", { value: d.location, placeholder: "Box A / Slab shelf 2" })}
      ${field("Status", "status", { value: d.status || "in_stock", options: [{ v: "in_stock", l: "📦 In Stock" }, { v: "listed", l: "🏷️ Listed" }, { v: "sold", l: "💰 Sold" }] })}
      ${field("Notes", "notes", { value: d.notes, type: "textarea", col2: true })}
    </div>`;
  }
  function openInv(id, prefill) {
    const d = id ? store.inventory.find((x) => x.id === id) : (prefill || {});
    openModal({ title: id ? "Edit Card" : "Add Card to Inventory", body: invForm(d), onSubmit: () => {
      const f = gatherForm(); if (!f.card) return toast("Card name required", "err");
      if (id) Object.assign(d, f); else store.inventory.push({ id: uid(), createdAt: todayISO(), status: "in_stock", ...f });
      save(); closeModal(); render(); toast(id ? "Card updated" : "Card added to inventory 📦");
    } });
  }

  /* --------------------------------------------------------------- LISTINGS */
  function listStatusPill(st) { return { active: '<span class="pill green">🟢 Active</span>', pending: '<span class="pill gold">⏳ Pending</span>', sold: '<span class="pill blue">💰 Sold</span>', ended: '<span class="pill gray">⏹ Ended</span>' }[st] || st; }
  function listingCardName(l) { const inv = store.inventory.find((i) => i.id === l.inventoryId); return inv ? inv.card : l.title || "—"; }
  function viewListings() {
    const cols = [
      { key: "card", label: "Card", search: (r) => `${listingCardName(r)} ${r.platform}`, render: (r) => { const inv = store.inventory.find((i) => i.id === r.inventoryId); return `<div class="cell-main">${esc(listingCardName(r))}</div><div class="cell-sub">${esc(inv ? [inv.year, inv.grade].filter(Boolean).join(" · ") : "")}</div>`; } },
      { key: "platform", label: "Platform", render: (r) => r.url ? `<a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.platform)} ↗</a>` : `<span class="pill purple">${esc(r.platform)}</span>` },
      { key: "listPrice", label: "List Price", cls: "right", sortVal: (r) => num(r.listPrice), render: (r) => `<span class="money">${money(num(r.listPrice))}</span>` },
      { key: "fees", label: "Fees", cls: "right", sortVal: (r) => listingMetrics(r).fees, render: (r) => `<span class="money neg">-${money(listingMetrics(r).fees)}</span>` },
      { key: "net", label: "Net", cls: "right", sortVal: (r) => listingMetrics(r).net, render: (r) => `<span class="money">${money(listingMetrics(r).net)}</span>` },
      { key: "profit", label: "Profit", cls: "right", sortVal: (r) => listingMetrics(r).profit, render: (r) => { const m = listingMetrics(r); return `<span class="money ${m.profit >= 0 ? "pos" : "neg"}">${signMoney(m.profit)}</span>`; } },
      { key: "age", label: "Age", cls: "right", sortVal: (r) => listingMetrics(r).age, render: (r) => { const a = listingMetrics(r).age; return `<span class="tiny ${a >= 45 ? "neg" : "muted"}">${a}d</span>`; } },
      { key: "status", label: "Status", render: (r) => listStatusPill(r.status) },
      { key: "act", label: "", sortable: false, cls: "right", render: (r) => rowActions(`${r.status !== "sold" ? `<button class="btn sm green" data-act="sold-listing" data-id="${r.id}">Sold 💰</button>` : ""}<button class="icon-btn" data-act="edit-listing" data-id="${r.id}">✏️</button><button class="icon-btn" data-act="del-listing" data-id="${r.id}">🗑️</button>`) },
    ];
    const s = empireStats();
    const summary = `<div class="kpis" style="margin-bottom:16px"><div class="kpi"><div class="k-label">Active Listings</div><div class="k-value">${s.active.length}</div></div><div class="kpi gold"><div class="k-label">Listed Value</div><div class="k-value">${money(s.listValue)}</div></div><div class="kpi good"><div class="k-label">Projected Net</div><div class="k-value">${money(s.projNet)}</div></div><div class="kpi good"><div class="k-label">Projected Profit</div><div class="k-value">${signMoney(s.active.reduce((a, l) => a + listingMetrics(l).profit, 0))}</div></div></div>`;
    return summary + toolbar("listings", "Search listings…") + renderTable("listings", cols, store.listings, viewSearch.listings);
  }
  function invOptions(selectedId) { const opts = store.inventory.filter((i) => i.status !== "sold" || i.id === selectedId).map((i) => ({ v: i.id, l: `${i.card} (${i.grade || "Raw"}) — cost ${money(num(i.costBasis))}` })); return [{ v: "", l: "— none / manual —" }, ...opts]; }
  function listingForm(d = {}) {
    return `<div class="form-grid">
      ${field("Inventory Item", "inventoryId", { value: d.inventoryId, options: invOptions(d.inventoryId), col2: true, hint: "Links cost basis for accurate profit" })}
      ${field("Title (if no item)", "title", { value: d.title, col2: true, placeholder: "Optional manual title" })}
      ${field("Platform", "platform", { value: d.platform || store.settings.defaultPlatform, options: Object.keys(store.settings.platforms) })}
      ${field("List Price ($)", "listPrice", { value: d.listPrice, type: "number", step: "0.01", required: true })}
      ${field("Listed Date", "listedDate", { value: d.listedDate || todayISO(), type: "date" })}
      ${field("Status", "status", { value: d.status || "active", options: [{ v: "active", l: "🟢 Active" }, { v: "pending", l: "⏳ Pending" }, { v: "ended", l: "⏹ Ended" }] })}
      ${field("Fee % (blank = preset)", "feePct", { value: d.feePct, type: "number", step: "0.01" })}
      ${field("Fixed Fee $ (blank = preset)", "feeFixed", { value: d.feeFixed, type: "number", step: "0.01" })}
      ${field("Your Shipping Cost ($)", "shippingCost", { value: d.shippingCost, type: "number", step: "0.01" })}
      ${field("Cost Basis ($, if manual)", "costBasis", { value: d.costBasis, type: "number", step: "0.01", hint: "Used only if no item linked" })}
      ${field("Listing URL", "url", { value: d.url, col2: true, placeholder: "https://…" })}
    </div><div class="calc-preview" id="list-calc"></div>`;
  }
  function wireListCalc() {
    const upd = () => { const m = listingMetrics(gatherForm()); const el = $("#list-calc"); if (!el) return;
      el.innerHTML = `<div class="ci"><span>Fees</span><b class="neg">-${money(m.fees)}</b></div><div class="ci"><span>Net Proceeds</span><b>${money(m.net)}</b></div><div class="ci"><span>Profit</span><b class="${m.profit >= 0 ? "pos" : "neg"}">${signMoney(m.profit)} (${pct(m.roi)})</b></div>`; };
    $$("#modal-body [name]").forEach((el) => { el.addEventListener("input", upd); el.addEventListener("change", upd); }); upd();
  }
  function openListing(id, prefillInvId) {
    const d = id ? store.listings.find((x) => x.id === id) : { inventoryId: prefillInvId || "" };
    openModal({ title: id ? "Edit Listing" : "New Listing", body: listingForm(d), onSubmit: () => {
      const f = gatherForm(); if (!num(f.listPrice)) return toast("List price required", "err");
      if (id) Object.assign(d, f); else { store.listings.push({ id: uid(), createdAt: todayISO(), ...f }); if (f.inventoryId) { const inv = store.inventory.find((i) => i.id === f.inventoryId); if (inv && inv.status === "in_stock") inv.status = "listed"; } }
      save(); closeModal(); render(); toast(id ? "Listing updated" : "Listing created 🏷️");
    } });
    wireListCalc();
  }

  /* ------------------------------------------------------------------ SALES */
  function viewSales() {
    const cols = [
      { key: "card", label: "Card", search: (r) => `${r.card} ${r.platform} ${r.buyer}`, render: (r) => `<div class="cell-main">${esc(r.card || "—")}</div><div class="cell-sub">${esc(r.grade || "")}${r.buyer ? " · " + esc(r.buyer) : ""}</div>` },
      { key: "platform", label: "Platform", render: (r) => `<span class="pill purple">${esc(r.platform)}</span>` },
      { key: "soldDate", label: "Sold", cls: "right", sortVal: (r) => r.soldDate, render: (r) => `<span class="tiny muted">${fmtDate(r.soldDate)}</span>` },
      { key: "salePrice", label: "Sale", cls: "right", sortVal: (r) => num(r.salePrice), render: (r) => `<span class="money">${money(num(r.salePrice))}</span>` },
      { key: "costBasis", label: "Cost", cls: "right", sortVal: (r) => num(r.costBasis), render: (r) => `<span class="money">${money(num(r.costBasis))}</span>` },
      { key: "fees", label: "Fees+Ship", cls: "right", sortVal: (r) => saleMetrics(r).fees + num(r.shippingCost), render: (r) => `<span class="money neg">-${money(saleMetrics(r).fees + num(r.shippingCost))}</span>` },
      { key: "profit", label: "Profit", cls: "right", sortVal: (r) => saleMetrics(r).profit, render: (r) => { const m = saleMetrics(r); return `<span class="money ${m.profit >= 0 ? "pos" : "neg"}"><b>${signMoney(m.profit)}</b></span>`; } },
      { key: "roi", label: "ROI", cls: "right", sortVal: (r) => saleMetrics(r).roi, render: (r) => { const m = saleMetrics(r); return `<span class="money ${m.roi >= 0 ? "pos" : "neg"}">${pct(m.roi)}</span>`; } },
      { key: "act", label: "", sortable: false, cls: "right", render: (r) => rowActions(`<button class="icon-btn" data-act="edit-sale" data-id="${r.id}">✏️</button><button class="icon-btn" data-act="del-sale" data-id="${r.id}">🗑️</button>`) },
    ];
    const s = empireStats();
    const summary = `<div class="kpis" style="margin-bottom:16px"><div class="kpi"><div class="k-label">Total Revenue</div><div class="k-value">${money(s.revenue)}</div></div><div class="kpi bad"><div class="k-label">Fees + Shipping Paid</div><div class="k-value">${money(s.feesPaid)}</div></div><div class="kpi gold"><div class="k-label">Realized Profit</div><div class="k-value">${signMoney(s.realized)}</div></div><div class="kpi good"><div class="k-label">Avg ROI / Flip</div><div class="k-value">${pct(store.sales.length ? store.sales.reduce((a, x) => a + saleMetrics(x).roi, 0) / store.sales.length : 0)}</div></div></div>`;
    return summary + toolbar("sales", "Search sales…") + renderTable("sales", cols, store.sales, viewSearch.sales);
  }
  function saleForm(d = {}) {
    return `<div class="form-grid">
      ${field("Card / Title", "card", { value: d.card, required: true, col2: true })}
      ${field("Grade", "grade", { value: d.grade || "Raw", options: GRADES })}
      ${field("Platform", "platform", { value: d.platform || store.settings.defaultPlatform, options: Object.keys(store.settings.platforms) })}
      ${field("Sale Price ($)", "salePrice", { value: d.salePrice, type: "number", step: "0.01", required: true })}
      ${field("Cost Basis ($)", "costBasis", { value: d.costBasis, type: "number", step: "0.01" })}
      ${field("Fee % (blank = preset)", "feePct", { value: d.feePct, type: "number", step: "0.01" })}
      ${field("Fixed Fee $ (blank = preset)", "feeFixed", { value: d.feeFixed, type: "number", step: "0.01" })}
      ${field("Your Shipping Cost ($)", "shippingCost", { value: d.shippingCost, type: "number", step: "0.01" })}
      ${field("Sold Date", "soldDate", { value: d.soldDate || todayISO(), type: "date" })}
      ${field("Acquired Date", "acquiredDate", { value: d.acquiredDate, type: "date", hint: "For hold-time" })}
      ${field("Buyer", "buyer", { value: d.buyer })}
      ${field("Notes", "notes", { value: d.notes, type: "textarea", col2: true })}
    </div><div class="calc-preview" id="sale-calc"></div>`;
  }
  function wireSaleCalc() {
    const upd = () => { const m = saleMetrics(gatherForm()); const el = $("#sale-calc"); if (!el) return;
      el.innerHTML = `<div class="ci"><span>Fees</span><b class="neg">-${money(m.fees)}</b></div><div class="ci"><span>Net</span><b>${money(m.net)}</b></div><div class="ci"><span>Profit</span><b class="${m.profit >= 0 ? "pos" : "neg"}">${signMoney(m.profit)} (${pct(m.roi)})</b></div>`; };
    $$("#modal-body [name]").forEach((el) => { el.addEventListener("input", upd); el.addEventListener("change", upd); }); upd();
  }
  function openSale(id, prefill) {
    const d = id ? store.sales.find((x) => x.id === id) : (prefill || {});
    openModal({ title: id ? "Edit Sale" : "Log a Sale", body: saleForm(d), onSubmit: () => {
      const f = gatherForm(); if (!f.card) return toast("Card name required", "err"); if (!num(f.salePrice)) return toast("Sale price required", "err");
      if (id) Object.assign(d, f); else store.sales.push({ id: uid(), createdAt: todayISO(), ...f });
      save(); closeModal(); render(); toast(id ? "Sale updated" : "Sale logged 💰 cha-ching!");
    } });
    wireSaleCalc();
  }

  /* -------------------------------------------------------- WORKFLOW ACTIONS */
  function buyDeal(id) {
    const d = store.deals.find((x) => x.id === id); if (!d) return; d.status = "bought";
    openInv(null, { card: d.card, player: d.player, year: d.year, set: d.set, grade: d.grade, costBasis: num(d.askPrice) + num(d.shippingCost), marketValue: d.marketValue, acquiredDate: todayISO(), notes: d.notes });
    save();
  }
  function sellInventory(id) {
    const inv = store.inventory.find((x) => x.id === id); if (!inv) return;
    const activeListing = store.listings.find((l) => l.inventoryId === id && l.status !== "sold");
    openSale(null, { card: inv.card, grade: inv.grade, costBasis: inv.costBasis, salePrice: activeListing ? activeListing.listPrice : inv.marketValue || inv.costBasis, platform: activeListing ? activeListing.platform : store.settings.defaultPlatform, acquiredDate: inv.acquiredDate, soldDate: todayISO() });
    // mark sold only if the sale was actually logged (validation passed)
    const orig = modalSubmit, before = store.sales.length;
    modalSubmit = () => { orig(); if (store.sales.length > before) { inv.status = "sold"; if (activeListing) activeListing.status = "sold"; save(); render(); } };
  }
  function soldListing(id) {
    const l = store.listings.find((x) => x.id === id); if (!l) return;
    const inv = store.inventory.find((i) => i.id === l.inventoryId);
    const m = listingMetrics(l);
    openSale(null, { card: inv ? inv.card : l.title, grade: inv ? inv.grade : "", costBasis: m.basis, salePrice: l.listPrice, platform: l.platform, feePct: l.feePct, feeFixed: l.feeFixed, shippingCost: l.shippingCost, acquiredDate: inv ? inv.acquiredDate : "", soldDate: todayISO() });
    const orig = modalSubmit, before = store.sales.length;
    modalSubmit = () => { orig(); if (store.sales.length > before) { l.status = "sold"; if (inv) inv.status = "sold"; save(); render(); } };
  }

  /* --------------------------------------------------------------- SETTINGS */
  function viewSettings() {
    const plats = Object.entries(store.settings.platforms).map(([name, p]) => `<div class="fee-row"><div class="lab">${esc(name)}</div><input class="input" data-fee="${esc(name)}" data-k="feePct" type="number" step="0.01" value="${p.feePct}"/><input class="input" data-fee="${esc(name)}" data-k="feeFixed" type="number" step="0.01" value="${p.feeFixed}"/><button class="icon-btn" data-act="del-platform" data-name="${esc(name)}">🗑️</button></div>`).join("");
    const counts = `${store.deals.length} deals · ${store.inventory.length} cards · ${store.listings.length} listings · ${store.sales.length} sales`;
    return `<div class="settings-grid">
      <div class="panel"><div class="panel-head"><h3>🎯 Targets</h3></div><div class="panel-pad">
        <div class="form-grid">
          ${field("“Insane Deal” ROI threshold (%)", "insaneRoi", { value: store.settings.insaneRoi, type: "number", step: "1", hint: "Deals above this get the 🔥 flag" })}
          ${field("Target ROI (%)", "targetRoi", { value: store.settings.targetRoi, type: "number", step: "1" })}
          ${field("Default Platform", "defaultPlatform", { value: store.settings.defaultPlatform, options: Object.keys(store.settings.platforms), col2: true })}
        </div>
        <button class="btn primary" data-act="save-targets" style="margin-top:14px">Save targets</button>
      </div></div>

      <div class="panel"><div class="panel-head"><h3>💾 Data & Backup</h3></div><div class="panel-pad">
        <p class="muted tiny" style="margin-top:0">Your data lives in this browser only (${esc(counts)}). Back it up regularly.</p>
        <div style="display:flex;flex-wrap:wrap;gap:10px;margin-top:8px">
          <button class="btn" data-act="export-json">⬇️ Export backup (JSON)</button>
          <button class="btn" data-act="export-csv">⬇️ Export inventory (CSV)</button>
          <button class="btn" data-act="import-json">⬆️ Import backup</button>
          <button class="btn" data-act="seed">✨ Load demo data</button>
          <button class="btn danger" data-act="wipe">🗑️ Erase everything</button>
        </div>
      </div></div>

      <div class="panel" style="grid-column:1/-1"><div class="panel-head"><h3>🏦 Marketplace Fee Presets</h3><button class="btn sm" data-act="add-platform">＋ Add platform</button></div><div class="panel-pad">
        <div class="fee-row" style="color:var(--muted-2);font-size:11px;text-transform:uppercase;letter-spacing:.06em"><div>Platform</div><div>Fee %</div><div>Fixed $</div><div></div></div>
        ${plats}
        <button class="btn green" data-act="save-fees" style="margin-top:10px">Save fees</button>
      </div></div>
    </div>`;
  }

  /* -------------------------------------------------------- import / export */
  function download(name, content, type) { const b = new Blob([content], { type }); const u = URL.createObjectURL(b); const a = document.createElement("a"); a.href = u; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 500); }
  function exportJSON() { download(`psxhub-backup-${todayISO()}.json`, JSON.stringify(store, null, 2), "application/json"); toast("Backup downloaded 💾"); }
  function exportCSV() {
    const rows = [["Card", "Player", "Year", "Set", "Grade", "Qty", "CostBasis", "MarketValue", "Acquired", "Location", "Status"]];
    store.inventory.forEach((i) => rows.push([i.card, i.player, i.year, i.set, i.grade, i.qty, i.costBasis, i.marketValue, i.acquiredDate, i.location, i.status]));
    const csv = rows.map((r) => r.map((c) => `"${String(c == null ? "" : c).replace(/"/g, '""')}"`).join(",")).join("\n");
    download(`psxhub-inventory-${todayISO()}.csv`, csv, "text/csv"); toast("Inventory CSV downloaded 📄");
  }
  function importJSON() {
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "application/json";
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const d = JSON.parse(r.result); if (!d.inventory && !d.deals) throw 0; store = { ...blank(), ...d }; store.settings = { ...DEFAULT_SETTINGS, ...store.settings }; store.settings.platforms = { ...DEFAULT_PLATFORMS, ...store.settings.platforms }; save(); render(); toast("Backup restored ✅"); } catch (e) { toast("Invalid backup file", "err"); } }; r.readAsText(f); };
    inp.click();
  }

  /* -------------------------------------------------------------- demo seed */
  function seed() {
    confirmAction("Load a set of demo deals, inventory, listings and sales? This is added on top of your current data.", () => {
      const d = (o) => store.deals.push({ id: uid(), createdAt: todayISO(), status: "watching", ...o });
      const i = (o) => { const id = uid(); store.inventory.push({ id, createdAt: todayISO(), status: "in_stock", ...o }); return id; };
      const l = (o) => store.listings.push({ id: uid(), createdAt: todayISO(), status: "active", ...o });
      const sl = (o) => store.sales.push({ id: uid(), createdAt: todayISO(), ...o });
      d({ card: "2018 Luka Doncic Prizm Silver PSA 10", player: "Luka Doncic", year: 2018, set: "Panini Prizm", grade: "PSA 10", source: "eBay", askPrice: 240, shippingCost: 5, marketValue: 420, url: "https://ebay.com", status: "hot", notes: "Underpriced BIN" });
      d({ card: "1986 Jordan Fleer #57 PSA 8", player: "Michael Jordan", year: 1986, set: "Fleer", grade: "PSA 8", source: "Facebook", askPrice: 1500, shippingCost: 0, marketValue: 2100 });
      d({ card: "2020 Justin Herbert Prizm RC Raw", player: "Justin Herbert", year: 2020, set: "Prizm", grade: "Raw", source: "Whatnot", askPrice: 35, shippingCost: 4, marketValue: 60 });
      d({ card: "2017 Patrick Mahomes Optic RC PSA 9", player: "Patrick Mahomes", year: 2017, set: "Donruss Optic", grade: "PSA 9", source: "eBay", askPrice: 600, shippingCost: 0, marketValue: 720, status: "watching" });
      const inv1 = i({ card: "2003 LeBron James Topps Chrome RC PSA 9", player: "LeBron James", year: 2003, set: "Topps Chrome", grade: "PSA 9", qty: 1, costBasis: 3200, marketValue: 4500, acquiredDate: addDays(-60), location: "Slab Vault A" });
      const inv2 = i({ card: "2019 Zion Williamson Prizm RC PSA 10", player: "Zion Williamson", year: 2019, set: "Prizm", grade: "PSA 10", qty: 1, costBasis: 180, marketValue: 260, acquiredDate: addDays(-20), location: "Box B" });
      i({ card: "2021 Trevor Lawrence Prizm RC Raw", player: "Trevor Lawrence", year: 2021, set: "Prizm", grade: "Raw", qty: 4, costBasis: 12, marketValue: 18, acquiredDate: addDays(-50), location: "Bin 3" });
      l({ inventoryId: inv1, platform: "eBay", listPrice: 4500, listedDate: addDays(-12) });
      l({ inventoryId: inv2, platform: "Whatnot", listPrice: 260, listedDate: addDays(-3) });
      sl({ card: "2018 Shohei Ohtani Topps RC PSA 10", grade: "PSA 10", platform: "eBay", salePrice: 320, costBasis: 150, shippingCost: 8, soldDate: addDays(-15), acquiredDate: addDays(-70), buyer: "cardking88" });
      sl({ card: "2016 Ben Simmons Prizm RC Raw", grade: "Raw", platform: "Mercari", salePrice: 45, costBasis: 20, shippingCost: 5, soldDate: addDays(-40), acquiredDate: addDays(-90) });
      sl({ card: "2020 Anthony Edwards Select RC PSA 9", grade: "PSA 9", platform: "eBay", salePrice: 210, costBasis: 95, shippingCost: 7, soldDate: addDays(-75), acquiredDate: addDays(-120) });
      save(); render(); toast("Demo empire loaded ✨");
    });
  }
  function addDays(n) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); }

  /* --------------------------------------------------------------- toolbar */
  function toolbar(view, ph) {
    return `<div class="toolbar"><div class="search"><input class="input" data-search="${view}" placeholder="🔎 ${esc(ph)}" value="${esc(viewSearch[view] || "")}"/></div></div>`;
  }

  /* ------------------------------------------------------------- delegation */
  function del(arr, id, label) { confirmAction(`Delete this ${label}? This can't be undone.`, () => { const ix = arr.findIndex((x) => x.id === id); if (ix >= 0) arr.splice(ix, 1); save(); render(); toast(label + " deleted"); }, true); }

  document.addEventListener("click", (e) => {
    const navBtn = e.target.closest(".nav-item"); if (navBtn) return setView(navBtn.dataset.view);
    const goto = e.target.closest("[data-goto]"); if (goto) return setView(goto.dataset.goto);
    const sortTh = e.target.closest("th[data-sort]"); if (sortTh && !sortTh.classList.contains("no-sort")) { const k = sortTh.dataset.sort; const st = sortState[current] || { key: null, dir: 1 }; sortState[current] = { key: k, dir: st.key === k ? -st.dir : -1 }; return render(); }

    const a = e.target.closest("[data-act]"); if (!a) {
      if (e.target.id === "modal-overlay") closeModal();
      return;
    }
    const id = a.dataset.id, act = a.dataset.act;
    switch (act) {
      case "add-deal": return openDeal();
      case "edit-deal": return openDeal(id);
      case "del-deal": return del(store.deals, id, "deal");
      case "buy-deal": return buyDeal(id);
      case "add-inv": return openInv();
      case "edit-inv": return openInv(id);
      case "del-inv": return del(store.inventory, id, "card");
      case "list-inv": return openListing(null, id);
      case "sell-inv": return sellInventory(id);
      case "add-listing": return openListing();
      case "edit-listing": return openListing(id);
      case "del-listing": return del(store.listings, id, "listing");
      case "sold-listing": return soldListing(id);
      case "add-sale": return openSale();
      case "edit-sale": return openSale(id);
      case "del-sale": return del(store.sales, id, "sale");
      case "seed": return seed();
      case "export-json": return exportJSON();
      case "export-csv": return exportCSV();
      case "import-json": return importJSON();
      case "wipe": return confirmAction("Erase ALL data permanently? Export a backup first if unsure.", () => { store = blank(); save(); render(); toast("All data erased"); }, true);
      case "save-targets": { const f = gatherForm(); store.settings.insaneRoi = num(f.insaneRoi); store.settings.targetRoi = num(f.targetRoi); store.settings.defaultPlatform = f.defaultPlatform; save(); render(); return toast("Targets saved 🎯"); }
      case "save-fees": { $$("[data-fee]").forEach((el) => { const n = el.dataset.fee, k = el.dataset.k; if (store.settings.platforms[n]) store.settings.platforms[n][k] = num(el.value); }); save(); render(); return toast("Fees saved 🏦"); }
      case "add-platform": return openModal({ title: "Add Platform", body: `<div class="form-grid">${field("Name", "name", { required: true, col2: true })}${field("Fee %", "feePct", { type: "number", step: "0.01", value: 12 })}${field("Fixed Fee $", "feeFixed", { type: "number", step: "0.01", value: 0.3 })}</div>`, onSubmit: () => { const f = gatherForm(); if (!f.name) return toast("Name required", "err"); store.settings.platforms[f.name] = { feePct: num(f.feePct), feeFixed: num(f.feeFixed) }; save(); closeModal(); render(); toast("Platform added"); } });
      case "del-platform": { const n = a.dataset.name; if (DEFAULT_PLATFORMS[n]) return toast("Can't delete a built-in platform", "err"); delete store.settings.platforms[n]; save(); render(); return toast("Platform removed"); }
    }
  });

  document.addEventListener("input", (e) => { const s = e.target.closest("[data-search]"); if (s) { viewSearch[s.dataset.search] = s.value; const v = s.dataset.search; render(); const again = $(`[data-search="${v}"]`); if (again) { again.focus(); again.setSelectionRange(again.value.length, again.value.length); } } });

  // modal buttons
  $("#modal-close").addEventListener("click", closeModal);
  $("#modal-foot").addEventListener("click", (e) => { if (e.target.closest("[data-mc]")) return closeModal(); if (e.target.closest("[data-ms]")) { if (modalSubmit) modalSubmit(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#modal-overlay").hidden) closeModal(); });

  /* ------------------------------------------------------------------- init */
  render();
})();
