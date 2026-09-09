"use client"

import { cn } from "@/lib/utils"
import type { AnalysisMethod } from "@/application/select-classifier"

export const MethodCards = ({
  value,
  onChange,
}: {
  value: AnalysisMethod
  onChange: (method: AnalysisMethod) => void
}) => {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange("fusion")}
        aria-pressed={value === "fusion"}
        className={cn(
          "rounded-xl border bg-card p-5 text-left transition-colors",
          value === "fusion"
            ? "border-foreground"
            : "border-border hover:border-foreground/40",
        )}
      >
        <p className="text-sm font-medium">Fusion</p>
        <p className="mt-1 text-xs text-muted-foreground">Production</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Gemini 3.6 Flash classifies tone, intensity, noise, and overlap.
          Acoustics own silence and quality. Use this for the hidden set.
        </p>
      </button>
      <button
        type="button"
        onClick={() => onChange("baseline")}
        aria-pressed={value === "baseline"}
        className={cn(
          "rounded-xl border bg-card p-5 text-left transition-colors",
          value === "baseline"
            ? "border-foreground"
            : "border-border hover:border-foreground/40",
        )}
      >
        <p className="text-sm font-medium">Acoustic baseline</p>
        <p className="mt-1 text-xs text-muted-foreground">Control</p>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          DSP-only rules from SNR, RMS, clipping, and spectral flatness. No
          Gemini call. Required as a second approach, not for scoring.
        </p>
      </button>
    </div>
  )
}
