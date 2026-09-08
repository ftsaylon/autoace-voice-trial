import { NextResponse } from "next/server";
import {
  expectedPassword,
  expectedUser,
  getSession,
  loginAllowed,
  passwordsMatch,
} from "@/adapters/http/session";

export async function POST(request: Request) {
  const ip = request.headers.get("x-forwarded-for") ?? "local";
  if (!loginAllowed(ip)) {
    return NextResponse.json({ error: "Too many login attempts" }, { status: 429 });
  }
  const body = (await request.json()) as { username?: string; password?: string };
  const username = body.username ?? "";
  const password = body.password ?? "";
  const userOk = passwordsMatch(username, expectedUser());
  const passOk = passwordsMatch(password, expectedPassword());
  if (!userOk || !passOk) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }
  const session = await getSession();
  session.user = expectedUser();
  await session.save();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const session = await getSession();
  session.destroy();
  return NextResponse.json({ ok: true });
}
