# Terms

This page explains the words this repo uses for analysis. Use these names in code, UI, and other docs. Do not invent a synonym for a term that already exists here.

## Task

A task is one field we score. Emotional-tone classification, background-noise detection, audio quality, speaker overlap, and long silence are tasks. The AutoAce schema lists the legal values for each task.

## Method

A method is a named pipeline you can pick in the dashboard or CLI. It is stored on the batch as `method`. The current ids are `fusion`, `baseline`, `lexical`, `prosody`, and `gemini_only`.

A method chooses a classifier, whether `fuse()` runs, the model string shown on the batch, and the cost assumption. The catalog lives in `src/application/methods.ts`.

## Classifier

A classifier is one implementation of `SemanticClassifier`. It returns tone, intensity, noise, and overlap for a window of audio. `GeminiClassifier`, `AcousticBaselineClassifier`, and `ProsodyClassifier` are classifiers. A method may run a classifier and then `fuse()`.

## Model

A model is the backend label stored on the batch as `model`. Examples are `gemini-3.6-flash` and `acoustic-baseline`. It is display metadata. It is not the method id.

## Feature extractor

The feature extractor is `FfmpegAcousticAnalyzer` plus `measureStereo` in `src/adapters/acoustic/measure-acoustics.ts`. It decodes stereo 16 kHz PCM, then measures duration, RMS, energy SNR, WADA-SNR, clipping, frame spectral flatness, unvoiced Hammarberg/alpha, 2–8 Hz modulation, HNR / harmonic energy ratio, unvoiced ZCR, F0 range, channel correlation, and longest silence. Those numbers become `noiseFamily` and `overlapEvidence`. It is not a classifier. Citations live in `docs/METHODS.md`.

## Late fusion

Late fusion combines outputs after each subsystem has already decided. In this repo, `fuse()` in `src/domain/fusion.ts` writes `long_silence_present` from DSP, sets `audio_quality` to the worse of Gemini vs DSP, drops only low-severity generic chatter on a `clean` residual, may set stereo overlap, and may floor intensity from F0 range (not loudness). It never changes `emotional_tone`. The method named `fusion` uses that function. The function also runs for `baseline`, `lexical`, and `prosody`. The method `gemini_only` skips it.

## Control

A control is a simpler method used to prove the production method is better. `baseline` and `prosody` are controls. Do not use them to score the hidden set.

## Experiment

An experiment is a selectable method for A/B comparison. `lexical` and `gemini_only` are experiments. The default stays `fusion` until a later measured run on held-out audio says otherwise.

## Gold

Gold is the `result_json` from the batch CSV. The scorer compares gold to the prediction. Gold never enters a Gemini prompt, few-shot list, or log sent to Google.
