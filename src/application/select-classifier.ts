import { AcousticBaselineClassifier } from "@/adapters/baseline/acoustic-baseline"
import { GeminiClassifier } from "@/adapters/gemini/gemini-classifier"
import {
  FUSION_PROMPT,
  GEMINI_ONLY_PROMPT,
  LEXICAL_PROMPT,
} from "@/adapters/gemini/prompts"
import { ProsodyClassifier } from "@/adapters/prosody/prosody-classifier"
import type { AcousticAnalyzer, SemanticClassifier } from "./ports"
import type { MethodId } from "./methods"

export type { AnalysisMethod, MethodId } from "./methods"
export {
  DEFAULT_METHOD,
  METHOD_IDS,
  METHOD_LIST,
  METHODS,
  methodDefinition,
  modelForMethod,
} from "./methods"

export const classifierForMethod = (
  method: MethodId,
  acoustic: AcousticAnalyzer,
  apiKey?: string,
): SemanticClassifier => {
  if (method === "baseline") {
    return new AcousticBaselineClassifier(acoustic)
  }
  if (method === "prosody") {
    return new ProsodyClassifier()
  }
  if (method === "lexical") {
    return new GeminiClassifier({ prompt: LEXICAL_PROMPT, apiKey })
  }
  if (method === "gemini_only") {
    return new GeminiClassifier({
      prompt: GEMINI_ONLY_PROMPT,
      ownQualityAndSilence: true,
      apiKey,
    })
  }
  return new GeminiClassifier({ prompt: FUSION_PROMPT, apiKey })
}
