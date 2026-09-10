/**
 * Shared acoustic feature extractor.
 *
 * Spectral flatness: Johnston, IEEE J-SAC 1988 (geometric/arithmetic mean of
 * the power spectrum), averaged over frames as in Boakye et al., Interspeech 2008
 * (60 ms window, 10 ms hop).
 *
 * Alpha ratio and Hammarberg index on unvoiced frames: Eyben et al., IEEE TAC
 * 2016, GeMAPS / eGeMAPS.
 *
 * Envelope modulation 2–8 Hz is measured (Greenberg/Kingsbury; Festen & Plomp)
 * but is not a noise-family vote: the mix's 4 Hz peak is usually the
 * foreground talker, not TV.
 *
 * HNR / harmonic energy ratio: Boersma, IFA Proceedings 1993; Boakye 2008 HER.
 *
 * WADA-SNR: Kim & Stern, Interspeech 2008.
 *
 * Stereo overlap: Xiao, Ghosh, Georgiou & Narayanan, ICASSP 2011 (both-channel
 * energy baseline). Pearson ρ: high correlation is crosstalk, not two sources
 * (Ghosh et al., Interspeech 2010; Pfau, Ellis & Stolcke, ASRU 2001). Dual-mono
 * (ρ ≈ 1) ignores channels.
 */
import {
  DUAL_MONO_CORR_MIN,
  AROUSAL_F0_RANGE_HZ,
  CLEAN_HNR_MIN_DB,
  HARMONICITY_HNR_MAX_DB,
  HARMONICITY_SFM_MAX,
  STATIC_UNVOICED_FRACTION_MIN,
  STATIC_UNVOICED_SFM_MIN,
  STEREO_OVERLAP_BOTH_ACTIVE_MIN,
  STEREO_OVERLAP_CORR_MAX,
  VAD_HANGOVER_FRAMES,
} from "@/domain/constants";
import {
  acousticMeasurements,
  type AcousticMeasurements,
  type NoiseFamily,
  type OverlapEvidence,
} from "@/domain/prediction";
import { hamming, powerSpectrum } from "./fft";
import { wadaSnrDb } from "./wada-snr";

export const SAMPLE_RATE = 16000;
const FRAME_SEC = 0.06;
const HOP_SEC = 0.01;
const FFT_N = 1024;
const MIN_F0_HZ = 80;
const MAX_F0_HZ = 400;

const FRAME = Math.round(FRAME_SEC * SAMPLE_RATE);
const HOP = Math.round(HOP_SEC * SAMPLE_RATE);
const WINDOW = hamming(FRAME);
const BIN_HZ = SAMPLE_RATE / FFT_N;

function frameEnergy(samples: Float32Array, start: number, size: number): number {
  let sum = 0;
  const end = Math.min(start + size, samples.length);
  for (let i = start; i < end; i++) {
    const v = samples[i]!;
    sum += v * v;
  }
  return Math.sqrt(sum / Math.max(1, end - start));
}

function spectralFlatnessOf(power: Float64Array): number {
  let logSum = 0;
  let arith = 0;
  let count = 0;
  for (let k = 1; k < power.length; k++) {
    const p = Math.max(power[k]!, 1e-12);
    logSum += Math.log(p);
    arith += p;
    count += 1;
  }
  if (count === 0 || arith === 0) {
    return 0.5;
  }
  return Math.exp(logSum / count) / (arith / count);
}

function bandSum(power: Float64Array, hz0: number, hz1: number): number {
  const k0 = Math.max(1, Math.floor(hz0 / BIN_HZ));
  const k1 = Math.min(power.length - 1, Math.ceil(hz1 / BIN_HZ));
  let sum = 0;
  for (let k = k0; k <= k1; k++) {
    sum += power[k]!;
  }
  return sum;
}

function bandPeak(power: Float64Array, hz0: number, hz1: number): number {
  const k0 = Math.max(1, Math.floor(hz0 / BIN_HZ));
  const k1 = Math.min(power.length - 1, Math.ceil(hz1 / BIN_HZ));
  let peak = 1e-12;
  for (let k = k0; k <= k1; k++) {
    peak = Math.max(peak, power[k]!);
  }
  return peak;
}

