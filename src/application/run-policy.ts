export const MAX_RUNNING_BATCHES = 2

export const processesOnCreate = false

export const decideBatchLaunch = (
  othersRunning: number,
  cap = MAX_RUNNING_BATCHES,
): "queued" | "running" => {
  if (othersRunning >= cap) {
    return "queued"
  }
  return "running"
}
