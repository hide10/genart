// Draw epicycles and return tip position
function drawEpicycles(ctx, x, y, components, time, N, drawCircles) {
  for (const c of components) {
    const px = x, py = y;
    const angle = c.freq * time * (2 * Math.PI / N) + c.phase;
    x += c.amp * Math.cos(angle);
    y += c.amp * Math.sin(angle);

    if (drawCircles && c.amp > 0.5) {
      // 円
      ctx.beginPath();
      ctx.arc(px, py, c.amp, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      ctx.stroke();
      // 半径線
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(x, y);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }
  return { x, y };
}