function zeroCrossingRate(frame: Float32Array): number {
  if (frame.length < 2) {
    return 0;
  }
  let zc = 0;
  for (let i = 1; i < frame.length; i++) {
    if (frame[i]! === 0 || frame[i - 1]! === 0) {
      continue;
    }
    if (frame[i]! > 0 !== frame[i - 1]! > 0) {
      zc += 1;
    }
  }
  return zc / (frame.length - 1);
}

function autocorrelationPeak(
  frame: Float32Array,
  minLag: number,
  maxLag: number,
): { lag: number; peak: number; energy: number } {
  let energy = 0;
  for (let i = 0; i < frame.length; i++) {
    energy += frame[i]! * frame[i]!;
  }
  let bestLag = minLag;
  let best = 0;
  for (let lag = minLag; lag <= maxLag && lag < frame.length; lag++) {
    let sum = 0;
    for (let i = 0; i + lag < frame.length; i++) {
      sum += frame[i]! * frame[i + lag]!;
    }
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  return { lag: bestLag, peak: best, energy };
}

function harmonicEnergyRatio(power: Float64Array, f0Hz: number): number {
  if (f0Hz <= 0) {
    return 0;
  }
  let harmonic = 0;
  let total = 0;
  for (let k = 1; k < power.length; k++) {
    total += power[k]!;
  }
  const maxHarmonic = Math.floor((SAMPLE_RATE / 2 - BIN_HZ) / f0Hz);
  for (let h = 1; h <= maxHarmonic; h++) {
    const center = Math.round((h * f0Hz) / BIN_HZ);
    for (let d = -2; d <= 2; d++) {
      const k = center + d;
      if (k > 0 && k < power.length) {
        harmonic += power[k]!;
      }
    }
  }
  if (total <= 1e-12) {
    return 0;
  }
  return Math.min(1, harmonic / total);
}

function pearson(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) {
    return 1;
  }
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i]!;
    sb += b[i]!;
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i]! - ma;
    const xb = b[i]! - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const den = Math.sqrt(da * db);
  if (den < 1e-12) {
    return 1;
  }
  return num / den;
}

function mixDown(left: Float32Array, right: Float32Array): Float32Array {
  const n = Math.min(left.length, right.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = 0.5 * (left[i]! + right[i]!);
  }
  return out;
}

function modulationRatio(envelope: number[], hopSec: number): number {
  if (envelope.length < 16) {
    return 0;
  }
  let fftN = 1;
  while (fftN < envelope.length) {
    fftN <<= 1;
  }
  fftN = Math.min(fftN, 2048);
  const window = hamming(Math.min(envelope.length, fftN));
  const frame = envelope.slice(0, window.length);
  const power = powerSpectrum(frame, fftN, window);
  const df = 1 / (fftN * hopSec);
  let peak = 0;
  let sum = 0;
  let count = 0;
  for (let k = 1; k < power.length; k++) {
    const hz = k * df;
    if (hz > 20) {
      break;
    }
    sum += power[k]!;
    count += 1;
    if (hz >= 2 && hz <= 8) {
      peak = Math.max(peak, power[k]!);
    }
  }
  if (count === 0 || sum <= 1e-12) {
    return 0;
  }
  return peak / (sum / count);
}

/**
 * Three-way residual class. Mix-envelope 4 Hz is the talker's syllabic rhythm
 * (Greenberg/Kingsbury), so it must not mean "background TV". Static is
 * sustained unvoiced high SFM (Johnston), not a handful of fricatives.
 * Clean is a positive HNR decision (Boersma), not the leftover bin.
 */
