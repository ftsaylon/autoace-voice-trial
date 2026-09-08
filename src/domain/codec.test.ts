import { describe, expect, it } from "vitest";
import { fromAutoAceJson, toAutoAceJson } from "./codec";
import { noNoise, presentNoise, type ClipPrediction } from "./prediction";

const sample: ClipPrediction = {
  emotional_tone: "frustrated",
  emotional_intensity: "medium",
  background_noise: presentNoise("office chatter", "low"),
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.82,
};

const quiet: ClipPrediction = {
  emotional_tone: "upset",
  emotional_intensity: "high",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.91,
};

describe("AutoAce JSON codec", () => {
  it("round-trips a prediction with present noise", () => {
    const json = toAutoAceJson(sample);
    expect(json).toEqual({
      emotional_tone: "frustrated",
      emotional_intensity: "medium",
      background_noise_present: true,
      background_noise_type: "office chatter",
      background_noise_severity: "low",
      audio_quality: "clear",
      speaker_overlap_present: false,
      long_silence_present: false,
      confidence: 0.82,
    });
    const parsed = fromAutoAceJson(json);
    expect(parsed).toEqual({ ok: true, value: sample });
  });

  it("round-trips absent noise as empty type and none severity", () => {
    const json = toAutoAceJson(quiet);
    expect(json.background_noise_present).toBe(false);
    expect(json.background_noise_type).toBe("");
    expect(json.background_noise_severity).toBe("none");
    expect(fromAutoAceJson(json)).toEqual({ ok: true, value: quiet });
  });

  it("parses a JSON string from a CSV cell", () => {
    const cell = JSON.stringify(toAutoAceJson(quiet));
    expect(fromAutoAceJson(cell)).toEqual({ ok: true, value: quiet });
  });

  it("rejects present noise with an empty type", () => {
    const parsed = fromAutoAceJson({
      ...toAutoAceJson(sample),
      background_noise_type: "",
    });
    expect(parsed.ok).toBe(false);
  });

  it("rejects absent noise with a leftover type", () => {
    const parsed = fromAutoAceJson({
      ...toAutoAceJson(quiet),
      background_noise_type: "TV",
    });
    expect(parsed.ok).toBe(false);
  });
});
