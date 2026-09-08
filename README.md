# AutoAce voice tone and noise trial

Hosted dashboard for classifying customer emotional tone and background noise in production call audio. AutoAce can log in, upload an evaluation ZIP, watch clip-by-clip progress, and download the required JSON schema.

Production inference uses Gemini 2.5 Flash with constrained decoding. An acoustic engine owns silence and technical quality. Gold `result_json` is used only for scoring. It never enters the model.

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

Set the same environment variables on the host. The app expects a Node runtime with disk (`data/app.db` and `data/audio`) or `DATABASE_URL` pointing at libsql/Turso. ffmpeg-static is bundled. `maxDuration` on analysis routes is 300 seconds.
