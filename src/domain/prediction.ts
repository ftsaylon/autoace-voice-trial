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

export type AcousticMeasurements = {
  durationSec: number;
  longestSilenceSec: number;
  snrDb: number;
  clipFraction: number;
  rms: number;
  spectralFlatness: number;
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
