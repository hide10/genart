const PARTICLE_COUNT = 3500;
const NOISE_SCALE    = 0.003;
const CELL_SIZE      = 10;

const SPEEDS = [0.7, 2.0, 4.5];
let speedIdx = 1;

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

let canvas, ctx, field, particles, menu, overlay;
let paletteIdx = 0;
let mouse = null;
let W, H;
let holdTimer = null;
let holdFired = false;

function currentSpeed() { return SPEEDS[speedIdx]; }

function newSeed() {
  noise.setSeed(Math.floor(Math.random() * 1e6));
  ctx.clearRect(0, 0, W, H);
  spawnParticles();
}

function nextPalette() {
  paletteIdx = (paletteIdx + 1) % PALETTES.length;
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

// --- メニュー ---
function openMenu()  { menu.hidden = false; overlay.hidden = false; }
function closeMenu() { menu.hidden = true;  overlay.hidden = true; }

function updateSpeedButtons() {
  ['btn-slow', 'btn-mid', 'btn-fast'].forEach((id, i) => {
    document.getElementById(id).classList.toggle('active', i === speedIdx);
  });
}

// --- 長押し ---
function startHold() {
  holdFired = false;
  holdTimer = setTimeout(() => {
    holdFired = true;
    openMenu();
  }, 500);
}

function cancelHold() {
  clearTimeout(holdTimer);
  holdTimer = null;
}

function init() {
  canvas  = document.getElementById('c');
  ctx     = canvas.getContext('2d');
  menu    = document.getElementById('menu');
  overlay = document.getElementById('overlay');

  resize();

  const cols = Math.ceil(W / CELL_SIZE);
  const rows = Math.ceil(H / CELL_SIZE);
  field = new FlowField(
    Math.ceil(cols * CELL_SIZE * NOISE_SCALE * 10),
    Math.ceil(rows * CELL_SIZE * NOISE_SCALE * 10),
    NOISE_SCALE * 10
  );

  spawnParticles();
  loop();

  // メニューボタン
  document.getElementById('btn-seed').addEventListener('click', () => { newSeed(); closeMenu(); });
  document.getElementById('btn-palette').addEventListener('click', () => { nextPalette(); closeMenu(); });
  ['btn-slow', 'btn-mid', 'btn-fast'].forEach((id, i) => {
    document.getElementById(id).addEventListener('click', () => {
      speedIdx = i;
      updateSpeedButtons();
      ctx.clearRect(0, 0, W, H);
      spawnParticles();
      closeMenu();
    });
  });
  document.getElementById('btn-close').addEventListener('click', closeMenu);
  overlay.addEventListener('click', closeMenu);

  // マウス
  canvas.addEventListener('mousedown', () => startHold());
  canvas.addEventListener('mousemove', e => {
    cancelHold();
    mouse = { x: e.clientX, y: e.clientY };
  });
  canvas.addEventListener('mouseup', () => {
    cancelHold();
    if (!holdFired) newSeed();
  });
  canvas.addEventListener('mouseleave', () => { mouse = null; });

  // タッチ
  canvas.addEventListener('touchstart', () => startHold(), { passive: true });
  canvas.addEventListener('touchmove', e => {
    cancelHold();
    mouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }, { passive: true });
  canvas.addEventListener('touchend', () => {
    cancelHold();
    mouse = null;
    if (!holdFired) newSeed();
  });

  window.addEventListener('resize', () => { resize(); spawnParticles(); });
}

window.addEventListener('DOMContentLoaded', init);
