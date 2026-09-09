"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  AlertCircleIcon,
  CloudUploadIcon,
  FolderOpenIcon,
  Loader2Icon,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import {
  buildUploadFormData,
  collectDroppedFiles,
  resetFileInput,
} from "@/lib/collect-dropped-files";
import { cn } from "@/lib/utils";

type UploadPanelProps = {
  classifierReady: boolean;
};

export function UploadPanel({ classifierReady }: UploadPanelProps) {
  const router = useRouter();
  const zipInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [inputKey, setInputKey] = useState(0);

  const send = useCallback(
    async (form: FormData) => {
      setPending(true);
      setError(null);
      try {
        const response = await fetch("/api/batches", { method: "POST", body: form });
        const body = (await response.json()) as { id?: string; error?: string };
        if (!response.ok || !body.id) {
          setError(body.error ?? "Upload failed");
          setInputKey((value) => value + 1);
          return;
        }
        router.push(`/batches/${body.id}`);
      } catch {
        setError("Network error while uploading. Check your connection and try again.");
        setInputKey((value) => value + 1);
      } finally {
        setPending(false);
        resetFileInput(zipInputRef.current);
        resetFileInput(folderInputRef.current);
      }
    },
    [router],
  );

  const handleFiles = useCallback(
    async (files: File[]) => {
      const built = buildUploadFormData(files);
      if ("error" in built) {
        setError(built.error);
        return;
      }
      await send(built);
    },
    [send],
  );

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!pending) {
      setDragActive(true);
    }
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
  };

  const handleDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setDragActive(false);
    if (pending) {
      return;
    }
    const files = await collectDroppedFiles(event.dataTransfer);
    await handleFiles(files);
  };

  return (
    <Card className="overflow-hidden border-border/70 shadow-sm">
      <CardHeader className="border-b bg-muted/30 pb-6">
        <CardTitle className="text-xl">Upload evaluation batch</CardTitle>
        <CardDescription className="max-w-2xl text-sm leading-relaxed">
          Drop a ZIP or folder containing audio clips and an optional labels.csv.
          The CSV needs a name column. Gold result_json is used only for scoring.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6 pt-6">
        {!classifierReady ? (
          <Alert>
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Gemini key required</AlertTitle>
            <AlertDescription>
              Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local before analyzing calls.
              Without it, clips fail with classifier_unavailable.
            </AlertDescription>
          </Alert>
        ) : null}

        {error ? (
          <Alert variant="destructive">
            <AlertCircleIcon className="size-4" />
            <AlertTitle>Upload failed</AlertTitle>
            <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>{error}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="shrink-0 border-destructive/30 bg-background"
                onClick={() => setError(null)}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        ) : null}

        <div
          role="button"
          tabIndex={0}
          aria-label="Drop evaluation batch files here"
          aria-busy={pending}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              zipInputRef.current?.click();
            }
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={(event) => {
            void handleDrop(event);
          }}
          className={cn(
            "relative flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors",
            dragActive
              ? "border-primary bg-primary/5"
              : "border-border/80 bg-muted/20 hover:border-primary/40 hover:bg-muted/35",
            pending && "pointer-events-none opacity-70",
          )}
        >
          <div
            className={cn(
              "flex size-14 items-center justify-center rounded-full border bg-background shadow-sm",
              dragActive ? "border-primary text-primary" : "text-muted-foreground",
            )}
          >
            {pending ? (
              <Loader2Icon className="size-6 animate-spin" aria-hidden="true" />
            ) : (
              <CloudUploadIcon className="size-6" aria-hidden="true" />
            )}
          </div>
          <div className="space-y-1">
            <p className="text-base font-medium">
              {pending
                ? "Creating batch…"
                : dragActive
                  ? "Release to upload"
                  : "Drag and drop anywhere to upload"}
            </p>
            <p className="text-sm text-muted-foreground">
              ZIP archive, individual audio files, or a folder with labels.csv
            </p>
          </div>
          <div className="flex w-full max-w-md flex-col gap-2 sm:flex-row sm:justify-center">
            <Button
              type="button"
              disabled={pending}
              className="w-full sm:w-auto"
              onClick={() => zipInputRef.current?.click()}
            >
              <CloudUploadIcon className="size-4" />
              Choose ZIP
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              className="w-full sm:w-auto"
              onClick={() => folderInputRef.current?.click()}
            >
              <FolderOpenIcon className="size-4" />
              Choose folder
            </Button>
          </div>
        </div>

        {pending ? (
          <div className="space-y-2">
            <Progress value={66} className="h-2" />
            <p className="text-xs text-muted-foreground">
              Parsing files and preparing clips…
            </p>
          </div>
        ) : null}

        <Separator />

        <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <div className="rounded-lg border bg-background px-4 py-3">
            <p className="font-medium text-foreground">Supported audio</p>
            <p>wav, mp3, ogg, m4a, flac</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <p className="font-medium text-foreground">Batch shape</p>
            <p>Flat folder or ZIP with labels.csv</p>
          </div>
          <div className="rounded-lg border bg-background px-4 py-3">
            <p className="font-medium text-foreground">Privacy</p>
            <p>Gold labels never enter the model prompt</p>
          </div>
        </div>

        <input
          key={`zip-${inputKey}`}
          ref={zipInputRef}
          type="file"
          accept=".zip,application/zip"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (!file) {
              return;
            }
            void handleFiles([file]);
          }}
        />
        <input
          key={`folder-${inputKey}`}
          ref={folderInputRef}
          type="file"
          className="hidden"
          multiple
          {...{ webkitdirectory: "" }}
          onChange={(event) => {
            const list = event.target.files;
            if (!list || list.length === 0) {
              return;
            }
            void handleFiles(Array.from(list));
          }}
        />
      </CardContent>
    </Card>
  );
}
