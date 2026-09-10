/**
 * Late fusion of Gemini (or control) semantics with DSP evidence.
 *
 * Quality SNR cutoffs stay 5 / 15 dB. WADA-SNR (Kim & Stern, Interspeech 2008)
 * can veto a VAD-biased "slightly impaired" from energy SNR.
 *
 * Noise: `clean` is a positive single-talker class (Boersma HNR + low unvoiced
 * SFM). Only then may DSP gate Gemini noise. `uncertain` means no residual
 * evidence — Gemini still owns TV/chatter. `static` recovers broadband hiss
 * (Johnston 1988). DSP never invents TV from the mix's 4 Hz peak.
 *
 * Overlap: stereo both-active (Xiao et al., ICASSP 2011). Dual-mono is ignored.
 * A clean residual vetoes Gemini overlap (single periodic source). Mono
 * harmonicity only confirms Gemini, and not when F0 range looks like arousal
 * (Boakye 2008 vs Juslin & Laukka 2003).
 *
 * Intensity floor from F0 range + loudness, and from the schema (anger/distress
 * is not low). emotional_tone is never taken from RMS or F0.
 */
import {
  AROUSAL_F0_RANGE_HZ,
  AROUSAL_RMS,
  LONG_SILENCE_SEC,
  QUALITY_SEVERE_CLIP_FRACTION,
  QUALITY_SEVERE_SNR_DB,
  QUALITY_SLIGHT_CLIP_FRACTION,
  QUALITY_SLIGHT_SNR_DB,
} from "./constants";
import { noNoise, presentNoise } from "./prediction";
import type {
  AcousticMeasurements,
  AudioQuality,
  BackgroundNoise,
  ClipPrediction,
  EmotionalTone,
  Intensity,
} from "./prediction";

const looksStatic = (type: string): boolean => {
  return /static|hiss|crackle|electrical/i.test(type);
};

export function qualityFromAcoustic(
  acoustic: AcousticMeasurements,
): AudioQuality {
  if (
    acoustic.snrDb < QUALITY_SEVERE_SNR_DB ||
    acoustic.clipFraction >= QUALITY_SEVERE_CLIP_FRACTION
  ) {
    return "severely_impaired";
  }
  const energySlight = acoustic.snrDb < QUALITY_SLIGHT_SNR_DB;
  const wadaSlight = acoustic.wadaSnrDb < QUALITY_SLIGHT_SNR_DB;
  if (
    (energySlight && wadaSlight) ||
    acoustic.clipFraction >= QUALITY_SLIGHT_CLIP_FRACTION
  ) {
    return "slightly_impaired";
  }
  return "clear";
}

export function fuseNoise(
  semantic: BackgroundNoise,
  acoustic: AcousticMeasurements,
): BackgroundNoise {
  if (acoustic.noiseFamily === "static") {
    const type =
      semantic.present && looksStatic(semantic.type)
        ? semantic.type
        : "sharp static";
    const severity = semantic.present ? semantic.severity : "low";
    return presentNoise(type, severity);
  }
  if (acoustic.noiseFamily === "clean" && semantic.present) {
    return noNoise;
  }
  return semantic;
}

export function fuseOverlap(
  semanticOverlap: boolean,
  acoustic: AcousticMeasurements,
): boolean {
  if (acoustic.overlapEvidence === "stereo_both_active") {
    return true;
  }
  if (acoustic.noiseFamily === "clean") {
    return false;
  }
  if (acoustic.overlapEvidence === "harmonicity") {
    return semanticOverlap;
  }
  return semanticOverlap;
}

export function fuseIntensity(
  semantic: Intensity,
  acoustic: AcousticMeasurements,
  tone: EmotionalTone,
): Intensity {
  let intensity = semantic;
  if (
    intensity === "low" &&
    acoustic.f0RangeHz >= AROUSAL_F0_RANGE_HZ &&
    acoustic.rms >= AROUSAL_RMS
  ) {
    intensity = "medium";
  }
  if ((tone === "upset" || tone === "distressed") && intensity === "low") {
    return "medium";
  }
  return intensity;
}

export function fuse(
  semantic: ClipPrediction,
  acoustic: AcousticMeasurements,
): ClipPrediction {
  return {
    emotional_tone: semantic.emotional_tone,
    emotional_intensity: fuseIntensity(
      semantic.emotional_intensity,
      acoustic,
      semantic.emotional_tone,
    ),
    background_noise: fuseNoise(semantic.background_noise, acoustic),
    audio_quality: qualityFromAcoustic(acoustic),
    speaker_overlap_present: fuseOverlap(
      semantic.speaker_overlap_present,
      acoustic,
    ),
    long_silence_present: acoustic.longestSilenceSec >= LONG_SILENCE_SEC,
    confidence: semantic.confidence,
  };
}
