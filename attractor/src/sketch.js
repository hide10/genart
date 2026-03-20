// Strange Attractor — sketch.js
// 常に同じゲーム状態でループ。クリックで軌道変更なし。速度・スタンプは自動。

/** UI・キャッシュバストと揃える（index.html ?v= と一致させる） */
const BUILD = 21;

let canvas, ctx, W, H;
let overlayCanvas, overlayCtx;

let accR, accG, accB;
let imageData;

let attrX = 0.1, attrY = 0.1;
let params = {};
let mapping = { ox: 0, oy: 0, scale: 1 };
let currentType = 'clifford';
const BG_R = 5, BG_G = 5, BG_B = 8;

const EXPLOSIONS_MAX = 26;

let globalHue = 0;
let prevVx = 0, prevVy = 0;
let explosions = [];
let targetX = 0, targetY = 0;
let segProgress = 0;
/** 1辺あたりのフレーム数（resize で自動） */
let segFrames = 68;
/** 重ね描き本数（多いほどリボン・光の層が増える） */
const RUNNER_COUNT = 5;
const RUNNER_LAG_FRAMES = 11;
const PATH_HIST_CAP = 1600;
let pathHistAX, pathHistAY;
let pathHistW = 0, pathHistSize = 0;
let currentBrushR = 1.0;
let orbitBounds = null;
let chromaPhase = 0;
/** innerWidth/Height の微小変化で resize が連打→initRgbAccum が繰り返され「数回ごとにリセット」に見える端末対策 */
let resizeDebounceTimer = null;
const RESIZE_DEBOUNCE_MS = 480;
/** この差未満はバックバッファサイズを変えない（アドレスバー等の数 px ジッタ） */
const RESIZE_IGNORE_PX = 6;

const ATTRACTORS = {
  clifford: {
    step: (x, y, p) => ({
      x: Math.sin(p.a * y) + p.c * Math.cos(p.a * x),
      y: Math.sin(p.b * x) + p.d * Math.cos(p.b * y),
    }),
    random: () => ({
      a: (Math.random() - 0.5) * 4, b: (Math.random() - 0.5) * 4,
      c: (Math.random() - 0.5) * 4, d: (Math.random() - 0.5) * 4,
    }),
  },
  dejong: {
    step: (x, y, p) => ({
      x: Math.sin(p.a * y) - Math.cos(p.b * x),
      y: Math.sin(p.c * x) - Math.cos(p.d * y),
    }),
    random: () => ({
      a: (Math.random() - 0.5) * 6, b: (Math.random() - 0.5) * 6,
      c: (Math.random() - 0.5) * 6, d: (Math.random() - 0.5) * 6,
    }),
  },
};

function hslToRgb(h, s, l) {
  if (!Number.isFinite(h)) h = 0;
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0, g = 0, b = 0;
  if (h < 60) { r = c; g = x; }
  else if (h < 120) { r = x; g = c; }
  else if (h < 180) { g = c; b = x; }
  else if (h < 240) { g = x; b = c; }
  else if (h < 300) { r = x; b = c; }
  else { r = c; b = x; }
  return [(r + m), (g + m), (b + m)];
}

function warmup(attr) {
  let x = 0.1, y = 0.1;
  for (let i = 0; i < 500; i++) ({ x, y } = attr.step(x, y, params));
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  const visited = new Set();
  for (let i = 0; i < 5000; i++) {
    ({ x, y } = attr.step(x, y, params));
    if (!isFinite(x) || !isFinite(y)) return null;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    visited.add(`${(x * 10) | 0},${(y * 10) | 0}`);
  }
  if (visited.size < 80) return null;
  const rangeX = maxX - minX, rangeY = maxY - minY;
  if (rangeX < 0.3 || rangeY < 0.3) return null;
  const pad = 0.1, scaleX = W * (1 - 2 * pad) / rangeX, scaleY = H * (1 - 2 * pad) / rangeY;
  const scale = Math.min(scaleX, scaleY);
  return {
    x, y,
    mapping: {
      ox: W / 2 - (minX + rangeX / 2) * scale,
      oy: H / 2 - (minY + rangeY / 2) * scale,
      scale,
    },
    bounds: { minX, maxX, minY, maxY },
  };
}

