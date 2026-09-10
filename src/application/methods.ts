export const METHOD_IDS = [
  "fusion",
  "baseline",
  "lexical",
  "prosody",
  "gemini_only",
] as const

export const MAX_METHODS_PER_START = METHOD_IDS.length

export type MethodId = (typeof METHOD_IDS)[number]
export type AnalysisMethod = MethodId
export type MethodRole = "production" | "control" | "experiment"

export type MethodDefinition = {
  id: MethodId
  label: string
  role: MethodRole
  model: string
  fuseQualityAndSilence: boolean
  needsGemini: boolean
  costUsdPerMinute: number
  description: string
}

export const DEFAULT_METHOD: MethodId = "fusion"

export const METHODS: Record<MethodId, MethodDefinition> = {
  fusion: {
    id: "fusion",
    label: "Fusion",
    role: "production",
    model: "gemini-3.5-flash-lite",
    fuseQualityAndSilence: true,
    needsGemini: true,
    costUsdPerMinute: 0.0006,
    description:
      "Gemini 3.5 Flash-Lite classifies tone, intensity, noise, and overlap. DSP owns silence, quality, clean/static residual gates, and stereo overlap. Use this for the hidden set.",
  },
  baseline: {
    id: "baseline",
    label: "Acoustic baseline",
    role: "control",
    model: "acoustic-baseline",
    fuseQualityAndSilence: true,
    needsGemini: false,
    costUsdPerMinute: 0,
    description:
      "Naive RMS/SNR tone map (the control the spec asked for). Shared extractor supplies SFM, modulation, and stereo. Not for hidden-set scoring.",
  },
  lexical: {
    id: "lexical",
    label: "Lexical",
    role: "experiment",
    model: "gemini-3.5-flash-lite-lexical",
    fuseQualityAndSilence: true,
    needsGemini: true,
    costUsdPerMinute: 0.0006,
    description:
      "Gemini transcribes the customer, then labels tone and intensity from those words (AlloSat). Acoustics still own silence, quality, and DSP noise/overlap gates.",
  },
  prosody: {
    id: "prosody",
    label: "Prosody",
    role: "control",
    model: "acoustic-prosody",
    fuseQualityAndSilence: true,
    needsGemini: false,
    costUsdPerMinute: 0,
    description:
      "eGeMAPS-inspired F0, speaking rate, and HNR (Eyben 2016; Boersma 1993). Tone from pitch dynamics, not loudness. No Gemini call.",
  },
  gemini_only: {
    id: "gemini_only",
    label: "Gemini only",
    role: "experiment",
    model: "gemini-3.5-flash-lite-only",
    fuseQualityAndSilence: false,
    needsGemini: true,
    costUsdPerMinute: 0.0006,
    description:
      "Gemini owns every field, including quality and silence. Skips acoustic fusion so you can A/B the DSP overrides.",
  },
}

export const METHOD_LIST: MethodDefinition[] = METHOD_IDS.map((id) => METHODS[id])

export const METHOD_ROLES: MethodRole[] = ["production", "control", "experiment"]

export const ROLE_LABEL: Record<MethodRole, string> = {
  production: "Production",
  control: "Control",
  experiment: "Experiment",
}

export const isMethodId = (value: string): value is MethodId => {
  return (METHOD_IDS as readonly string[]).includes(value)
}

export const methodDefinition = (id: MethodId): MethodDefinition => {
  return METHODS[id]
}

export const modelForMethod = (id: MethodId): string => {
  return METHODS[id].model
}

export const parseMethodId = (value: string | undefined): MethodId | null => {
  if (!value) {
    return null
  }
  return isMethodId(value) ? value : null
}

export const resolveMethod = (value: string): MethodDefinition | null => {
  return isMethodId(value) ? METHODS[value] : null
}
