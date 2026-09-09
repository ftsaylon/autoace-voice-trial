# Technical memo

AutoAce asked for the most accurate, cheap, and reproducible classifier of customer tone and background noise on production calls. This memo records what we compared, what shipped, and what will still fail.

## Approaches tested

**Acoustic baseline.** ffmpeg decode to 16 kHz mono PCM, then energy VAD, SNR, clipping, RMS, and spectral flatness. A small rule table maps those measurements onto the AutoAce schema. Cost is $0. The taxonomy does not match acted-emotion SER labels, and dual-mono files have no channel cue for overlap, so this path is a control, not the production method.

**Prosody control.** The same decode, plus F0 from autocorrelation, F0 range, speaking-rate bursts, and an HNR proxy. Tone comes from pitch dynamics and rate, not RMS. Cost is $0. It still cannot name TV versus sharp static.

**Fusion.** Gemini 3.6 Flash audio with constrained decoding against a Zod schema. The prompt quotes AutoAce field definitions, a tone ladder for `frustrated` versus `upset` versus `distressed`, and the anti-confound rules. Full-clip SNR, clip fraction, silence, and spectral flatness are passed as numbers. Clips longer than 30 s are windowed (20 s, 5 s overlap), classified, then reduced by `aggregateWindows`. `fuse()` then writes quality and silence from ffmpeg. Production pins `gemini-3.6-flash` with thinking `minimal`.

**Lexical experiment.** Same Gemini model and cost. The prompt requires a customer transcript first, then tone from the words. Quality and silence still come from `fuse()`.

**Gemini-only experiment.** Gemini owns every field. `fuse()` does not run. This is the ablation for DSP quality thresholds.

All methods share parse, `processClip`, Convex storage, and the method registry in `src/application/methods.ts`. The dashboard exposes the catalog, then Run. Uploads stay drafts until Run.

## Why fusion is production

The labeled set is three clips. That is enough to sanity-check wiring, not to train a five-class SER model. The hidden set will include the same taxonomy (`frustrated` vs `upset` vs `distressed`) and free-text noise types such as `TV` and `sharp static`. Those are semantic judgments. A Flash audio model can apply the written definitions. The DSP controls cannot.

Gold `result_json` is never placed in a production prompt. Using the three labels as few-shot would overfit the hidden set.

Lexical is the closest alternative. Call-center work on AlloSat found linguistic content stronger than acoustics for satisfaction. We keep that path selectable. We do not flip the default until a held-out run says it wins.

## Fusion policy

The acoustic engine is source of truth for `long_silence_present` and `audio_quality` on every method except `gemini_only`. The 8 s silence threshold sits above the 7.36 s quiet stretch on the satisfied call, which is labeled false. Gemini owns tone, intensity, noise type, and overlap on `fusion` and `lexical`. Fusion does not invent noise from low SNR, and it does not change tone from RMS.

## Cost

Gemini bills audio at about 32 tokens per second, or 1920 tokens per minute. Gemini 3.6 Flash input is $1.50 / 1M tokens, so audio alone is about **$0.0029 per audio minute**, plus a small structured-output completion. That stays under the $0.003 / min ceiling if thinking stays at `minimal`. `fusion`, `lexical`, and `gemini_only` each send audio once. A two-call ensemble would break the ceiling and is not offered.

Audio leaves AutoAce infrastructure: Convex stores the bytes, Google receives windows for Gemini methods. Retention follows those providers' policies. Disclose that on evaluation.

If `GOOGLE_GENERATIVE_AI_API_KEY` is missing on the Convex deployment, Gemini methods fail with `classifier_unavailable`. The dashboard still loads. Baseline and prosody still run.

## Latency and concurrency

On this machine the acoustic baseline processed the three labeled calls (31 s + 35 s + 172 s) in **1.91 seconds** wall time, including decode, window extract, and fusion. Gemini wall time is one network round trip per window once a key is set. Re-measure with `npx tsx experiments/run-comparison.ts /path/to/folder` after a paid key is available.

The worker is a Convex scheduler chain: one clip at a time per batch, up to two batches running, extras queued. Navigating the app does not pause jobs.

## Validation

n = 3. Independent classification, no gold in the prompt.

Scoring reports per-field accuracy and **tone macro F1**, matching the hidden-set criterion. On the dashboard, expand a clip for field-level pred vs gold.

Acoustic baseline tone confusion from the earlier labeled run (rows gold, columns predicted):

- upset → frustrated
- neutral → neutral
- satisfied → frustrated

Tone accuracy 1/3. The baseline missed TV and sharp static, and never marked overlap. That is why Gemini is the production classifier.

Fusion, lexical, prosody, and gemini-only scores on that folder are not in this memo yet. Run the comparison script and replace this paragraph with the `experiments/last-run.json` field scores. Do not treat n = 3 numbers as the hidden-set score.

## Failure modes

- Dual-mono stereo. L/R correlation on the provided calls is 1.0. Overlap has to come from the classifier, not from channels.
- `frustrated` vs `upset` vs `distressed` will collapse under weak signal or agent-side emotion.
- Subtle TV versus sharp static can be labeled as generic noise.
- Packet-loss / robotic speech may look like noise to a model and like quality to DSP. Fusion keeps those fields separate on purpose.
- Long dead air just under 8 s stays `long_silence_present: false`.
- SNR between 5 dB and 15 dB marks `slightly_impaired` even when a listener would call the clip clear. Compare `gemini_only` if that field misses gold.
- ffmpeg spawn failure in Convex Node actions fails the clip (`decode_failed`) instead of fabricating a prediction.
- Per-clip errors are isolated; Retry failed requeues only those rows.

## Next steps

- Measure every method on the three labeled calls and a 40-clip hidden-set rehearsal.
- Calibrate window aggregation on a larger labeled set.
- Add overlapped-speech detection that does not assume split channels.
- Fit confidence to reliability diagrams once n is larger than a handful.
