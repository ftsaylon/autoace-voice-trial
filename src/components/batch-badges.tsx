import { AudioWaveformIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react"
import { METHODS, isMethodId, type MethodId } from "@/application/methods"
import { Spinner } from "@/components/waveform-spinner"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export const METHOD_CHART_COLOR: Record<MethodId, { fill: string; muted: string }> = {
  fusion: { fill: "#7c3aed", muted: "#c4b5fd" },
  baseline: { fill: "#64748b", muted: "#cbd5e1" },
  lexical: { fill: "#0d9488", muted: "#5eead4" },
  prosody: { fill: "#d97706", muted: "#fcd34d" },
  gemini_only: { fill: "#0284c7", muted: "#7dd3fc" },
}

export const runChartColor = (method: MethodId | string, occurrence: number): string => {
  const known = isMethodId(method) ? METHOD_CHART_COLOR[method] : METHOD_CHART_COLOR.fusion
  return occurrence === 0 ? known.fill : known.muted
}

export const METHOD_VISUAL: Record<
  MethodId,
  {
    className: string
    icon: typeof SparklesIcon
  }
> = {
  fusion: {
    className:
      "border-violet-500/15 bg-violet-500/8 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
    icon: SparklesIcon,
  },
  baseline: {
    className:
      "border-slate-500/15 bg-slate-500/8 text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300",
    icon: AudioWaveformIcon,
  },
  lexical: {
    className:
      "border-teal-500/15 bg-teal-500/8 text-teal-800 dark:border-teal-400/20 dark:bg-teal-400/10 dark:text-teal-300",
    icon: MessageSquareTextIcon,
  },
  prosody: {
    className:
      "border-amber-500/15 bg-amber-500/8 text-amber-800 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-300",
    icon: AudioWaveformIcon,
  },
  gemini_only: {
    className:
      "border-sky-500/15 bg-sky-500/8 text-sky-800 dark:border-sky-400/20 dark:bg-sky-400/10 dark:text-sky-300",
    icon: SparklesIcon,
  },
}

const MODEL_LABELS: Record<string, string> = {
  "gemini-3.5-flash-lite": "Gemini 3.5 Flash-Lite",
  "gemini-3.5-flash-lite-lexical": "Gemini 3.5 Flash-Lite lexical",
  "gemini-3.5-flash-lite-only": "Gemini 3.5 Flash-Lite only",
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.6-flash-lexical": "Gemini 3.6 Flash lexical",
  "gemini-3.6-flash-only": "Gemini 3.6 Flash only",
  "acoustic-baseline": "Acoustic baseline",
  "acoustic-prosody": "Acoustic prosody",
}

export const formatModelLabel = (model: string): string => {
  return MODEL_LABELS[model] ?? model
}

export type MethodRunSnapshot = {
  runId: string
  status: "queued" | "running" | "complete" | "failed"
  succeededCount: number
  failedCount: number
  clipCount: number
}

export const runProgressLabel = (run: MethodRunSnapshot): string | null => {
  if (run.status === "running" || run.status === "queued") {
    const done = run.succeededCount + run.failedCount
    return `${done}/${run.clipCount}`
  }
  return null
}

export const shouldShowMethodRunProgress = (
  batchStatus: string,
  runs: Array<{ status: MethodRunSnapshot["status"] }>,
): boolean => {
  if (batchStatus === "uploading") {
    return false
  }
  return runs.some(
    (run) =>
      run.status === "running" ||
      run.status === "queued" ||
      run.status === "failed",
  )
}

export const MethodBadge = ({ method }: { method: MethodId | string }) => {
  const known = isMethodId(method)
  const style = known
    ? METHOD_VISUAL[method]
    : {
        className: "border-border bg-muted text-muted-foreground",
        icon: SparklesIcon,
      }
  const Icon = style.icon
  const label = known ? METHODS[method].label : method

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 rounded-md px-2.5 text-xs font-medium",
        style.className,
      )}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {label}
    </Badge>
  )
}

export const MethodRunBadge = ({
  method,
  run,
  selected = false,
  onSelect,
}: {
  method: MethodId | string
  run?: MethodRunSnapshot
  selected?: boolean
  onSelect?: () => void
}) => {
  const known = isMethodId(method)
  const style = known
    ? METHOD_VISUAL[method]
    : {
        className: "border-border bg-muted text-muted-foreground",
        icon: SparklesIcon,
      }
  const Icon = style.icon
  const label = known ? METHODS[method].label : method
  const progress = run ? runProgressLabel(run) : null
  const interactive = Boolean(run && onSelect)
  const Tag = interactive ? "button" : "span"

  return (
    <Tag
      type={interactive ? "button" : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={
        interactive && run
          ? `${label}, ${run.status}${progress ? `, ${progress} clips` : ""}`
          : undefined
      }
      disabled={interactive ? !onSelect : undefined}
      onClick={interactive ? onSelect : undefined}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-shadow",
        style.className,
        run?.status === "failed" && "ring-2 ring-offset-2 ring-red-500/40",
        run?.status === "queued" && "opacity-80",
        selected && "ring-2 ring-offset-1 ring-foreground/25",
        interactive && "cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-foreground/15",
      )}
    >
      {run?.status === "running" ? (
        <Spinner size={14} />
      ) : (
        <Icon className="size-3.5 shrink-0" aria-hidden />
      )}
      <span>{label}</span>
      {progress ? (
        <span className="font-mono text-[10px] tabular-nums opacity-80">{progress}</span>
      ) : null}
    </Tag>
  )
}

export const AllMethodsBadge = ({
  selected = false,
  disabled = false,
  title,
  onSelect,
}: {
  selected?: boolean
  disabled?: boolean
  title?: string
  onSelect?: () => void
}) => {
  const interactive = Boolean(onSelect) && !disabled
  const Tag = interactive ? "button" : "span"

  return (
    <Tag
      type={interactive ? "button" : undefined}
      aria-pressed={interactive ? selected : undefined}
      aria-label={interactive ? "All methods" : undefined}
      aria-disabled={disabled || undefined}
      title={title}
      disabled={interactive ? false : disabled}
      onClick={interactive ? onSelect : undefined}
      className={cn(
        "inline-flex h-7 items-center rounded-md border border-border bg-muted/60 px-2.5 text-xs font-medium text-foreground transition-shadow",
        selected && "ring-2 ring-offset-1 ring-foreground/25",
        disabled && "cursor-not-allowed opacity-45",
        interactive &&
          "cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-foreground/15",
      )}
    >
      All
    </Tag>
  )
}
