import { describe, expect, it } from "vitest";
import { measurePcm } from "@/adapters/acoustic/ffmpeg-analyzer";

describe("measurePcm", () => {
  it("flags an 8 second quiet stretch as long silence", () => {
    const sr = 16000;
    const samples = new Float32Array(sr * 10);
    for (let i = 0; i < sr; i++) {
      samples[i] = 0.2;
    }
    const measured = measurePcm(samples);
    expect(measured.durationSec).toBeCloseTo(10);
    expect(measured.longestSilenceSec).toBeGreaterThanOrEqual(8);
  });
});
