/**
 * Windowing and reduction for Gemini methods.
 *
 * Clips ≤ 240 s are one request so billed audio stays under $0.003/min
 * (Gemini audio ≈ 32 tokens/s). Longer clips use non-overlapping 20 s
 * windows. Tone ties prefer window confidence, then AutoAce enum order —
 * not tone severity. Overlap needs a strict majority so one false-positive
 * window cannot set the clip.
 */
import {
  INTENSITY_RANK,
  NOISE_SEVERITY_RANK,
  QUALITY_RANK,
  WINDOW_FULL_CLIP_MAX_SEC,
  WINDOW_OVERLAP_SEC,
  WINDOW_SEC,
} from "./constants";
import {
  EMOTIONAL_TONES,
  noNoise,
  presentNoise,
  type AudioQuality,
  type ClipPrediction,
  type EmotionalTone,
  type Intensity,
  type WindowPrediction,
} from "./prediction";

export function windowBounds(durationSec: number): { startSec: number; endSec: number }[] {
  if (durationSec <= WINDOW_FULL_CLIP_MAX_SEC) {
    return [{ startSec: 0, endSec: durationSec }];
  }
  const windows: { startSec: number; endSec: number }[] = [];
  const hop = WINDOW_SEC - WINDOW_OVERLAP_SEC;
  let start = 0;
  while (start < durationSec) {
    const end = Math.min(start + WINDOW_SEC, durationSec);
    windows.push({ startSec: start, endSec: end });
    if (end >= durationSec) {
      break;
    }
    start += hop;
  }
  return windows;
}

function maxIntensity(values: Intensity[]): Intensity {
  let best: Intensity = "low";
  for (const value of values) {
    if (INTENSITY_RANK[value] > INTENSITY_RANK[best]) {
      best = value;
    }
  }
  return best;
}

function winningQuality(windows: WindowPrediction[]): AudioQuality {
  let winner: AudioQuality = "clear";
  for (const window of windows) {
    if (QUALITY_RANK[window.audio_quality] > QUALITY_RANK[winner]) {
      winner = window.audio_quality;
    }
  }
  return winner;
}

function winningTone(windows: WindowPrediction[]): EmotionalTone {
  const counts = new Map<EmotionalTone, number>();
  for (const window of windows) {
    counts.set(window.emotional_tone, (counts.get(window.emotional_tone) ?? 0) + 1);
  }
  let bestCount = 0;
  const tied: EmotionalTone[] = [];
  for (const [tone, count] of counts) {
    if (count > bestCount) {
      bestCount = count;
      tied.length = 0;
      tied.push(tone);
    } else if (count === bestCount) {
      tied.push(tone);
    }
  }
  if (tied.length === 1) {
    return tied[0]!;
  }
  let winner = tied[0]!;
  let bestConfidence = -1;
  for (const tone of tied) {
    const confidence = Math.max(
      ...windows
        .filter((window) => window.emotional_tone === tone)
        .map((window) => window.confidence),
    );
    if (confidence > bestConfidence) {
      bestConfidence = confidence;
      winner = tone;
      continue;
    }
    if (confidence === bestConfidence) {
      const winnerIndex = EMOTIONAL_TONES.indexOf(winner);
      const toneIndex = EMOTIONAL_TONES.indexOf(tone);
      if (toneIndex >= 0 && (winnerIndex < 0 || toneIndex < winnerIndex)) {
        winner = tone;
      }
    }
  }
  return winner;
}

export function aggregateWindows(windows: WindowPrediction[]): ClipPrediction {
  if (windows.length === 0) {
    throw new Error("aggregateWindows requires at least one window");
  }
  const tone = winningTone(windows);
  const toneWindows = windows.filter((window) => window.emotional_tone === tone);
  const intensity = maxIntensity(
    toneWindows.map((window) => window.emotional_intensity),
  );
  const noisy = windows.filter((window) => window.background_noise.present);
  let background_noise = noNoise;
  if (noisy.length > 0) {
    let chosen = noisy[0]!;
    for (const window of noisy) {
      if (
        NOISE_SEVERITY_RANK[window.background_noise.severity] >
        NOISE_SEVERITY_RANK[chosen.background_noise.severity]
      ) {
        chosen = window;
      }
    }
    if (chosen.background_noise.present) {
      background_noise = presentNoise(
        chosen.background_noise.type,
        chosen.background_noise.severity,
      );
    }
  }
  const matches = windows.filter((window) => window.emotional_tone === tone).length;
  return {
    emotional_tone: tone,
    emotional_intensity: intensity,
    background_noise,
    audio_quality: winningQuality(windows),
    speaker_overlap_present:
      windows.filter((window) => window.speaker_overlap_present).length * 2 >
      windows.length,
    long_silence_present: windows.some((window) => window.long_silence_present),
    confidence: matches / windows.length,
  };
}
