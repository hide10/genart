// Particle: follows flow field angles
class Particle {
  constructor(w, h, palette) {
    this.w = w;
    this.h = h;
    this.palette = palette;
    this.reset();
  }

  reset() {
    this.x    = Math.random() * this.w;
    this.y    = Math.random() * this.h;
    this.vx   = 0;
    this.vy   = 0;
    this.life = Math.random() * 200 + 80;
    this.age  = 0;
    this.speed = Math.random() * 1.5 + 1.0;
    this.colorIdx = Math.floor(Math.random() * this.palette.length);
  }

  update(field, globalSpeed = 2.0) {
    const angle = field.getAngle(this.x, this.y);
    const s = this.speed * globalSpeed * 0.15;
    this.vx = this.vx * 0.88 + Math.cos(angle) * s;
    this.vy = this.vy * 0.88 + Math.sin(angle) * s;
    this.x += this.vx;
    this.y += this.vy;
    this.age++;
    if (this.age > this.life ||
        this.x < 0 || this.x > this.w ||
        this.y < 0 || this.y > this.h) {
      this.reset();
    }
  }

  draw(ctx) {
    const t = this.age / this.life;
    const alpha = t < 0.1 ? t / 0.1 : t > 0.8 ? (1 - t) / 0.2 : 1;
    const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    const c = this.palette[this.colorIdx];
    ctx.strokeStyle = `hsla(${c.h},${c.s}%,${c.l}%,${alpha * 0.85})`;
    ctx.lineWidth = 0.8 + speed * 0.3;
    ctx.beginPath();
    ctx.moveTo(this.x - this.vx * 2, this.y - this.vy * 2);
    ctx.lineTo(this.x, this.y);
    ctx.stroke();
  }
}
