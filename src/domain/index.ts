export { type Result, ok, err } from "./result";
export {
  type AnalyzeError,
  type BatchParseIssue,
  formatAnalyzeError,
  formatStoredAnalyzeError,
} from "./errors";
export {
  LONG_SILENCE_SEC,
  WINDOW_SEC,
  WINDOW_OVERLAP_SEC,
  WINDOW_FULL_CLIP_MAX_SEC,
  MAX_CLIP_BYTES,
  MAX_BATCH_BYTES,
  MAX_CLIP_COUNT,
  MAX_PARSE_ISSUES,
  MAX_PARSE_ISSUE_LENGTH,
  MAX_RUNS_PER_BATCH,
  SUPPORTED_AUDIO_EXTENSIONS,
  CLAIM_STALE_MS,
} from "./constants";
export {
  EMOTIONAL_TONES,
  INTENSITIES,
  AUDIO_QUALITIES,
  NOISE_SEVERITIES,
  semanticClassifierSchema,
  noNoise,
  presentNoise,
  acousticMeasurements,
  type EmotionalTone,
  type Intensity,
  type AudioQuality,
  type NoiseSeverity,
  type BackgroundNoise,
  type ClipPrediction,
  type AcousticMeasurements,
  type NoiseFamily,
  type OverlapEvidence,
  type WindowPrediction,
  type SemanticClassifierOutput,
} from "./prediction";
export {
  toAutoAceJson,
  fromAutoAceJson,
  autoAceJsonString,
  type AutoAceJson,
  type CodecError,
} from "./codec";
export {
  fuse,
  qualityFromAcoustic,
  fuseQuality,
  fuseNoise,
  fuseOverlap,
  fuseIntensity,
  normalizeNoiseType,
} from "./fusion";
export { aggregateWindows, windowBounds } from "./aggregate";
export {
  derivedBatchStatus,
  type ClipState,
  type ClipRow,
  type BatchStatus,
  type Batch,
  type NewClip,
  type NewBatch,
  type CompletedClip,
} from "./batch";
