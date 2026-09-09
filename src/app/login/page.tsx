"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircleIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    setPending(false);
    if (!response.ok) {
      const body = (await response.json()) as { error?: string };
      setError(body.error ?? "Login failed");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="flex min-h-full flex-1 items-center justify-center bg-muted/30 px-4 py-10">
      <div className="grid w-full max-w-4xl gap-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="hidden space-y-4 lg:block">
          <p className="text-sm font-medium text-primary">AutoAce evaluation portal</p>
          <h1 className="text-4xl font-semibold tracking-tight">
            Review call tone and noise at batch scale
          </h1>
          <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
            Sign in to upload labeled audio, monitor processing, and export structured
            predictions for AutoAce scoring.
          </p>
        </section>
        <Card className="w-full shadow-sm">
          <CardHeader className="space-y-2">
            <p className="text-xs font-semibold tracking-[0.18em] text-primary uppercase lg:hidden">
              AutoAce
            </p>
            <CardTitle>Sign in</CardTitle>
            <CardDescription>
              Use the evaluation credentials provided for this trial.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  autoComplete="username"
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                />
              </div>
              {error ? (
                <Alert variant="destructive">
                  <AlertCircleIcon className="size-4" />
                  <AlertTitle>Login failed</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" className="w-full" disabled={pending}>
                {pending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Need access? Credentials are listed in env.example for local evaluation.
            </p>
            <p className="mt-2 text-center text-xs">
              <Link href="/" className="text-primary hover:underline">
                Back to upload
              </Link>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
