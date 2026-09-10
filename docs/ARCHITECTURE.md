# Architecture

The domain stays a hexagon. Convex is the system of record and the live progress bus. Next.js is a thin operator UI.

```mermaid
flowchart LR
  UI[Next.js app shell]
  Auth[Convex Auth Password]
  Conv[Convex DB and file storage]
  Sched[Scheduler per batch]
  Act[Node action ProcessClip]
  Gem[Gemini 3.6 Flash]
  Ff[ffmpeg acoustics]

  UI --> Auth
  UI --> Conv
  Conv --> Sched
  Sched --> Act
  Act --> Ff
  Act --> Gem
  Act --> Conv
  Conv --> UI
```

## Layers

- `src/domain` — AutoAce JSON codec, fusion, window aggregation, prediction types
- `src/application` — `parseManifestAndFiles`, `processClip`, scoring, method registry
- `convex/` — schema, auth, queries/mutations, scheduler worker
- `src/app` and `src/components` — operator UI
- `src/adapters/cli` — local `npm run analyze` using the same `processClip`

SQLite, cookie login, and the browser `POST /process` loop are gone from the web path. The CLI may still use SQLite on disk for a one-shot run.

## Data

Tables are flat and indexed:

- `batches` — `userId`, `name`, `status` (`draft` | `queued` | `running` | `complete` | `failed`), latest `method` / `model`, parse issues, counts, timestamps, `runCount`, `methodIds`
- `runs` — one method attempt on a batch. Append-only. Status `queued` | `running` | `complete` | `failed`
- `clipResults` — per-clip prediction/error for a run
- `clips` — `batchId`, original `name`, `storageId`, gold JSON, upload state. Predictions live on `clipResults`
- `logs` — append-only diagnostics keyed by user, batch, and optional `runId`
- `userSettings` — default method
- Convex Auth tables — users and sessions. No parallel profile table.

Indexes: `by_user`, `by_user_and_created`, `by_batch`, `by_batch_and_created`, `by_status`, `by_run`, `by_run_and_state`, `by_clip`.

Files go through `generateUploadUrl` into Convex storage. ZIP unzip happens in the browser with JSZip. There is no extra size cap in storage; the parser still enforces clip/batch caps.

## Authz

Every public query and mutation calls `requireUserId` (`getAuthUserId`). Batch and log reads use `ownedOrNull`, so user A cannot read user B's batch. Internal worker mutations are not exposed to the client.

## Sequence of a run

```mermaid
sequenceDiagram
  participant User
  participant UI
  participant Convex
  participant Worker
  participant Gemini

  User->>UI: Drop ZIP or folder on Batches (or New batch modal)
  UI->>UI: Parse labels.csv client-side
  UI->>Convex: Upload clips in parallel
  User->>UI: Pick method anytime, then Run
  UI->>Convex: createDraft, start
  Convex->>Worker: scheduler.runAfter processNext
  loop Each queued clip
    Worker->>Worker: ffmpeg decode, windows
    Worker->>Gemini: classify window when the method needs Gemini
    Worker->>Convex: stage logs, complete clip
    Worker->>Worker: schedule next clip
  end
  Convex-->>UI: useQuery updates list, detail, logs
```

1. Drop or choose files. Empty `result_json` is unlabeled, not fatal. Missing `labels.csv` is fatal.
2. Parsed clips upload to Convex storage immediately (parallel, bounded concurrency). Run stays disabled until every clip is stored.
3. Method (`fusion`, `baseline`, `lexical`, `prosody`, `gemini_only`) can be chosen with or without files.
4. Run creates a draft then starts it. Drafts are not processed.
5. At most two batches run at once. Further starts are `queued`.
6. Clips inside a **run** are serialized (Gemini RPM). Multiple methods on the same batch run one after another and occupy one running-batch slot.
7. `onStage` writes decode / acoustics / window i/n / fuse into `clipResults.stage` and `logs`. A log failure cannot fail the clip.
8. The UI never polls a process endpoint. `useQuery` on batch, clips, runs, and logs is the live stream.

## Failures

Per-clip isolation: one decode or classifier error marks that clip result `failed` and the worker continues. Retry failed requeues only those clip results on that run. **Run methods** always creates new runs — previous results stay.

If ffmpeg cannot spawn in the Convex Node action, the clip fails with `decode_failed` and the log records the cause. Predictions are never invented.

## Downloads

CSV and JSON are generated in the browser from the batch query, keyed by the original filename, matching the AutoAce `result_json` codec.
