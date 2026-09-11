import { describe, expect, it } from "vitest"
import {
  overlayClipsForRun,
  stripClipOverlays,
  type BaseClipRow,
  type ClipResultOverlay,
} from "./overlay-clips"

const clip = (overrides: Partial<BaseClipRow> & Pick<BaseClipRow, "_id" | "name">): BaseClipRow => ({
  state: "queued",
  ...overrides,
})

describe("stripClipOverlays", () => {
  it("drops predictions so a later overlay cannot show the wrong run", () => {
    const clips = [
      clip({
        _id: "c1",
        name: "a.wav",
        state: "succeeded",
        predictionJson: '{"emotional_tone":"neutral"}',
      }),
    ]
    const stripped = stripClipOverlays(clips)[0]
    expect(stripped?.state).toBe("queued")
    expect(stripped?.predictionJson).toBeUndefined()
  })
})

describe("overlayClipsForRun", () => {
  const clips = [clip({ _id: "c1", name: "a.wav" }), clip({ _id: "c2", name: "b.wav" })]
  const results: ClipResultOverlay[] = [
    {
      runId: "fusion",
      clipId: "c1",
      state: "succeeded",
      predictionJson: '{"emotional_tone":"calm"}',
    },
    {
      runId: "lexical",
      clipId: "c1",
      state: "succeeded",
      predictionJson: '{"emotional_tone":"angry"}',
    },
  ]

  it("applies only the selected run's predictions", () => {
    const overlaid = overlayClipsForRun(clips, results, "lexical")
    expect(overlaid[0]?.predictionJson).toBe('{"emotional_tone":"angry"}')
    expect(overlaid[1]?.state).toBe("queued")
  })
})
