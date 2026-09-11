# Methods

Source of truth: `src/application/methods.ts`.

Default method: `fusion`. Production cost ceiling: $0.003 per audio minute.

Gold `result_json` never enters a prompt.

## Shared pipeline

Every method runs `processClip`.

1. ffmpeg decodes the clip as stereo 16 kHz PCM, then `measureStereo` extracts full-clip acoustics (mix-down after the stereo probe).
2. Clips longer than 240 s split into non-overlapping 20 s windows. Shorter clips are one Gemini request.
3. The method's classifier labels each window.
4. `aggregateWindows` reduces windows. Tone uses plurality. Ties prefer higher window confidence, then AutoAce enum order (not tone severity). Overlap needs a majority of windows.
5. If `fuseQualityAndSilence` is true, `fuse()` writes quality and silence from DSP and applies noise-family / overlap / intensity-floor rules. It never changes `emotional_tone`.

Quality cutoffs: energy SNR below 5 dB or clip fraction at or above 0.05 is `severely_impaired`. Slight impairment requires both energy SNR below 15 dB **and** WADA-SNR below 15 dB, or clip fraction at or above 0.01. Long silence is 8 s, with a short VAD hangover so clicks do not split a pause.

## Acoustic extractor

Shared code: `src/adapters/acoustic/measure-acoustics.ts`. No openSMILE binary.

| Feature | Role | Source |
| --- | --- | --- |
| Frame SFM (60 ms / 10 ms, mean over frames and unvoiced frames) | Tonality; static vs speech | Johnston, IEEE J-SAC 1988; Boakye et al., Interspeech 2008 |
| Alpha ratio and Hammarberg index on unvoiced frames | Residual / noise spectral balance | Eyben et al., IEEE TAC 2016, GeMAPS / eGeMAPS |
| Envelope modulation peakiness 2–8 Hz | Speech-like background vs hiss | Greenberg & Kingsbury, JASA 1996; Kingsbury, Morgan & Greenberg, Speech Communication 1998; Festen & Plomp, JASA 1990 |
| Boersma-style HNR and harmonic energy ratio | Periodicity; two-talker harmonicity | Boersma, IFA Proceedings 1993; Boakye 2008 HER |
| WADA-SNR | Quality companion to VAD SNR | Kim & Stern, Interspeech 2008 |
| Unvoiced zero-crossing rate | Broadband residue | Rabiner & Schafer; ICSI SAD |
| Stereo energy + Pearson correlation | Overlap when both channels active and ρ is low | Xiao, Ghosh, Georgiou & Narayanan, ICASSP 2011; Ghosh et al., Interspeech 2010; Pfau, Ellis & Stolcke, ASRU 2001 |

DSP noise family (not clip names): `clean` (high HNR, low unvoiced SFM — a positive single-talker class), `static` (sustained unvoiced high SFM, fraction ≥ 0.5 so a few fricatives do not count), `uncertain` (no residual evidence). `speech_like` is reserved; the mix's 4 Hz peak is the foreground talker and is not treated as TV. Overlap evidence: `none`, `stereo_both_active`, `harmonicity` (DSP does not set overlap from harmonicity alone). Dual-mono (ρ ≥ 0.95) ignores channels. On `clean`, `fuse()` drops only weak or generic Gemini noise (low severity or chatter/ambience); named medium/high events (TV, music, keyboard) stay. It recovers `sharp static` on `static`, and otherwise trusts Gemini. Stereo both-active forces overlap; a `clean` residual does not veto Gemini overlap. Prompt `overlap_evidence: none` means no split-channel evidence, not a veto.

## fusion

Role: production.

Classifier: `GeminiClassifier` with `FUSION_PROMPT`.

Model: `gemini-3.6-flash`.

Owns: tone from Gemini. Intensity may be floored by F0 range (Juslin & Laukka 2003; Scherer) or by the schema (upset/distressed is not low) but tone is never taken from RMS or F0. Noise from Gemini, then `fuse()` drops only weak/generic Gemini noise on `clean`, recovers static, and can set stereo overlap. Dual-mono overlap stays with Gemini. Quality and silence from ffmpeg.

