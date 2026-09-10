export type BaseClipRow = {
  _id: string
  name: string
  goldJson?: string
  state: "uploading" | "queued" | "running" | "succeeded" | "failed"
  predictionJson?: string
  errorJson?: string
  stage?: string
  startedAt?: number
  finishedAt?: number
}

export type ClipResultOverlay = {
  runId: string
  clipId: string
  state: string
  predictionJson?: string
  errorJson?: string
  stage?: string
  startedAt?: number
  finishedAt?: number
}

const clipStateFromResult = (
  state: string,
): BaseClipRow["state"] => {
  if (
    state === "uploading" ||
    state === "queued" ||
    state === "running" ||
    state === "succeeded" ||
    state === "failed"
  ) {
    return state
  }
  return "failed"
}

export const overlayClipsForRun = (
  clips: BaseClipRow[],
  results: ClipResultOverlay[],
  runId: string,
): BaseClipRow[] => {
  const byClip = new Map(
    results
      .filter((row) => row.runId === runId)
      .map((row) => [row.clipId, row] as const),
  )
  return clips.map((clip) => {
    const result = byClip.get(clip._id)
    if (!result) {
      return clip
    }
    return {
      ...clip,
      state: clipStateFromResult(result.state),
      predictionJson: result.predictionJson,
      errorJson: result.errorJson,
      stage: result.stage ?? result.state,
      startedAt: result.startedAt ?? clip.startedAt,
      finishedAt: result.finishedAt ?? clip.finishedAt,
    }
  })
}