function mappingFromBounds(b) {
  const { minX, maxX, minY, maxY } = b;
  const rangeX = maxX - minX, rangeY = maxY - minY;
  if (rangeX < 0.3 || rangeY < 0.3) return null;
  const pad = 0.1, scaleX = W * (1 - 2 * pad) / rangeX, scaleY = H * (1 - 2 * pad) / rangeY;
  const scale = Math.min(scaleX, scaleY);
  return {
    ox: W / 2 - (minX + rangeX / 2) * scale,
    oy: H / 2 - (minY + rangeY / 2) * scale,
    scale,
  };
}

/** 画面が広いほどやや速く（segFrames を小さく） */
function autoSegFrames() {
  const s = Math.min(W, H);
  // 値を下げるほど1辺が短く → 画面上の移動が速く見える
  segFrames = Math.round(Math.min(76, Math.max(38, 64 - s / 50)));
}

function initRgbAccum() {
  const n = W * H;
  accR = new Float32Array(n);
  accG = new Float32Array(n);
  accB = new Float32Array(n);
  imageData = ctx.createImageData(W, H);
  const d = imageData.data;
  for (let i = 3; i < d.length; i += 4) d[i] = 255;
}

function clearRgbAccum() {
  accR.fill(0);
  accG.fill(0);
  accB.fill(0);
}

function resetPathHist() {
  pathHistW = 0;
  pathHistSize = 0;
  if (!pathHistAX || pathHistAX.length !== PATH_HIST_CAP) {
    pathHistAX = new Float32Array(PATH_HIST_CAP);
    pathHistAY = new Float32Array(PATH_HIST_CAP);
  }
}

function pushPathHist(ax, ay) {
  pathHistAX[pathHistW] = ax;
  pathHistAY[pathHistW] = ay;
  pathHistW = (pathHistW + 1) % PATH_HIST_CAP;
  if (pathHistSize < PATH_HIST_CAP) pathHistSize++;
}

function pathHistSample(age) {
  if (age < 0 || age >= pathHistSize) return null;
  const idx = (pathHistW - 1 - age + PATH_HIST_CAP * 5000) % PATH_HIST_CAP;
  return { ax: pathHistAX[idx], ay: pathHistAY[idx] };
}

/** 座標が暴走すると x*14 が Infinity → hue が NaN → hsla 描画が例外 → catch で全消去になる */
function clampAttractorXY(x, y) {
  if (!orbitBounds) {
    return {
      x: Number.isFinite(x) ? x : 0,
      y: Number.isFinite(y) ? y : 0,
    };
  }
  const { minX, maxX, minY, maxY } = orbitBounds;
  const rx = Math.max(1e-9, maxX - minX);
  const ry = Math.max(1e-9, maxY - minY);
  const span = Math.max(rx, ry) * 4;
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  let xf = Number.isFinite(x) ? x : cx;
  let yf = Number.isFinite(y) ? y : cy;
  xf = Math.min(cx + span, Math.max(cx - span, xf));
  yf = Math.min(cy + span, Math.max(cy - span, yf));
  return { x: xf, y: yf };
}

function hueFromAttractor(x, y, chromaBoost = 0) {
  let xf = Number.isFinite(x) ? x : 0;
  let yf = Number.isFinite(y) ? y : 0;
  xf = Math.min(400, Math.max(-400, xf));
  yf = Math.min(400, Math.max(-400, yf));
  let h = chromaPhase + chromaBoost + globalHue * 0.06 + xf * 14 + yf * 12 + Math.atan2(yf, xf) * 4;
  h = ((h % 360) + 360) % 360;
  return Number.isFinite(h) ? h : 0;
}

