"use node"

import { v } from "convex/values"
import { internalAction } from "./_generated/server"
import { internal } from "./_generated/api"
import { processClip, formatProcessStage } from "../src/application/process-clip"
import { classifierForMethod } from "../src/application/select-classifier"
import { resolveMethod } from "../src/application/methods"
import { formatAnalyzeError } from "../src/domain/errors"
import { FfmpegAcousticAnalyzer } from "../src/adapters/acoustic/ffmpeg-analyzer"
import { autoAceJsonString } from "../src/domain"
import { mediaTypeFor } from "../src/adapters/storage/memory"
import type { AnalyzeError } from "../src/domain/errors"
import type { ClipPrediction } from "../src/domain"
import type { Result } from "../src/domain/result"
import type { AudioStore, BatchRepository } from "../src/application/ports"

export const processNext = internalAction({
  args: { batchId: v.id("batches") },
  handler: async (ctx, args) => {
    const claimed = await ctx.runMutation(internal.process.claimNext, {
      batchId: args.batchId,
    })
    if (!claimed) {
      const finished = await ctx.runMutation(internal.process.finishBatchIfIdle, {
        batchId: args.batchId,
      })
      if (finished.finished) {
        await ctx.runMutation(internal.process.startNextQueued, {})
      }
      return
    }

    const blob = await ctx.storage.get(claimed.storageId)
    if (!blob) {
      await ctx.runMutation(internal.process.completeClip, {
        clipId: claimed.clipId,
        ok: false,
        errorJson: JSON.stringify({
          tag: "decode_failed",
          name: claimed.name,
          cause: "Audio is missing from storage",
        }),
      })
      await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
        batchId: args.batchId,
      })
      return
    }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const method = resolveMethod(claimed.method)
    if (!method) {
      const error = {
        tag: "classifier_invalid_output" as const,
        cause: `Unknown method ${claimed.method}`,
      }
      await ctx.runMutation(internal.process.completeClip, {
        clipId: claimed.clipId,
        ok: false,
        errorJson: JSON.stringify(error),
      })
      await ctx.runMutation(internal.process.appendLog, {
        userId: claimed.userId,
        batchId: claimed.batchId,
        clipId: claimed.clipId,
        level: "error",
        message: formatAnalyzeError(error),
      })
      await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
        batchId: args.batchId,
      })
      return
    }

    const acoustic = new FfmpegAcousticAnalyzer()
    const classifier = classifierForMethod(method.id, acoustic)

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
        clipId: string,
        result: Result<ClipPrediction, AnalyzeError>,
      ) {
        await ctx.runMutation(internal.process.completeClip, {
          clipId: clipId as typeof claimed.clipId,
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
              clipId: claimed.clipId,
              batchId: claimed.batchId,
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
      await ctx.runMutation(internal.process.completeClip, {
        clipId: claimed.clipId,
        ok: false,
        errorJson: JSON.stringify({
          tag: "classifier_invalid_output",
          cause: error instanceof Error ? error.message : "Unexpected worker error",
        }),
      })
      await ctx.runMutation(internal.process.appendLog, {
        userId: claimed.userId,
        batchId: claimed.batchId,
        clipId: claimed.clipId,
        level: "error",
        message: error instanceof Error ? error.message : "Unexpected worker error",
      })
    }

    await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
      batchId: args.batchId,
    })
  },
})