Prompt: AutoAce field definitions, whole-clip tone ladder, anti-confound rules, and DSP labels `noise_family` / `overlap_evidence` only. No SNR, RMS, or filename. File part is always `clip.wav`.

Thinking: `minimal`.

Cost: about $0.0014 per audio minute of **billed** audio through 31 Dec 2026 (Gemini 3.6 Flash intro $0.75 / 1M input). From 1 Jan 2027 the same audio is about $0.0029 / min at standard $1.50 / 1M. One request per clip under 240 s. Gemini bills audio at about 32 tokens per second. Thinking stays `minimal`.

Sources:

- AutoAce field definitions in `docs/assessment.md`.
- Deschamps-Berger, Rasa, Lamel, Dupont. Acoustic and linguistic representations for speech continuous emotion recognition in call center conversations. [arXiv:2310.04481](https://arxiv.org/html/2310.04481).
- Extractor and fusion citations in the table above.

## baseline

Role: control.

Classifier: `AcousticBaselineClassifier`.

Model: `acoustic-baseline`.

Owns: tone from RMS and SNR (the naive loudness map the spec asked for). Noise from the shared DSP family. Quality, silence, and stereo overlap from `fuse()`.

Cost: $0.

## lexical

Role: experiment.

Classifier: `GeminiClassifier` with `LEXICAL_PROMPT`.

Model: `gemini-3.6-flash-lexical`.

Owns: tone and intensity from the customer's words after an implicit transcript. Noise and overlap may use the audio, then `fuse()`. Quality and silence from `fuse()`.

Cost: about $0.0014 per audio minute. One audio call under 240 s.

Source: AlloSat call-center results in [arXiv:2310.04481](https://arxiv.org/html/2310.04481). Linguistic content was the main contributor to satisfaction and generalized better than acoustics.

## prosody

Role: control.

Classifier: `ProsodyClassifier`.

Model: `acoustic-prosody`.

Owns: tone from F0 range, speaking rate, and HNR (Eyben et al. 2016; Boersma 1993). Noise from the shared DSP family. Overlap is false in the classifier; `fuse()` may still set stereo overlap. Quality and silence from `fuse()`.

Cost: $0.

The openSMILE binary is not bundled. Features are computed in TypeScript.

## gemini_only

Role: experiment.

Classifier: `GeminiClassifier` with `GEMINI_ONLY_PROMPT` and `ownQualityAndSilence`.

Model: `gemini-3.6-flash-only`.

Owns: every output field, including quality and silence.

`fuseQualityAndSilence` is false. The prompt does not include DSP evidence. Use this to A/B the DSP overrides.

Cost: about $0.0014 per audio minute.

## ffmpeg in Convex

The worker is a `"use node"` action. `ffmpeg-static` is listed in `convex.json` `node.externalPackages`. If spawn fails in Convex cloud, the clip errors instead of returning a fabricated prediction.

## Model pin

Default `GEMINI_MODEL=gemini-3.6-flash`. Override only for experiments. Hidden-set scoring should use `fusion` and this pin. Do not use Flash-Lite for hidden-set scoring: it is the wrong quality tier for this taxonomy. `gemini-3.8-flash` is not pinned because `thinkingLevel: "minimal"` is unsupported and default medium thinking can blow the $0.003 / min ceiling.

## Bibliography

Full citations for features, fusion rules, and method choice. Thresholds come from synthetic tests, not the three labeled clips.

- **Johnston, J. D. (1988).** Transform coding of audio signals using perceptual noise criteria. *IEEE Journal on Selected Areas in Communications*, 6(2), 314–323. Spectral flatness measure (geometric / arithmetic mean of the power spectrum).
- **Boakye, K., Trueba-Hornero, B., Vinyals, O., & Friedland, G. (2008).** Overlapped speech detection for improved speaker diarization in multiparty meetings. *Interspeech 2008*. 60 ms / 10 ms SFM, harmonic energy ratio, modulation spectrogram bands; overlap false alarms cost more than misses.
- **Eyben, F., Scherer, K. R., Schuller, B. W., et al. (2016).** The Geneva Minimalistic Acoustic Parameter Set (GeMAPS) for voice research and affective computing. *IEEE Transactions on Affective Computing*, 7(2), 190–202. Alpha ratio, Hammarberg index, unvoiced-frame means; F0 / HNR for the prosody control.
- **Greenberg, S., & Kingsbury, B. E. D. (1997).** The modulation spectrogram: in pursuit of an invariant representation of speech. *ICASSP 1997*. Also **Kingsbury, B. E. D., Morgan, N., & Greenberg, S. (1998).** Robust speech recognition using the modulation spectrogram. *Speech Communication*, 25(1–3), 117–132. Envelope energy near 4 Hz is speech-like.
- **Festen, J. M., & Plomp, R. (1990).** Effects of fluctuating noise and interfering speech on the speech-reception threshold for impaired and normal hearing. *Journal of the Acoustical Society of America*, 88(4), 1725–1736. Competing speech keeps a 4 Hz modulation peak; hiss does not.
- **Boersma, P. (1993).** Accurate short-term analysis of the fundamental frequency and the harmonics-to-noise ratio of a sampled sound. *IFA Proceedings*, 17, 97–110. Praat-style HNR from autocorrelation.
- **Kim, C., & Stern, R. M. (2008).** Robust signal-to-noise ratio estimation based on waveform amplitude distribution analysis. *Interspeech 2008*. WADA-SNR from the amplitude distribution, without energy VAD. Lookup interpolated from the published table / Ellis LabROSA implementation.
- **Xiao, B., Ghosh, P. K., Georgiou, P., & Narayanan, S. (2011).** Overlapped speech detection using long-term spectro-temporal similarity in stereo recording. *ICASSP 2011*. Both-channel energy is their baseline; we use energy plus Pearson ρ (high ρ = crosstalk, not two talkers). We did not implement their full spectro-temporal similarity classifier.
- **Ghosh, P. K., Tsiartas, A., Georgiou, P., & Narayanan, S. (2010).** Robust voice activity detection in stereo recording with crosstalk. *Interspeech 2010*. Stereo VAD in the presence of leakage; dual-mono / high correlation is not overlap.
- **Pfau, T., Ellis, D. P. W., & Stolcke, A. (2001).** Multispeaker speech activity detection for the ICSI meeting recorder. *ASRU 2001*. Also **Morgan, N., et al. (2001).** Meetings about meetings: research at ICSI on speech in multiparty conversations. *ASRU 2001*. ICSI SAD hangover and crosstalk vs two-source distinction.
- **Rabiner, L. R., & Schafer, R. W. (1978).** *Digital Processing of Speech Signals*. Prentice-Hall. Unvoiced zero-crossing rate.
- **Juslin, P. N., & Laukka, P. (2003).** Communication of emotions in vocal expression and music performance: Different channels, same code? *Psychological Bulletin*, 129(5), 770–814. High arousal tracks F0 range and loudness. Fusion floors intensity from F0 range only, never from loudness, and never maps F0 onto `emotional_tone`.
- **Scherer, K. R. (2003).** Vocal communication of emotion: A review of research paradigms. *Speech Communication*, 40(1–2), 227–256. Same arousal mapping; production fusion never sets `emotional_tone` from RMS.
- **Deschamps-Berger, T., Rasa, L., Lamel, L., & Dupont, S. (2023).** Acoustic and linguistic representations for speech continuous emotion recognition in call center conversations. [arXiv:2310.04481](https://arxiv.org/abs/2310.04481). AlloSat: lexical content was the main contributor to satisfaction and generalized better than acoustics — rationale for the lexical experiment, not a second Gemini call on fusion.
