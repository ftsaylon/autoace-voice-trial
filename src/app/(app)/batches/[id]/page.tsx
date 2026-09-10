import { BatchDetail } from "@/components/batch-detail"
import type { Id } from "@convex/_generated/dataModel"

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BatchDetail batchId={id as Id<"batches">} />
}
