import { NextResponse } from "next/server";
import { getDeps } from "@/adapters/composition";
import { requireUser } from "@/adapters/http/session";
import { getBatch } from "@/application/get-batch";
import { autoAceJsonString, formatAnalyzeError, derivedBatchStatus } from "@/domain";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const deps = await getDeps();
  const batch = await getBatch(deps.repo, id);
  if (!batch) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }
  return NextResponse.json({
    id: batch.id,
    createdAt: batch.createdAt,
    status: batch.status,
    parseIssues: batch.parseIssues,
    labeledCount: batch.labeledCount,
    scores: batch.scores,
    clips: batch.clips.map((clip) => ({
      id: clip.id,
      name: clip.name,
      state: clip.state,
      prediction: clip.prediction ? JSON.parse(autoAceJsonString(clip.prediction)) : null,
      gold: clip.gold ? JSON.parse(autoAceJsonString(clip.gold)) : null,
      error: clip.error ? formatAnalyzeError(clip.error) : null,
    })),
    derivedStatus: derivedBatchStatus(batch.clips),
  });
}
