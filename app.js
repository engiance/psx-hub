"use strict";

/* =========================================================================
   Angle Lab
   A private, on-device dashboard: you tap facial landmarks on a photo,
   it computes proportion/symmetry metrics from those points, and turns
   that into camera-angle and lighting suggestions.

   Everything happens in this browser tab. Nothing is uploaded — the
   photo never leaves the canvas, and only small numeric summaries
   (plus an optional low-res thumbnail) are kept in localStorage.
   ========================================================================= */

const STORAGE_KEY = "anglelab.history.v1";

/* ---------------------------------------------------------------------
   Landmark plan — order matters, it's the tap sequence.
   "left / right" always means left/right side OF THE PHOTO as displayed,
   not the subject's anatomical left/right (front-camera selfies are
   often mirrored, so anatomical sides get confusing fast).
--------------------------------------------------------------------- */
const LANDMARKS = [
  { id: "trichion", label: "Hairline", instr: "Tap the center of your hairline, where your forehead meets your hair.", group: "mid" },
  { id: "glabella", label: "Between brows", instr: "Tap the point directly between your eyebrows.", group: "mid" },
  { id: "subnasale", label: "Base of nose", instr: "Tap where the bottom of your nose meets your upper lip.", group: "mid" },
  { id: "menton", label: "Chin", instr: "Tap the very bottom tip of your chin.", group: "mid" },
  { id: "eye1_outer", label: "Left eye, outer corner", instr: "Tap the outer corner of the eye on the LEFT side of the photo.", group: "eye_outer", side: 1 },
  { id: "eye1_inner", label: "Left eye, inner corner", instr: "Tap the inner corner of that same LEFT eye, near the nose.", group: "eye_inner", side: 1 },
  { id: "eye2_inner", label: "Right eye, inner corner", instr: "Tap the inner corner of the eye on the RIGHT side of the photo.", group: "eye_inner", side: 2 },
  { id: "eye2_outer", label: "Right eye, outer corner", instr: "Tap the outer corner of that same RIGHT eye.", group: "eye_outer", side: 2 },
  { id: "ala1", label: "Left nostril edge", instr: "Tap the outer edge of the LEFT nostril.", group: "ala", side: 1 },
  { id: "ala2", label: "Right nostril edge", instr: "Tap the outer edge of the RIGHT nostril.", group: "ala", side: 2 },
  { id: "mouth1", label: "Left mouth corner", instr: "Tap the LEFT corner of your mouth.", group: "mouth", side: 1 },
  { id: "mouth2", label: "Right mouth corner", instr: "Tap the RIGHT corner of your mouth.", group: "mouth", side: 2 },
  { id: "cheek1", label: "Left cheekbone", instr: "Tap the widest point of the LEFT cheekbone.", group: "cheek", side: 1 },
  { id: "cheek2", label: "Right cheekbone", instr: "Tap the widest point of the RIGHT cheekbone.", group: "cheek", side: 2 },
  { id: "jaw1", label: "Left jaw corner", instr: "Tap the corner of the jaw on the LEFT side, where it turns up toward the ear.", group: "jaw", side: 1 },
  { id: "jaw2", label: "Right jaw corner", instr: "Tap the corner of the jaw on the RIGHT side.", group: "jaw", side: 2 },
];

/* ---------------------------------------------------------------------
   State
--------------------------------------------------------------------- */
const state = {
  tab: "dashboard",
  img: null,          // HTMLImageElement of the loaded photo
  points: {},          // id -> {x,y} in natural image pixel space
  stepIndex: 0,
  reviewing: false,
  history: loadHistory(),
};

/* ---------------------------------------------------------------------
   Storage
--------------------------------------------------------------------- */
function loadHistory() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}
function saveHistory() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.history)); }
  catch (e) { /* storage full / unavailable — fail silently, non-critical */ }
}

