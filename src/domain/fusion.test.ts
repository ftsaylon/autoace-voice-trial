import { describe, expect, it } from "vitest";
import { toAutoAceJson } from "./codec";
import { fuse } from "./fusion";
import {
  acousticMeasurements,
  noNoise,
  presentNoise,
  type ClipPrediction,
} from "./prediction";

const semanticSatisfied: ClipPrediction = {
  emotional_tone: "satisfied",
  emotional_intensity: "medium",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.74,
};

const loudClean = acousticMeasurements({
  durationSec: 31,
  longestSilenceSec: 2.9,
  snrDb: 28,
  clipFraction: 0,
  rms: 0.4,
  spectralFlatness: 0.1,
  wadaSnrDb: 28,
  hnrDb: 14,
  noiseFamily: "clean",
  overlapEvidence: "none",
});

const lowSnrNoNoise = acousticMeasurements({
  durationSec: 35,
  longestSilenceSec: 3.4,
  snrDb: 8,
  clipFraction: 0,
  rms: 0.05,
  spectralFlatness: 0.4,
  wadaSnrDb: 8,
  noiseFamily: "uncertain",
  overlapEvidence: "none",
});

const longDeadAir = acousticMeasurements({
  durationSec: 40,
  longestSilenceSec: 8,
  snrDb: 22,
  clipFraction: 0,
  rms: 0.08,
  spectralFlatness: 0.12,
  wadaSnrDb: 22,
  noiseFamily: "uncertain",
  overlapEvidence: "none",
});

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

  it("gates low office chatter when DSP family is clean", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("office chatter", "low") },
      loudClean,
    );
    expect(fused.background_noise).toEqual(noNoise);
    expect(fused.emotional_tone).toBe("satisfied");
  });

  it("gates medium generic chatter on a clean residual", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("office chatter", "medium") },
      loudClean,
    );
    expect(fused.background_noise).toEqual(noNoise);
  });

  it("keeps Gemini TV on a clean residual", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("TV", "medium") },
      loudClean,
    );
    expect(fused.background_noise).toEqual(presentNoise("TV", "medium"));
  });

  it("keeps Gemini TV when DSP family is uncertain", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("TV", "medium") },
      acousticMeasurements({ noiseFamily: "uncertain" }),
    );
    expect(fused.background_noise).toEqual(presentNoise("TV", "medium"));
  });

  it("recovers sharp static when DSP family is static", () => {
    const fused = fuse(
      semanticSatisfied,
      acousticMeasurements({ noiseFamily: "static" }),
    );
    expect(fused.background_noise).toEqual(presentNoise("sharp static", "low"));
  });

  it("replaces office chatter with sharp static when DSP family is static", () => {
    const fused = fuse(
      { ...semanticSatisfied, background_noise: presentNoise("office chatter", "medium") },
      acousticMeasurements({ noiseFamily: "static" }),
    );
    expect(fused.background_noise).toEqual(presentNoise("sharp static", "medium"));
  });

  it("sets overlap from stereo both-active evidence", () => {
    const fused = fuse(
      semanticSatisfied,
      acousticMeasurements({ overlapEvidence: "stereo_both_active" }),
    );
    expect(fused.speaker_overlap_present).toBe(true);
  });

  it("does not set overlap from harmonicity unless Gemini already did", () => {
    const fused = fuse(
      semanticSatisfied,
      acousticMeasurements({ noiseFamily: "uncertain", overlapEvidence: "harmonicity" }),
    );
    expect(fused.speaker_overlap_present).toBe(false);
  });

  it("keeps Gemini overlap on a clean residual (dual-mono must not be vetoed)", () => {
    const fused = fuse(
      { ...semanticSatisfied, speaker_overlap_present: true },
      loudClean,
    );
    expect(fused.speaker_overlap_present).toBe(true);
  });

  it("still forces overlap from stereo both-active when the residual looks clean", () => {
    const fused = fuse(
      semanticSatisfied,
      acousticMeasurements({
        noiseFamily: "clean",
        overlapEvidence: "stereo_both_active",
      }),
    );
    expect(fused.speaker_overlap_present).toBe(true);
  });

  it("floors low intensity when F0 range is high without requiring loudness", () => {
    const fused = fuse(
      { ...semanticSatisfied, emotional_tone: "neutral", emotional_intensity: "low" },
      acousticMeasurements({ f0RangeHz: 60, rms: 0.05 }),
    );
    expect(fused.emotional_tone).toBe("neutral");
    expect(fused.emotional_intensity).toBe("medium");
  });

  it("does not floor intensity from loudness alone", () => {
    const fused = fuse(
      { ...semanticSatisfied, emotional_tone: "neutral", emotional_intensity: "low" },
      acousticMeasurements({ f0RangeHz: 20, rms: 0.4 }),
    );
    expect(fused.emotional_tone).toBe("neutral");
    expect(fused.emotional_intensity).toBe("low");
  });

  it("floors upset intensity off low without changing tone", () => {
    const fused = fuse(
      { ...semanticSatisfied, emotional_tone: "upset", emotional_intensity: "low" },
      acousticMeasurements({ f0RangeHz: 20, rms: 0.08 }),
    );
    expect(fused.emotional_tone).toBe("upset");
    expect(fused.emotional_intensity).toBe("medium");
  });

  it("does not mark quality slight from energy SNR when WADA-SNR is high", () => {
    const fused = fuse(
      semanticSatisfied,
      acousticMeasurements({ snrDb: 8, wadaSnrDb: 22, clipFraction: 0 }),
    );
    expect(fused.audio_quality).toBe("clear");
  });
});
