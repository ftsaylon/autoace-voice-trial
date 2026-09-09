# Methods

Two classifiers share `processClip`, fusion, and storage. Only the `SemanticClassifier` port swaps.

## Fusion (production)

Pin `gemini-3.6-flash` with `thinkingLevel: "minimal"`. Constrained decoding (`generateText` + `Output.object`) against a Zod schema derived from the semantic fields.

The prompt quotes AutoAce's field definitions and the two anti-confound rules:

- Do not infer frustration or distress solely from loudness.
- Do not infer background noise solely from poor audio quality.

Gold `result_json` never enters the prompt, few-shot examples, or logs sent to Gemini.

Clips longer than 30 s are split into 20 s windows with 5 s overlap, classified, then reduced by `aggregateWindows`. Fusion then applies acoustics:

| Field | Owner |
| --- | --- |
| `emotional_tone`, `emotional_intensity` | Gemini |
| `background_noise_*`, `speaker_overlap_present` | Gemini |
| `audio_quality` | ffmpeg (SNR + clipping) |
| `long_silence_present` | ffmpeg (8 s threshold) |
| `confidence` | fused |

A Gemini-only production option is intentionally absent. It would mix loudness into tone and quality into noise.

## Acoustic baseline (control)

`AcousticBaselineClassifier` maps RMS, SNR, clipping, and spectral flatness onto the schema with a small rule table. Cost is $0. It cannot reliably separate `frustrated` / `upset` / `distressed` or name TV vs sharp static. It exists because the spec requires a second materially different approach.

## Cost

Gemini bills audio at about 32 tokens per second, or 1920 tokens per minute. Gemini 3.6 Flash input is $1.50 / 1M tokens, so audio alone is about **$0.0029 per audio minute**, plus a small structured-output completion. Thinking stays at `minimal` so the total stays under **$0.003 / min**. Windowing a long call still sends about one minute of audio tokens per minute of source, not a full-file multiply.

## Model pin

Default `GEMINI_MODEL=gemini-3.6-flash`. Override only for experiments. Hidden-set scoring should use fusion + this pin.

## ffmpeg in Convex

The worker is a `"use node"` action. `ffmpeg-static` is listed in `convex.json` `node.externalPackages`. If spawn fails in Convex cloud, the clip errors instead of returning a fabricated prediction.
