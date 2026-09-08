import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";

export type SessionData = {
  user: string;
};

const COOKIE = "autoace_eval";

function sessionSecret(): string {
  const secret = process.env.SESSION_SECRET ?? "autoace-eval-session-secret-key-32";
  if (secret.length < 32) {
    throw new Error("SESSION_SECRET must be at least 32 characters");
  }
  return secret;
}

export function sessionOptions(): SessionOptions {
  return {
    password: sessionSecret(),
    cookieName: COOKIE,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

export function expectedUser(): string {
  return process.env.AUTOACE_USER ?? "autoace";
}

export function expectedPassword(): string {
  return process.env.AUTOACE_PASSWORD ?? "trial-eval-2026";
}

export function passwordsMatch(provided: string, expected: string): boolean {
  const a = createHmac("sha256", "autoace").update(provided).digest();
  const b = createHmac("sha256", "autoace").update(expected).digest();
  return timingSafeEqual(a, b);
}

const attempts = new Map<string, number[]>();

export function loginAllowed(ip: string, now = Date.now()): boolean {
  const windowMs = 10 * 60 * 1000;
  const recent = (attempts.get(ip) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= 20) {
    return false;
  }
  recent.push(now);
  attempts.set(ip, recent);
  return true;
}

export async function requireUser(): Promise<string | null> {
  const session = await getSession();
  return session.user ?? null;
}
