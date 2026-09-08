"use client";

import useSWR from "swr";
import { useEffect } from "react";
import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ClipDto = {
  id: string;
  name: string;
  state: string;
  prediction: Record<string, unknown> | null;
  gold: Record<string, unknown> | null;
  error: string | null;
};

type BatchDto = {
  id: string;
  status: string;
  parseIssues: string[];
  labeledCount: number;
  scores: Record<string, { accuracy: number; correct: number; total: number }> | null;
  clips: ClipDto[];
};

const fetcher = async (url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error("Failed to load batch");
  }
  return response.json() as Promise<BatchDto>;
};

function toneVariant(tone: unknown): "default" | "secondary" | "destructive" | "outline" {
  if (tone === "upset" || tone === "distressed") {
    return "destructive";
  }
  if (tone === "frustrated") {
    return "outline";
  }
  return "secondary";
}

export function BatchView({ id }: { id: string }) {
  const { data, error, mutate } = useSWR<BatchDto>(`/api/batches/${id}`, fetcher, {
    refreshInterval: 1000,
  });

  useEffect(() => {
    if (!data || data.status !== "processing") {
      return;
    }
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/batches/${id}/process`, { method: "POST" });
      if (!cancelled && response.ok) {
        await mutate();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [data, id, mutate]);

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              <Link href="/" className="hover:underline">
                Batches
              </Link>
            </p>
            <h1 className="text-2xl font-semibold tracking-tight">Results</h1>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <a href={`/api/batches/${id}/download?format=csv`}>Download CSV</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/batches/${id}/download?format=json`}>Download JSON</a>
            </Button>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertDescription>Could not load this batch.</AlertDescription>
          </Alert>
        ) : null}

        {!data ? (
          <p className="text-sm text-muted-foreground">Loading batch…</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant={data.status === "complete" ? "secondary" : "outline"}>
                {data.status}
              </Badge>
              <span className="text-sm text-muted-foreground">
                {data.clips.filter((clip) => clip.state === "succeeded").length}/
                {data.clips.length} succeeded
              </span>
            </div>
            {data.parseIssues.length > 0 ? (
              <Alert>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {data.parseIssues.map((issue) => (
                      <li key={issue}>{issue}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}
            {data.scores ? (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Labeled comparison</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-5">
                  {Object.entries(data.scores).map(([field, score]) => (
                    <div key={field}>
                      <p className="text-muted-foreground">{field.replaceAll("_", " ")}</p>
                      <p className="font-medium">
                        {(score.accuracy * 100).toFixed(0)}% ({score.correct}/{score.total})
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File</TableHead>
                    <TableHead>State</TableHead>
                    <TableHead>Tone</TableHead>
                    <TableHead>Intensity</TableHead>
                    <TableHead>Noise</TableHead>
                    <TableHead>Quality</TableHead>
                    <TableHead>Overlap</TableHead>
                    <TableHead>Silence</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Gold</TableHead>
                    <TableHead>Error</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clips.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={11} className="text-muted-foreground">
                        No valid clips in this batch.
                      </TableCell>
                    </TableRow>
                  ) : (
                    data.clips.map((clip) => (
                      <TableRow key={clip.id}>
                        <TableCell className="font-mono text-xs">{clip.name}</TableCell>
                        <TableCell>{clip.state}</TableCell>
                        <TableCell>
                          {clip.prediction ? (
                            <Badge variant={toneVariant(clip.prediction.emotional_tone)}>
                              {String(clip.prediction.emotional_tone)}
                            </Badge>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {clip.prediction ? String(clip.prediction.emotional_intensity) : "—"}
                        </TableCell>
                        <TableCell>
                          {clip.prediction
                            ? clip.prediction.background_noise_present
                              ? `${clip.prediction.background_noise_type} (${clip.prediction.background_noise_severity})`
                              : "none"
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {clip.prediction ? String(clip.prediction.audio_quality) : "—"}
                        </TableCell>
                        <TableCell>
                          {clip.prediction
                            ? clip.prediction.speaker_overlap_present
                              ? "yes"
                              : "no"
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {clip.prediction
                            ? clip.prediction.long_silence_present
                              ? "yes"
                              : "no"
                            : "—"}
                        </TableCell>
                        <TableCell>
                          {clip.prediction
                            ? Number(clip.prediction.confidence).toFixed(2)
                            : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {clip.gold ? String(clip.gold.emotional_tone) : "—"}
                        </TableCell>
                        <TableCell className="max-w-[16rem] text-xs text-destructive">
                          {clip.error ?? ""}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
