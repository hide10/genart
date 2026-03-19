// Discrete Fourier Transform
// Input: array of {re, im}
// Output: array of {freq, amp, phase, re, im}
function dft(signal) {
  const N = signal.length;
  const result = [];
  for (let k = 0; k < N; k++) {
    let re = 0, im = 0;
    for (let n = 0; n < N; n++) {
      const phi = (2 * Math.PI * k * n) / N;
      re +=  signal[n].re * Math.cos(phi) + signal[n].im * Math.sin(phi);
      im += -signal[n].re * Math.sin(phi) + signal[n].im * Math.cos(phi);
    }
    re /= N;
    im /= N;
    result.push({
      freq:  k,
      amp:   Math.sqrt(re * re + im * im),
      phase: Math.atan2(im, re),
      re, im,
    });
  }
  // 振幅の大きい順（大きな円から描く）
  result.sort((a, b) => b.amp - a.amp);
  return result;
}