function classifyNoiseFamily(input: {
  unvoicedSfm: number;
  unvoicedFraction: number;
  hnrDb: number;
}): NoiseFamily {
  if (
    input.unvoicedSfm >= STATIC_UNVOICED_SFM_MIN &&
    input.unvoicedFraction >= STATIC_UNVOICED_FRACTION_MIN
  ) {
    return "static";
  }
  if (
    input.hnrDb >= CLEAN_HNR_MIN_DB &&
    input.unvoicedSfm < STATIC_UNVOICED_SFM_MIN
  ) {
    return "clean";
  }
  return "uncertain";
}

/** Stereo first; mono HER/HNR only as Gemini-confirm (Boakye: FAs cost more than misses). */
function classifyOverlapEvidence(input: {
  channelCorrelation: number;
  bothChannelsActiveFraction: number;
  hnrDb: number;
  spectralFlatness: number;
  f0RangeHz: number;
}): OverlapEvidence {
  if (
    input.channelCorrelation < STEREO_OVERLAP_CORR_MAX &&
    input.bothChannelsActiveFraction >= STEREO_OVERLAP_BOTH_ACTIVE_MIN
  ) {
    return "stereo_both_active";
  }
  if (
    input.hnrDb <= HARMONICITY_HNR_MAX_DB &&
    input.spectralFlatness <= HARMONICITY_SFM_MAX &&
    input.f0RangeHz < AROUSAL_F0_RANGE_HZ
  ) {
    return "harmonicity";
  }
  return "none";
}

export function measurePcm(samples: Float32Array): AcousticMeasurements {
  return measureStereo(samples, samples);
}

