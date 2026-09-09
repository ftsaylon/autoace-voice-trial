import { BatchDetail } from "@/components/batch-detail"

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <BatchDetail batchId={id} />
}
