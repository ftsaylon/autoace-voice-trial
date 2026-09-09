"use client";

import useSWR from "swr";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircleIcon,
  DownloadIcon,
  Loader2Icon,
  PlusIcon,
  RefreshCwIcon,
  RotateCcwIcon,
} from "lucide-react";
import { AppHeader } from "@/components/app-header";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

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

function stateVariant(state: string): "default" | "secondary" | "destructive" | "outline" {
  if (state === "succeeded") {
    return "secondary";
  }
  if (state === "failed") {
    return "destructive";
  }
  if (state === "running") {
    return "default";
  }
  return "outline";
}

function ClipCard({ clip }: { clip: ClipDto }) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="truncate font-mono text-sm">{clip.name}</CardTitle>
            {clip.gold ? (
              <CardDescription>Gold tone: {String(clip.gold.emotional_tone)}</CardDescription>
            ) : null}
          </div>
          <Badge variant={stateVariant(clip.state)}>{clip.state}</Badge>
        </div>
        {clip.prediction ? (
          <Badge variant={toneVariant(clip.prediction.emotional_tone)}>
            {String(clip.prediction.emotional_tone)}
          </Badge>
        ) : null}
      </CardHeader>
      <CardContent className="grid gap-2 text-sm">
        <div className="grid grid-cols-2 gap-2">
          <Metric label="Intensity" value={clip.prediction?.emotional_intensity} />
          <Metric label="Confidence" value={formatConfidence(clip.prediction?.confidence)} />
          <Metric label="Quality" value={clip.prediction?.audio_quality} />
          <Metric label="Overlap" value={formatBool(clip.prediction?.speaker_overlap_present)} />
        </div>
        <Metric
          label="Background noise"
          value={
            clip.prediction
              ? clip.prediction.background_noise_present
                ? `${clip.prediction.background_noise_type} (${clip.prediction.background_noise_severity})`
                : "none"
              : null
          }
        />
        {clip.error ? (
          <p className="rounded-md border border-destructive/20 bg-destructive/5 px-3 py-2 text-xs text-destructive">
            {clip.error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: unknown }) {
  return (
    <div className="rounded-md border bg-muted/20 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value === null || value === undefined ? "—" : String(value)}</p>
    </div>
  );
}

function formatBool(value: unknown) {
  if (value === true) {
    return "yes";
  }
  if (value === false) {
    return "no";
  }
  return null;
}

function formatConfidence(value: unknown) {
  if (typeof value !== "number") {
    return null;
  }
  return value.toFixed(2);
}

export function BatchView({ id }: { id: string }) {
  const { data, error, mutate, isValidating } = useSWR<BatchDto>(
    `/api/batches/${id}`,
    fetcher,
    { refreshInterval: (latest) => (latest?.status === "processing" ? 1000 : 0) },
  );
  const [retryPending, setRetryPending] = useState<"failed" | "all" | null>(null);
  const [confirmRedoAll, setConfirmRedoAll] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const counts = useMemo(() => {
    const clips = data?.clips ?? [];
    return {
      total: clips.length,
      succeeded: clips.filter((clip) => clip.state === "succeeded").length,
      failed: clips.filter((clip) => clip.state === "failed").length,
      pending: clips.filter((clip) => clip.state === "queued" || clip.state === "running")
        .length,
    };
  }, [data?.clips]);

  const progressValue =
    counts.total === 0 ? 0 : Math.round(((counts.succeeded + counts.failed) / counts.total) * 100);

  useEffect(() => {
    if (!data || data.status !== "processing" || counts.pending === 0) {
      return;
    }
    let cancelled = false;

    const runProcess = async () => {
      const response = await fetch(`/api/batches/${id}/process`, { method: "POST" });
      if (!cancelled) {
        await mutate();
      }
      return response.ok;
    };

    void runProcess();
    const interval = window.setInterval(() => {
      void runProcess();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [counts.pending, data, id, mutate]);

  const handleRefresh = useCallback(async () => {
    setActionError(null);
    await mutate();
  }, [mutate]);

  const handleRetry = useCallback(
    async (scope: "failed" | "all") => {
      setRetryPending(scope);
      setActionError(null);
      try {
        const response = await fetch(`/api/batches/${id}/retry`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ scope }),
        });
        const body = (await response.json()) as { error?: string; requeued?: number };
        if (!response.ok) {
          setActionError(body.error ?? "Could not restart this batch.");
          return;
        }
        if ((body.requeued ?? 0) === 0) {
          setActionError("No clips were eligible to rerun.");
          return;
        }
        await mutate();
      } catch {
        setActionError("Network error while restarting the batch.");
      } finally {
        setRetryPending(null);
        setConfirmRedoAll(false);
      }
    },
    [id, mutate],
  );

  return (
    <div className="flex min-h-full flex-col">
      <AppHeader active="batch" />
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 sm:px-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              <Link href="/" className="hover:text-foreground hover:underline">
                Batches
              </Link>
              <span className="px-2 text-border">/</span>
              <span className="font-mono">{id.slice(0, 8)}</span>
            </p>
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                Batch results
              </h1>
              <p className="max-w-2xl text-sm text-muted-foreground">
                Review per-clip predictions, compare against gold labels, and rerun failed
                clips without re-uploading audio.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="default" size="sm">
              <Link href="/">
                <PlusIcon className="size-4" />
                New batch
              </Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isValidating}
              onClick={() => {
                void handleRefresh();
              }}
            >
              {isValidating ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : (
                <RefreshCwIcon className="size-4" />
              )}
              Refresh
            </Button>
            {counts.failed > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={retryPending !== null || data?.status === "processing"}
                onClick={() => {
                  void handleRetry("failed");
                }}
              >
                {retryPending === "failed" ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <RotateCcwIcon className="size-4" />
                )}
                Retry failed ({counts.failed})
              </Button>
            ) : null}
            {counts.total > 0 && data?.status === "complete" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={retryPending !== null}
                onClick={() => setConfirmRedoAll(true)}
              >
                Redo all
              </Button>
            ) : null}
            <Button asChild variant="outline" size="sm">
              <a href={`/api/batches/${id}/download?format=csv`}>
                <DownloadIcon className="size-4" />
                CSV
              </a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href={`/api/batches/${id}/download?format=json`}>
                <DownloadIcon className="size-4" />
                JSON
              </a>
            </Button>
          </div>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Could not load this batch</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>Check your connection or try again.</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-destructive/30 bg-background"
                onClick={() => {
                  void handleRefresh();
                }}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        {actionError ? (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Action failed</AlertTitle>
            <AlertDescription>{actionError}</AlertDescription>
          </Alert>
        ) : null}

        {!data ? (
          <Card>
            <CardContent className="flex items-center gap-3 py-10 text-sm text-muted-foreground">
              <Loader2Icon className="size-4 animate-spin" />
              Loading batch…
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <StatCard label="Status" value={data.status} />
              <StatCard label="Succeeded" value={`${counts.succeeded}/${counts.total}`} />
              <StatCard label="Failed" value={String(counts.failed)} />
              <StatCard label="Labeled clips" value={String(data.labeledCount)} />
            </div>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle className="text-base">Processing progress</CardTitle>
                  <Badge variant={data.status === "complete" ? "secondary" : "default"}>
                    {progressValue}%
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <Progress value={progressValue} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {data.status === "processing"
                    ? `${counts.pending} clip${counts.pending === 1 ? "" : "s"} remaining`
                    : counts.failed > 0
                      ? "Batch finished with failures. Retry failed clips or upload a new batch."
                      : "Batch finished successfully."}
                </p>
              </CardContent>
            </Card>

            {data.parseIssues.length > 0 ? (
              <Alert>
                <AlertCircleIcon className="size-4" />
                <AlertTitle>Parse warnings</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc space-y-1 pl-4">
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
                  <CardDescription>
                    Accuracy against optional gold labels in labels.csv
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {Object.entries(data.scores).map(([field, score]) => (
                    <div
                      key={field}
                      className="rounded-lg border bg-muted/20 px-4 py-3 text-sm"
                    >
                      <p className="text-muted-foreground">{field.replaceAll("_", " ")}</p>
                      <p className="text-lg font-semibold">
                        {(score.accuracy * 100).toFixed(0)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {score.correct}/{score.total} correct
                      </p>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ) : null}

            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-medium">Clips</h2>
                <p className="text-sm text-muted-foreground">{counts.total} total</p>
              </div>

              <div className="grid gap-4 md:hidden">
                {data.clips.length === 0 ? (
                  <Card>
                    <CardContent className="py-8 text-sm text-muted-foreground">
                      No valid clips in this batch.
                    </CardContent>
                  </Card>
                ) : (
                  data.clips.map((clip) => <ClipCard key={clip.id} clip={clip} />)
                )}
              </div>

              <div className="hidden overflow-hidden rounded-xl border md:block">
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
                          <TableCell className="max-w-[12rem] truncate font-mono text-xs">
                            {clip.name}
                          </TableCell>
                          <TableCell>
                            <Badge variant={stateVariant(clip.state)}>{clip.state}</Badge>
                          </TableCell>
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
                            {clip.prediction
                              ? String(clip.prediction.emotional_intensity)
                              : "—"}
                          </TableCell>
                          <TableCell className="max-w-[12rem] truncate">
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
                            {formatBool(clip.prediction?.speaker_overlap_present) ?? "—"}
                          </TableCell>
                          <TableCell>
                            {formatBool(clip.prediction?.long_silence_present) ?? "—"}
                          </TableCell>
                          <TableCell>{formatConfidence(clip.prediction?.confidence) ?? "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {clip.gold ? String(clip.gold.emotional_tone) : "—"}
                          </TableCell>
                          <TableCell className="max-w-[18rem] text-xs text-destructive">
                            {clip.error ?? ""}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </main>

      <Dialog open={confirmRedoAll} onOpenChange={setConfirmRedoAll}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Redo entire batch?</DialogTitle>
            <DialogDescription>
              This clears current predictions and requeues every clip for analysis. Audio
              files stay in place.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => setConfirmRedoAll(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={retryPending === "all"}
              onClick={() => {
                void handleRetry("all");
              }}
            >
              {retryPending === "all" ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              Redo all clips
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="shadow-sm">
      <CardContent className="px-4 py-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          {label}
        </p>
        <p className={cn("mt-1 text-2xl font-semibold capitalize")}>{value}</p>
      </CardContent>
    </Card>
  );
}
