import {
  LONG_SILENCE_SEC,
  QUALITY_SEVERE_CLIP_FRACTION,
  QUALITY_SEVERE_SNR_DB,
  QUALITY_SLIGHT_CLIP_FRACTION,
  QUALITY_SLIGHT_SNR_DB,
} from "./constants";
import type {
  AcousticMeasurements,
  AudioQuality,
  ClipPrediction,
} from "./prediction";

export function qualityFromAcoustic(
  acoustic: AcousticMeasurements,
): AudioQuality {
  if (
    acoustic.snrDb < QUALITY_SEVERE_SNR_DB ||
    acoustic.clipFraction >= QUALITY_SEVERE_CLIP_FRACTION
  ) {
    return "severely_impaired";
  }
  if (
    acoustic.snrDb < QUALITY_SLIGHT_SNR_DB ||
    acoustic.clipFraction >= QUALITY_SLIGHT_CLIP_FRACTION
  ) {
    return "slightly_impaired";
  }
  return "clear";
}

export function fuse(
  semantic: ClipPrediction,
  acoustic: AcousticMeasurements,
): ClipPrediction {
  return {
    emotional_tone: semantic.emotional_tone,
    emotional_intensity: semantic.emotional_intensity,
    background_noise: semantic.background_noise,
    audio_quality: qualityFromAcoustic(acoustic),
    speaker_overlap_present: semantic.speaker_overlap_present,
    long_silence_present: acoustic.longestSilenceSec >= LONG_SILENCE_SEC,
    confidence: semantic.confidence,
  };
}
