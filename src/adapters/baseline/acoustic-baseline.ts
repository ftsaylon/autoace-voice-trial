import type { AcousticAnalyzer, SemanticClassifier } from "@/application/ports";
import { FfmpegAcousticAnalyzer } from "@/adapters/acoustic/ffmpeg-analyzer";
import {
  noNoise,
  presentNoise,
  type ClipPrediction,
} from "@/domain";
import { err, ok, type Result } from "@/domain/result";
import type { AnalyzeError } from "@/domain/errors";

export class AcousticBaselineClassifier implements SemanticClassifier {
  constructor(private readonly acoustic: AcousticAnalyzer = new FfmpegAcousticAnalyzer()) {}

  async classify(input: {
    audio: { name: string; bytes: Uint8Array; mediaType: string };
    durationSec: number;
  }): Promise<Result<ClipPrediction, AnalyzeError>> {
    const measured = await this.acoustic.measure(input.audio);
    if (!measured.ok) {
      return err(measured.error);
    }
    const m = measured.value;
    let emotional_tone: ClipPrediction["emotional_tone"] = "neutral";
    let emotional_intensity: ClipPrediction["emotional_intensity"] = "low";
    if (m.rms >= 0.18 && m.snrDb >= 12) {
      emotional_tone = "upset";
      emotional_intensity = m.rms >= 0.28 ? "high" : "medium";
    } else if (m.rms >= 0.12 && m.spectralFlatness < 0.2) {
      emotional_tone = "satisfied";
      emotional_intensity = "medium";
    } else if (m.rms >= 0.1) {
      emotional_tone = "frustrated";
      emotional_intensity = "medium";
    }
    const noisy = m.spectralFlatness >= 0.28 || (m.snrDb < 12 && m.rms >= 0.04);
    const prediction: ClipPrediction = {
      emotional_tone,
      emotional_intensity,
      background_noise: noisy
        ? presentNoise(m.spectralFlatness >= 0.35 ? "broadband noise" : "background noise", m.snrDb < 8 ? "medium" : "low")
        : noNoise,
      audio_quality: "clear",
      speaker_overlap_present: false,
      long_silence_present: false,
      confidence: 0.4,
    };
    return ok(prediction);
  }
}