/* ---------------------------------------------------------------------
   Geometry helpers
--------------------------------------------------------------------- */
function dist(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round1(v) { return Math.round(v * 10) / 10; }

function computeMetrics(p) {
  const midlineX = (p.trichion.x + p.glabella.x + p.subnasale.x + p.menton.x) / 4;
  const faceWidth = dist(p.cheek1, p.cheek2) || 1;
  const faceLength = dist(p.trichion, p.menton);

  // --- Facial thirds ---
  const upper = dist(p.trichion, p.glabella);
  const middle = dist(p.glabella, p.subnasale);
  const lower = dist(p.subnasale, p.menton);
  const thirdsTotal = upper + middle + lower || 1;
  const pctU = (upper / thirdsTotal) * 100;
  const pctM = (middle / thirdsTotal) * 100;
  const pctL = (lower / thirdsTotal) * 100;
  const thirdsDeviation = Math.abs(pctU - 33.33) + Math.abs(pctM - 33.33) + Math.abs(pctL - 33.33);
  const thirdsScore = clamp(100 - thirdsDeviation * 1.3, 0, 100);
  let thirdsLead = "middle";
  if (pctU > pctM && pctU > pctL) thirdsLead = "upper";
  else if (pctL > pctM && pctL > pctU) thirdsLead = "lower";

  // --- Facial fifths (eye spacing) ---
  const eyeW1 = dist(p.eye1_outer, p.eye1_inner);
  const eyeW2 = dist(p.eye2_inner, p.eye2_outer);
  const avgEyeW = (eyeW1 + eyeW2) / 2 || 1;
  const gap = dist(p.eye1_inner, p.eye2_inner);
  const fifthsRatio = gap / avgEyeW;
  const fifthsScore = clamp(100 - Math.abs(fifthsRatio - 1) * 100, 0, 100);

  // --- Symmetry ---
  const pairs = [
    [p.eye1_outer, p.eye2_outer], [p.eye1_inner, p.eye2_inner],
    [p.ala1, p.ala2], [p.mouth1, p.mouth2], [p.cheek1, p.cheek2], [p.jaw1, p.jaw2],
  ];
  let hDiffSum = 0, vDiffSum = 0;
  let leftBias = 0, rightBias = 0; // which side sits closer to midline overall
  pairs.forEach(([L, R]) => {
    const dL = midlineX - L.x;
    const dR = R.x - midlineX;
    hDiffSum += Math.abs(dL - dR);
    vDiffSum += Math.abs(L.y - R.y);
    leftBias += dL; rightBias += dR;
  });
  const asymmetryPct = ((hDiffSum + vDiffSum) / pairs.length / faceWidth) * 100;
  const symmetryScore = clamp(100 - asymmetryPct * 4, 0, 100);
  const fullerSide = leftBias > rightBias ? "left" : "right";

  // --- Canthal tilt ---
  function tilt(outer, inner, side) {
    const run = Math.abs(outer.x - inner.x) || 1;
    const rise = inner.y - outer.y; // positive => outer corner higher => upturned
    return (Math.atan2(rise, run) * 180) / Math.PI;
  }
  const tilt1 = tilt(p.eye1_outer, p.eye1_inner, 1);
  const tilt2 = tilt(p.eye2_outer, p.eye2_inner, 2);
  const avgTilt = (tilt1 + tilt2) / 2;

  // --- Descriptive ratios ---
  const jawCheekRatio = dist(p.jaw1, p.jaw2) / faceWidth;
  const lengthWidthRatio = faceLength / faceWidth;
  const noseMouthRatio = dist(p.ala1, p.ala2) / (dist(p.mouth1, p.mouth2) || 1);

  return {
    thirdsScore: round1(thirdsScore), pctU: round1(pctU), pctM: round1(pctM), pctL: round1(pctL), thirdsLead,
    fifthsScore: round1(fifthsScore), fifthsRatio: round1(fifthsRatio),
    symmetryScore: round1(symmetryScore), fullerSide,
    tilt1: round1(tilt1), tilt2: round1(tilt2), avgTilt: round1(avgTilt),
    jawCheekRatio: round1(jawCheekRatio * 100) / 100,
    lengthWidthRatio: round1(lengthWidthRatio * 100) / 100,
    noseMouthRatio: round1(noseMouthRatio * 100) / 100,
  };
}

/* ---------------------------------------------------------------------
   Tip engine — turns metrics into concrete, kind, actionable suggestions.
   Framing note: facial asymmetry is normal and near-universal; language
   here stays descriptive, not corrective.
--------------------------------------------------------------------- */
function generateTips(m) {
  const tips = [];

  if (m.symmetryScore < 90) {
    tips.push({
      icon: iconTurn(),
      title: `Favor your ${m.fullerSide} side in 3/4 shots`,
      body: `Every face reads slightly differently side to side — completely normal. Turn your ${m.fullerSide === "left" ? "right" : "left"} cheek a little further from the lens (about a 30–45° turn) so the camera sees more of your ${m.fullerSide} side, and compare a few shots to see which you prefer.`,
    });
  } else {
    tips.push({
      icon: iconTurn(),
      title: "Your two sides measure close to even",
      body: "Straight-on shots and 3/4 angles should both work well for you — pick whichever expression feels most natural rather than worrying about which side to show.",
    });
  }

  if (m.thirdsLead === "lower") {
    tips.push({
      icon: iconCamera(),
      title: "Shoot slightly from above eye level",
      body: "Your lower third reads a bit longer relative to the rest of your face. Raising the camera a few inches above eye level and tilting your chin down slightly shortens that lower-face impression in photos.",
    });
  } else if (m.thirdsLead === "upper") {
    tips.push({
      icon: iconCamera(),
      title: "Try eye-level or slightly below",
      body: "Your upper third (forehead) reads a bit larger relative to the rest of your face. A hairstyle with some volume/fringe, or a slightly lower camera angle, balances that in photos.",
    });
  } else {
    tips.push({
      icon: iconCamera(),
      title: "Your thirds are close to balanced",
      body: "Most standard angles — eye-level, slightly above — will look proportionate. Focus your angle choices on lighting and expression instead.",
    });
  }

  if (m.lengthWidthRatio >= 1.55) {
    tips.push({
      icon: iconFace(),
      title: "Longer face shape — soften with fill light",
      body: "Use soft, even light from the front (a window works well) rather than hard side light, which can exaggerate length. Keep the camera at or just above eye level.",
    });
  } else if (m.lengthWidthRatio <= 1.3) {
    tips.push({
      icon: iconFace(),
      title: "Rounder face shape — add gentle shadow",
      body: "A light source slightly off to one side (about 45°) adds mild contour and definition. Avoid direct flat, on-axis flash, which tends to widen round faces further.",
    });
  }

  if (Math.abs(m.avgTilt) >= 6) {
    tips.push({
      icon: iconEye(),
      title: "Notable canthal tilt detected",
      body: `Your eye corners measured a ${m.avgTilt > 0 ? "pronounced upward" : "pronounced downward"} tilt on average (${Math.abs(m.avgTilt)}°). This is just a trait, not a flaw — direct, level eye contact with the lens tends to show it off most clearly.`,
    });
  }

  if (m.jawCheekRatio >= 0.92) {
    tips.push({
      icon: iconJaw(),
      title: "Strong jaw-to-cheek width",
      body: "A more frontal angle with the chin level (not tucked) shows off jaw definition well. Under-lighting slightly (light source at or just below eye level) adds emphasis.",
    });
  } else if (m.jawCheekRatio <= 0.72) {
    tips.push({
      icon: iconJaw(),
      title: "Tapered jawline relative to cheekbones",
      body: "A 3/4 angle with the chin very slightly forward (not down) tends to add visible jaw definition for a tapered jaw shape.",
    });
  }

  // Universal, metric-independent tips — always included.
  tips.push({
    icon: iconLens(),
    title: "Back off and use the main lens",
    body: "Phone front cameras (and any ultra-wide lens) distort faces up close — noses look bigger, ears vanish. Stand at least arm's length away, or better, use the rear main camera with a timer or a friend.",
  });
  tips.push({
    icon: iconSun(),
    title: "Light from the side, not above",
    body: "Overhead light (ceiling fixtures, harsh midday sun) casts shadows under the eyes and nose. Face a window at roughly 45°, or shoot during golden hour outdoors, for the most flattering light.",
  });

  return tips;
}

const svgWrap = (path) => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
function iconTurn() { return svgWrap(`<path d="M4 12a8 8 0 1 1 3 6.2"/><path d="M4 16v-4h4"/>`); }
function iconCamera() { return svgWrap(`<path d="M4 8h3l2-2h6l2 2h3v11H4z"/><circle cx="12" cy="13" r="3.2"/>`); }
function iconFace() { return svgWrap(`<circle cx="12" cy="12" r="8.5"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/>`); }
function iconEye() { return svgWrap(`<path d="M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.6"/>`); }
function iconJaw() { return svgWrap(`<path d="M5 5v6c0 6 4.5 9.5 7 9.5s7-3.5 7-9.5V5"/>`); }
function iconLens() { return svgWrap(`<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3.5"/>`); }
function iconSun() { return svgWrap(`<circle cx="12" cy="12" r="4.2"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>`); }

/* ---------------------------------------------------------------------
   Router / tab bar
--------------------------------------------------------------------- */
const app = document.getElementById("app");
document.getElementById("tabbar").addEventListener("click", (e) => {
  const btn = e.target.closest(".tab");
  if (!btn) return;
  goTo(btn.dataset.tab);
});

function goTo(tab, opts) {
  state.tab = tab;
  document.querySelectorAll(".tab").forEach((t) => {
    if (t.dataset.tab === tab) t.setAttribute("aria-current", "page");
    else t.removeAttribute("aria-current");
  });
  if (tab === "dashboard") renderDashboard();
  else if (tab === "scan") renderCapture();
  else if (tab === "tips") renderTipsLibrary();
  window.scrollTo(0, 0);
}

function toast(msg) {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove("show"), 2200);
}

