// Strange Attractor — sketch.js

let canvas, ctx, W, H;
let overlayCanvas, overlayCtx;

let acc, imageData;
let dynLut = new Uint8Array(256 * 3);

let attrX = 0.1, attrY = 0.1;
let params  = {};
let mapping = { ox: 0, oy: 0, scale: 1 };
let currentType = 'clifford';
let frameCount  = 0;
let startTime   = 0;
const DURATION_MS = 120000;

let globalHue     = 0;
let prevVx = 0, prevVy = 0;
let explosions    = [];
let targetX = 0, targetY = 0;
let segProgress   = 0;
const SEG_FRAMES  = 150;
let currentBrushR = 1.0;

const ATTRACTORS = {
  clifford: {
    step: (x, y, p) => ({
      x: Math.sin(p.a * y) + p.c * Math.cos(p.a * x),
      y: Math.sin(p.b * x) + p.d * Math.cos(p.b * y),
    }),
    random: () => ({
      a: (Math.random() - 0.5) * 4,  b: (Math.random() - 0.5) * 4,
      c: (Math.random() - 0.5) * 4,  d: (Math.random() - 0.5) * 4,
    }),
  },
  dejong: {
    step: (x, y, p) => ({
      x: Math.sin(p.a * y) - Math.cos(p.b * x),
      y: Math.sin(p.c * x) - Math.cos(p.d * y),
    }),
    random: () => ({
      a: (Math.random() - 0.5) * 6,  b: (Math.random() - 0.5) * 6,
      c: (Math.random() - 0.5) * 6,  d: (Math.random() - 0.5) * 6,
    }),
  },
};

function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360; s /= 100; l /= 100;
  const c = (1 - Math.abs(2*l - 1)) * s;
  const x = c * (1 - Math.abs((h/60)%2 - 1));
  const m = l - c/2;
  let r=0,g=0,b=0;
  if      (h<60)  {r=c;g=x;} else if (h<120) {r=x;g=c;}
  else if (h<180) {g=c;b=x;} else if (h<240) {g=x;b=c;}
  else if (h<300) {r=x;b=c;} else            {r=c;b=x;}
  return [(r+m)*255,(g+m)*255,(b+m)*255];
}

// globalHue ベースのカラーLUT（毎フレーム再計算）
function rebuildDynLut() {
  for (let i = 0; i < 256; i++) {
    const t   = i / 255;
    const hue = (globalHue + t * 160) % 360;
    const lit = 8 + t * 52;
    const [r, g, b] = hslToRgb(hue, 72, lit);
    dynLut[i*3] = r|0; dynLut[i*3+1] = g|0; dynLut[i*3+2] = b|0;
  }
}

function initBuffer() {
  acc       = new Float32Array(W * H);
  imageData = ctx.createImageData(W, H);
  for (let i = 3; i < imageData.data.length; i += 4) imageData.data[i] = 255;
}

function clearBuffer() { acc.fill(0); }

function warmup(attr) {
  let x = 0.1, y = 0.1;
  for (let i = 0; i < 500; i++) ({ x, y } = attr.step(x, y, params));
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  const visited = new Set();
  for (let i = 0; i < 5000; i++) {
    ({ x, y } = attr.step(x, y, params));
    if (!isFinite(x) || !isFinite(y)) return null;
    minX=Math.min(minX,x); maxX=Math.max(maxX,x);
    minY=Math.min(minY,y); maxY=Math.max(maxY,y);
    visited.add(`${(x*10)|0},${(y*10)|0}`);
  }
  if (visited.size < 80) return null;
  const rangeX = maxX-minX, rangeY = maxY-minY;
  if (rangeX < 0.3 || rangeY < 0.3) return null;
  const pad=0.10, scaleX=W*(1-2*pad)/rangeX, scaleY=H*(1-2*pad)/rangeY;
  const scale=Math.min(scaleX,scaleY);
  return { x, y, mapping: {
    ox: W/2-(minX+rangeX/2)*scale,
    oy: H/2-(minY+rangeY/2)*scale,
    scale,
  }};
}

