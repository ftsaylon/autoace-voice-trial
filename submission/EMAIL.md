Subject: AutoAce voice tone trial — hosted dashboard, repo, and labeled-call predictions

Hi AutoAce team,

Here is my submission for the Voice Tone and Background Noise trial.

## Hosted dashboard

URL: https://autoace-voice-trial-seven.vercel.app  
Username: `autoace`  
Password: `trial-eval-2026`

Please score the hidden set with **Fusion** only. Baseline and Prosody are controls. Lexical and Gemini-only are experiments.

## Hidden-set upload

1. Sign in.
2. On New batch, drop a ZIP or folder with the audio files at the root plus `labels.csv`.
3. Keep **Fusion** selected. Press **Run**.
4. Watch per-clip progress and logs. One bad file does not stop the batch.
5. Download ZIP when the batch finishes. It contains `results.csv` and `results.json`, keyed by the original filename.

`labels.csv` columns: `name` (exact filename including extension) and optional `result_json`. Empty `result_json` is unlabeled and is not fatal.

Supported audio: wav, mp3, ogg, m4a, flac.

## Repository

https://github.com/ftsaylon/autoace-voice-trial

The README covers live evaluation, local setup, and deploy. Production-call audio is not in the repo.

## Attachments

- Technical memo (approaches, why Fusion, validation, cost, latency, failure modes)
- Predictions for the three labeled calls (`labeled-calls-fusion.csv` / `.json`)
- Evaluator walkthrough

## Paid API disclosure

Production inference uses **Google Gemini 3.6 Flash** (`gemini-3.6-flash`, thinking `minimal`). Audio is stored in Convex and sent to Google. The file part is always named `clip.wav`. Gold labels never enter the prompt.

Cost assumption: Gemini bills audio at about 32 tokens/sec (1920 tokens/min). Intro input is $0.75 / 1M tokens through 31 Dec 2026 → about **$0.0014 per audio minute**. From 1 Jan 2027 standard input is $1.50 / 1M → about **$0.0029 / min**. Both stay under the $0.003 / min ceiling. One request per clip up to 15 minutes. Retention follows Convex and Google policies.

A hosted Fusion run of the three labeled calls (about 3.97 audio minutes) finished in **56 seconds** wall time.

Happy to walk through methodology, experiments, and what I would improve with more data.

Thanks,  
Francis
