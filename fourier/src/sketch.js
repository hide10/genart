// Fourier Drawing — sketch.js
// 3D parametric curve の XY/XZ/YZ 投影 — 光跡エピサイクル

const SAMPLE_COUNT = 512;
const MIN_INST     = 2;
const MAX_INST     = 5;

let canvas, ctx, W, H;
let instances  = [];
let globalTime = 0;

// 形状ファクトリ（呼ぶと (t,s)=>point な関数を返す。乱数パラメータはここで固定）
const SHAPE_FACTORIES = [
  () => (t,s) => ({ re: 16*Math.pow(Math.sin(t),3)*s/16,
                    im: -(13*Math.cos(t)-5*Math.cos(2*t)-2*Math.cos(3*t)-Math.cos(4*t))*s/13 }),
  () => (t,s) => ({ re: Math.pow(Math.cos(t),3)*s, im: Math.pow(Math.sin(t),3)*s }),
  () => (t,s) => { const r=Math.cos(3*t)*s; return { re: r*Math.cos(t), im: r*Math.sin(t) }; },
  () => (t,s) => { const r=Math.cos(5*t)*s; return { re: r*Math.cos(t), im: r*Math.sin(t) }; },
  () => (t,s) => { const r=Math.cos(7*t)*s; return { re: r*Math.cos(t), im: r*Math.sin(t) }; },
  () => { const d=0.5+Math.random()*2.0;
    return (t,s) => { const R=3,r=1,n=R+r+d;
      return { re:((R+r)*Math.cos(t)-d*Math.cos((R+r)/r*t))*s/n,
               im:((R+r)*Math.sin(t)-d*Math.sin((R+r)/r*t))*s/n }; }; },
  () => { const d=1+Math.random()*2.5;
    return (t,s) => { const R=5,r=3,n=Math.max(R-r+d,1)*1.2;
      return { re:((R-r)*Math.cos(t)+d*Math.cos((R-r)/r*t))*s/n,
               im:((R-r)*Math.sin(t)-d*Math.sin((R-r)/r*t))*s/n }; }; },
  () => (t,s) => ({ re: Math.sin(3*t)*s, im: Math.sin(5*t+Math.PI/4)*s }),
  () => (t,s) => ({ re: Math.sin(4*t)*s, im: Math.sin(5*t+Math.PI/6)*s }),
  () => (t,s) => ({ re: Math.sin(2*t)*s, im: Math.sin(3*t+Math.PI/3)*s }),
  () => (t,s) => { const r=(Math.exp(Math.cos(t))-2*Math.cos(4*t)-Math.pow(Math.sin(t/12),5))*s*0.28;
    return { re: r*Math.cos(t), im: r*Math.sin(t) }; },
];

function makeInstance() {
  const factory = SHAPE_FACTORIES[Math.floor(Math.random() * SHAPE_FACTORIES.length)];
  const shapeFn = factory();  // 乱数パラメータをここで固定
  const scale   = Math.min(W, H) * 0.20;
  const signal  = [];
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = (2 * Math.PI * i) / SAMPLE_COUNT;
    signal.push(shapeFn(t, scale));
  }

  const margin = 0.18;
  // インスタンスごとに軌跡の長さもバラバラに
  const trailLen = 400 + Math.floor(Math.random() * 1600);
  return {
    components:  dft(signal),
    trail:       [],
    trailLen,
    state:       'alive',
    age:         0,
    maxAge:      500 + Math.random() * 1500,
    time:        0,
    speedPhase:  Math.random() * Math.PI * 2,
    speedFreq:   0.002 + Math.random() * 0.005,
    speedMin:    0.003 + Math.random() * 0.007,
    speedMax:    0.08  + Math.random() * 0.22,   // 最速を上げる
    hue:         Math.random() * 360,
    hueSpeed:    (0.15 + Math.random() * 0.45) * (Math.random() < 0.5 ? 1 : -1),
    // 画面内のランダム位置
    bcx:     margin + Math.random() * (1 - margin * 2),
    bcy:     margin + Math.random() * (1 - margin * 2),
    driftAx: (Math.random() * 0.07 + 0.03) * (Math.random() < 0.5 ? 1 : -1),
    driftAy: (Math.random() * 0.06 + 0.03) * (Math.random() < 0.5 ? 1 : -1),
    driftFx: 0.0003 + Math.random() * 0.0005,
    driftFy: 0.0003 + Math.random() * 0.0004,
    driftPx: Math.random() * Math.PI * 2,
    driftPy: Math.random() * Math.PI * 2,
  };
}

