const PARTICLE_COUNT = 3500;
const NOISE_SCALE    = 0.003;
const CELL_SIZE      = 10;

let speedTime = 0;  // 時間で自動変化するスピード用

const PALETTES = [
  [ {h:190,s:100,l:45}, {h:200,s:95,l:48}, {h:210,s:90,l:50},
    {h:175,s:100,l:42}, {h:185,s:95,l:46}, {h:220,s:85,l:52},
    {h:165,s:100,l:44}, {h:195,s:98,l:50} ],
  [ {h:15,s:100,l:48},  {h:25,s:95,l:50},  {h:35,s:90,l:50},
    {h:5,s:100,l:44},   {h:45,s:90,l:50},  {h:0,s:100,l:46},
    {h:55,s:85,l:50},   {h:20,s:98,l:48} ],
  [ {h:45,s:100,l:48},  {h:40,s:95,l:46},  {h:50,s:100,l:50},
    {h:35,s:90,l:44},   {h:55,s:95,l:50},  {h:42,s:100,l:45},
    {h:48,s:98,l:48},   {h:38,s:92,l:46} ],
  [ {h:280,s:90,l:50},  {h:300,s:88,l:50}, {h:320,s:92,l:50},
    {h:265,s:85,l:46},  {h:310,s:95,l:52}, {h:340,s:90,l:50},
    {h:250,s:80,l:48},  {h:295,s:92,l:52} ],
];

let canvas, ctx, field, particles;
let paletteIdx = 0;
let mouse = null;
let W, H;

// スピードはサイン波で自動変化（0.5〜4.5）
function currentSpeed() {
  speedTime += 0.003;
  return 0.5 + (Math.sin(speedTime) * 0.5 + 0.5) * 4.0;
}

function randomizeAll() {
  noise.setSeed(Math.floor(Math.random() * 1e6));
  field.randomize();
  paletteIdx = Math.floor(Math.random() * PALETTES.length);
  speedTime  = Math.random() * Math.PI * 2;  // 位相もランダムに
  ctx.clearRect(0, 0, W, H);
  spawnParticles();
}

function spawnParticles() {
  particles = Array.from(
    {length: PARTICLE_COUNT},
    () => new Particle(W, H, PALETTES[paletteIdx])
  );
}

function resize() {
  W = canvas.width  = window.innerWidth;
  H = canvas.height = window.innerHeight;
}

function loop() {
  ctx.fillStyle = 'rgba(10,10,15,0.04)';
  ctx.fillRect(0, 0, W, H);

  const mi = mouse ? {
    cx: mouse.x * NOISE_SCALE * 10,
    cy: mouse.y * NOISE_SCALE * 10,
    radius: 12
  } : null;

  field.update(mi);

  for (const p of particles) {
    p.update(field, currentSpeed());
    p.draw(ctx);
  }

  requestAnimationFrame(loop);
}

function init() {
  canvas = document.getElementById('c');
  ctx    = canvas.getContext('2d');

  resize();

  const cols = Math.ceil(W / CELL_SIZE);
  const rows = Math.ceil(H / CELL_SIZE);
  field = new FlowField(
    Math.ceil(cols * CELL_SIZE * NOISE_SCALE * 10),
    Math.ceil(rows * CELL_SIZE * NOISE_SCALE * 10),
    NOISE_SCALE * 10
  );
  field.randomize();
  spawnParticles();
  loop();

  // タップ / クリック → 全部ランダム変更
  let touchMoved = false;
  canvas.addEventListener('touchstart', () => { touchMoved = false; }, { passive: true });
  canvas.addEventListener('touchmove',  e => {
    touchMoved = true;
    mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', () => {
    mouse = null;
    if (!touchMoved) randomizeAll();
  });

  canvas.addEventListener('click', () => randomizeAll());
  canvas.addEventListener('mousemove', e => { mouse = { x: e.clientX, y: e.clientY }; });
  canvas.addEventListener('mouseleave', () => { mouse = null; });

  window.addEventListener('resize', () => { resize(); spawnParticles(); });
}

window.addEventListener('DOMContentLoaded', init);
