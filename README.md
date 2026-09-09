# AutoAce voice tone and noise trial

Hosted operator dashboard for classifying customer emotional tone and background noise in production call audio. AutoAce can log in, create a batch from a ZIP or folder, pick a method, run concurrent jobs, watch live clip logs, and download schema-faithful CSV/JSON.

Production inference uses Gemini 3.6 Flash with constrained decoding, fused with ffmpeg acoustics. Gold `result_json` is used only for scoring. It never enters the model.

Audio leaves AutoAce infrastructure and is stored in **Convex** and sent to **Google Gemini**.

## Run locally

```bash
cp env.example .env.local
npm install
npx convex dev
```

In a second terminal:

```bash
npm test
npm run dev
```

Open http://127.0.0.1:43123.

`npx convex dev` pushes functions, regenerates `convex/_generated`, and keeps the scheduler worker running. The Next app talks to `NEXT_PUBLIC_CONVEX_URL`.

Set `GOOGLE_GENERATIVE_AI_API_KEY` on the Convex deployment (`npx convex env set GOOGLE_GENERATIVE_AI_API_KEY`) before analyzing real calls. Without a key, fusion clips fail with `classifier_unavailable` instead of a fake prediction.

### Login

Convex Auth Password. The trial UI accepts the provided username and maps it to an email account:

- Username: `autoace` (stored as `autoace@eval.local`)
- Password: `trial-eval-2026`

The first successful sign-in creates the Password user if it does not exist yet.

### Batch shape

```
evaluation_batch/
  call_001.ogg
  call_002.ogg
  call_003.ogg
  labels.csv
```

`labels.csv` must include a `name` column (exact filename plus extension). `result_json` is optional and may be empty on the hidden set.

Supported audio: wav, mp3, ogg, m4a, flac.

Create a batch from **New batch** on the Batches page (or drop a ZIP/folder onto that page), pick **Fusion** (production) or **Acoustic baseline** (control), then press **Run**. Files upload as soon as they parse. Classification does not start until you press Run.

### Methods

- `fusion` — Gemini 3.6 Flash + acoustic fusion. Use this for hidden-set scoring.
- `baseline` — DSP-only `AcousticBaselineClassifier`. Required second approach; not for production scoring.

### CLI

```bash
npm run analyze -- /path/to/evaluation_batch
```

Writes `batch-<id>.json` in the working directory using the same `processClip` command.

Do not commit production `.ogg` files.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the hexagon, Convex data model, authz, and run sequence.

See [docs/METHODS.md](docs/METHODS.md) for fusion policy, windowing, prompts, and cost math.

See [docs/TECHNICAL_MEMO.md](docs/TECHNICAL_MEMO.md) for the short evaluation memo.

## Deploy

A previous Vercel URL may still exist; this revision needs a Convex deployment plus Next.js.

1. `npx convex deploy` only for production (not during development).
2. Set Convex env: `SITE_URL`, `JWT_PRIVATE_KEY`, `JWKS`, `GOOGLE_GENERATIVE_AI_API_KEY`, optional `GEMINI_MODEL`.
3. Set Next env: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`.
4. Host the Next app. ffmpeg runs inside Convex Node actions, not on Vercel `/tmp`.
