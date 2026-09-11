/** Assessment schema: unusually long dead air. Not fitted to the labeled n=3. */
export const LONG_SILENCE_SEC = 8;

/** Gemini fallback only. Clips ≤ WINDOW_FULL_CLIP_MAX_SEC are one request (cost ceiling). */
export const WINDOW_SEC = 20;
export const WINDOW_OVERLAP_SEC = 0;
export const WINDOW_FULL_CLIP_MAX_SEC = 900;

/** Hangover after energy VAD so a click does not split an 8 s pause (ICSI SAD style). */
export const VAD_HANGOVER_FRAMES = 4;

/** Dual-mono ρ≈1 is crosstalk, not two sources (Ghosh et al., Interspeech 2010). */
export const DUAL_MONO_CORR_MIN = 0.95;
/** Independent L/R with both channels active → overlap (Xiao et al., ICASSP 2011). */
export const STEREO_OVERLAP_CORR_MAX = 0.85;
export const STEREO_OVERLAP_BOTH_ACTIVE_MIN = 0.05;

/** Sustained unvoiced high SFM → static (Johnston 1988). Fraction guards against a few fricatives. */
export const STATIC_UNVOICED_SFM_MIN = 0.35;
export const STATIC_UNVOICED_FRACTION_MIN = 0.5;
/** Positive clean-speech class (Boersma HNR), not the leftover of static. */
export const CLEAN_HNR_MIN_DB = 8;
/** Mono overlap confirm only: two F0s drop HNR without flattening the spectrum (Boersma 1993; Boakye 2008). */
export const HARMONICITY_HNR_MAX_DB = 6;
export const HARMONICITY_SFM_MAX = 0.25;
/** Intensity floor only — never maps onto emotional_tone (Juslin & Laukka 2003; Scherer). */
export const AROUSAL_F0_RANGE_HZ = 50;
/** Unused by fusion. Intensity does not require loudness. */
export const AROUSAL_RMS = 0.15;

export const QUALITY_SEVERE_SNR_DB = 5;
export const QUALITY_SLIGHT_SNR_DB = 15;
export const QUALITY_SEVERE_CLIP_FRACTION = 0.05;
export const QUALITY_SLIGHT_CLIP_FRACTION = 0.01;

export const MAX_CLIP_BYTES = 40 * 1024 * 1024;
export const MAX_BATCH_BYTES = 200 * 1024 * 1024;
export const MAX_CLIP_COUNT = 50;
export const MAX_PARSE_ISSUES = 40;
export const MAX_PARSE_ISSUE_LENGTH = 500;
export const MAX_RUNS_PER_BATCH = 50;
export const MAX_BATCHES_PER_USER = 8192;

export const SUPPORTED_AUDIO_EXTENSIONS = [
  ".wav",
  ".mp3",
  ".ogg",
  ".m4a",
  ".flac",
] as const;

export const CLAIM_STALE_MS = 5 * 60 * 1000;

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
