"use node"

import { v } from "convex/values"
import { env, internalAction, type ActionCtx } from "./_generated/server"
import { internal } from "./_generated/api"
import { processClip, formatProcessStage } from "../src/application/process-clip"
import { classifierForMethod } from "../src/application/select-classifier"
import { resolveMethod } from "../src/application/methods"
import { formatAnalyzeError } from "../src/domain/errors"
import { classifierIsConfigured, resolveGeminiApiKey } from "../src/adapters/gemini/gemini-classifier"
import { FfmpegAcousticAnalyzer } from "../src/adapters/acoustic/ffmpeg-analyzer"
import { autoAceJsonString } from "../src/domain"
import { mediaTypeFor } from "../src/adapters/storage/memory"
import type { AnalyzeError } from "../src/domain/errors"
import type { ClipPrediction } from "../src/domain"
import type { Result } from "../src/domain/result"
import type { AudioStore, BatchRepository } from "../src/application/ports"
import type { Id } from "./_generated/dataModel"

type ClaimedClip = {
  clipResultId: Id<"clipResults">
  clipId: Id<"clips">
  batchId: Id<"batches">
  runId: Id<"runs">
  name: string
  storageId: Id<"_storage">
  userId: Id<"users">
  method: string
  model: string
}

const processClaim = async (ctx: ActionCtx, claimed: ClaimedClip) => {
  const failClip = async (errorJson: string) => {
    await ctx.runMutation(internal.process.completeClip, {
      clipResultId: claimed.clipResultId,
      ok: false,
      errorJson,
    })
  }

  const method = resolveMethod(claimed.method)
  if (!method) {
    const error = {
      tag: "classifier_invalid_output" as const,
      cause: `Unknown method ${claimed.method}`,
    }
    await failClip(JSON.stringify(error))
    await ctx.runMutation(internal.process.appendLog, {
      userId: claimed.userId,
      batchId: claimed.batchId,
      clipId: claimed.clipId,
      runId: claimed.runId,
      level: "error",
      message: formatAnalyzeError(error),
    })
    return
  }

  const apiKey = resolveGeminiApiKey(
    env.GOOGLE_GENERATIVE_AI_API_KEY ?? env.GEMINI_API_KEY ?? env.GOOGLE_API_KEY,
  )
  if (method.needsGemini && !classifierIsConfigured(apiKey)) {
    const error = { tag: "classifier_unavailable" as const }
    await ctx.runMutation(internal.process.failRunUnavailable, {
      runId: claimed.runId,
      errorJson: JSON.stringify(error),
      message: formatAnalyzeError(error),
    })
    return
  }

  const blob = await ctx.storage.get(claimed.storageId)
  if (!blob) {
    await failClip(
      JSON.stringify({
        tag: "decode_failed",
        name: claimed.name,
        cause: "Audio is missing from storage",
      }),
    )
    return
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())

  const acoustic = new FfmpegAcousticAnalyzer()
  const classifier = classifierForMethod(method.id, acoustic, apiKey, env.GEMINI_MODEL)

  const store: AudioStore = {
    async put() {
      throw new Error("Uploads are not done inside the worker")
    },
    async get() {
      return {
        name: claimed.name,
        bytes,
        mediaType: mediaTypeFor(claimed.name),
      }
    },
  }

  const repo: BatchRepository = {
    async create() {
      throw new Error("create is not used in the worker")
    },
    async get() {
      throw new Error("get is not used in the worker")
    },
    async claimNext() {
      throw new Error("claimNext is not used in processClip")
    },
    async requeueClips() {
      throw new Error("requeueClips is not used in the worker")
    },
    async complete(
      _clipId: string,
      result: Result<ClipPrediction, AnalyzeError>,
    ) {
      await ctx.runMutation(internal.process.completeClip, {
        clipResultId: claimed.clipResultId,
        ok: result.ok,
        predictionJson: result.ok ? autoAceJsonString(result.value) : undefined,
        errorJson: result.ok ? undefined : JSON.stringify(result.error),
      })
    },
  }

  try {
    await processClip(
      {
        repo,
        store,
        acoustic,
        classifier,
        fuseQualityAndSilence: method.fuseQualityAndSilence,
        onStage: async (stage) => {
          await ctx.runMutation(internal.process.setStage, {
            clipResultId: claimed.clipResultId,
            clipId: claimed.clipId,
            batchId: claimed.batchId,
            runId: claimed.runId,
            userId: claimed.userId,
            stage: `${formatProcessStage(stage)} · ${claimed.model}`,
          })
        },
      },
      {
        id: claimed.clipId,
        batchId: claimed.batchId,
        name: claimed.name,
        audioRef: claimed.storageId,
        state: "running",
        gold: null,
        prediction: null,
        error: null,
        claimedAt: Date.now(),
      },
    )
  } catch (error) {
    await failClip(
      JSON.stringify({
        tag: "classifier_invalid_output",
        cause: error instanceof Error ? error.message : "Unexpected worker error",
      }),
    )
    await ctx.runMutation(internal.process.appendLog, {
      userId: claimed.userId,
      batchId: claimed.batchId,
      clipId: claimed.clipId,
      runId: claimed.runId,
      level: "error",
      message: error instanceof Error ? error.message : "Unexpected worker error",
    })
  }
}

export const processNext = internalAction({
  args: { batchId: v.id("batches") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const claims = await ctx.runMutation(internal.process.claimNextRound, {
      batchId: args.batchId,
    })
    if (claims.length === 0) {
      const finished = await ctx.runMutation(internal.process.finishBatchIfIdle, {
        batchId: args.batchId,
      })
      if (finished.finished) {
        await ctx.runMutation(internal.process.startNextQueued, {})
      }
      return null
    }

    await processClaim(ctx, claims[0]!)

    // One function per clip. Chain one successor so the start-time pool stays filled.
    await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
      batchId: args.batchId,
    })
    return null
  },
})