/* ---------------------------------------------------------------------
   Screen: Dashboard
--------------------------------------------------------------------- */
function renderDashboard() {
  const h = state.history;
  const latest = h[h.length - 1];

  let heroHtml = `
    <div class="hero-card">
      <h2>Find your best angle</h2>
      <p>Tap 16 points on a photo and get a private, on-device read on your proportions — plus concrete camera-angle and lighting tips. Nothing ever leaves your phone.</p>
      <button class="hero-cta" id="heroScanBtn">Start a scan →</button>
    </div>`;

  let historyHtml = "";
  if (!h.length) {
    historyHtml = `
      <div class="card empty-state">
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M9 10h.01M15 10h.01M9 15c1 1 5 1 6 0"/></svg>
        <p>No scans yet. Run your first scan to see proportion scores and personalized angle tips here.</p>
      </div>`;
  } else {
    const spark = h.slice(-10).map((entry, i, arr) => {
      const isLast = i === arr.length - 1;
      return `<div class="spark-bar${isLast ? " latest" : ""}" style="height:${Math.max(6, entry.metrics.symmetryScore * 0.4)}px" title="${entry.metrics.symmetryScore}"></div>`;
    }).join("");

    historyHtml = `
      <div class="card">
        <div class="card-row">
          <span class="section-title" style="margin:0;">Balance score trend</span>
          <span class="meter-value">${latest.metrics.symmetryScore}</span>
        </div>
        <div class="sparkline">${spark}</div>
      </div>
      <div class="card" id="historyList">
        ${h.slice().reverse().slice(0, 8).map((entry) => historyRow(entry)).join("")}
      </div>`;
  }

  app.innerHTML = `
    <div class="screen active">
      ${heroHtml}
      <div class="section-title">Recent scans</div>
      ${historyHtml}
      <div class="section-title">Privacy</div>
      <div class="callout">Photos are analyzed entirely on your device inside this page. Only the numeric results (and a small thumbnail) are saved, in your browser's local storage — never sent anywhere.</div>
    </div>`;

  document.getElementById("heroScanBtn").addEventListener("click", () => goTo("scan"));
  document.querySelectorAll(".history-item").forEach((el) => {
    el.addEventListener("click", () => {
      const entry = state.history.find((e) => e.id === el.dataset.id);
      if (entry) showResults(entry.metrics, entry.tips, entry.thumb, false);
    });
  });
}

