/**
 * Prompts quote AutoAce field definitions (assessment §2). Tone ladder and
 * anti-confound rules are the written schema, not gold examples.
 *
 * Lexical follows AlloSat: linguistic content was the main contributor to
 * call-center satisfaction (Deschamps-Berger et al., arXiv:2310.04481).
 *
 * Fusion context is DSP labels only (noise_family / overlap_evidence).
 * SNR, RMS, and filenames stay out so the model cannot map loudness to
 * frustration or clip identity to a label.
 */
import type { AcousticMeasurements } from "@/domain"

export const TONE_LADDER = `emotional_tone is the customer's primary stance across THIS whole clip, not the agent's, and not the most common local slice. Apply this ladder in order and stop at the first match:
- distressed: crying, panic, overwhelmed, or otherwise emotionally escalated
- upset: clearly angry, agitated, hostile, or strongly dissatisfied. Requires anger in the delivery, not only negative words
- frustrated: annoyed, impatient, or dissatisfied without that anger
- satisfied: pleased, relieved, appreciative, a clearly positive close, or calm thanks / confirmation after resolution — even if the voice is not enthusiastic
- neutral: informational Q&A with no clear positive or negative valence. Do not promote a calm complaint or wait-time talk to frustrated from words alone

emotional_intensity: low (subtle), medium (clear and sustained), high (strong, escalated). If the customer is clearly angry or distressed, intensity is usually high.`

export const NOISE_AND_OVERLAP = `background_noise_present: true only if meaningful non-speech sound is audible. Barely perceptible artifacts do not count. Noise can be present while the recording itself is technically clear (static, TV, and chatter are events, not codec damage).

background_noise_type: a short phrase for the dominant noise. Name what you hear. Do not default to office chatter. Use TV for television or a TV program. Use sharp static for electrical crackle, hiss, or pops. Other examples: road noise, keyboard typing, music, wind, mechanical. Empty string when no noise is present.

background_noise_severity: none when no noise. Otherwise low (audible but does not interfere), medium (occasionally interferes), high (materially impairs the conversation).

speaker_overlap_present: true only if two or more speakers talk at the same time enough to affect understanding. Adjacent turns, latching, and backchannels are not overlap.

confidence: 0 to 1 for the overall result.`

export const ANTI_CONFOUND_RULES = `Rules:
- Do not infer frustration or distress solely from loudness.
- Do not infer background noise solely from poor audio quality.
- Judge the customer, not the agent.
- If several emotions appear, pick the primary one across the clip.`

export const FUSION_PROMPT = `You analyze production call-center audio between a customer and an agent.

Listen to the customer's words and delivery together. Return structured fields for THIS clip only.

${TONE_LADDER}

${NOISE_AND_OVERLAP}

${ANTI_CONFOUND_RULES}

Do not set audio quality or long silence. Those come from a separate acoustic measurement.`

export const LEXICAL_PROMPT = `You analyze production call-center audio between a customer and an agent.

Transcribe the customer's speech first, then label tone and intensity from those words. Ignore how loud or harsh the signal sounds.

Return structured fields for THIS clip only.

${TONE_LADDER}

${NOISE_AND_OVERLAP}

${ANTI_CONFOUND_RULES}

Acoustics may inform noise and overlap. Do not set audio quality or long silence.`

export const GEMINI_ONLY_PROMPT = `You analyze production call-center audio between a customer and an agent.

Return structured fields for THIS clip only.

${TONE_LADDER}

${NOISE_AND_OVERLAP}

audio_quality: the technical quality of the recording, independent of emotion. Allowed: clear, slightly_impaired, severely_impaired. Consider distortion, clipping, echo, static, low volume, muffled speech, robotic audio, and packet loss.

long_silence_present: true if the clip contains an unusually long period of silence or dead air that may indicate a call-flow or audio problem.

${ANTI_CONFOUND_RULES}`

export const formatAcousticContext = (
  acoustic: AcousticMeasurements,
): string => {
  return [
    "DSP residual labels (context only; do not infer tone from loudness or noise from quality):",
    `- noise_family: ${acoustic.noiseFamily}`,
    `- overlap_evidence: ${acoustic.overlapEvidence}`,
    "If noise_family is uncertain, DSP did not find electrical hiss. Still report TV, chatter, music, or other audible non-speech if you hear it.",
    "If noise_family is clean, only report noise when a distinct non-speech event is clearly audible. Do not invent office chatter.",
    "If noise_family is static, name the residual as sharp static unless you clearly hear a different hiss/crackle phrase.",
    "If overlap_evidence is none, adjacent turns are not overlap. True only if two voices are simultaneous.",
  ].join("\n")
}

export const acousticForGeminiPrompt = (input: {
  ownQualityAndSilence: boolean
  acoustic?: AcousticMeasurements
}): AcousticMeasurements | undefined => {
  if (input.ownQualityAndSilence) {
    return undefined
  }
  return input.acoustic
}

export const buildGeminiUserText = (input: {
  prompt: string
  durationSec: number
  acoustic?: AcousticMeasurements
}): string => {
  const parts = [
    input.prompt,
    `Clip duration: ${input.durationSec.toFixed(2)} seconds.`,
  ]
  if (input.acoustic) {
    parts.push(formatAcousticContext(input.acoustic))
  }
  return parts.join("\n\n")
}
