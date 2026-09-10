import { describe, expect, it } from "vitest"
import { autoAceJsonString, noNoise, type ClipPrediction } from "@/domain"
import type { CompareClipInput } from "@/application/compare-runs"
import {
  accuracyByFieldCsv,
  buildComparisonExports,
  disagreementCsv,
  perClipComparisonCsv,
} from "@/application/export-comparison"
import type { LabeledRun } from "@/lib/run-labels"

const pred = (tone: ClipPrediction["emotional_tone"]): ClipPrediction => ({
  emotional_tone: tone,
  emotional_intensity: "medium",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.5,
})

const clip = (
  name: string,
  gold: ClipPrediction | null,
  byRun: Record<string, ClipPrediction>,
): CompareClipInput => ({
  id: name,
  name,
  goldJson: gold ? autoAceJsonString(gold) : undefined,
  byRun: Object.fromEntries(
    Object.entries(byRun).map(([runId, prediction]) => [
      runId,
      {
        state: "succeeded",
        predictionJson: autoAceJsonString(prediction),
      },
    ]),
  ),
})

const runs: LabeledRun[] = [
  {
    id: "fusion",
    method: "fusion",
    createdAt: 1,
    occurrence: 0,
    label: "Fusion · 1h ago",
    shortLabel: "Fusion",
  },
  {
    id: "lexical",
    method: "lexical",
    createdAt: 2,
    occurrence: 0,
    label: "Lexical · 30m ago",
    shortLabel: "Lexical",
  },
]

describe("export comparison csv", () => {
  const clips = [
    clip("a.wav", pred("neutral"), {
      fusion: pred("neutral"),
      lexical: pred("upset"),
    }),
  ]

  it("writes accuracy and disagreement exports", () => {
    expect(accuracyByFieldCsv(clips, runs)).toContain("Tone")
    expect(disagreementCsv(clips, runs)).toContain("Tone")
    expect(perClipComparisonCsv(clips, runs)).toContain("a.wav")
  })

  it("builds the full comparison folder", () => {
    const files = buildComparisonExports(clips, runs)
    expect(files["comparison/comparison.csv"]).toContain("a.wav")
    expect(files["comparison/accuracy-by-field.csv"]).toBeTruthy()
    expect(files["comparison/score-matrix.csv"]).toBeTruthy()
    expect(files["comparison/clip-heatmap-emotional_tone.csv"]).toBeTruthy()
    expect(files["comparison/tone-confusion-fusion.csv"]).toBeTruthy()
  })
})
