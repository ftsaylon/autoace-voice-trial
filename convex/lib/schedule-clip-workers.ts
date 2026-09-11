import { internal } from "../_generated/api"
import type { Id } from "../_generated/dataModel"
import { inFlightToSchedule } from "../../src/application/run-policy"

type Scheduler = {
  runAfter: (
    delayMs: number,
    fn: typeof internal.processActions.processNext,
    args: { batchId: Id<"batches"> },
  ) => Promise<unknown>
}

/** Spawn one processNext per slot so each clip is its own Convex action. */
export async function scheduleClipWorkers(
  ctx: { scheduler: Scheduler },
  batchId: Id<"batches">,
  remaining: number,
  running = 0,
): Promise<number> {
  const count = inFlightToSchedule(running, remaining)
  for (let i = 0; i < count; i++) {
    await ctx.scheduler.runAfter(0, internal.processActions.processNext, {
      batchId,
    })
  }
  return count
}
