# Technical memo

AutoAce asked for the most accurate, cheap, and reproducible classifier of customer tone and background noise on production calls. This memo records what we compared, what shipped, and what will still fail.

## Approaches tested

**Acoustic baseline.** ffmpeg decode to 16 kHz mono PCM, then energy VAD, SNR, clipping, RMS, and spectral flatness. A small rule table maps those measurements onto the AutoAce schema. Cost is $0. The taxonomy does not match acted-emotion SER labels, and dual-mono files have no channel cue for overlap, so this path is a control, not the production model.

**Gemini 3.6 Flash audio.** Constrained decoding (`generateText` + `Output.object`) against a Zod schema derived from `ClipPrediction`. The prompt quotes AutoAce's field definitions and the two anti-confound rules (tone is not loudness, noise is not quality). Clips longer than 30 s are split into 20 s windows with 5 s overlap, classified, then reduced by `aggregateWindows`. Gemini 2.5 Flash is retired for new API keys, so production pins `gemini-3.6-flash` (overridable with `GEMINI_MODEL`) and sets `thinkingLevel: minimal` so thinking tokens do not eat the $0.003 / min ceiling.

Both approaches share `CreateBatch`, `ProcessClip`, fusion, and storage. The only swap is the `SemanticClassifier` port.

## Why Gemini is production

The labeled set is three clips. That is enough to sanity-check wiring, not to train a five-class SER model. The hidden set will include the same taxonomy (`frustrated` vs `upset` vs `distressed`) and free-text noise types such as `TV` and `sharp static`. Those are semantic judgments. A Flash audio model can apply the written definitions. The baseline cannot.

Gold `result_json` is never placed in the production prompt. Using the three labels as few-shot would overfit the hidden set.

## Fusion

The acoustic engine is source of truth for `long_silence_present` and `audio_quality`. The 8 s silence threshold sits above the 7.36 s quiet stretch on the satisfied call, which is labeled false. Gemini owns tone, intensity, noise type, and overlap. Fusion does not invent noise from low SNR, and it does not change tone from RMS.

## Cost

Gemini bills audio at about 32 tokens per second, or 1920 tokens per minute. Gemini 3.6 Flash input is $1.50 / 1M tokens, so audio alone is about **$0.0029 per audio minute**, plus a small structured-output completion. That stays under the $0.003 / min ceiling if thinking stays at `minimal`. Windowing a long call sends each 20 s slice once, so a three-minute call is still about three minutes of audio tokens, not a full-file multiply.

Audio leaves AutoAce infrastructure and is sent to Google. Retention follows Google's Gemini API policy. Disclose that on evaluation.

If `GOOGLE_GENERATIVE_AI_API_KEY` is missing, clips fail with `classifier_unavailable`. The dashboard still loads.

## Latency

On this machine the acoustic baseline processed the three labeled calls (31 s + 35 s + 172 s) in **1.91 seconds** wall time, including decode, window extract, and fusion. That is far under production batch needs. Gemini was not configured in this environment (`GOOGLE_GENERATIVE_AI_API_KEY` unset), so Gemini wall time is not reported here. Expect one network round trip per window once a key is set. Batch processing is one clip at a time so a crash can resume from `queued` or stale `running`.

## Validation

n = 3. Independent classification, no gold in the prompt.

Acoustic baseline tone confusion (rows gold, columns predicted):

- upset → frustrated
- neutral → neutral
- satisfied → frustrated

Tone accuracy 1/3. The baseline missed TV and sharp static, and never marked overlap. That is why Gemini is the production classifier. Do not treat these numbers as the hidden-set score.

## Failure modes

- Dual-mono stereo. L/R correlation on the provided calls is 1.0. Overlap has to come from the classifier, not from channels.
- `frustrated` vs `upset` vs `distressed` will collapse under weak signal or agent-side emotion.
- Subtle TV versus sharp static can be labeled as generic noise.
- Packet-loss / robotic speech may look like noise to a model and like quality to DSP. Fusion keeps those fields separate on purpose.
- Long dead air just under 8 s stays `long_silence_present: false`.

## Next steps

- Calibrate window aggregation on a larger labeled set.
- Add overlapped-speech detection that does not assume split channels.
- Fit confidence to reliability diagrams once n is larger than a handful.
