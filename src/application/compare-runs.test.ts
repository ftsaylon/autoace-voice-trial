import { describe, expect, it } from "vitest"
import { noNoise, type ClipPrediction } from "@/domain"
import { autoAceJsonString } from "@/domain"
import {
  agreementRate,
  comparisonCsv,
  confusionMatrixForRun,
  disagreementCounts,
  heatmapRows,
  latestRunIdsPerMethod,
  scoresForRun,
} from "./compare-runs"
import type { CompareClipInput } from "./compare-runs"

const pred = (
  tone: ClipPrediction["emotional_tone"],
  extras: Partial<ClipPrediction> = {},
): ClipPrediction => ({
  emotional_tone: tone,
  emotional_intensity: "medium",
  background_noise: noNoise,
  audio_quality: "clear",
  speaker_overlap_present: false,
  long_silence_present: false,
  confidence: 0.5,
  ...extras,
})

const clip = (
  name: string,
  gold: ClipPrediction | null,
  byRun: Record<string, ClipPrediction | undefined>,
): CompareClipInput => ({
  id: name,
  name,
  goldJson: gold ? autoAceJsonString(gold) : undefined,
  byRun: Object.fromEntries(
    Object.entries(byRun).map(([runId, prediction]) => [
      runId,
      {
        state: prediction ? "succeeded" : "failed",
        predictionJson: prediction ? autoAceJsonString(prediction) : undefined,
      },
    ]),
  ),
})

describe("latestRunIdsPerMethod", () => {
  it("keeps the newest run per method in created order", () => {
    const ids = latestRunIdsPerMethod([
      { id: "f1", method: "fusion", createdAt: 1 },
      { id: "l1", method: "lexical", createdAt: 2 },
      { id: "f2", method: "fusion", createdAt: 3 },
    ])
    expect(ids).toEqual(["l1", "f2"])
  })
})

describe("scoresForRun", () => {
  it("scores one run against gold and ignores other runs", () => {
    const clips = [
      clip("a.wav", pred("neutral"), {
        fusion: pred("neutral"),
        lexical: pred("upset"),
      }),
      clip("b.wav", pred("upset"), {
        fusion: pred("frustrated"),
        lexical: pred("upset"),
      }),
    ]
    expect(scoresForRun(clips, "fusion")?.emotional_tone.accuracy).toBe(0.5)
    expect(scoresForRun(clips, "lexical")?.emotional_tone.accuracy).toBe(0.5)
  })
})

describe("disagreementCounts", () => {
  it("counts clips where selected runs differ on a field", () => {
    const clips = [
      clip("a.wav", pred("neutral"), {
        fusion: pred("neutral"),
        lexical: pred("neutral"),
      }),
      clip("b.wav", pred("upset"), {
        fusion: pred("frustrated"),
        lexical: pred("upset"),
      }),
    ]
    const tone = disagreementCounts(clips, ["fusion", "lexical"]).find(
      (row) => row.field === "emotional_tone",
    )
    expect(tone).toEqual({
      field: "emotional_tone",
      label: "Tone",
      disagreed: 1,
      compared: 2,
    })
  })
})

describe("agreementRate", () => {
  it("is the complement of disagreement", () => {
    const clips = [
      clip("a.wav", null, {
        fusion: pred("neutral"),
        lexical: pred("neutral"),
      }),
      clip("b.wav", null, {
        fusion: pred("upset"),
        lexical: pred("frustrated"),
      }),
    ]
    expect(agreementRate(clips, ["fusion", "lexical"], "emotional_tone")).toEqual({
      rate: 0.5,
      agreed: 1,
      compared: 2,
    })
  })
})

describe("confusionMatrixForRun", () => {
  it("puts gold on rows and prediction on columns", () => {
    const clips = [
      clip("a.wav", pred("neutral"), { fusion: pred("neutral") }),
      clip("b.wav", pred("upset"), { fusion: pred("frustrated") }),
    ]
    const matrix = confusionMatrixForRun(clips, "fusion")
    expect(matrix?.total).toBe(2)
    const neutral = matrix?.labels.indexOf("neutral") ?? -1
    const upset = matrix?.labels.indexOf("upset") ?? -1
    const frustrated = matrix?.labels.indexOf("frustrated") ?? -1
    expect(matrix?.counts[neutral]?.[neutral]).toBe(1)
    expect(matrix?.counts[upset]?.[frustrated]).toBe(1)
  })
})

describe("heatmapRows", () => {
  it("flags gold mismatches and majority disagreements", () => {
    const rows = heatmapRows(
      [
        clip("a.wav", pred("neutral"), {
          fusion: pred("neutral"),
          lexical: pred("upset"),
        }),
      ],
      ["fusion", "lexical"],
      "emotional_tone",
    )
    expect(rows[0]?.gold).toBe("neutral")
    expect(rows[0]?.cells[0]).toMatchObject({
      runId: "fusion",
      value: "neutral",
      matchGold: true,
      disagreesMajority: false,
    })
    expect(rows[0]?.cells[1]).toMatchObject({
      runId: "lexical",
      value: "upset",
      matchGold: false,
      disagreesMajority: true,
    })
  })
})

describe("comparisonCsv", () => {
  it("writes one row per clip with per-run tone columns", () => {
    const csv = comparisonCsv(
      [clip("a.wav", pred("neutral"), { fusion: pred("neutral") })],
      [{ id: "fusion", label: "Fusion" }],
    )
    expect(csv).toContain("name,gold_tone,Fusion_tone,Fusion_error")
    expect(csv).toContain("a.wav")
    expect(csv).toContain("neutral")
  })
})