function spawnIfNeeded() {
  const maxNow = Math.min(W, H) < 500 ? 3 : MAX_INST;  // スマホは最大3個
  if (instances.length < MIN_INST) {
    instances.push(makeInstance());
  } else if (instances.length < maxNow && Math.random() < 0.004) {
    instances.push(makeInstance());
  }
}

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function loop() {
  ctx.fillStyle = '#0a0a0f';
  ctx.fillRect(0, 0, W, H);

  spawnIfNeeded();

  const toRemove = [];

  instances.forEach((inst, idx) => {
    const N = inst.components.length;

    // スピード
    inst.speedPhase += inst.speedFreq;
    const s  = Math.pow(Math.sin(inst.speedPhase) * 0.5 + 0.5, 2);
    const dt = inst.speedMin + s * (inst.speedMax - inst.speedMin);

    inst.hue = (inst.hue + inst.hueSpeed + 360) % 360;
    inst.age++;

    // 寿命が来たら dying に
    if (inst.state === 'alive' && inst.age > inst.maxAge) {
      inst.state = 'dying';
    }

    const cx = (inst.bcx + Math.sin(globalTime * inst.driftFx + inst.driftPx) * inst.driftAx) * W;
    const cy = (inst.bcy + Math.cos(globalTime * inst.driftFy + inst.driftPy) * inst.driftAy) * H;
    const tip = drawEpicycles(ctx, cx, cy, inst.components, inst.time, N, false);

    if (inst.state === 'alive') {
      inst.trail.push({ x: tip.x, y: tip.y, hue: inst.hue });
      if (inst.trail.length > inst.trailLen) inst.trail.shift();
    } else {
      // dying: 頭を消すだけ → 軌跡が後ろから縮んでいく
      inst.trail.shift();
      if (inst.trail.length === 0) {
        toRemove.push(idx);
        return;
      }
    }

    // 画面サイズ基準の線幅係数（800px で 1.0）
    const px = Math.min(W, H) / 800;

    // 軌跡描画: グロー + コア 2パス
    const tlen = inst.trail.length;

    for (let i = 1; i < tlen; i++) {
      const ratio = Math.pow(i / tlen, 1.8);
      if (ratio < 0.03) continue;
      const hue = inst.trail[i].hue;
      ctx.beginPath();
      ctx.moveTo(inst.trail[i-1].x, inst.trail[i-1].y);
      ctx.lineTo(inst.trail[i].x,   inst.trail[i].y);
      ctx.strokeStyle = `hsla(${hue}, 100%, 55%, ${ratio * 0.22})`;
      ctx.lineWidth   = (5 + ratio * 7) * px;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    for (let i = 1; i < tlen; i++) {
      const ratio = Math.pow(i / tlen, 1.8);
      if (ratio < 0.03) continue;
      const hue = inst.trail[i].hue;
      ctx.beginPath();
      ctx.moveTo(inst.trail[i-1].x, inst.trail[i-1].y);
      ctx.lineTo(inst.trail[i].x,   inst.trail[i].y);
      ctx.strokeStyle = `hsla(${hue}, 100%, 82%, ${ratio * 0.9})`;
      ctx.lineWidth   = (0.8 + ratio * 1.8) * px;
      ctx.lineCap     = 'round';
      ctx.stroke();
    }

    // 先端の光点（alive のみ）
    if (inst.state === 'alive') {
      const tipHue = ((inst.hue % 360) + 360) % 360;
      ctx.save();
      ctx.shadowColor = `hsl(${tipHue}, 100%, 70%)`;
      ctx.shadowBlur  = 20 * px;
      ctx.beginPath();
      ctx.arc(tip.x, tip.y, 3 * px, 0, Math.PI * 2);
      ctx.fillStyle = `hsl(${tipHue}, 100%, 90%)`;
      ctx.fill();
      ctx.restore();
    }

    inst.time += dt;
    if (inst.time >= N) inst.time -= N;
  });

  // 消滅したインスタンスを削除（後ろから）
  for (let i = toRemove.length - 1; i >= 0; i--) {
    instances.splice(toRemove[i], 1);
  }

  globalTime++;
  requestAnimationFrame(loop);
}

function init() {
  canvas = document.getElementById('c');
  ctx    = canvas.getContext('2d');
  resize();

  // 最初に MIN_INST 個を即時生成
  for (let i = 0; i < MIN_INST; i++) instances.push(makeInstance());

  loop();

  let touchMoved = false;
  canvas.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  canvas.addEventListener('touchmove',  () => { touchMoved = true;  }, { passive: true });
  canvas.addEventListener('touchend',   () => {
    if (!touchMoved) {
      // タップ: 全消して新しく
      instances.forEach(inst => { inst.state = 'dying'; });
    }
  });
  canvas.addEventListener('click', () => {
    instances.forEach(inst => { inst.state = 'dying'; });
  });

  window.addEventListener('resize', () => { resize(); });
}

window.addEventListener('DOMContentLoaded', init);