function historyRow(entry) {
  const d = new Date(entry.date);
  const dateStr = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `
    <div class="history-item" data-id="${entry.id}">
      <div class="history-thumb">${entry.thumb ? `<img src="${entry.thumb}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" alt="">` : entry.metrics.symmetryScore}</div>
      <div class="history-meta">
        <div class="h-title">Scan · ${dateStr}</div>
        <div class="h-sub">Balance ${entry.metrics.symmetryScore} · Thirds ${entry.metrics.thirdsScore} · Fifths ${entry.metrics.fifthsScore}</div>
      </div>
      <div class="history-chev">${svgWrap('<path d="m9 6 6 6-6 6"/>')}</div>
    </div>`;
}

/* ---------------------------------------------------------------------
   Screen: Capture
--------------------------------------------------------------------- */
function renderCapture() {
  app.innerHTML = `
    <div class="screen active">
      <div class="section-title">New scan</div>
      <div class="card">
        <label class="capture-box" for="fileInput">
          ${svgWrap('<path d="M9 2 7.2 4H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-3.2L15 2H9Z"/><circle cx="12" cy="13" r="4"/>').replace('width="20" height="20"', 'width="34" height="34"')}
          <div style="font-weight:600; color:var(--text-primary); margin-top:6px;">Take or choose a photo</div>
          <div style="font-size:12.5px; margin-top:4px;">Face the camera, even light, hair pulled back if possible</div>
        </label>
        <input type="file" id="fileInput" accept="image/*" />
        <div class="capture-tip">
          Tips for an accurate scan:
          <ul style="margin:6px 0 0; padding-left:18px;">
            <li>Look straight at the camera, neutral expression</li>
            <li>Even, front-facing light — avoid harsh shadows</li>
            <li>Use the rear camera if you can, from arm's length or further</li>
          </ul>
        </div>
      </div>
    </div>`;

  document.getElementById("fileInput").addEventListener("change", onFileChosen);
}

