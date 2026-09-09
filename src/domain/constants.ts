export const LONG_SILENCE_SEC = 8;

export const WINDOW_SEC = 20;
export const WINDOW_OVERLAP_SEC = 5;
export const WINDOW_FULL_CLIP_MAX_SEC = 30;

export const QUALITY_SEVERE_SNR_DB = 5;
export const QUALITY_SLIGHT_SNR_DB = 15;
export const QUALITY_SEVERE_CLIP_FRACTION = 0.05;
export const QUALITY_SLIGHT_CLIP_FRACTION = 0.01;

export const MAX_CLIP_BYTES = 40 * 1024 * 1024;
export const MAX_BATCH_BYTES = 200 * 1024 * 1024;
export const MAX_CLIP_COUNT = 50;

export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".ogg",
  ".m4a",
  ".flac",
] as const;

export const CLAIM_STALE_MS = 5 * 60 * 1000;

export const TONE_SEVERITY: Record<
  "neutral" | "satisfied" | "frustrated" | "upset" | "distressed",
  number
> = {
  distressed: 4,
  upset: 3,
  frustrated: 2,
  satisfied: 1,
  neutral: 0,
};

export const INTENSITY_RANK: Record<"low" | "medium" | "high", number> = {
  low: 0,
  medium: 1,
  high: 2,
};

export const NOISE_SEVERITY_RANK: Record<"none" | "low" | "medium" | "high", number> =
  {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
  };

export const QUALITY_RANK: Record<
  "clear" | "slightly_impaired" | "severely_impaired",
  number
> = {
  clear: 0,
  slightly_impaired: 1,
  severely_impaired: 2,
};