function stampDisk(cx, cy, radius, lr, lg, lb, gain) {
  const sigma2 = radius * radius * 0.85;
  const R2 = radius * radius;
  const ri = Math.ceil(radius);
  const xa = Math.max(0, Math.floor(cx - ri));
  const ya = Math.max(0, Math.floor(cy - ri));
  const xb = Math.min(W - 1, Math.ceil(cx + ri));
  const yb = Math.min(H - 1, Math.ceil(cy + ri));
  for (let py = ya; py <= yb; py++) {
    const row = py * W;
    for (let px = xa; px <= xb; px++) {
      const ddx = px + 0.5 - cx;
      const ddy = py + 0.5 - cy;
      const d2 = ddx * ddx + ddy * ddy;
      if (d2 > R2) continue;
      const w = gain * Math.exp(-d2 / sigma2);
      const i = row + px;
      accR[i] += lr * w;
      accG[i] += lg * w;
      accB[i] += lb * w;
    }
  }
}

function plotColorSegment(sx0, sy0, sx1, sy1, lineW, hSeg, gainMul = 1) {
  const len = Math.hypot(sx1 - sx0, sy1 - sy0);
  const lenSteps = Math.max(1, Math.ceil(len));
  const steps = Math.min(26, Math.max(lenSteps, 10));
  const radius = Math.max(1.8, Math.min(5.2, lineW * 0.72));
  const gain = 0.029 * gainMul;
  const [lr, lg, lb] = hslToRgb(hSeg, 42, 49);
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const cx = sx0 + (sx1 - sx0) * t;
    const cy = sy0 + (sy1 - sy0) * t;
    stampDisk(cx, cy, radius, lr, lg, lb, gain);
  }
}

function renderAccumToCanvas(toneK) {
  const d = imageData.data;
  const n = W * H;
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const r = accR[i], g = accG[i], b = accB[i];
    if (r + g + b < 1e-8) {
      d[p] = BG_R; d[p + 1] = BG_G; d[p + 2] = BG_B;
    } else {
      d[p]     = Math.min(255, BG_R + (255 - BG_R) * (1 - Math.exp(-r * toneK)));
      d[p + 1] = Math.min(255, BG_G + (255 - BG_G) * (1 - Math.exp(-g * toneK)));
      d[p + 2] = Math.min(255, BG_B + (255 - BG_B) * (1 - Math.exp(-b * toneK)));
    }
    d[p + 3] = 255;
  }
  ctx.putImageData(imageData, 0, 0);
}

function applyAttractorResult(result) {
  attrX = result.x; attrY = result.y; mapping = result.mapping;
  orbitBounds = result.bounds;
  clearRgbAccum();
  resetPathHist();
  explosions = []; currentBrushR = 1.0;
  const fs = ATTRACTORS[currentType].step(attrX, attrY, params);
  if (!isFinite(fs.x) || !isFinite(fs.y)) {
    targetX = attrX * 0.999 + 1e-4;
    targetY = attrY * 0.999 + 1e-4;
  } else {
    targetX = fs.x; targetY = fs.y;
  }
  segProgress = 0;
  prevVx = targetX - attrX; prevVy = targetY - attrY;
}

/** 初回のみ。以降ユーザー操作では呼ばない */
function bootstrapOrbit() {
  const types = Object.keys(ATTRACTORS);
  for (let attempt = 0; attempt < 100; attempt++) {
    const others = types.filter(t => t !== currentType);
    currentType = Math.random() < 0.6
      ? others[Math.floor(Math.random() * others.length)]
      : currentType;
    const attr = ATTRACTORS[currentType];
    let result = null;
    for (let t = 0; t < 18 && !result; t++) {
      params = attr.random();
      result = warmup(attr);
    }
    if (!result) continue;
    applyAttractorResult(result);
    return;
  }
  const fallbacks = [
    ['clifford', { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }],
    ['clifford', { a: 1.5, b: -1.8, c: 1.6, d: 0.9 }],
  ];
  for (const [type, p] of fallbacks) {
    currentType = type;
    params = p;
    const r = warmup(ATTRACTORS[type]);
    if (r) {
      applyAttractorResult(r);
      return;
    }
  }
}

