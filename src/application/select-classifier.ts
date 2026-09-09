import { AcousticBaselineClassifier } from "@/adapters/baseline/acoustic-baseline"
import { GeminiClassifier } from "@/adapters/gemini/gemini-classifier"
import type { AcousticAnalyzer, SemanticClassifier } from "./ports"

export type AnalysisMethod = "fusion" | "baseline"

export const classifierForMethod = (
  method: AnalysisMethod,
  acoustic: AcousticAnalyzer,
): SemanticClassifier => {
  if (method === "baseline") {
    return new AcousticBaselineClassifier(acoustic)
  }
  return new GeminiClassifier()
}
