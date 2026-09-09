import type { SemanticClassifier } from "@/application/ports"
import { decodePcm } from "@/adapters/acoustic/ffmpeg-analyzer"
import { err, ok, type Result } from "@/domain/result"
import type { AnalyzeError } from "@/domain/errors"
import type { ClipPrediction } from "@/domain"
import { mapProsodyToPrediction, measureProsody } from "./measure-prosody"

export class ProsodyClassifier implements SemanticClassifier {
  constructor(
    private readonly decode: (bytes: Uint8Array) => Promise<Float32Array> = decodePcm,
  ) {}

  async classify(input: {
    audio: { name: string; bytes: Uint8Array; mediaType: string }
    durationSec: number
  }): Promise<Result<ClipPrediction, AnalyzeError>> {
    try {
      const samples = await this.decode(input.audio.bytes)
      return ok(mapProsodyToPrediction(measureProsody(samples)))
    } catch (error) {
      return err({
        tag: "decode_failed",
        name: input.audio.name,
        cause: error instanceof Error ? error.message : "prosody decode failed",
      })
    }
  }
}