/** 同期ウォームアップを大量に回すと数秒フリーズして「止まった」ように見えるので数回だけ */
function recoverOrbitSilently() {
  clearRgbAccum();
  resetPathHist();
  explosions = [];
  const tries = [
    ['clifford', { a: -1.4, b: 1.6, c: 1.0, d: 0.7 }],
    ['clifford', { a: 1.5, b: -1.8, c: 1.6, d: 0.9 }],
    ['dejong', { a: 1.2, b: -1.8, c: -0.7, d: 1.9 }],
  ];
  for (const [type, p] of tries) {
    currentType = type;
    params = p;
    const result = warmup(ATTRACTORS[type]);
    if (result) {
      applyAttractorResult(result);
      return;
    }
  }
  for (let k = 0; k < 5; k++) {
    currentType = k % 2 === 0 ? 'clifford' : 'dejong';
    params = ATTRACTORS[currentType].random();
    const result = warmup(ATTRACTORS[currentType]);
    if (result) {
      applyAttractorResult(result);
      return;
    }
  }
  bootstrapOrbit();
}

function remapOnly() {
  if (!orbitBounds) return false;
  const m = mappingFromBounds(orbitBounds);
  if (!m) return false;
  mapping = m;
  clearRgbAccum();
  resetPathHist();
  return true;
}

function resize() {
  W = canvas.width = window.innerWidth;
  H = canvas.height = window.innerHeight;
  if (overlayCanvas) {
    overlayCanvas.width = W;
    overlayCanvas.height = H;
  }
  autoSegFrames();
}

function loop() {
  try {
    if (!(W > 0 && H > 0 && isFinite(mapping.scale))) {
      recoverOrbitSilently();
    } else {
      loopFrameBody();
    }
  } catch (err) {
    // 描画（グラデ・hsla）の例外で軌道までは捨てない。積分の NaN は loopFrameBody 内で recover 済み
    console.warn('[attractor]', err);
  } finally {
    requestAnimationFrame(loop);
  }
}

