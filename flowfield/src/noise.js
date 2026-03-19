// Perlin Noise (simplex-like 2D implementation)
// Based on Stefan Gustavson's public domain implementation

const noise = (() => {
  const grad3 = [
    [1,1,0],[-1,1,0],[1,-1,0],[-1,-1,0],
    [1,0,1],[-1,0,1],[1,0,-1],[-1,0,-1],
    [0,1,1],[0,-1,1],[0,1,-1],[0,-1,-1]
  ];

  let perm = new Uint8Array(512);
  let seed = 0;

  function setSeed(s) {
    seed = s;
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    let n = s & 0xffffffff;
    for (let i = 255; i > 0; i--) {
      n = (n * 1664525 + 1013904223) & 0xffffffff;
      const j = ((n >>> 0) % (i + 1));
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  }

  function dot(g, x, y) { return g[0] * x + g[1] * y; }

  function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }

  function lerp(a, b, t) { return a + t * (b - a); }

  function get(x, y) {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a  = perm[X]   + Y, aa = perm[a], ab = perm[a + 1];
    const b  = perm[X+1] + Y, ba = perm[b], bb = perm[b + 1];
    return lerp(
      lerp(dot(grad3[aa & 11], x,   y  ), dot(grad3[ba & 11], x-1, y  ), u),
      lerp(dot(grad3[ab & 11], x,   y-1), dot(grad3[bb & 11], x-1, y-1), u),
      v
    );
  }

  setSeed(Math.floor(Math.random() * 100000));
  return { get, setSeed };
})();
