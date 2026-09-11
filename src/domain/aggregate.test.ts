import { describe, expect, it } from "vitest";
import { aggregateWindows, windowBounds } from "./aggregate";
import { noNoise, presentNoise, type WindowPrediction } from "./prediction";

function window(
  startSec: number,
  tone: WindowPrediction["emotional_tone"],
  intensity: WindowPrediction["emotional_intensity"],
  confidence = 0.7,
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
    confidence,
  };
}

describe("windowBounds", () => {
  it("returns a single window for clips at or under 240s", () => {
    expect(windowBounds(240)).toEqual([{ startSec: 0, endSec: 240 }]);
  });

  it("splits clips longer than 240s into non-overlapping 20s windows", () => {
    const bounds = windowBounds(260);
    expect(bounds[0]).toEqual({ startSec: 0, endSec: 20 });
    expect(bounds[bounds.length - 1]).toEqual({ startSec: 240, endSec: 260 });
    expect(bounds).toHaveLength(13);
    expect(bounds[1]).toEqual({ startSec: 20, endSec: 40 });
  });
});

describe("aggregateWindows", () => {
  it("keeps classifier confidence on a single window", () => {
    const prediction = aggregateWindows([window(0, "upset", "high", 0.7)]);
    expect(prediction.emotional_tone).toBe("upset");
    expect(prediction.confidence).toBeCloseTo(0.7);
  });

  it("majority-votes tone and takes max intensity of the winning tone", () => {
    const prediction = aggregateWindows([
      window(0, "neutral", "low", 0.9),
      window(15, "frustrated", "medium", 0.6),
      window(30, "frustrated", "high", 0.6),
    ]);
    expect(prediction.emotional_tone).toBe("frustrated");
    expect(prediction.emotional_intensity).toBe("high");
    expect(prediction.confidence).toBeCloseTo((40 / 60) * 0.6);
  });

  it("weights tone votes by window duration", () => {
    const prediction = aggregateWindows([
      {
        ...window(0, "neutral", "low", 0.9),
        endSec: 40,
      },
      {
        ...window(40, "frustrated", "medium", 0.9),
        endSec: 50,
      },
    ]);
    expect(prediction.emotional_tone).toBe("neutral");
    expect(prediction.confidence).toBeCloseTo((40 / 50) * 0.9);
  });

  it("breaks a tone tie toward higher window confidence, not severity", () => {
    const prediction = aggregateWindows([
      window(0, "frustrated", "medium", 0.4),
      window(15, "upset", "medium", 0.9),
    ]);
    expect(prediction.emotional_tone).toBe("upset");
  });

  it("uses enum order when confidence is tied instead of tone severity", () => {
    const prediction = aggregateWindows([
      window(0, "frustrated", "medium", 0.7),
      window(15, "upset", "medium", 0.7),
    ]);
    expect(prediction.emotional_tone).toBe("frustrated");
  });

  it("prefers noise type from the highest-severity noisy window", () => {
    const prediction = aggregateWindows([
      {
        ...window(0, "neutral", "medium"),
        background_noise: presentNoise("television", "low"),
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
    expect(prediction.speaker_overlap_present).toBe(false);
  });

  it("prefers the longer window when noise severity is tied", () => {
    const prediction = aggregateWindows([
      {
        ...window(0, "neutral", "medium"),
        endSec: 8,
        background_noise: presentNoise("keyboard typing", "medium"),
      },
      {
        ...window(8, "neutral", "medium"),
        endSec: 28,
        background_noise: presentNoise("television", "medium"),
      },
    ]);
    expect(prediction.background_noise).toEqual(
      presentNoise("television", "medium"),
    );
  });

  it("throws when there are no windows", () => {
    expect(() => aggregateWindows([])).toThrow(/at least one window/);
  });

  it("requires a majority of windows for overlap", () => {
    const minority = aggregateWindows([
      { ...window(0, "neutral", "low"), speaker_overlap_present: true },
      window(20, "neutral", "low"),
      window(40, "neutral", "low"),
    ]);
    expect(minority.speaker_overlap_present).toBe(false);
    const majority = aggregateWindows([
      { ...window(0, "neutral", "low"), speaker_overlap_present: true },
      { ...window(20, "neutral", "low"), speaker_overlap_present: true },
      window(40, "neutral", "low"),
    ]);
    expect(majority.speaker_overlap_present).toBe(true);
  });

  it("keeps the most impaired window quality", () => {
    const prediction = aggregateWindows([
      window(0, "neutral", "low"),
      {
        ...window(15, "neutral", "low"),
        audio_quality: "severely_impaired",
        long_silence_present: true,
      },
    ]);
    expect(prediction.audio_quality).toBe("severely_impaired");
    expect(prediction.long_silence_present).toBe(true);
  });
});
