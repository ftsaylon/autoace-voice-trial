import { NextResponse } from "next/server";
import { z } from "zod";
import { getDeps } from "@/adapters/composition";
import { requireUser } from "@/adapters/http/session";
import { requeueBatch } from "@/application/requeue-batch";

const bodySchema = z.object({
  scope: z.enum(["failed", "all"]).default("failed"),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const deps = await getDeps();
  const result = await requeueBatch(deps.repo, id, parsed.data.scope);
  if (!result) {
    return NextResponse.json({ error: "Batch not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
