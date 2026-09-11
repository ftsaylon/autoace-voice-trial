import { z } from "zod";

export const EMOTIONAL_TONES = [
  "neutral",
  "satisfied",
  "frustrated",
  "upset",
  "distressed",
] as const;
export type EmotionalTone = (typeof EMOTIONAL_TONES)[number];

export const INTENSITIES = ["low", "medium", "high"] as const;
export type Intensity = (typeof INTENSITIES)[number];

export const AUDIO_QUALITIES = [
  "clear",
  "slightly_impaired",
  "severely_impaired",
] as const;
export type AudioQuality = (typeof AUDIO_QUALITIES)[number];

export const NOISE_SEVERITIES = ["none", "low", "medium", "high"] as const;
export type NoiseSeverity = (typeof NOISE_SEVERITIES)[number];

export type BackgroundNoise =
  | { present: false; type: ""; severity: "none" }
  | { present: true; type: string; severity: Exclude<NoiseSeverity, "none"> };

export type ClipPrediction = {
  emotional_tone: EmotionalTone;
  emotional_intensity: Intensity;
  background_noise: BackgroundNoise;
  audio_quality: AudioQuality;
  speaker_overlap_present: boolean;
  long_silence_present: boolean;
  confidence: number;
};

/**
 * DSP residual class. `clean` is a positive single-talker decision.
 * `uncertain` means DSP has no residual evidence — Gemini still owns TV/chatter.
 * `speech_like` is reserved for a competing-speech residual; the extractor may
 * omit it when the mix's 4 Hz peak is just the foreground talker.
 */
export type NoiseFamily = "clean" | "static" | "speech_like" | "uncertain";

/** Stereo both-active (Xiao/Morgan) or mono harmonicity confirm (Boakye HER). */
export type OverlapEvidence = "none" | "stereo_both_active" | "harmonicity";

/**
 * Shared extractor output. Frame SFM / Hammarberg / modulation / HNR / WADA /
 * stereo fields are documented in docs/METHODS.md. emotional_tone is never
 * derived from these numbers in production fusion.
 */
export type AcousticMeasurements = {
  durationSec: number;
  longestSilenceSec: number;
  snrDb: number;
  clipFraction: number;
  rms: number;
  spectralFlatness: number;
  wadaSnrDb: number;
  unvoicedSpectralFlatness: number;
  alphaRatioDb: number;
  hammarbergDb: number;
  modulationRatio: number;
  hnrDb: number;
  harmonicEnergyRatio: number;
  unvoicedZcr: number;
  f0RangeHz: number;
  channelCount: number;
  channelCorrelation: number;
  bothChannelsActiveFraction: number;
  noiseFamily: NoiseFamily;
  overlapEvidence: OverlapEvidence;
};

export const acousticMeasurements = (
  overrides: Partial<AcousticMeasurements> = {},
): AcousticMeasurements => {
  return {
    durationSec: 1,
    longestSilenceSec: 0,
    snrDb: 25,
    clipFraction: 0,
    rms: 0.1,
    spectralFlatness: 0.15,
    wadaSnrDb: 25,
    unvoicedSpectralFlatness: 0.15,
    alphaRatioDb: 0,
    hammarbergDb: 12,
    modulationRatio: 0.08,
    hnrDb: 12,
    harmonicEnergyRatio: 0.6,
    unvoicedZcr: 0.08,
    f0RangeHz: 20,
    channelCount: 1,
    channelCorrelation: 1,
    bothChannelsActiveFraction: 0,
    noiseFamily: "uncertain",
    overlapEvidence: "none",
    ...overrides,
  };
};

export type WindowPrediction = ClipPrediction & {
  startSec: number;
  endSec: number;
};

export const noNoise: BackgroundNoise = {
  present: false,
  type: "",
  severity: "none",
};

export function presentNoise(
  type: string,
  severity: Exclude<NoiseSeverity, "none">,
): BackgroundNoise {
  return { present: true, type, severity };
}

export const semanticClassifierSchema = z.object({
  emotional_tone: z.enum(EMOTIONAL_TONES),
  emotional_intensity: z.enum(INTENSITIES),
  background_noise_present: z.boolean(),
  background_noise_type: z.string(),
  background_noise_severity: z.enum(["low", "medium", "high", "none"]),
  speaker_overlap_present: z.boolean(),
  confidence: z.number().min(0).max(1),
});

export type SemanticClassifierOutput = z.infer<typeof semanticClassifierSchema>;