function onFileChosen(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (ev) => {
    const img = new Image();
    img.onload = () => {
      state.img = img;
      state.points = {};
      state.stepIndex = 0;
      state.reviewing = false;
      renderLandmarkScreen();
    };
    img.onerror = () => toast("Couldn't read that image — try another photo.");
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}

/* ---------------------------------------------------------------------
   Screen: Landmark tagging
--------------------------------------------------------------------- */
let canvasCtx = null;
let displayScale = 1;

function renderLandmarkScreen() {
  const total = LANDMARKS.length;
  const step = LANDMARKS[state.stepIndex];
  const doneCount = Object.keys(state.points).length;

  app.innerHTML = `
    <div class="screen active">
      <div class="section-title">Mark landmarks</div>
      <div class="canvas-wrap" id="canvasWrap">
        <canvas id="photoCanvas"></canvas>
        <div class="magnifier" id="magnifier"><canvas id="magCanvas" width="192" height="192"></canvas></div>
      </div>
      <div class="step-banner">
        ${state.reviewing ? `
          <div class="step-progress">Review</div>
          <div class="step-instruction">Tap any point below to redo it, or looks good — analyze.</div>
        ` : `
          <div class="step-progress">Point ${state.stepIndex + 1} of ${total}</div>
          <div class="step-instruction">${step.instr}</div>
        `}
        <div class="dot-progress">${LANDMARKS.map((l, i) => `<span class="${state.points[l.id] ? "done" : ""} ${!state.reviewing && i === state.stepIndex ? "cur" : ""}"></span>`).join("")}</div>
        <div class="step-controls">
          ${state.reviewing
            ? `<button class="btn btn-ghost btn-sm" id="backBtn">Redo last point</button><button class="btn btn-primary" id="analyzeBtn">Analyze →</button>`
            : `<button class="btn btn-ghost btn-sm" id="backBtn" ${state.stepIndex === 0 ? "disabled" : ""}>Back</button><button class="btn btn-ghost btn-sm" id="cancelBtn">Cancel scan</button>`
          }
        </div>
      </div>
    </div>`;

  setupCanvas();

  document.getElementById("backBtn").addEventListener("click", () => {
    if (state.reviewing) {
      state.reviewing = false;
      state.stepIndex = LANDMARKS.length - 1;
      delete state.points[LANDMARKS[state.stepIndex].id];
    } else if (state.stepIndex > 0) {
      state.stepIndex -= 1;
      delete state.points[LANDMARKS[state.stepIndex].id];
    }
    renderLandmarkScreen();
  });
  const cancelBtn = document.getElementById("cancelBtn");
  if (cancelBtn) cancelBtn.addEventListener("click", () => goTo("dashboard"));
  const analyzeBtn = document.getElementById("analyzeBtn");
  if (analyzeBtn) analyzeBtn.addEventListener("click", runAnalysis);
}

function setupCanvas() {
  const canvas = document.getElementById("photoCanvas");
  const wrap = document.getElementById("canvasWrap");
  const img = state.img;
  const maxW = wrap.clientWidth || 360;
  displayScale = maxW / img.naturalWidth;
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  canvas.style.width = maxW + "px";
  canvas.style.height = (img.naturalHeight * displayScale) + "px";
  canvasCtx = canvas.getContext("2d");
  drawScene();

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
}

function drawScene() {
  const canvas = document.getElementById("photoCanvas");
  if (!canvas || !canvasCtx) return;
  canvasCtx.drawImage(state.img, 0, 0);

  // draw placed points
  Object.entries(state.points).forEach(([id, pt]) => {
    const isCurrent = !state.reviewing && LANDMARKS[state.stepIndex] && LANDMARKS[state.stepIndex].id === id;
    drawMarker(pt.x, pt.y, isCurrent);
  });

  if (state.reviewing) {
    drawLandmarkGuides();
  }
}

function drawMarker(x, y, highlighted) {
  const r = Math.max(6, state.img.naturalWidth * 0.006);
  canvasCtx.save();
  canvasCtx.strokeStyle = highlighted ? "#4a3aa7" : "#2a78d6";
  canvasCtx.fillStyle = "rgba(42,120,214,0.25)";
  canvasCtx.lineWidth = Math.max(2, state.img.naturalWidth * 0.0025);
  canvasCtx.beginPath();
  canvasCtx.moveTo(x - r, y); canvasCtx.lineTo(x + r, y);
  canvasCtx.moveTo(x, y - r); canvasCtx.lineTo(x, y + r);
  canvasCtx.stroke();
  canvasCtx.beginPath();
  canvasCtx.arc(x, y, r * 0.7, 0, Math.PI * 2);
  canvasCtx.fill();
  canvasCtx.restore();
}

function drawLandmarkGuides() {
  const p = state.points;
  const lines = [
    ["trichion", "glabella"], ["glabella", "subnasale"], ["subnasale", "menton"],
    ["eye1_outer", "eye1_inner"], ["eye2_inner", "eye2_outer"], ["eye1_inner", "eye2_inner"],
    ["cheek1", "cheek2"], ["jaw1", "jaw2"], ["mouth1", "mouth2"], ["ala1", "ala2"],
  ];
  canvasCtx.save();
  canvasCtx.strokeStyle = "rgba(42,120,214,0.55)";
  canvasCtx.lineWidth = Math.max(1.5, state.img.naturalWidth * 0.0015);
  lines.forEach(([a, b]) => {
    if (!p[a] || !p[b]) return;
    canvasCtx.beginPath();
    canvasCtx.moveTo(p[a].x, p[a].y);
    canvasCtx.lineTo(p[b].x, p[b].y);
    canvasCtx.stroke();
  });
  canvasCtx.restore();
}

function eventToImageCoords(e) {
  const canvas = document.getElementById("photoCanvas");
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  return { x: clamp(x, 0, canvas.width), y: clamp(y, 0, canvas.height) };
}

let dragging = false;
function onPointerDown(e) {
  dragging = true;
  handlePoint(e);
}
function onPointerMove(e) {
  if (!dragging) return;
  handlePoint(e);
}
function onPointerUp() {
  dragging = false;
  hideMagnifier();
}

function handlePoint(e) {
  const { x, y } = eventToImageCoords(e);
  showMagnifier(x, y);

  if (state.reviewing) {
    // in review mode, dragging only affects the most-recently-tapped-for-redo point; not used by default
    return;
  }
  const step = LANDMARKS[state.stepIndex];
  state.points[step.id] = { x, y };
  drawScene();
}

function onPointerUpFinal() {
  if (state.reviewing) return;
  const step = LANDMARKS[state.stepIndex];
  if (!state.points[step.id]) return;
  if (state.stepIndex < LANDMARKS.length - 1) {
    state.stepIndex += 1;
    renderLandmarkScreen();
  } else {
    state.reviewing = true;
    renderLandmarkScreen();
  }
}

function showMagnifier(x, y) {
  const mag = document.getElementById("magnifier");
  const magCanvas = document.getElementById("magCanvas");
  const wrap = document.getElementById("canvasWrap");
  if (!mag || !magCanvas) return;
  const mctx = magCanvas.getContext("2d");
  mctx.imageSmoothingEnabled = true;
  const zoom = 3;
  const srcSize = magCanvas.width / zoom;
  mctx.clearRect(0, 0, magCanvas.width, magCanvas.height);
  mctx.drawImage(
    state.img,
    clamp(x - srcSize / 2, 0, state.img.naturalWidth - srcSize),
    clamp(y - srcSize / 2, 0, state.img.naturalHeight - srcSize),
    srcSize, srcSize, 0, 0, magCanvas.width, magCanvas.height
  );
  mctx.strokeStyle = "#4a3aa7";
  mctx.lineWidth = 2;
  mctx.beginPath();
  mctx.moveTo(magCanvas.width / 2 - 10, magCanvas.height / 2); mctx.lineTo(magCanvas.width / 2 + 10, magCanvas.height / 2);
  mctx.moveTo(magCanvas.width / 2, magCanvas.height / 2 - 10); mctx.lineTo(magCanvas.width / 2, magCanvas.height / 2 + 10);
  mctx.stroke();

  const dispX = x * displayScale;
  const dispY = y * displayScale;
  mag.style.left = clamp(dispX - 48, 0, wrap.clientWidth - 96) + "px";
  mag.style.top = (dispY - 130 < 0 ? dispY + 24 : dispY - 130) + "px";
  mag.style.display = "block";
}
function hideMagnifier() {
  const mag = document.getElementById("magnifier");
  if (mag) mag.style.display = "none";
  onPointerUpFinal();
}

/* ---------------------------------------------------------------------
   Analysis + Results
--------------------------------------------------------------------- */
function runAnalysis() {
  const missing = LANDMARKS.filter((l) => !state.points[l.id]);
  if (missing.length) { toast("A few points are missing — please place all 16."); return; }
  const metrics = computeMetrics(state.points);
  const tips = generateTips(metrics);
  const thumb = makeThumbnail();

  const entry = { id: "s" + Date.now(), date: new Date().toISOString(), metrics, tips, thumb };
  state.history.push(entry);
  saveHistory();

  showResults(metrics, tips, thumb, true);
}

function makeThumbnail() {
  const c = document.createElement("canvas");
  const size = 160;
  c.width = size; c.height = size;
  const ctx = c.getContext("2d");
  const img = state.img;
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  return c.toDataURL("image/jpeg", 0.6);
}

function showResults(m, tips, thumb, isFresh) {
  app.innerHTML = `
    <div class="screen active">
      <div class="section-title">${isFresh ? "Your results" : "Past scan"}</div>
      ${thumb ? `<div class="result-photo"><img src="${thumb}" style="width:100%;display:block;" alt=""></div>` : ""}

      <div class="card">
        ${meterHtml("Facial thirds balance", m.thirdsScore, thirdsDesc(m))}
        ${meterHtml("Facial fifths (eye spacing)", m.fifthsScore, `Space between your eyes measures ${m.fifthsRatio}× your average eye width (1.0 = classic "one eye apart").`)}
        ${meterHtml("Left/right balance", m.symmetryScore, `Comparing paired landmarks side to side. Some asymmetry is universal — even very symmetric faces score under 100 here.`)}
      </div>

      <div class="section-title">Descriptive traits</div>
      <div class="stat-pair" style="margin-bottom:12px;">
        <div class="card">
          <div class="stat-caption">Canthal tilt (avg)</div>
          <div class="stat-figure">${m.avgTilt > 0 ? "+" : ""}${m.avgTilt}°</div>
          <div class="stat-desc">${tiltDesc(m.avgTilt)}</div>
        </div>
        <div class="card">
          <div class="stat-caption">Length : width</div>
          <div class="stat-figure">${m.lengthWidthRatio}</div>
          <div class="stat-desc">${lwDesc(m.lengthWidthRatio)}</div>
        </div>
      </div>
      <div class="stat-pair">
        <div class="card">
          <div class="stat-caption">Jaw : cheekbone width</div>
          <div class="stat-figure">${m.jawCheekRatio}</div>
          <div class="stat-desc">${jawDesc(m.jawCheekRatio)}</div>
        </div>
        <div class="card">
          <div class="stat-caption">Nose : mouth width</div>
          <div class="stat-figure">${m.noseMouthRatio}</div>
          <div class="stat-desc">Typical range is roughly 0.7–0.9.</div>
        </div>
      </div>

      <div class="section-title">Angle &amp; lighting tips for you</div>
      ${tips.map((t) => `<div class="card tip-card"><div class="tip-icon">${t.icon}</div><div class="tip-body"><h3>${t.title}</h3><p>${t.body}</p></div></div>`).join("")}

      <div class="callout" style="margin-top:4px;">These numbers come from points you tapped on one 2D photo — they're a rough, fun estimate, not a scientific or medical measurement. Nearly every face is asymmetric; that's normal anatomy, not a flaw to fix.</div>

      <div class="btn-row" style="margin-top:16px;">
        <button class="btn btn-ghost" id="doneBtn">Back to dashboard</button>
        <button class="btn btn-primary" id="rescanBtn">New scan</button>
      </div>
    </div>`;

  document.getElementById("doneBtn").addEventListener("click", () => goTo("dashboard"));
  document.getElementById("rescanBtn").addEventListener("click", () => goTo("scan"));
}

function meterHtml(label, score, desc) {
  return `
    <div class="meter">
      <div class="meter-head"><span class="meter-label">${label}</span><span class="meter-value">${score}</span></div>
      <div class="meter-track"><div class="meter-fill" style="width:${score}%"></div></div>
      <div class="meter-desc">${desc}</div>
    </div>`;
}
function thirdsDesc(m) {
  const base = `Upper ${m.pctU}% · Mid ${m.pctM}% · Lower ${m.pctL}%`;
  if (m.thirdsScore >= 80) return `${base} — close to the classic equal-thirds guideline.`;
  const leadLabel = m.thirdsLead === "middle" ? "mid" : m.thirdsLead;
  return `${base} — your ${leadLabel} third reads a little larger than the other two.`;
}
function tiltDesc(t) {
  if (t >= 6) return "Notably upturned (positive) canthal tilt.";
  if (t >= 2) return "Slightly upturned canthal tilt.";
  if (t > -2) return "Roughly neutral canthal tilt.";
  if (t > -6) return "Slightly downturned canthal tilt.";
  return "Notably downturned canthal tilt.";
}
function lwDesc(r) {
  if (r >= 1.55) return "Longer, narrower face proportions.";
  if (r <= 1.3) return "Rounder, shorter face proportions.";
  return "Balanced, oval-leaning proportions.";
}
function jawDesc(r) {
  if (r >= 0.92) return "Jaw width close to cheekbone width — squarer impression.";
  if (r <= 0.72) return "Jaw notably narrower than cheekbones — tapered impression.";
  return "Moderate taper from cheekbones to jaw.";
}

/* ---------------------------------------------------------------------
   Screen: Tips library (static, curated)
--------------------------------------------------------------------- */
const TIP_SECTIONS = [
  {
    title: "Photography basics",
    items: [
      "Use the rear camera when you can — front/selfie cameras are usually wider-angle and distort features up close.",
      "Stand at least an arm's length from the lens; further away plus zooming in slightly reduces distortion even more.",
      "Shoot in natural light near a window at a 45° angle, or outdoors during golden hour (soon after sunrise / before sunset).",
      "Avoid direct overhead light and on-axis flash — both cast unflattering shadows under the eyes and nose.",
      "Take several shots and slightly vary head tilt and angle each time; small changes make a bigger difference than expected.",
    ],
  },
  {
    title: "Skincare fundamentals",
    items: [
      "A simple daily routine beats a complicated one you won't stick to: gentle cleanser, moisturizer, and SPF 30+ every morning.",
      "Sunscreen is the single highest-leverage anti-aging habit — daily use, rain or shine.",
      "Introduce actives (retinoids, exfoliating acids) one at a time, a few times a week, and increase slowly.",
      "Sleep and hydration show up on skin quickly — they're unglamorous but effective.",
    ],
  },
  {
    title: "Grooming & styling",
    items: [
      "A hairstyle suited to your face shape can visually rebalance proportions more than almost anything else.",
      "Well-groomed eyebrows (trimmed, shaped to your natural arch) frame the whole face.",
      "For facial hair: a beard/stubble shape that follows your jawline can add definition; a barber consult is worth it.",
      "Fit matters — clothing and collar shapes that suit your neck/shoulder proportions change how your face reads in photos too.",
    ],
  },
  {
    title: "Posture & presentation",
    items: [
      "Relaxed shoulders and a slight forward head position (not a slouch) reads as more confident in photos.",
      "A 'soft-eye' smile — relaxing the eyes rather than a big forced grin — usually photographs better.",
      "Take a breath and relax your jaw right before the photo; tension shows.",
    ],
  },
];

function renderTipsLibrary() {
  app.innerHTML = `
    <div class="screen active">
      <div class="section-title">Tips library</div>
      <div class="callout" style="margin-bottom:14px;">General, evidence-informed basics — not a substitute for a dermatologist, stylist, or your own judgment about what actually makes you feel good.</div>
      ${TIP_SECTIONS.map((sec, i) => `
        <div class="accordion" data-idx="${i}">
          <button class="accordion-head">${sec.title}${svgWrap('<path d="m6 9 6 6 6-6"/>')}</button>
          <div class="accordion-body"><div class="accordion-body-inner"><ul>${sec.items.map((t) => `<li>${t}</li>`).join("")}</ul></div></div>
        </div>`).join("")}
    </div>`;

  document.querySelectorAll(".accordion-head").forEach((btn) => {
    btn.addEventListener("click", () => btn.closest(".accordion").classList.toggle("open"));
  });
}

/* ---------------------------------------------------------------------
   Boot
--------------------------------------------------------------------- */
goTo("dashboard");
