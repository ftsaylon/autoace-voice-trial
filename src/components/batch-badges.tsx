import { AudioWaveformIcon, MessageSquareTextIcon, SparklesIcon } from "lucide-react"
import { METHODS, isMethodId, type MethodId } from "@/application/methods"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const methodStyle: Record<
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
  "gemini-3.6-flash": "Gemini 3.6 Flash",
  "gemini-3.6-flash-lexical": "Gemini 3.6 Flash lexical",
  "gemini-3.6-flash-only": "Gemini 3.6 Flash only",
  "acoustic-baseline": "Acoustic baseline",
  "acoustic-prosody": "Acoustic prosody",
}

export const formatModelLabel = (model: string): string => {
  return MODEL_LABELS[model] ?? model
}

export const MethodBadge = ({ method }: { method: MethodId | string }) => {
  const known = isMethodId(method)
  const style = known
    ? methodStyle[method]
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

export const ModelBadge = ({ model }: { model: string }) => {
  return (
    <Badge
      variant="outline"
      className="h-6 rounded-md border-foreground/8 bg-background px-2.5 font-mono text-[11px] font-normal tracking-tight text-muted-foreground"
    >
      {formatModelLabel(model)}
    </Badge>
  )
}
