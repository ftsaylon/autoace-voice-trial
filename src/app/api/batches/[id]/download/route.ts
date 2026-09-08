import { NextResponse } from "next/server";
import { getDeps } from "@/adapters/composition";
import { requireUser } from "@/adapters/http/session";
import { batchToCsv, batchToJson } from "@/application/download-batch";

export async function GET(
  request: Request,
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
  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format === "json") {
    return new NextResponse(batchToJson(batch), {
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${id}.json"`,
      },
    });
  }
  return new NextResponse(batchToCsv(batch), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${id}.csv"`,
    },
  });
}
