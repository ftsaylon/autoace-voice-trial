import { NextResponse } from "next/server";
import { getDeps } from "@/adapters/composition";
import { requireUser } from "@/adapters/http/session";
import { createBatch, createBatchFromZip } from "@/application/create-batch";
import type { IncomingFile } from "@/application/parse-batch";

export const maxDuration = 300;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const deps = await getDeps();
  const form = await request.formData();
  const zip = form.get("zip");
  if (zip instanceof File) {
    const bytes = new Uint8Array(await zip.arrayBuffer());
    const batch = await createBatchFromZip({
      repo: deps.repo,
      store: deps.store,
      zipBytes: bytes,
    });
    return NextResponse.json({ id: batch.id, parseIssues: batch.parseIssues });
  }

  const files: IncomingFile[] = [];
  for (const [key, value] of form.entries()) {
    if (key !== "files" || !(value instanceof File)) {
      continue;
    }
    files.push({
      name: value.name,
      bytes: new Uint8Array(await value.arrayBuffer()),
    });
  }
  if (files.length === 0) {
    return NextResponse.json(
      { error: "Upload a ZIP archive or a folder that contains labels.csv and audio files" },
      { status: 400 },
    );
  }
  const batch = await createBatch({
    repo: deps.repo,
    store: deps.store,
    files,
  });
  return NextResponse.json({ id: batch.id, parseIssues: batch.parseIssues });
}
