import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { SemanticClassifier } from "@/application/ports";
import {
  AUDIO_QUALITIES,
  noNoise,
  presentNoise,
  semanticClassifierSchema,
  type AcousticMeasurements,
  type AudioQuality,
  type ClipPrediction,
} from "@/domain";
import { err, ok, type Result } from "@/domain/result";
import type { AnalyzeError } from "@/domain/errors";
import { z } from "zod";
import {
  FUSION_PROMPT,
  acousticForGeminiPrompt,
  buildGeminiUserText,
} from "./prompts";
import {
  classifierIsConfigured,
  readEnv,
  resolveGeminiApiKey,
} from "./gemini-env";

export { classifierIsConfigured, resolveGeminiApiKey } from "./gemini-env";

export const DEFAULT_GEMINI_MODEL = "gemini-3.6-flash";

export const resolveGeminiModel = (): string => {
  const override = readEnv("GEMINI_MODEL");
  if (!override) {
    return DEFAULT_GEMINI_MODEL;
  }
  return override.replace(/^models\//, "");
};

export const CLASSIFIER_PROMPT = FUSION_PROMPT;

const fullClassifierSchema = semanticClassifierSchema.extend({
  audio_quality: z.enum(AUDIO_QUALITIES),
  long_silence_present: z.boolean(),
});

export type GeminiClassifierOptions = {
  prompt: string;
  ownQualityAndSilence?: boolean;
  apiKey?: string;
};

export function toPrediction(
  output: {
    emotional_tone: ClipPrediction["emotional_tone"];
    emotional_intensity: ClipPrediction["emotional_intensity"];
    background_noise_present: boolean;
    background_noise_type: string;
    background_noise_severity: "none" | "low" | "medium" | "high";
    speaker_overlap_present: boolean;
    confidence: number;
    audio_quality?: AudioQuality;
    long_silence_present?: boolean;
  },
): Result<ClipPrediction, AnalyzeError> {
  const audio_quality = output.audio_quality ?? "clear";
  const long_silence_present = output.long_silence_present ?? false;
  if (!output.background_noise_present) {
    return ok({
      emotional_tone: output.emotional_tone,
      emotional_intensity: output.emotional_intensity,
      background_noise: noNoise,
      audio_quality,
      speaker_overlap_present: output.speaker_overlap_present,
      long_silence_present,
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
    audio_quality,
    speaker_overlap_present: output.speaker_overlap_present,
    long_silence_present,
    confidence: output.confidence,
  });
}

export class GeminiClassifier implements SemanticClassifier {
  constructor(
    private readonly options: GeminiClassifierOptions = { prompt: FUSION_PROMPT },
  ) {}

  async classify(input: {
    audio: { name: string; bytes: Uint8Array; mediaType: string };
    durationSec: number;
    acoustic?: AcousticMeasurements;
  }): Promise<Result<ClipPrediction, AnalyzeError>> {
    const apiKey = resolveGeminiApiKey(this.options.apiKey);
    if (!apiKey || !classifierIsConfigured(apiKey)) {
      return err({ tag: "classifier_unavailable" });
    }
    const google = createGoogleGenerativeAI({ apiKey });
    const ownQuality = this.options.ownQualityAndSilence === true;
    try {
      const result = await generateText({
        model: google(resolveGeminiModel()),
        output: Output.object({
          schema: ownQuality ? fullClassifierSchema : semanticClassifierSchema,
        }),
        providerOptions: {
          google: {
            thinkingConfig: {
              thinkingLevel: "minimal",
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: buildGeminiUserText({
                  prompt: this.options.prompt,
                  durationSec: input.durationSec,
                  acoustic: acousticForGeminiPrompt({
                    ownQualityAndSilence: ownQuality,
                    acoustic: input.acoustic,
                  }),
                }),
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
