# Technical memo

AutoAce asked for the most accurate, cheap, and reproducible classifier of customer tone and background noise on production calls. This memo records what we compared, what shipped, and what will still fail.

Citations for the extractor and fusion rules are listed in full in [METHODS.md](METHODS.md#bibliography).

## Approaches tested

**Acoustic baseline.** ffmpeg decodes stereo 16 kHz PCM. The shared extractor (`measureStereo`) computes frame SFM (Johnston 1988; Boakye 2008), unvoiced Hammarberg/alpha (Eyben et al. 2016), 2–8 Hz modulation (Greenberg/Kingsbury; Festen & Plomp 1990), Boersma HNR, WADA-SNR (Kim & Stern 2008), and stereo correlation. The **classifier** still maps RMS/SNR onto tone — that is the naive control the spec asked for, and it is wrong for production. Noise type comes from the DSP family (`static` only), not Gemini. Cost is $0.

**Prosody control.** Same decode. Tone comes from F0 range, speaking-rate bursts, and HNR (Eyben et al. 2016; Boersma 1993), not RMS. Noise uses the shared family. Overlap stays false in the classifier; `fuse()` may still set stereo overlap. Cost is $0. It still cannot name TV versus sharp static.

**Fusion (production).** Gemini 3.6 Flash audio with constrained decoding against a Zod schema. The prompt quotes AutoAce field definitions, a whole-clip tone ladder, anti-confound rules, perceptual `audio_quality`, and DSP labels `noise_family` / `overlap_evidence` only — not SNR, RMS, or filename. The file part is always `clip.wav`. Typical production calls (up to 15 min) are one request. Longer clips use non-overlapping 20 s windows. `fuse()` writes silence from DSP, takes the worse of Gemini vs DSP quality, drops only low-severity generic chatter on a positive `clean` residual (named events such as television stay), recovers static from sustained unvoiced SFM without rewriting television, and can set stereo overlap. Dual-mono overlap stays with Gemini; prompt `none` is split-channel context, not a veto. It never changes `emotional_tone`. Invalid structured output retries once. Production pins `gemini-3.6-flash` with thinking `minimal`.

**Lexical experiment.** Same Gemini model and cost. The prompt requires a customer transcript first, then tone from the words (AlloSat / Deschamps-Berger et al., arXiv:2310.04481). Quality, silence, and DSP noise/overlap gates still come from `fuse()`.

**Gemini-only experiment.** Gemini owns every field. `fuse()` does not run. This is the ablation for DSP overrides.

All methods share parse, `processClip`, Convex storage, and the method registry in `src/application/methods.ts`. The dashboard exposes the catalog, then Run. Uploads stay drafts until Run.

## Why fusion is production

The labeled set is three clips. That is enough to sanity-check wiring, not to train a five-class SER model. The hidden set will include the same taxonomy (`frustrated` vs `upset` vs `distressed`) and free-text noise types such as `TV` and `sharp static`. Those are semantic judgments. A Flash audio model can apply the written definitions. The DSP controls cannot name the show on a TV in the background.

Gold `result_json` is never placed in a production prompt. Using the three labels as few-shot would overfit the hidden set.

Lexical is the closest alternative. AlloSat found linguistic content stronger than acoustics for satisfaction. We keep that path selectable. We do not flip the default until a held-out run says it wins.

DSP is the partner for everything that is physical: quality, long silence, a positive clean-talker residual, sustained static, and split-channel overlap. Gemini remains the partner for tone and for naming TV vs chatter. The mix’s 4 Hz peak is not a TV detector.

## Fusion policy

On every method except `gemini_only`:

- `audio_quality` is the worse of Gemini (echo, muffled, robotic, packet loss, plus the brief quality list) and DSP energy SNR (5 / 15 dB) with WADA-SNR as a veto on VAD-biased “slight,” plus clip fraction.
- `long_silence_present` from an 8 s pause with a short VAD hangover. Gemini does not own this field on fusion.
- Noise: do not invent from low SNR. On `clean`, drop only low-severity generic chatter/ambience. Keep named events (television, music, keyboard), including low severity. If family is `static`, force present; keep Gemini’s type when it already looks like static **or** is a named non-static event (television). Otherwise type `sharp static`. If family is `uncertain`, Gemini may name a distinct audible event but must not invent chatter or traffic from the talker alone. `TV` aliases to `television`.
- Overlap: stereo both-active + low correlation sets true. Dual-mono (ρ ≥ 0.95) ignores channels. A `clean` residual does not veto Gemini overlap. Harmonicity does not set overlap by itself. Prompt `overlap_evidence: none` means no split-channel overlap, not that simultaneous speech is absent.
- Intensity: F0 range may floor `low` → `medium` (Juslin & Laukka 2003; Scherer). Loudness is not required. Upset/distressed is not `low` (schema). **`emotional_tone` is never taken from RMS or F0.**
- Confidence: single-window clips keep Gemini’s value. Multi-window clips mix duration-weighted tone agreement with mean winning-tone confidence. Do not Platt-scale on n=3.

## Cost

Gemini bills audio at about 32 tokens per second, or 1920 tokens per minute. Gemini 3.6 Flash intro input is $0.75 / 1M tokens through 31 Dec 2026, so audio alone is about **$0.0014 per audio minute**, plus a small structured-output completion. From 1 Jan 2027 standard input is $1.50 / 1M (~$0.0029 / min). Both stay under the $0.003 / min ceiling if thinking stays at `minimal` **and** typical calls are one request (≤ 15 min, no overlapping windows). We do not upgrade the model: leftover headroom cannot pay for Pro, thinking above `minimal`, or a second audio call. `fusion`, `lexical`, and `gemini_only` each send audio once per window. A two-call ensemble is not offered. One retry on invalid JSON is the same SKU and stays under the ceiling if rare. `gemini-3.8-flash` is not the production pin: `minimal` thinking is unsupported and default medium thinking is billed as output.

Audio leaves AutoAce infrastructure: Convex stores the bytes, Google receives windows for Gemini methods. Retention follows those providers' policies. Disclose that on evaluation.

If `GOOGLE_GENERATIVE_AI_API_KEY` is missing on the Convex deployment, Gemini methods fail the run immediately with `classifier_unavailable`. `npm run dev:backend` copies a non-empty key from `.env.local` onto that deployment. The dashboard still loads. Baseline and prosody still run.

## Latency and concurrency

On this machine the acoustic baseline processed the three labeled calls (31 s + 35 s + 172 s) in **1.91 seconds** wall time in an earlier decode. Fusion wall time is estimated as **`~ceil(n / 8) × one Gemini RTT`** (up to eight in-flight **functions**, one clip each, same pattern as method runs). Parallelism does not change $ per audio minute. Windows inside a clip stay serial only on the >15 min fallback. Re-measure with `npx tsx experiments/run-comparison.ts /path/to/folder` after a paid key is available.

The worker pool is one Convex Node action per clip, capped at eight per batch, up to two batches running (16 peak). Extras queue. Navigating the app does not pause jobs. The cap is not unbounded: Gemini RPM, ffmpeg memory, and write contention on run counters bind it. Eight is the production setting; 16 per batch would be 32 Node processes with two batches and is not used.

## Validation

n = 3. Independent classification, no gold in the prompt.

Scoring reports per-field accuracy (tone, intensity, noise present/type/severity, quality, overlap, silence, confidence within 0.2) and **tone macro F1**, matching the hidden-set criterion. On the dashboard, expand a clip for field-level pred vs gold. Compare bars include the related fields.

Acoustic baseline tone confusion from the earlier labeled run (rows gold, columns predicted):

- upset → frustrated
- neutral → neutral
- satisfied → frustrated

Tone accuracy 1/3. The baseline missed TV and sharp static, and never marked overlap. That is why Gemini is the production classifier for those fields.

A Fusion run on 2026-09-10 22:53 (same three clips, Gemini 3.6 Flash + the previous `none`/speech_like gates):

- Tone 0/3, adjacent: upset→frustrated, gold-neutral→frustrated, satisfied→neutral. Gemini-only was 1/3 (got the neutral call).
- Noise 1/3. DSP family `none` dropped Gemini’s TV on call_002. Static on call_003 was not recovered (mix 4 Hz from speech blocked the static bin). Gemini-only named TV correctly and invented road noise on the clean call.
- Overlap 1/3. Fusion false-alarmed overlap on the clean upset call and missed overlap on the TV call. Lexical was 2/3 on overlap.
- Quality and silence 3/3.

That `none` bin was doing two jobs (confident clean and “don’t know”). This revision splits `clean` vs `uncertain` and stops treating mix-envelope 4 Hz as TV. A later Flash-Lite run (23:14) showed Lite is the wrong quality tier for this taxonomy (invented road noise under an over-permissive uncertain prompt; missed dual-mono overlap when `clean` vetoed Gemini). Production is pinned to Gemini 3.6 Flash with thinking `minimal`. It is **not** fitted to 3/3.

Do not treat n = 3 numbers as the hidden-set score. Feature thresholds are locked by synthetic tests in `src/adapters/acoustic/measure-acoustics.test.ts`.

## Failure modes

- Dual-mono stereo. L/R correlation on the provided calls is 1.0. Stereo overlap will not fire; Gemini and (weak) mono harmonicity remain the cues.
- `frustrated` vs `upset` vs `distressed` will collapse under weak signal or agent-side emotion.
- Subtle television versus office chatter inside the speech-like bin is still Gemini. DSP will not invent the show name `television`.
- Packet-loss / robotic speech may look like noise to a model and like quality to DSP. Fusion keeps those fields separate on purpose, then takes the worse quality so Gemini can still mark echo/muffled/robotic/packet-loss when DSP SNR looks fine.
- Long dead air just under 8 s stays `long_silence_present: false`.
- Energy SNR between 5 dB and 15 dB marks `slightly_impaired` only if WADA-SNR agrees, or if clipping is high.
- ffmpeg spawn failure in Convex Node actions fails the clip (`decode_failed`) instead of fabricating a prediction.
- Per-clip errors are isolated; Retry failed requeues only those rows.

## Next steps

- Measure every method on the three labeled calls (when audio is available) and a 40-clip hidden-set rehearsal.
- Do not iterate thresholds until those three clips are perfect.
- Fit confidence to reliability diagrams once n is larger than a handful.
