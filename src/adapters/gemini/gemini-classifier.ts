import { generateText, Output } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { SemanticClassifier } from "@/application/ports";
import {
  AUDIO_QUALITIES,
  noNoise,
  presentNoise,
  semanticClassifierSchema,
  normalizeNoiseType,
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

export const resolveGeminiModel = (override?: string): string => {
  const fromOverride = override?.trim();
  if (fromOverride) {
    return fromOverride.replace(/^models\//, "");
  }
  const fromEnv = readEnv("GEMINI_MODEL");
  if (!fromEnv) {
    return DEFAULT_GEMINI_MODEL;
  }
  return fromEnv.replace(/^models\//, "");
};

/** Generic name so Gemini never sees call_*.ogg or window slice ids. */
export const GEMINI_AUDIO_FILENAME = "clip.wav"

export const CLASSIFIER_PROMPT = FUSION_PROMPT

export const GEMINI_INVALID_OUTPUT_RETRIES = 1

const qualityClassifierSchema = semanticClassifierSchema.extend({
  audio_quality: z.enum(AUDIO_QUALITIES),
});

const fullClassifierSchema = semanticClassifierSchema.extend({
  audio_quality: z.enum(AUDIO_QUALITIES),
  long_silence_present: z.boolean(),
});

export type GeminiStructuredOutput = {
  emotional_tone: ClipPrediction["emotional_tone"];
  emotional_intensity: ClipPrediction["emotional_intensity"];
  background_noise_present: boolean;
  background_noise_type: string;
  background_noise_severity: "none" | "low" | "medium" | "high";
  speaker_overlap_present: boolean;
  confidence: number;
  audio_quality?: AudioQuality;
  long_silence_present?: boolean;
};

export type GeminiGenerateInput = {
  modelId: string;
  apiKey: string;
  ownQuality: boolean;
  ownSilence: boolean;
  userText: string;
  audio: { bytes: Uint8Array; mediaType: string };
};

export type GeminiGenerateFn = (
  input: GeminiGenerateInput,
) => Promise<{ output?: GeminiStructuredOutput | null }>;

const schemaFor = (ownQuality: boolean, ownSilence: boolean) => {
  if (ownQuality && ownSilence) {
    return fullClassifierSchema;
  }
  if (ownQuality) {
    return qualityClassifierSchema;
  }
  return semanticClassifierSchema;
};

const defaultGenerate: GeminiGenerateFn = async (input) => {
  const google = createGoogleGenerativeAI({ apiKey: input.apiKey });
  const result = await generateText({
    model: google(input.modelId),
    output: Output.object({
      schema: schemaFor(input.ownQuality, input.ownSilence),
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
            text: input.userText,
          },
          {
            type: "file",
            data: input.audio.bytes,
            mediaType: input.audio.mediaType,
            filename: GEMINI_AUDIO_FILENAME,
          },
        ],
      },
    ],
  });
  return { output: result.output };
};

export type GeminiClassifierOptions = {
  prompt: string;
  ownQuality?: boolean;
  ownSilence?: boolean;
  ownQualityAndSilence?: boolean;
  apiKey?: string;
  model?: string;
  generate?: GeminiGenerateFn;
};

export const resolveOwnFields = (
  options: GeminiClassifierOptions,
): { ownQuality: boolean; ownSilence: boolean } => {
  const both = options.ownQualityAndSilence === true;
  return {
    ownQuality: options.ownQuality === true || both,
    ownSilence: options.ownSilence === true || both,
  };
};

export function toPrediction(
  output: GeminiStructuredOutput,
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
  const type = normalizeNoiseType(output.background_noise_type);
  if (type.length === 0 || output.background_noise_severity === "none") {
    return err({
      tag: "classifier_invalid_output",
      cause: "noise present without type and non-none severity",
    });
  }
  return ok({
    emotional_tone: output.emotional_tone,
    emotional_intensity: output.emotional_intensity,
    background_noise: presentNoise(type, output.background_noise_severity),
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
    const generate = this.options.generate ?? defaultGenerate;
    const apiKey = resolveGeminiApiKey(this.options.apiKey);
    if (!this.options.generate && (!apiKey || !classifierIsConfigured(apiKey))) {
      return err({ tag: "classifier_unavailable" });
    }
    const { ownQuality, ownSilence } = resolveOwnFields(this.options);
    const userText = buildGeminiUserText({
      prompt: this.options.prompt,
      durationSec: input.durationSec,
      acoustic: acousticForGeminiPrompt({
        skipAcousticContext: ownQuality && ownSilence,
        acoustic: input.acoustic,
      }),
    });
    const generateInput: GeminiGenerateInput = {
      modelId: resolveGeminiModel(this.options.model),
      apiKey: apiKey ?? "test",
      ownQuality,
      ownSilence,
      userText,
      audio: {
        bytes: input.audio.bytes,
        mediaType: input.audio.mediaType,
      },
    };
    const attempts = 1 + GEMINI_INVALID_OUTPUT_RETRIES;
    let lastError: AnalyzeError = {
      tag: "classifier_invalid_output",
      cause: "Gemini request failed",
    };
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        const result = await generate(generateInput);
        if (!result.output) {
          lastError = {
            tag: "classifier_invalid_output",
            cause: "empty structured output",
          };
          continue;
        }
        const parsed = toPrediction(result.output);
        if (parsed.ok) {
          return parsed;
        }
        lastError = parsed.error;
      } catch (error) {
        lastError = {
          tag: "classifier_invalid_output",
          cause: error instanceof Error ? error.message : "Gemini request failed",
        };
      }
    }
    return err(lastError);
  }
}
