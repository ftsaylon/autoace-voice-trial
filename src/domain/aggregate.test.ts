import { describe, expect, it } from "vitest";
import { aggregateWindows, windowBounds } from "./aggregate";
import { noNoise, presentNoise, type WindowPrediction } from "./prediction";

function window(
  startSec: number,
  tone: WindowPrediction["emotional_tone"],
  intensity: WindowPrediction["emotional_intensity"],
): WindowPrediction {
  return {
    startSec,
    endSec: startSec + 20,
    emotional_tone: tone,
    emotional_intensity: intensity,
    background_noise: noNoise,
    audio_quality: "clear",
    speaker_overlap_present: false,
    long_silence_present: false,
    confidence: 0.7,
  };
}

describe("windowBounds", () => {
  it("returns a single window for clips at or under 30s", () => {
    expect(windowBounds(30)).toEqual([{ startSec: 0, endSec: 30 }]);
  });

  it("splits long clips into 20s windows with 5s overlap", () => {
    expect(windowBounds(50)).toEqual([
      { startSec: 0, endSec: 20 },
      { startSec: 15, endSec: 35 },
      { startSec: 30, endSec: 50 },
    ]);
  });
});

describe("aggregateWindows", () => {
  it("majority-votes tone and takes max intensity of the winning tone", () => {
    const prediction = aggregateWindows([
      window(0, "neutral", "low"),
      window(15, "frustrated", "medium"),
      window(30, "frustrated", "high"),
    ]);
    expect(prediction.emotional_tone).toBe("frustrated");
    expect(prediction.emotional_intensity).toBe("high");
    expect(prediction.confidence).toBeCloseTo(2 / 3);
  });

  it("breaks a non-low intensity tie toward the more severe tone", () => {
    const prediction = aggregateWindows([
      window(0, "frustrated", "medium"),
      window(15, "upset", "medium"),
    ]);
    expect(prediction.emotional_tone).toBe("upset");
  });

  it("prefers noise type from the highest-severity noisy window", () => {
    const prediction = aggregateWindows([
      {
        ...window(0, "neutral", "medium"),
        background_noise: presentNoise("TV", "low"),
      },
      {
        ...window(15, "neutral", "medium"),
        background_noise: presentNoise("sharp static", "medium"),
        speaker_overlap_present: true,
      },
      window(30, "neutral", "medium"),
    ]);
    expect(prediction.background_noise).toEqual(
      presentNoise("sharp static", "medium"),
    );
    expect(prediction.speaker_overlap_present).toBe(true);
  });
});
