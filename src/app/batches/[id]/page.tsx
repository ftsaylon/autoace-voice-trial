import { BatchView } from "@/components/batch-view";

export default async function BatchPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <BatchView id={id} />;
}
