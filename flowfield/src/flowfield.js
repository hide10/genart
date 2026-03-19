// Flow Field: generates angle map from Perlin noise
class FlowField {
  constructor(cols, rows, scale) {
    this.cols  = cols;
    this.rows  = rows;
    this.scale = scale;
    this.field = new Float32Array(cols * rows);
    this.zOff  = 0;
  }

  update(mouseInfluence) {
    this.zOff += 0.003;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let n = noise.get(x * this.scale, y * this.scale + this.zOff);
        let angle = n * Math.PI * 4;

        // マウス影響：カーソル周辺の流れを乱す
        if (mouseInfluence) {
          const dx = x - mouseInfluence.cx;
          const dy = y - mouseInfluence.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < mouseInfluence.radius) {
            const strength = (1 - dist / mouseInfluence.radius) * 2.5;
            angle += Math.atan2(dy, dx) * strength;
          }
        }

        this.field[y * this.cols + x] = angle;
      }
    }
  }

  getAngle(x, y) {
    const col = Math.floor(x * this.scale);
    const row = Math.floor(y * this.scale);
    const c = Math.max(0, Math.min(this.cols - 1, col));
    const r = Math.max(0, Math.min(this.rows - 1, row));
    return this.field[r * this.cols + c];
  }
}
