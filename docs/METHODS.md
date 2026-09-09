# Methods

Source of truth: `src/application/methods.ts`.

Default method: `fusion`. Production cost ceiling: $0.003 per audio minute.

Gold `result_json` never enters a prompt.

## Shared pipeline

Every method runs `processClip`.

1. ffmpeg decodes the clip and measures full-clip acoustics.
2. Clips longer than 30 s split into 20 s windows with 5 s overlap.
3. The method's classifier labels each window.
4. `aggregateWindows` reduces windows. Tone uses plurality. Ties prefer non-low intensity, then higher `TONE_SEVERITY`.
5. If `fuseQualityAndSilence` is true, `fuse()` overwrites `audio_quality` and `long_silence_present` from full-clip acoustics.

Quality cutoffs: SNR below 5 dB or clip fraction at or above 0.05 is `severely_impaired`. SNR below 15 dB or clip fraction at or above 0.01 is `slightly_impaired`. Long silence is 8 s.

## fusion

Role: production.

Classifier: `GeminiClassifier` with `FUSION_PROMPT`.

Model: `gemini-3.6-flash`.

Owns: tone, intensity, noise, overlap from Gemini. Quality and silence from ffmpeg.

Prompt: AutoAce field definitions, a distressed / upset / frustrated / satisfied / neutral ladder, anti-confound rules, and the measured SNR, clip fraction, longest silence, and spectral flatness. The prompt does not include the filename.

Thinking: `minimal`.

Cost: about $0.0029 per audio minute. Gemini bills audio at about 32 tokens per second. Gemini 3.6 Flash input is $1.50 / 1M tokens.

Sources:

- AutoAce field definitions in `docs/assessment.md`.
- Deschamps-Berger, Rasa, Lamel, Dupont. Acoustic and linguistic representations for speech continuous emotion recognition in call center conversations. [arXiv:2310.04481](https://arxiv.org/html/2310.04481).

## baseline

Role: control.

Classifier: `AcousticBaselineClassifier`.

Model: `acoustic-baseline`.

Owns: tone, intensity, noise, and overlap from RMS, SNR, and spectral flatness. Quality and silence from `fuse()`.

Cost: $0.

This is the naive control the spec asks for. It maps loudness onto tone. It cannot name TV versus sharp static. Overlap is always false.

## lexical

Role: experiment.

Classifier: `GeminiClassifier` with `LEXICAL_PROMPT`.

Model: `gemini-3.6-flash-lexical`.

Owns: tone and intensity from the customer's words after an implicit transcript. Noise and overlap may use the audio. Quality and silence from `fuse()`.

Cost: about $0.0029 per audio minute. One audio call.

Source: AlloSat call-center results in [arXiv:2310.04481](https://arxiv.org/html/2310.04481). Linguistic content was the main contributor to satisfaction and generalized better than acoustics.

## prosody

Role: control.

Classifier: `ProsodyClassifier`.

Model: `acoustic-prosody`.

Owns: tone from F0 range, speaking rate, and a harmonic-to-noise proxy. Noise from flatness and SNR. Overlap is always false. Quality and silence from `fuse()`.

Cost: $0.

Features follow the eGeMAPS idea (F0, rate, HNR) computed in TypeScript. The openSMILE binary is not bundled.

Sources:

- Eyben et al. The Geneva Minimalistic Acoustic Parameter Set (GeMAPS) for Voice Research and Affective Computing. IEEE Transactions on Affective Computing, 2016.
- openSMILE eGeMAPSv02 as the reference feature set.

## gemini_only

Role: experiment.

Classifier: `GeminiClassifier` with `GEMINI_ONLY_PROMPT` and `ownQualityAndSilence`.

Model: `gemini-3.6-flash-only`.

Owns: every output field, including quality and silence.

`fuseQualityAndSilence` is false. The prompt does not include measured SNR, clip fraction, silence, or spectral flatness. Those numbers would leak the DSP judgment this method exists to isolate.

Cost: about $0.0029 per audio minute.

Use this to A/B the DSP quality and silence overrides. If `gemini_only` matches gold quality and `fusion` does not, the mismatch is in `qualityFromAcoustic`.

## ffmpeg in Convex

The worker is a `"use node"` action. `ffmpeg-static` is listed in `convex.json` `node.externalPackages`. If spawn fails in Convex cloud, the clip errors instead of returning a fabricated prediction.

## Model pin

Default `GEMINI_MODEL=gemini-3.6-flash`. Override only for experiments. Hidden-set scoring should use `fusion` and this pin.
