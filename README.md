# AutoAce voice tone and noise trial

Hosted dashboard for classifying customer emotional tone and background noise in production call audio. AutoAce can log in, upload an evaluation ZIP, watch clip-by-clip progress, and download the required JSON schema.

Production inference uses Gemini 3.6 Flash with constrained decoding. An acoustic engine owns silence and technical quality. Gold `result_json` is used only for scoring. It never enters the model.

## Run locally

```bash
cp env.example .env.local
npm install
npm test
npm run dev
```

Open http://127.0.0.1:43123. Sign in with the credentials in `env.example`.

Set `GOOGLE_GENERATIVE_AI_API_KEY` before analyzing real calls. Without a key, clips fail with `classifier_unavailable` instead of a fake prediction.

### Login

- Username: `autoace`
- Password: `trial-eval-2026`

### Batch shape

```
evaluation_batch/
  call_001.ogg
  call_002.ogg
  call_003.ogg
  labels.csv
```

`labels.csv` must include a `name` column (exact filename plus extension). `result_json` is optional.

Supported audio: wav, mp3, ogg, m4a, flac.

### CLI

```bash
npm run analyze -- /path/to/evaluation_batch
```

Writes `batch-<id>.json` in the working directory.

### Experiments

```bash
npx tsx experiments/run-comparison.ts /path/to/evaluation_batch
```

Compares Gemini with the acoustic baseline through the same `ProcessClip` command.

Do not commit production `.ogg` files.

## Architecture

- `src/domain` prediction types, AutoAce JSON codec, fusion, window aggregation
- `src/application` CreateBatch, ProcessClip, GetBatch
- `src/adapters` Gemini, ffmpeg acoustics, SQLite, filesystem audio, HTTP, CLI

See [docs/TECHNICAL_MEMO.md](docs/TECHNICAL_MEMO.md) for model choice, cost, latency, and failure modes.

## Deploy

A production deploy is at https://workspace-beryl-nine-33.vercel.app.

Sign in with username `autoace` and password `trial-eval-2026`.

Set `GOOGLE_GENERATIVE_AI_API_KEY` on the host before scoring hidden audio. Without it, clips fail with `classifier_unavailable`.

Vercel serverless uses `/tmp` for SQLite and audio. ffmpeg-static's install script is skipped on some Vercel builds, so decode can fail there. For the evaluation period, run `npm run start` (or `npm run dev`) on a Node host with disk if you need local acoustics plus Gemini.

Environment variables: `AUTOACE_USER`, `AUTOACE_PASSWORD`, `SESSION_SECRET` (32+ characters), `GOOGLE_GENERATIVE_AI_API_KEY`, optional `GEMINI_MODEL` (default `gemini-3.6-flash`), `DATABASE_URL`, and `AUDIO_ROOT`. `maxDuration` on analysis routes is 300 seconds.
