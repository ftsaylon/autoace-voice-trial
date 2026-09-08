import { NextResponse } from "next/server";
import { getDeps } from "@/adapters/composition";
import { requireUser } from "@/adapters/http/session";
import { processNextClip } from "@/application/process-clip";

export const maxDuration = 300;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const deps = await getDeps();
  const batch = await deps.repo.get(id);
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  const result = await processNextClip({
    repo: deps.repo,
    store: deps.store,
    acoustic: deps.acoustic,
    classifier: deps.classifier,
    batchId: id,
  });
  if (result === "idle") {
    return NextResponse.json({ idle: true });
  }
  return NextResponse.json({ idle: false, ok: result.ok });
}
