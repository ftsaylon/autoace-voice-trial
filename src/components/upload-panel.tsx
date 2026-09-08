"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export function UploadPanel({ classifierReady }: { classifierReady: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function send(form: FormData) {
    setPending(true);
    setError(null);
    const response = await fetch("/api/batches", { method: "POST", body: form });
    const body = (await response.json()) as { id?: string; error?: string };
    setPending(false);
    if (!response.ok || !body.id) {
      setError(body.error ?? "Upload failed");
      return;
    }
    router.push(`/batches/${body.id}`);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Evaluation batch</CardTitle>
        <CardDescription>
          Upload a ZIP or a folder whose root contains audio files and labels.csv.
          The CSV needs a name column. result_json is optional and used only for scoring.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!classifierReady ? (
          <Alert>
            <AlertDescription>
              GOOGLE_GENERATIVE_AI_API_KEY is not set. Clips will fail with
              classifier_unavailable until a Gemini key is provided.
            </AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row">
          <Button asChild variant="outline" disabled={pending}>
            <label className="cursor-pointer">
              Upload ZIP
              <input
                type="file"
                accept=".zip"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) {
                    return;
                  }
                  const form = new FormData();
                  form.set("zip", file);
                  void send(form);
                }}
              />
            </label>
          </Button>
          <Button asChild variant="outline" disabled={pending}>
            <label className="cursor-pointer">
              Upload folder
              <input
                type="file"
                className="hidden"
                multiple
                {...{ webkitdirectory: "" }}
                onChange={(event) => {
                  const list = event.target.files;
                  if (!list || list.length === 0) {
                    return;
                  }
                  const form = new FormData();
                  for (const file of Array.from(list)) {
                    form.append("files", file, file.name);
                  }
                  void send(form);
                }}
              />
            </label>
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          {pending ? "Creating the batch…" : "Supported audio: wav, mp3, ogg, m4a, flac."}
        </p>
      </CardContent>
    </Card>
  );
}
