import { Suspense } from "react"
import { BatchShell } from "@/components/batch-shell"
import { LoadingMessage } from "@/components/waveform-spinner"
import type { Id } from "@convex/_generated/dataModel"

export default async function BatchLayout({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return (
    <Suspense fallback={<LoadingMessage>Loading batch…</LoadingMessage>}>
      <BatchShell batchId={id as Id<"batches">} />
    </Suspense>
  )
}