export function measureStereo(
  left: Float32Array,
  right: Float32Array,
): AcousticMeasurements {
  const samples = mixDown(left, right);
  const durationSec = samples.length / SAMPLE_RATE;
  if (samples.length === 0) {
    return acousticMeasurements({ durationSec: 0, rms: 0, snrDb: 0 });
  }

  let sumSq = 0;
  let clipped = 0;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i]!;
    sumSq += v * v;
    if (Math.abs(v) >= 0.99) {
      clipped += 1;
    }
  }
  const rms = Math.sqrt(sumSq / samples.length);
  const energies: number[] = [];
  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    energies.push(frameEnergy(samples, start, FRAME));
  }
  const sorted = [...energies].sort((a, b) => a - b);
  const p10 = sorted[Math.max(0, Math.floor(sorted.length * 0.1))] ?? 0;
  const p50 = sorted[Math.max(0, Math.floor(sorted.length * 0.5))] ?? 0;
  const hasPause = p10 < p50 * 0.4;
  const speechThresh = hasPause
    ? Math.max(0.01, p10 * 3, rms * 0.25)
    : Math.max(0.01, rms * 0.15);

  let hangover = 0;
  let longest = 0;
  let current = 0;
  let speechEnergy = 0;
  let speechCount = 0;
  let noiseEnergy = 0;
  let noiseCount = 0;
  for (const energy of energies) {
    const rawSpeech = energy >= speechThresh;
    if (rawSpeech) {
      hangover = VAD_HANGOVER_FRAMES;
    } else if (hangover > 0) {
      hangover -= 1;
    }
    const isSpeech = rawSpeech || hangover > 0;
    if (!isSpeech) {
      current += HOP_SEC;
      longest = Math.max(longest, current);
      noiseEnergy += energy * energy;
      noiseCount += 1;
    } else {
      current = 0;
      speechEnergy += energy * energy;
      speechCount += 1;
    }
  }
  const speechRms = speechCount ? Math.sqrt(speechEnergy / speechCount) : rms;
  const noiseRms = noiseCount
    ? Math.sqrt(noiseEnergy / noiseCount)
    : Math.max(rms * 0.05, 1e-6);
  const snrDb = 20 * Math.log10((speechRms + 1e-8) / (noiseRms + 1e-8));

  const minLag = Math.floor(SAMPLE_RATE / MAX_F0_HZ);
  const maxLag = Math.floor(SAMPLE_RATE / MIN_F0_HZ);
  const sfms: number[] = [];
  const unvoicedSfms: number[] = [];
  const unvoicedAlpha: number[] = [];
  const unvoicedHamm: number[] = [];
  const unvoicedZcrs: number[] = [];
  const f0s: number[] = [];
  let hnrSum = 0;
  let hnrCount = 0;
  let herSum = 0;
  let herCount = 0;

  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    const frame = samples.subarray(start, start + FRAME);
    const copy = new Float32Array(frame);
    const power = powerSpectrum(copy, FFT_N, WINDOW);
    const sfm = spectralFlatnessOf(power);
    sfms.push(sfm);
    const { lag, peak, energy: acEnergy } = autocorrelationPeak(
      copy,
      minLag,
      maxLag,
    );
    const voiced = acEnergy > 0 && peak / acEnergy >= 0.3;
    if (voiced) {
      const f0 = SAMPLE_RATE / lag;
      f0s.push(f0);
      const residual = Math.max(acEnergy - peak, 1e-12);
      hnrSum += 10 * Math.log10(Math.max(peak, 1e-12) / residual);
      hnrCount += 1;
      herSum += harmonicEnergyRatio(power, f0);
      herCount += 1;
    } else {
      unvoicedSfms.push(sfm);
      const low = bandSum(power, 50, 1000);
      const high = bandSum(power, 1000, 5000);
      unvoicedAlpha.push(10 * Math.log10((low + 1e-12) / (high + 1e-12)));
      unvoicedHamm.push(
        10 * Math.log10(bandPeak(power, 0, 2000) / bandPeak(power, 2000, 5000)),
      );
      unvoicedZcrs.push(zeroCrossingRate(copy));
    }
  }

  const mean = (values: number[], fallback: number): number => {
    if (values.length === 0) {
      return fallback;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };

  const spectralFlatness = mean(sfms, 0.5);
  const unvoicedSpectralFlatness = mean(unvoicedSfms, spectralFlatness);
  const envelope = energies;
  const modRatio = modulationRatio(envelope, HOP_SEC);
  const hnrDb = hnrCount === 0 ? 0 : hnrSum / hnrCount;
  const f0RangeHz =
    f0s.length === 0 ? 0 : Math.max(...f0s) - Math.min(...f0s);
  const noiseFamily = classifyNoiseFamily({
    unvoicedSfm: unvoicedSpectralFlatness,
    unvoicedFraction: sfms.length === 0 ? 0 : unvoicedSfms.length / sfms.length,
    hnrDb,
  });

  const channelCorrelation = pearson(left, right);
  const effectiveStereo = channelCorrelation < DUAL_MONO_CORR_MIN;
  let bothActive = 0;
  let bothCount = 0;
  if (effectiveStereo) {
    for (let start = 0; start + FRAME <= left.length && start + FRAME <= right.length; start += HOP) {
      const le = frameEnergy(left, start, FRAME);
      const re = frameEnergy(right, start, FRAME);
      bothCount += 1;
      if (le >= speechThresh && re >= speechThresh) {
        bothActive += 1;
      }
    }
  }
  const bothChannelsActiveFraction = bothCount === 0 ? 0 : bothActive / bothCount;
  const overlapEvidence = classifyOverlapEvidence({
    channelCorrelation,
    bothChannelsActiveFraction,
    hnrDb,
    spectralFlatness,
    f0RangeHz,
  });

  return acousticMeasurements({
    durationSec,
    longestSilenceSec: longest,
    snrDb,
    clipFraction: clipped / samples.length,
    rms,
    spectralFlatness,
    wadaSnrDb: wadaSnrDb(samples),
    unvoicedSpectralFlatness,
    alphaRatioDb: mean(unvoicedAlpha, 0),
    hammarbergDb: mean(unvoicedHamm, 0),
    modulationRatio: modRatio,
    hnrDb,
    harmonicEnergyRatio: herCount === 0 ? 0 : herSum / herCount,
    unvoicedZcr: mean(unvoicedZcrs, 0),
    f0RangeHz,
    channelCount: effectiveStereo ? 2 : 1,
    channelCorrelation,
    bothChannelsActiveFraction,
    noiseFamily,
    overlapEvidence,
  });
}
