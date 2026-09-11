/**
 * Late fusion of Gemini (or control) semantics with DSP evidence.
 *
 * Quality: worse of Gemini vs DSP (`QUALITY_RANK`). SNR cutoffs stay 5 / 15 dB.
 * WADA-SNR (Kim & Stern, Interspeech 2008) can veto a VAD-biased "slightly
 * impaired" from energy SNR. Gemini can still mark echo, muffled, robotic,
 * or packet-loss that SNR cannot see. Silence stays DSP-owned at 8 s.
 *
 * Noise: `clean` is a positive single-talker class (Boersma HNR + low unvoiced
 * SFM). On `clean`, DSP may drop only low-severity generic chatter/ambience.
 * Named medium/high events (television, music, keyboard) stay. `uncertain`
 * means no residual evidence — Gemini still owns television. `static`
 * recovers broadband hiss (Johnston 1988) without rewriting television.
 * DSP never invents television from the mix's 4 Hz peak.
 *
 * Overlap: stereo both-active (Xiao et al., ICASSP 2011) forces overlap.
 * Dual-mono true overlap can look like one talker in the residual, so a
 * clean class must not veto Gemini. Harmonicity does not set overlap by
 * itself (Boakye 2008).
 *
 * Intensity floor from F0 range (Juslin & Laukka 2003) and from the schema
 * (anger/distress is not low). emotional_tone is never taken from RMS or F0.
 */
import {
  AROUSAL_F0_RANGE_HZ,
  LONG_SILENCE_SEC,
  QUALITY_RANK,
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

const looksGenericChatter = (type: string): boolean => {
  return /chatter|background speech|room tone|ambience/i.test(type);
};

const isLowSeverityGenericChatter = (semantic: BackgroundNoise): boolean => {
  if (!semantic.present) {
    return false;
  }
  return semantic.severity === "low" && looksGenericChatter(semantic.type);
};

/** Brief-aligned aliases. Unknown phrases are kept. */
const NOISE_TYPE_ALIASES: Record<string, string> = {
  tv: "television",
  "tv program": "television",
  "tv programme": "television",
  "television program": "television",
  "television programme": "television",
  chatter: "office chatter",
  "background speech": "office chatter",
  traffic: "road noise",
  "traffic noise": "road noise",
  keyboard: "keyboard typing",
  typing: "keyboard typing",
  mechanical: "mechanical noise",
  engine: "mechanical noise",
};

export function normalizeNoiseType(type: string): string {
  const trimmed = type.trim();
  if (trimmed.length === 0) {
    return "";
  }
  const aliased = NOISE_TYPE_ALIASES[trimmed.toLowerCase()];
  return aliased ?? trimmed;
}

const looksNamedNonStaticEvent = (type: string): boolean => {
  if (looksStatic(type) || looksGenericChatter(type)) {
    return false;
  }
  return type.trim().length > 0;
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

export function fuseQuality(
  semantic: AudioQuality,
  acoustic: AcousticMeasurements,
): AudioQuality {
  const dsp = qualityFromAcoustic(acoustic);
  return QUALITY_RANK[semantic] >= QUALITY_RANK[dsp] ? semantic : dsp;
}

export function fuseNoise(
  semantic: BackgroundNoise,
  acoustic: AcousticMeasurements,
): BackgroundNoise {
  if (acoustic.noiseFamily === "static") {
    if (semantic.present && looksStatic(semantic.type)) {
      return presentNoise(normalizeNoiseType(semantic.type), semantic.severity);
    }
    if (semantic.present && looksNamedNonStaticEvent(semantic.type)) {
      return presentNoise(normalizeNoiseType(semantic.type), semantic.severity);
    }
    const severity = semantic.present ? semantic.severity : "low";
    return presentNoise("sharp static", severity);
  }
  if (
    acoustic.noiseFamily === "clean" &&
    semantic.present &&
    isLowSeverityGenericChatter(semantic)
  ) {
    return noNoise;
  }
  if (!semantic.present) {
    return noNoise;
  }
  return presentNoise(normalizeNoiseType(semantic.type), semantic.severity);
}

export function fuseOverlap(
  semanticOverlap: boolean,
  acoustic: AcousticMeasurements,
): boolean {
  if (acoustic.overlapEvidence === "stereo_both_active") {
    return true;
  }
  return semanticOverlap;
}

export function fuseIntensity(
  semantic: Intensity,
  acoustic: AcousticMeasurements,
  tone: EmotionalTone,
): Intensity {
  let intensity = semantic;
  if (intensity === "low" && acoustic.f0RangeHz >= AROUSAL_F0_RANGE_HZ) {
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
    audio_quality: fuseQuality(semantic.audio_quality, acoustic),
    speaker_overlap_present: fuseOverlap(
      semantic.speaker_overlap_present,
      acoustic,
    ),
    long_silence_present: acoustic.longestSilenceSec >= LONG_SILENCE_SEC,
    confidence: semantic.confidence,
  };
}
