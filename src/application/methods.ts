export const METHOD_IDS = [
  "fusion",
  "baseline",
  "lexical",
  "prosody",
  "gemini_only",
] as const

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
    model: "gemini-3.6-flash",
    fuseQualityAndSilence: true,
    needsGemini: true,
    costUsdPerMinute: 0.0029,
    description:
      "Gemini 3.6 Flash classifies tone, intensity, noise, and overlap. Acoustics own silence and quality. Use this for the hidden set.",
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
      "DSP-only rules from SNR, RMS, clipping, and spectral flatness. No Gemini call. Required naive control, not for hidden-set scoring.",
  },
  lexical: {
    id: "lexical",
    label: "Lexical",
    role: "experiment",
    model: "gemini-3.6-flash-lexical",
    fuseQualityAndSilence: true,
    needsGemini: true,
    costUsdPerMinute: 0.0029,
    description:
      "Gemini transcribes the customer, then labels tone and intensity from the words. Acoustics still own silence and quality.",
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
      "eGeMAPS-inspired F0, speaking rate, and HNR rules. Tone comes from pitch dynamics, not loudness. No Gemini call.",
  },
  gemini_only: {
    id: "gemini_only",
    label: "Gemini only",
    role: "experiment",
    model: "gemini-3.6-flash-only",
    fuseQualityAndSilence: false,
    needsGemini: true,
    costUsdPerMinute: 0.0029,
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
