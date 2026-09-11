/**
 * In-place radix-2 Cooley–Tukey FFT.
 * Frame spectra follow Johnston 1988 (SFM) and Boakye et al. Interspeech 2008
 * (60 ms analysis, 10 ms hop).
 */
export function fftRadix2(re: Float64Array, im: Float64Array): void {
  const n = re.length;
  if (n === 0 || (n & (n - 1)) !== 0) {
    throw new Error("FFT length must be a power of two");
  }
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) {
      j ^= bit;
    }
    j ^= bit;
    if (i < j) {
      const tr = re[i]!;
      const ti = im[i]!;
      re[i] = re[j]!;
      im[i] = im[j]!;
      re[j] = tr;
      im[j] = ti;
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wlenRe = Math.cos(ang);
    const wlenIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let wRe = 1;
      let wIm = 0;
      const half = len >> 1;
      for (let j = 0; j < half; j++) {
        const vr =
          re[i + j + half]! * wRe - im[i + j + half]! * wIm;
        const vi =
          re[i + j + half]! * wRe + im[i + j + half]! * wIm;
        const uRe = re[i + j]!;
        const uIm = im[i + j]!;
        re[i + j] = uRe + vr;
        im[i + j] = uIm + vi;
        re[i + j + half] = uRe - vr;
        im[i + j + half] = uIm - vi;
        const nextRe = wRe * wlenRe - wIm * wlenIm;
        wIm = wRe * wlenIm + wIm * wlenRe;
        wRe = nextRe;
      }
    }
  }
}

export function hamming(n: number): Float64Array {
  const w = new Float64Array(n);
  if (n === 1) {
    w[0] = 1;
    return w;
  }
  for (let i = 0; i < n; i++) {
    w[i] = 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
  }
  return w;
}

export function powerSpectrum(
  frame: ArrayLike<number>,
  fftN: number,
  window: Float64Array,
): Float64Array {
  const re = new Float64Array(fftN);
  const im = new Float64Array(fftN);
  const n = Math.min(frame.length, window.length, fftN);
  for (let i = 0; i < n; i++) {
    re[i] = frame[i]! * window[i]!;
  }
  fftRadix2(re, im);
  const bins = fftN / 2;
  const power = new Float64Array(bins);
  for (let k = 0; k < bins; k++) {
    power[k] = re[k]! * re[k]! + im[k]! * im[k]!;
  }
  return power;
}
