import type { AcousticMeasurements } from "@/domain"

export const TONE_LADDER = `emotional_tone is the primary emotion of the customer. Apply this ladder in order and stop at the first match:
- distressed: crying, panic, overwhelmed, or otherwise emotionally escalated
- upset: clearly angry, agitated, or strongly dissatisfied
- frustrated: annoyed, impatient, or dissatisfied without that anger
- satisfied: pleased, relieved, appreciative, or clearly positive
- neutral: no clear positive or negative emotion

emotional_intensity: low (subtle), medium (clear and sustained), high (strong, escalated).`

export const NOISE_AND_OVERLAP = `background_noise_present: true only if meaningful non-speech sound is audible. Barely perceptible artifacts do not count.

background_noise_type: a short phrase for the dominant noise. Prefer one of: office chatter, TV, road noise, sharp static, keyboard typing, music, wind, mechanical. Empty string when no noise is present.

background_noise_severity: none when no noise. Otherwise low (audible but does not interfere), medium (occasionally interferes), high (materially impairs the conversation).

speaker_overlap_present: true if two or more speakers talk at the same time enough to affect understanding.

confidence: 0 to 1 for the overall result.`

export const ANTI_CONFOUND_RULES = `Rules:
- Do not infer frustration or distress solely from loudness.
- Do not infer background noise solely from poor audio quality.
- Judge the customer, not the agent.
- If several emotions appear, pick the primary one.`

export const FUSION_PROMPT = `You analyze production call-center audio between a customer and an agent.

Return structured fields for THIS clip only.

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
    "Measured acoustics (context only; do not infer tone from loudness or noise from quality):",
    `- SNR: ${acoustic.snrDb.toFixed(1)} dB`,
    `- clip fraction: ${acoustic.clipFraction.toFixed(4)}`,
    `- longest silence: ${acoustic.longestSilenceSec.toFixed(2)} s`,
    `- spectral flatness: ${acoustic.spectralFlatness.toFixed(3)}`,
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
