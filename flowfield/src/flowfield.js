// Flow Field: generates angle map from Perlin noise
class FlowField {
  constructor(cols, rows, scale) {
    this.cols         = cols;
    this.rows         = rows;
    this.scale        = scale;
    this.field        = new Float32Array(cols * rows);
    this.zOff         = 0;
    this.noiseScale   = 1.0;   // randomize でスケール変化
    this.angleMult    = 4.0;   // randomize で角度変化
  }

  randomize() {
    // ノイズスケール: 小（大きなうねり）〜大（細かい乱流）
    this.noiseScale = [0.4, 0.7, 1.0, 1.8, 3.5][Math.floor(Math.random() * 5)];
    // 角度倍率: 小（なめらか）〜大（螺旋・渦）
    this.angleMult  = [1.5, 3.0, 4.0, 6.0, 8.0][Math.floor(Math.random() * 5)];
    this.zOff       = 0;
  }

  update(mouseInfluence) {
    this.zOff += 0.003;
    const ns = this.scale * this.noiseScale;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        let n = noise.get(x * ns, y * ns + this.zOff);
        let angle = n * Math.PI * this.angleMult;

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
