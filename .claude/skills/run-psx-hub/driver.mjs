#!/usr/bin/env node
/* ============================================================================
   run-psx-hub driver — drives the Card Empire dashboard in a real DOM (jsdom)
   and asserts it boots, seeds, navigates, computes, and reacts — with zero
   JS errors.

   This is the verified harness for THIS repo. A pixel screenshot via a real
   browser is NOT possible in the sandbox (see SKILL.md → Gotchas): the egress
   proxy truncates Playwright's Chromium download and the apt `chromium-browser`
   is a snap stub. jsdom executes the actual index.html + assets/app.js with
   real event dispatch, so it exercises the same code path a user clicks.

   Usage (from the repo root, after `npm i --no-save jsdom@24`):
       node .claude/skills/run-psx-hub/driver.mjs
       node .claude/skills/run-psx-hub/driver.mjs --dump   # also write rendered HTML

   Exit code 0 = all assertions passed and no JS errors. Non-zero = failure.
   ========================================================================== */
import { JSDOM, VirtualConsole } from "jsdom";
import { readFileSync, writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// repo root = two dirs up from .claude/skills/run-psx-hub/
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const DUMP = process.argv.includes("--dump");
const OUT = process.env.PSX_OUT || "/tmp/psx-render.html";

const fails = [];
const ok = (cond, label) => { console.log(`  ${cond ? "✓" : "✗"} ${label}`); if (!cond) fails.push(label); };

const html = readFileSync(resolve(ROOT, "index.html"), "utf8");

const errors = [];
const vc = new VirtualConsole();
vc.on("jsdomError", (e) => errors.push("jsdomError: " + (e.detail?.message || e.message)));
vc.sendTo({ error: (...a) => errors.push("console.error: " + a.join(" ")), warn() {}, log() {}, info() {}, debug() {} });

const dom = new JSDOM(html, {
  url: pathToFileURL(resolve(ROOT, "index.html")).href,
  runScripts: "dangerously",
  resources: "usable",
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(win) {
    const mem = {};
    win.localStorage = {
      getItem: (k) => (k in mem ? mem[k] : null),
      setItem: (k, v) => { mem[k] = String(v); },
      removeItem: (k) => { delete mem[k]; },
      clear: () => { for (const k in mem) delete mem[k]; },
    };
    win.URL.createObjectURL = () => "blob:x";
    win.URL.revokeObjectURL = () => {};
  },
});

const { window } = dom;
const doc = window.document;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const txt = (s) => (doc.querySelector(s)?.textContent || "").trim();
const fire = (el, type = "click") => el && el.dispatchEvent(new window.Event(type, { bubbles: true }));
const nav = (view) => fire([...doc.querySelectorAll(".nav-item")].find((b) => b.dataset.view === view));
const rows = () => doc.querySelectorAll("#content tbody tr").length;

await wait(300); // let the external assets/app.js load and init

console.log("\n[1] Initial load");
ok(txt("#view-title") === "Dashboard", "lands on Dashboard");
ok(txt("#side-networth") === "$0", "net worth starts at $0");
ok(/Welcome to your Card Empire/.test(doc.querySelector("#content").innerHTML), "empty state renders");

console.log("\n[2] Load demo data (with confirm dialog)");
fire(doc.querySelector("[data-act='seed']"));
await wait(40);
ok(!doc.querySelector("#modal-overlay").hidden, "confirm modal opened");
fire(doc.querySelector("#modal-foot [data-ms]"));   // confirm
await wait(120);
const networth = txt("#side-networth");
ok(/^\$[\d,]+$/.test(networth) && networth !== "$0", `empire net worth computed (${networth})`);
ok(doc.querySelectorAll(".kpi").length >= 8, "dashboard KPIs rendered");
ok(doc.querySelectorAll(".bar-col").length === 6, "6-month profit chart rendered");
ok(doc.querySelectorAll(".alert").length > 0, "action-center alerts rendered");

console.log("\n[3] Navigate every section");
nav("deals"); await wait(40); ok(rows() === 4, "Deal Hunter shows 4 demo deals");
ok((doc.querySelector("#content").innerHTML.match(/🔥/g) || []).length > 0, "insane-deal 🔥 flag present");
nav("inventory"); await wait(40); ok(rows() === 3, "Inventory shows 3 cards");
nav("listings"); await wait(40); ok(rows() === 2, "Listings shows 2 active listings");
nav("sales"); await wait(40); ok(rows() === 3, "Sales shows 3 flips");
nav("settings"); await wait(40); ok(/Marketplace Fee Presets/.test(doc.querySelector("#content").innerHTML), "Settings renders fee presets");

console.log("\n[4] Open Log-Deal modal and verify live profit/ROI calc");
nav("deals"); await wait(30);
fire(doc.querySelector("[data-act='add-deal']")); await wait(30);
const ask = doc.querySelector("#modal-body [name='askPrice']");
const mkt = doc.querySelector("#modal-body [name='marketValue']");
ask.value = "100"; fire(ask, "input");
mkt.value = "250"; fire(mkt, "input");
await wait(20);
const calc = doc.querySelector("#deal-calc")?.textContent.replace(/\s+/g, " ").trim() || "";
console.log("    live calc →", calc);
ok(/\+\$150/.test(calc) && /150%/.test(calc), "ask 100 / market 250 → +$150 profit, 150% ROI");

console.log("\n[5] JS errors during the whole run");
ok(errors.length === 0, `no JS errors (${errors.length})`);
errors.slice(0, 8).forEach((e) => console.log("    !", e));

if (DUMP) {
  nav("dashboard");
  await new Promise((r) => setTimeout(r, 60));
  writeFileSync(OUT, "<!doctype html>\n" + doc.documentElement.outerHTML);
  console.log(`\n[dump] rendered DOM written to ${OUT}`);
}

console.log("\n" + (fails.length ? `FAIL — ${fails.length} assertion(s): ${fails.join("; ")}` : "PASS — all green ✅"));
process.exit(fails.length ? 1 : 0);
