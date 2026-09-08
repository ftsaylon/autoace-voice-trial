import { describe, expect, it } from "vitest";
import { toAutoAceJson } from "./codec";
import { fuse } from "./fusion";
import { noNoise, presentNoise, type AcousticMeasurements, type ClipPrediction } from "./prediction";

const semanticSatisfied: ClipPrediction = {
  emotional_tone: "satisfied",
  emotional_intensity: "medium",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.74,
};

const loudClean: AcousticMeasurements = {
  durationSec: 31,
  longestSilenceSec: 2.9,
  snrDb: 28,
  clipFraction: 0,
  rms: 0.4,
  spectralFlatness: 0.1,
};

const lowSnrNoNoise: AcousticMeasurements = {
  durationSec: 35,
  longestSilenceSec: 3.4,
  snrDb: 8,
  clipFraction: 0,
  rms: 0.05,
  spectralFlatness: 0.4,
};

const longDeadAir: AcousticMeasurements = {
  durationSec: 40,
  longestSilenceSec: 8,
  snrDb: 22,
  clipFraction: 0,
  rms: 0.08,
  spectralFlatness: 0.12,
};

describe("fusion", () => {
  it("keeps semantic tone when the signal is loud", () => {
    const fused = fuse(semanticSatisfied, loudClean);
    expect(toAutoAceJson(fused)).toEqual({
      emotional_tone: "satisfied",
      emotional_intensity: "medium",
      background_noise_present: false,
      background_noise_type: "",
      background_noise_severity: "none",
      audio_quality: "clear",
      speaker_overlap_present: false,
      long_silence_present: false,
      confidence: 0.74,
    });
  });

  it("does not invent background noise from low SNR", () => {
    const fused = fuse(semanticSatisfied, lowSnrNoNoise);
    expect(toAutoAceJson(fused)).toEqual({
      emotional_tone: "satisfied",
      emotional_intensity: "medium",
      background_noise_present: false,
      background_noise_type: "",
      background_noise_severity: "none",
      audio_quality: "slightly_impaired",
      speaker_overlap_present: false,
      long_silence_present: false,
      confidence: 0.74,
    });
  });

  it("sets long silence from the 8 second acoustic threshold", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("TV", "medium") },
      longDeadAir,
    );
    expect(fused.long_silence_present).toBe(true);
    expect(fused.background_noise).toEqual(presentNoise("TV", "medium"));
  });
});