function loopFrameBody() {
  const isMobile = Math.min(W, H) < 500;
  const headR = isMobile ? 16 : 26;
  const thinR = isMobile ? 0.55 : 0.78;
  const thickR = isMobile ? 1.85 : 2.8;
  const { ox, oy, scale } = mapping;

  if (orbitBounds) {
    const ca = clampAttractorXY(attrX, attrY);
    attrX = ca.x;
    attrY = ca.y;
    const ct = clampAttractorXY(targetX, targetY);
    targetX = ct.x;
    targetY = ct.y;
  }

  globalHue = (globalHue + 0.01) % 360;
  chromaPhase = (chromaPhase + 0.55) % 360;

  // 1フレームごとの累積バッファ減衰（値を上げるとトレイルが長く残る）
  const decay = isMobile ? 0.9994 : 0.99952;
  const n = W * H;
  for (let i = 0; i < n; i++) {
    accR[i] *= decay;
    accG[i] *= decay;
    accB[i] *= decay;
  }

  const prevProgress = segProgress;
  segProgress += 1.0 / segFrames;
  const segAX = attrX, segAY = attrY, segBX = targetX, segBY = targetY;
  let headPx, headPy, drawX0, drawY0, drawX1, drawY1;

  if (segProgress >= 1.0) {
    drawX0 = segAX + (segBX - segAX) * prevProgress; drawY0 = segAY + (segBY - segAY) * prevProgress;
    drawX1 = segBX; drawY1 = segBY;
    attrX = segBX; attrY = segBY;
    let nx, ny;
    const st = ATTRACTORS[currentType].step(attrX, attrY, params);
    nx = st.x; ny = st.y;
    if (!isFinite(nx) || !isFinite(ny)) {
      params = ATTRACTORS[currentType].random();
      const st2 = ATTRACTORS[currentType].step(attrX, attrY, params);
      nx = st2.x; ny = st2.y;
    }
    if (!isFinite(nx) || !isFinite(ny)) {
      recoverOrbitSilently();
      return;
    }
    const cl = clampAttractorXY(nx, ny);
    nx = cl.x;
    ny = cl.y;
    const vx = nx - attrX, vy = ny - attrY;
    const speed = Math.hypot(vx, vy), pSpeed = Math.hypot(prevVx, prevVy);
    if (speed > 0 && pSpeed > 0) {
      const cosA = (vx * prevVx + vy * prevVy) / (speed * pSpeed);
      if (cosA < 0.1) {
        while (explosions.length >= EXPLOSIONS_MAX) explosions.shift();
        const epx = attrX * scale + ox, epy = attrY * scale + oy;
        const intensity = Math.min(1, -cosA * 1.5);
        explosions.push({
          px: epx, py: epy, age: 0, maxAge: 160, hue: hueFromAttractor(attrX, attrY, 0), intensity,
        });
        currentBrushR = thinR + Math.random() * (thickR - thinR);
      }
    }
    prevVx = vx; prevVy = vy;
    targetX = nx; targetY = ny;
    segProgress -= 1.0;
    headPx = attrX * scale + ox; headPy = attrY * scale + oy;
  } else {
    drawX0 = segAX + (segBX - segAX) * prevProgress; drawY0 = segAY + (segBY - segAY) * prevProgress;
    drawX1 = segAX + (segBX - segAX) * segProgress; drawY1 = segAY + (segBY - segAY) * segProgress;
    headPx = drawX1 * scale + ox; headPy = drawY1 * scale + oy;
  }

  if (!isFinite(drawX1) || !isFinite(drawY1) || !isFinite(headPx) || !isFinite(headPy)) return;

  const baseLineW = Math.max(2.0, currentBrushR * 3.0);
  const perRunnerMul = 1 / Math.sqrt(RUNNER_COUNT);

  for (let r = 0; r < RUNNER_COUNT; r++) {
    let ax0, ay0, ax1, ay1;
    if (r === 0) {
      ax1 = drawX1; ay1 = drawY1;
      const prevTip = pathHistSample(0);
      if (!prevTip) {
        ax0 = drawX0; ay0 = drawY0;
      } else {
        ax0 = prevTip.ax; ay0 = prevTip.ay;
      }
    } else {
      const older = pathHistSample(r * RUNNER_LAG_FRAMES + 1);
      const newer = pathHistSample(r * RUNNER_LAG_FRAMES);
      if (!older || !newer) continue;
      ax0 = older.ax; ay0 = older.ay;
      ax1 = newer.ax; ay1 = newer.ay;
    }
    const sx0 = ax0 * scale + ox, sy0 = ay0 * scale + oy;
    const sx1 = ax1 * scale + ox, sy1 = ay1 * scale + oy;
    const lw = baseLineW * (1 - r * 0.05);
    const hSeg = hueFromAttractor((ax0 + ax1) * 0.5, (ay0 + ay1) * 0.5, r * 5);
    plotColorSegment(sx0, sy0, sx1, sy1, lw, hSeg, perRunnerMul);
  }

  pushPathHist(drawX1, drawY1);

  const toneK = isMobile ? 2.32 : 2.9;
  renderAccumToCanvas(toneK);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hh = hueFromAttractor(drawX1, drawY1, 0);
  const drawHeadGlow = (px, py, r, h0, coreA, rimA) => {
    if (!Number.isFinite(px) || !Number.isFinite(py) || !Number.isFinite(r) || r <= 0) return;
    const hSafe = Number.isFinite(h0) ? ((h0 % 360) + 360) % 360 : 0;
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    g.addColorStop(0, `hsla(${hSafe},42%,82%,${coreA})`);
    g.addColorStop(0.35, `hsla(${(hSafe + 8) % 360},38%,58%,${rimA})`);
    g.addColorStop(1, `hsla(${(hSafe + 22) % 360},34%,48%,0)`);
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  };
  drawHeadGlow(headPx, headPy, headR, hh, 0.72, 0.26);
  drawHeadGlow(headPx, headPy, headR * 1.85, (hh + 14) % 360, 0.14, 0.06);

  /** 軌跡上の遅延光点（重ね合わせのレイヤー感） */
  const ghostSpecs = isMobile
    ? [[5, 0.38, 11], [14, 0.2, 16], [30, 0.09, 22]]
    : [[6, 0.45, 13], [20, 0.24, 22], [48, 0.11, 34]];
  for (const [age, a0, rMul] of ghostSpecs) {
    const gh = pathHistSample(age);
    if (!gh) continue;
    const gpx = gh.ax * scale + ox, gpy = gh.ay * scale + oy;
    const ghue = hueFromAttractor(gh.ax, gh.ay, age * 0.4);
    drawHeadGlow(gpx, gpy, headR * rMul * 0.42, ghue, a0 * 0.55, a0 * 0.2);
  }
  ctx.restore();

  overlayCtx.clearRect(0, 0, W, H);
  overlayCtx.save();
  overlayCtx.globalCompositeOperation = 'lighter';
  const manyBooms = explosions.length > 12;
  for (let i = explosions.length - 1; i >= 0; i--) {
    const ex = explosions[i];
    const t = ex.age / ex.maxAge;
    const r = 15 + t * 160 * ex.intensity;
    const alpha = (1 - t) * 0.55 * ex.intensity;
    overlayCtx.strokeStyle = `hsla(${ex.hue},48%,62%,${alpha})`;
    overlayCtx.lineWidth = 2.2 * (1 - t * 0.65);
    overlayCtx.shadowBlur = manyBooms ? 0 : 6;
    overlayCtx.shadowColor = `hsla(${ex.hue},40%,52%,${alpha * 0.25})`;
    overlayCtx.lineCap = 'round';
    overlayCtx.beginPath();
    overlayCtx.arc(ex.px, ex.py, r, 0, Math.PI * 2);
    overlayCtx.stroke();
    ex.age++;
    if (ex.age >= ex.maxAge) explosions.splice(i, 1);
  }
  overlayCtx.restore();
}

