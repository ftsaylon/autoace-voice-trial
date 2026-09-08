import { err, ok, type Result } from "./result";
import {
  AUDIO_QUALITIES,
  EMOTIONAL_TONES,
  INTENSITIES,
  NOISE_SEVERITIES,
  noNoise,
  presentNoise,
  type ClipPrediction,
} from "./prediction";

export type AutoAceJson = {
  emotional_tone: ClipPrediction["emotional_tone"];
  emotional_intensity: ClipPrediction["emotional_intensity"];
  background_noise_present: boolean;
  background_noise_type: string;
  background_noise_severity: "none" | "low" | "medium" | "high";
  audio_quality: ClipPrediction["audio_quality"];
  speaker_overlap_present: boolean;
  long_silence_present: boolean;
  confidence: number;
};

export type CodecError = { tag: "invalid_json"; cause: string };

function isTone(value: unknown): value is ClipPrediction["emotional_tone"] {
  return (
    typeof value === "string" &&
    (EMOTIONAL_TONES as readonly string[]).includes(value)
  );
}

function isIntensity(value: unknown): value is ClipPrediction["emotional_intensity"] {
  return (
    typeof value === "string" &&
    (INTENSITIES as readonly string[]).includes(value)
  );
}

function isQuality(value: unknown): value is ClipPrediction["audio_quality"] {
  return (
    typeof value === "string" &&
    (AUDIO_QUALITIES as readonly string[]).includes(value)
  );
}

function isNoiseSeverity(
  value: unknown,
): value is "none" | "low" | "medium" | "high" {
  return (
    typeof value === "string" &&
    (NOISE_SEVERITIES as readonly string[]).includes(value)
  );
}

export function toAutoAceJson(prediction: ClipPrediction): AutoAceJson {
  return {
    emotional_tone: prediction.emotional_tone,
    emotional_intensity: prediction.emotional_intensity,
    background_noise_present: prediction.background_noise.present,
    background_noise_type: prediction.background_noise.type,
    background_noise_severity: prediction.background_noise.severity,
    audio_quality: prediction.audio_quality,
    speaker_overlap_present: prediction.speaker_overlap_present,
    long_silence_present: prediction.long_silence_present,
    confidence: prediction.confidence,
  };
}

export function fromAutoAceJson(
  input: unknown,
): Result<ClipPrediction, CodecError> {
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed.length === 0) {
      return err({ tag: "invalid_json", cause: "empty string" });
    }
    try {
      return fromAutoAceJson(JSON.parse(trimmed) as unknown);
    } catch {
      return err({ tag: "invalid_json", cause: "malformed JSON string" });
    }
  }

  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    return err({ tag: "invalid_json", cause: "expected an object" });
  }

  const row = input as Record<string, unknown>;

  if (!isTone(row.emotional_tone)) {
    return err({ tag: "invalid_json", cause: "emotional_tone" });
  }
  if (!isIntensity(row.emotional_intensity)) {
    return err({ tag: "invalid_json", cause: "emotional_intensity" });
  }
  if (typeof row.background_noise_present !== "boolean") {
    return err({ tag: "invalid_json", cause: "background_noise_present" });
  }
  if (typeof row.background_noise_type !== "string") {
    return err({ tag: "invalid_json", cause: "background_noise_type" });
  }
  if (!isNoiseSeverity(row.background_noise_severity)) {
    return err({ tag: "invalid_json", cause: "background_noise_severity" });
  }
  if (!isQuality(row.audio_quality)) {
    return err({ tag: "invalid_json", cause: "audio_quality" });
  }
  if (typeof row.speaker_overlap_present !== "boolean") {
    return err({ tag: "invalid_json", cause: "speaker_overlap_present" });
  }
  if (typeof row.long_silence_present !== "boolean") {
    return err({ tag: "invalid_json", cause: "long_silence_present" });
  }
  if (
    typeof row.confidence !== "number" ||
    !Number.isFinite(row.confidence) ||
    row.confidence < 0 ||
    row.confidence > 1
  ) {
    return err({ tag: "invalid_json", cause: "confidence" });
  }

  if (!row.background_noise_present) {
    if (row.background_noise_type !== "" || row.background_noise_severity !== "none") {
      return err({
        tag: "invalid_json",
        cause: "absent noise must have empty type and severity none",
      });
    }
    return ok({
      emotional_tone: row.emotional_tone,
      emotional_intensity: row.emotional_intensity,
      background_noise: noNoise,
      audio_quality: row.audio_quality,
      speaker_overlap_present: row.speaker_overlap_present,
      long_silence_present: row.long_silence_present,
      confidence: row.confidence,
    });
  }

  if (
    row.background_noise_type.trim().length === 0 ||
    row.background_noise_severity === "none"
  ) {
    return err({
      tag: "invalid_json",
      cause: "present noise must have a type and a non-none severity",
    });
  }

  return ok({
    emotional_tone: row.emotional_tone,
    emotional_intensity: row.emotional_intensity,
    background_noise: presentNoise(
      row.background_noise_type,
      row.background_noise_severity,
    ),
    audio_quality: row.audio_quality,
    speaker_overlap_present: row.speaker_overlap_present,
    long_silence_present: row.long_silence_present,
    confidence: row.confidence,
  });
}

export function autoAceJsonString(prediction: ClipPrediction): string {
  return JSON.stringify(toAutoAceJson(prediction));
}
