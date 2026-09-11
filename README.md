# AutoAce voice tone and noise trial

Hosted operator dashboard for classifying customer emotional tone and background noise in production call audio. Production inference is **Fusion**: Gemini 3.6 Flash with constrained decoding and thinking `minimal`, fused with ffmpeg acoustics. Gold `result_json` is used only for scoring. It never enters the model.

Audio leaves AutoAce infrastructure and is stored in **Convex** and sent to **Google Gemini**.

You do not need Convex MCP for any of the paths below.

## 1. Evaluate (no install)

Use the live site. Do not install anything.

1. Open [https://autoace-voice-trial-seven.vercel.app](https://autoace-voice-trial-seven.vercel.app)
2. Sign in with username `autoace` and password `trial-eval-2026`
3. Create a batch from a ZIP (audio files + `labels.csv`)
4. Pick **Fusion**, press **Run**, watch clip logs
5. Download CSV/JSON when the batch finishes

## 2. Reproduce locally (no MCP)

Node 22+. A free Convex account in the browser. Convex MCP is not required.

```bash
npm install
npx convex dev
```

The first `npx convex dev` opens a browser login and creates a dev deployment. Leave it running.

In another terminal, generate Auth keys (non-interactive — do not run `npx @convex-dev/auth`):

```bash
eval "$(node scripts/generate-convex-auth-keys.mjs --export)"
npx convex env set "JWT_PRIVATE_KEY=$JWT_PRIVATE_KEY"
npx convex env set "JWKS=$JWKS"
npx convex env set "SITE_URL=http://127.0.0.1:43123"
```

Use the `NAME=value` form shown above. Do not pass the PEM as a bare argv value; it starts with `-----BEGIN` and the CLI treats the leading dash as a flag.

Copy the `NEXT_PUBLIC_CONVEX_URL` that `npx convex dev` printed into `.env.local` (see `env.example`). Add `GOOGLE_GENERATIVE_AI_API_KEY` there too.

Fusion, Lexical, and Gemini-only run inside Convex Node actions. They read the Gemini key from the **Convex deployment**, not from Next.js. Start the backend with `npm run dev:backend` so the key is synced (`npm run sync:convex-env` also works). Without a key, Gemini runs fail immediately instead of inventing a prediction.

```bash
npm test
npm run dev
```

Open the URL Next prints. It prefers http://127.0.0.1:43123 and uses the next free port if that one is taken. If the port changes, set `SITE_URL` on Convex to match.

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

Create a batch from **New batch** on the Batches page (or drop a ZIP/folder onto that page), pick a method, then press **Run**. Files upload as soon as they parse. Classification does not start until you press Run. Hidden-set scoring should use **Fusion**.

To compare methods, turn on **Compare methods** before Run, or open a finished batch and press **Run methods**. Audio is not re-uploaded. Each attempt is stored as a run. The Compare tab shows grouped accuracy bars, tone confusion matrices, and a clip heatmap.

### Methods

See [docs/GLOSSARY.md](docs/GLOSSARY.md) for the words method, classifier, and model. See [docs/METHODS.md](docs/METHODS.md) for field ownership and cost.

- `fusion` — Gemini 3.6 Flash plus acoustic fusion. Production. Use this for hidden-set scoring.
- `baseline` — DSP rules from RMS, SNR, and flatness. Naive control.
- `prosody` — F0, speaking rate, and HNR rules. Literature DSP control.
- `lexical` — Gemini labels tone from the customer's words. Experiment.
- `gemini_only` — Gemini owns every field. Skips `fuse()`. Experiment.

### CLI

Convex-free smoke path for **baseline** and **prosody**:

```bash
npm run analyze -- /path/to/evaluation_batch --method baseline
```

Fusion (and lexical / gemini_only) on the CLI still need `GOOGLE_GENERATIVE_AI_API_KEY` in the shell. Writes `batch-<id>.json` in the working directory using the same `processClip` command.

Do not commit production `.ogg` files.

## 3. Deploy

`npx convex deploy` is production only. Do not use it during development.

1. `npx convex deploy`
2. Set Convex env: `SITE_URL` (the Vercel origin), `JWT_PRIVATE_KEY`, `JWKS`, `GOOGLE_GENERATIVE_AI_API_KEY`, optional `GEMINI_MODEL=gemini-3.6-flash`.
3. Set Vercel env: `NEXT_PUBLIC_CONVEX_URL`, `NEXT_PUBLIC_CONVEX_SITE_URL`.
4. Host the Next app on Vercel. ffmpeg runs inside Convex Node actions, not on Vercel `/tmp`.

## Architecture

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the hexagon, Convex data model, authz, and run sequence.

See [docs/GLOSSARY.md](docs/GLOSSARY.md) for method versus classifier.

See [docs/METHODS.md](docs/METHODS.md) for the method catalog, windowing, prompts, and cost math.

See [docs/assessment.md](docs/assessment.md) for the official field definitions and rubric.

See [docs/TECHNICAL_MEMO.md](docs/TECHNICAL_MEMO.md) for the short evaluation memo.