function randomize() {
  const types  = Object.keys(ATTRACTORS);
  const others = types.filter(t => t !== currentType);
  currentType  = Math.random() < 0.6
    ? others[Math.floor(Math.random() * others.length)] : currentType;
  const attr = ATTRACTORS[currentType];
  let result = null, tries = 0;
  while (!result && tries++ < 30) { params = attr.random(); result = warmup(attr); }
  if (!result) { randomize(); return; }
  attrX=result.x; attrY=result.y; mapping=result.mapping;
  clearBuffer();
  explosions=[]; currentBrushR=1.0;
  frameCount=0; startTime=performance.now();
  const fs = ATTRACTORS[currentType].step(attrX, attrY, params);
  targetX=fs.x; targetY=fs.y; segProgress=0;
  prevVx=targetX-attrX; prevVy=targetY-attrY;
}

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
  if (overlayCanvas) { overlayCanvas.width=W; overlayCanvas.height=H; }
}

// ガウシアンブラシでaccに積む
function plotLine(x0, y0, x1, y1, R) {
  const dx=Math.abs(x1-x0), dy=Math.abs(y1-y0);
  const steps=Math.max(dx,dy,1);
  const sx=(x1-x0)/steps, sy=(y1-y0)/steps;
  let cx=x0, cy=y0;
  const sigma2 = R*R*2.0;
  const w = 0.06;
  for (let s=0; s<=steps; s++) {
    const lx=cx|0, ly=cy|0;
    for (let bdy=-R; bdy<=R; bdy++) {
      for (let bdx=-R; bdx<=R; bdx++) {
        const d2=bdx*bdx+bdy*bdy;
        if (d2<=R*R) {
          const px=lx+bdx, py=ly+bdy;
          if (px>=0&&px<W&&py>=0&&py<H)
            acc[py*W+px] += w * Math.exp(-d2/sigma2);
        }
      }
    }
    cx+=sx; cy+=sy;
  }
}

