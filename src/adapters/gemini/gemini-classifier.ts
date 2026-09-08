import { generateText, Output } from "ai";
import { google } from "@ai-sdk/google";
import type { SemanticClassifier } from "@/application/ports";
import {
  noNoise,
  presentNoise,
  semanticClassifierSchema,
  type ClipPrediction,
} from "@/domain";
import { err, ok, type Result } from "@/domain/result";
import type { AnalyzeError } from "@/domain/errors";

export const GEMINI_MODEL = "gemini-2.5-flash" as const;

export const CLASSIFIER_PROMPT = `You analyze production call-center audio between a customer and an agent.

Return structured fields for THIS clip only.

emotional_tone: the primary emotion of the customer.
- neutral: no clear positive or negative emotion
- satisfied: pleased, relieved, appreciative, or clearly positive
- frustrated: annoyed, impatient, or dissatisfied without strong anger or distress
- upset: clearly angry, agitated, or strongly dissatisfied
- distressed: highly emotional, overwhelmed, panicked, crying, or otherwise emotionally escalated

emotional_intensity: low (subtle), medium (clear and sustained), high (strong, escalated).

background_noise_present: true only if meaningful non-speech sound is audible. Barely perceptible artifacts do not count.

background_noise_type: a short phrase for the dominant noise (office chatter, TV, road noise, sharp static, keyboard typing, music, wind, mechanical). Empty string when no noise is present.

background_noise_severity: none when no noise. Otherwise low (audible but does not interfere), medium (occasionally interferes), high (materially impairs the conversation).

speaker_overlap_present: true if two or more speakers talk at the same time enough to affect understanding.

confidence: 0 to 1 for the overall result.

Rules:
- Do not infer frustration or distress solely from loudness.
- Do not infer background noise solely from poor audio quality.
- Judge the customer, not the agent.
- If several emotions appear, pick the primary one.`;

export function classifierIsConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_API_KEY,
  );
}

function toPrediction(
  output: {
    emotional_tone: ClipPrediction["emotional_tone"];
    emotional_intensity: ClipPrediction["emotional_intensity"];
    background_noise_present: boolean;
    background_noise_type: string;
    background_noise_severity: "none" | "low" | "medium" | "high";
    speaker_overlap_present: boolean;
    confidence: number;
  },
): Result<ClipPrediction, AnalyzeError> {
  if (!output.background_noise_present) {
    return ok({
      emotional_tone: output.emotional_tone,
      emotional_intensity: output.emotional_intensity,
      background_noise: noNoise,
      audio_quality: "clear",
      speaker_overlap_present: output.speaker_overlap_present,
      long_silence_present: false,
      confidence: output.confidence,
    });
  }
  if (
    output.background_noise_type.trim().length === 0 ||
    output.background_noise_severity === "none"
  ) {
    return err({
      tag: "classifier_invalid_output",
      cause: "noise present without type and non-none severity",
    });
  }
  return ok({
    emotional_tone: output.emotional_tone,
    emotional_intensity: output.emotional_intensity,
    background_noise: presentNoise(
      output.background_noise_type,
      output.background_noise_severity,
    ),
    audio_quality: "clear",
    speaker_overlap_present: output.speaker_overlap_present,
    long_silence_present: false,
    confidence: output.confidence,
  });
}

export class GeminiClassifier implements SemanticClassifier {
  async classify(input: {
    audio: { name: string; bytes: Uint8Array; mediaType: string };
    durationSec: number;
  }): Promise<Result<ClipPrediction, AnalyzeError>> {
    if (!classifierIsConfigured()) {
      return err({ tag: "classifier_unavailable" });
    }
    try {
      const result = await generateText({
        model: google(GEMINI_MODEL),
        output: Output.object({ schema: semanticClassifierSchema }),
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: `${CLASSIFIER_PROMPT}\n\nClip duration: ${input.durationSec.toFixed(2)} seconds. Filename: ${input.audio.name}.`,
              },
              {
                type: "file",
                data: input.audio.bytes,
                mediaType: input.audio.mediaType,
                filename: input.audio.name,
              },
            ],
          },
        ],
      });
      if (!result.output) {
        return err({
          tag: "classifier_invalid_output",
          cause: "empty structured output",
        });
      }
      return toPrediction(result.output);
    } catch (error) {
      return err({
        tag: "classifier_invalid_output",
        cause: error instanceof Error ? error.message : "Gemini request failed",
      });
    }
  }
}
