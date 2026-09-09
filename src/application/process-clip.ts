import { windowBounds, fuse, aggregateWindows, type ClipRow, type ClipPrediction } from "@/domain"
import type { AnalyzeError } from "@/domain/errors"
import type { Result } from "@/domain/result"
import { ok } from "@/domain/result"
import type {
  AcousticAnalyzer,
  AudioStore,
  BatchRepository,
  SemanticClassifier,
} from "./ports"

export type ProcessStage =
  | { tag: "decode" }
  | { tag: "acoustics" }
  | { tag: "window"; index: number; total: number }
  | { tag: "fuse" }

export const formatProcessStage = (stage: ProcessStage): string => {
  if (stage.tag === "decode") {
    return "Decoding audio"
  }
  if (stage.tag === "acoustics") {
    return "Measuring acoustics"
  }
  if (stage.tag === "window") {
    return `Window ${stage.index}/${stage.total}`
  }
  return "Finalizing prediction"
}

export async function processClip(
  deps: {
    repo: BatchRepository
    store: AudioStore
    acoustic: AcousticAnalyzer
    classifier: SemanticClassifier
    fuseQualityAndSilence?: boolean
    onStage?: (stage: ProcessStage) => Promise<void>
  },
  clip: ClipRow,
): Promise<Result<ClipPrediction, AnalyzeError>> {
  const report = async (stage: ProcessStage) => {
    if (!deps.onStage) {
      return
    }
    try {
      await deps.onStage(stage)
    } catch {
      // Stage logs must never fail the clip
    }
  }

  await report({ tag: "decode" })
  const audio = await deps.store.get(clip.audioRef)
  await report({ tag: "acoustics" })
  const measured = await deps.acoustic.measure(audio)
  if (!measured.ok) {
    await deps.repo.complete(clip.id, measured)
    return measured
  }

  const bounds = windowBounds(measured.value.durationSec)
  const windows = []
  for (const [index, bound] of bounds.entries()) {
    await report({ tag: "window", index: index + 1, total: bounds.length })
    const sliced = await deps.acoustic.extractWindow(
      audio,
      bound.startSec,
      bound.endSec,
    )
    if (!sliced.ok) {
      await deps.repo.complete(clip.id, sliced)
      return sliced
    }
    const classified = await deps.classifier.classify({
      audio: sliced.value,
      durationSec: bound.endSec - bound.startSec,
      acoustic:
        deps.fuseQualityAndSilence === false ? undefined : measured.value,
    })
    if (!classified.ok) {
      await deps.repo.complete(clip.id, classified)
      return classified
    }
    windows.push({
      ...classified.value,
      startSec: bound.startSec,
      endSec: bound.endSec,
    })
  }

  await report({ tag: "fuse" })
  const semantic = aggregateWindows(windows)
  const fused =
    deps.fuseQualityAndSilence === false
      ? semantic
      : fuse(semantic, measured.value)
  const result = ok(fused)
  await deps.repo.complete(clip.id, result)
  return result
}

export async function processNextClip(deps: {
  repo: BatchRepository
  store: AudioStore
  acoustic: AcousticAnalyzer
  classifier: SemanticClassifier
  fuseQualityAndSilence?: boolean
  batchId: string
  onStage?: (stage: ProcessStage) => Promise<void>
}): Promise<"idle" | Result<ClipPrediction, AnalyzeError>> {
  const clip = await deps.repo.claimNext(deps.batchId)
  if (!clip) {
    return "idle"
  }
  return processClip(deps, clip)
}

export async function processBatchToCompletion(deps: {
  repo: BatchRepository
  store: AudioStore
  acoustic: AcousticAnalyzer
  classifier: SemanticClassifier
  fuseQualityAndSilence?: boolean
  batchId: string
  onStage?: (stage: ProcessStage) => Promise<void>
}): Promise<void> {
  for (;;) {
    const next = await processNextClip(deps)
    if (next === "idle") {
      return
    }
  }
}
