# Evaluator walkthrough

You do not need to install anything.

## Login

1. Open https://autoace-voice-trial-seven.vercel.app
2. Username `autoace`, password `trial-eval-2026`
3. You land on **New batch**

## Hidden-set batch

1. Drop a ZIP or folder. Audio files sit at the folder root with one `labels.csv`.
2. CSV must have a `name` column (exact filename + extension). `result_json` may be empty.
3. The page reports missing, extra, duplicate, or unsupported files. Matched clips still run.
4. Leave **Fusion** selected. Do not score with Acoustic baseline or Prosody.
5. Press **Run**. Files from a new ZIP upload first; a saved dataset skips re-upload.
6. Clip rows show decode → acoustics → window → fuse. Logs stream below.
7. Expand a clip to see every schema field.
8. **Download ZIP** for `results.csv` and `results.json` (original filenames preserved).

A single malformed file fails that row only. **Retry failed** requeues those rows.

## Optional compare

**Add methods** or **Compare methods** reruns the same stored audio with other pipelines. Use this to inspect controls. Hidden-set scoring should still use the Fusion `results.csv`.

## Local reproduce

See the repository README: https://github.com/ftsaylon/autoace-voice-trial

```bash
npm install
npx convex dev
npm test
npm run analyze -- /path/to/evaluation_batch --method fusion
```

Fusion on the CLI needs `GOOGLE_GENERATIVE_AI_API_KEY` in the shell. Do not commit production `.ogg` files.