function loop() {
  const attr     = ATTRACTORS[currentType];
  const isMobile = Math.min(W,H) < 500;
  const headR    = isMobile ? 14 : 22;
  const thinR    = isMobile ? 0.4 : 0.6;
  const thickR   = isMobile ? 1.5 : 2.5;
  const { ox, oy, scale } = mapping;

  globalHue = (globalHue + 0.08) % 360;
  rebuildDynLut();

  // accをゆっくりフェード
  for (let i=0; i<W*H; i++) acc[i] *= 0.9997;

  // セグメントを毎フレーム進める
  const prevProgress = segProgress;
  segProgress += 1.0 / SEG_FRAMES;
  const segAX=attrX, segAY=attrY, segBX=targetX, segBY=targetY;
  let headPx, headPy, drawX0, drawY0, drawX1, drawY1;

  if (segProgress >= 1.0) {
    drawX0=segAX+(segBX-segAX)*prevProgress; drawY0=segAY+(segBY-segAY)*prevProgress;
    drawX1=segBX; drawY1=segBY;
    attrX=segBX; attrY=segBY;
    const {x:nx,y:ny}=attr.step(attrX,attrY,params);
    const vx=nx-attrX, vy=ny-attrY;
    const speed=Math.sqrt(vx*vx+vy*vy), pSpeed=Math.sqrt(prevVx*prevVx+prevVy*prevVy);
    if (speed>0&&pSpeed>0) {
      const cosA=(vx*prevVx+vy*prevVy)/(speed*pSpeed);
      if (cosA<0.1) {
        const epx=(attrX*scale+ox)|0, epy=(attrY*scale+oy)|0;
        const intensity=Math.min(1,-cosA*1.5);
        explosions.push({px:epx,py:epy,age:0,maxAge:300,hue:globalHue,intensity});
        currentBrushR = thinR + Math.random()*(thickR-thinR);
      }
    }
    prevVx=vx; prevVy=vy;
    targetX=nx; targetY=ny; segProgress-=1.0;
    headPx=(attrX*scale+ox)|0; headPy=(attrY*scale+oy)|0;
  } else {
    drawX0=segAX+(segBX-segAX)*prevProgress; drawY0=segAY+(segBY-segAY)*prevProgress;
    drawX1=segAX+(segBX-segAX)*segProgress;  drawY1=segAY+(segBY-segAY)*segProgress;
    headPx=(drawX1*scale+ox)|0; headPy=(drawY1*scale+oy)|0;
  }

  const R = Math.max(1, Math.round(currentBrushR * 2));
  plotLine((drawX0*scale+ox)|0,(drawY0*scale+oy)|0,
           (drawX1*scale+ox)|0,(drawY1*scale+oy)|0, R);

  // acc → dynLut でレンダリング（log正規化 → 白飛びなし）
  const logMax = 1.2;
  const d = imageData.data;
  for (let i=0; i<W*H; i++) {
    const ti = acc[i]>0 ? Math.min(255,(Math.log1p(acc[i])/logMax*255)|0) : 0;
    const idx=i*4;
    d[idx]=dynLut[ti*3]; d[idx+1]=dynLut[ti*3+1]; d[idx+2]=dynLut[ti*3+2];
  }
  ctx.putImageData(imageData,0,0);

  // 現在のストロークをcanvas 2Dで重ね描き（滑らかなアンチエイリアス）
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  ctx.lineCap='round'; ctx.lineJoin='round';
  ctx.strokeStyle = `hsla(${globalHue},60%,65%,0.5)`;
  ctx.lineWidth   = currentBrushR;
  ctx.shadowColor = `hsl(${globalHue},55%,55%)`;
  ctx.shadowBlur  = currentBrushR * 2;
  ctx.beginPath();
  ctx.moveTo((drawX0*scale+ox),(drawY0*scale+oy));
  ctx.lineTo((drawX1*scale+ox),(drawY1*scale+oy));
  ctx.stroke();

  // 流星の頭
  ctx.shadowBlur = 0;
  const grad=ctx.createRadialGradient(headPx,headPy,0,headPx,headPy,headR);
  grad.addColorStop(0,  `hsla(${globalHue},60%,80%,0.85)`);
  grad.addColorStop(0.4,`hsla(${globalHue},50%,60%,0.35)`);
  grad.addColorStop(1,  `hsla(${globalHue},40%,40%,0)`);
  ctx.fillStyle=grad;
  ctx.beginPath(); ctx.arc(headPx,headPy,headR,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // 爆発（overlayCanvasに描画 → 毎フレームクリアで残像なし）
  overlayCtx.clearRect(0,0,W,H);
  overlayCtx.save();
  overlayCtx.globalCompositeOperation='screen';
  for (let i=explosions.length-1; i>=0; i--) {
    const ex=explosions[i];
    const t=ex.age/ex.maxAge;
    const r=15+t*180*ex.intensity;
    const alpha=(1-t)*0.8*ex.intensity;
    overlayCtx.strokeStyle=`hsla(${ex.hue},65%,70%,${alpha})`;
    overlayCtx.lineWidth=2.5*(1-t*0.7);
    overlayCtx.shadowColor=`hsla(${ex.hue},60%,55%,${alpha*0.5})`;
    overlayCtx.shadowBlur=12;
    overlayCtx.beginPath(); overlayCtx.arc(ex.px,ex.py,r,0,Math.PI*2); overlayCtx.stroke();
    ex.age++;
    if (ex.age>=ex.maxAge) explosions.splice(i,1);
  }
  overlayCtx.restore();

  frameCount++;
  if (performance.now()-startTime>=DURATION_MS) randomize();
  requestAnimationFrame(loop);
}

function init() {
  canvas = document.getElementById('c');
  ctx    = canvas.getContext('2d');
  overlayCanvas = document.createElement('canvas');
  overlayCanvas.style.cssText='position:absolute;top:0;left:0;pointer-events:none';
  canvas.parentElement.appendChild(overlayCanvas);
  overlayCtx = overlayCanvas.getContext('2d');
  resize(); initBuffer(); randomize(); loop();

  let touchMoved=false;
  canvas.addEventListener('touchstart',()=>{touchMoved=false;},{passive:true});
  canvas.addEventListener('touchmove', ()=>{touchMoved=true; },{passive:true});
  canvas.addEventListener('touchend',  ()=>{if(!touchMoved)randomize();});
  canvas.addEventListener('click',     ()=>randomize());
  window.addEventListener('resize',()=>{resize();initBuffer();randomize();});
}

window.addEventListener('DOMContentLoaded',init);
