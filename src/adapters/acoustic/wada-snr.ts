/**
 * WADA-SNR (Waveform Amplitude Distribution Analysis).
 * Kim & Stern, Interspeech 2008: clean speech ≈ Gamma(shape 0.4),
 * additive noise ≈ Gaussian. G = log(E[|z|]) − E[log|z|] maps to SNR.
 * Lookup is a coarse interpolation of the published table
 * (Ellis LabROSA / Kim & Stern implementation).
 */
const WADA_G = [
  0.409, 0.42, 0.45, 0.5, 0.58, 0.7, 0.85, 1.05, 1.25, 1.4, 1.52, 1.58, 1.63,
];
const WADA_SNR_DB = [-20, -10, 0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

export function wadaSnrDb(samples: Float32Array): number {
  if (samples.length === 0) {
    return 0;
  }
  let peak = 0;
  for (let i = 0; i < samples.length; i++) {
    peak = Math.max(peak, Math.abs(samples[i]!));
  }
  if (peak < 1e-12) {
    return 0;
  }
  const minVal = 1e-10;
  let absSum = 0;
  let logSum = 0;
  for (let i = 0; i < samples.length; i++) {
    const a = Math.max(Math.abs(samples[i]!) / peak, minVal);
    absSum += a;
    logSum += Math.log(a);
  }
  const g = Math.log(absSum / samples.length) - logSum / samples.length;
  if (g <= WADA_G[0]!) {
    return WADA_SNR_DB[0]!;
  }
  for (let i = 0; i < WADA_G.length - 1; i++) {
    const g0 = WADA_G[i]!;
    const g1 = WADA_G[i + 1]!;
    if (g <= g1) {
      const t = (g - g0) / (g1 - g0);
      return WADA_SNR_DB[i]! + t * (WADA_SNR_DB[i + 1]! - WADA_SNR_DB[i]!);
    }
  }
  return WADA_SNR_DB[WADA_SNR_DB.length - 1]!;
}