function applyCommittedResize() {
  const nw = Math.max(1, window.innerWidth | 0);
  const nh = Math.max(1, window.innerHeight | 0);
  const dw = Math.abs(nw - W);
  const dh = Math.abs(nh - H);
  if (dw <= RESIZE_IGNORE_PX && dh <= RESIZE_IGNORE_PX) return;

  resize();
  initRgbAccum();
  if (!remapOnly()) bootstrapOrbit();
}

function scheduleResizeCommit() {
  if (resizeDebounceTimer !== null) clearTimeout(resizeDebounceTimer);
  resizeDebounceTimer = setTimeout(() => {
    resizeDebounceTimer = null;
    applyCommittedResize();
  }, RESIZE_DEBOUNCE_MS);
}

function init() {
  const verEl = document.getElementById('attractor-ver');
  if (verEl) verEl.textContent = `build ${BUILD}`;

  canvas = document.getElementById('c');
  ctx = canvas.getContext('2d');
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.style.cssText = 'position:absolute;top:0;left:0;pointer-events:none;width:100%;height:100%';
  canvas.parentElement.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d', { alpha: true });
  resize();
  initRgbAccum();
  bootstrapOrbit();
  loop();

  window.addEventListener('resize', scheduleResizeCommit);
  window.addEventListener('orientationchange', scheduleResizeCommit);
}

window.addEventListener('DOMContentLoaded', init);
