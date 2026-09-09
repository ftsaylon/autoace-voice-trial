import { AudioWaveformIcon, SparklesIcon } from "lucide-react"
import type { AnalysisMethod } from "@/application/select-classifier"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

const methodConfig: Record<
  AnalysisMethod,
  {
    label: string
    className: string
    icon: typeof SparklesIcon
  }
> = {
  fusion: {
    label: "Fusion",
    className:
      "border-violet-500/15 bg-violet-500/8 text-violet-800 dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-300",
    icon: SparklesIcon,
  },
  baseline: {
    label: "Baseline",
    className:
      "border-slate-500/15 bg-slate-500/8 text-slate-700 dark:border-slate-400/20 dark:bg-slate-400/10 dark:text-slate-300",
    icon: AudioWaveformIcon,
  },
}

export const formatModelLabel = (model: string): string => {
  if (model === "gemini-3.6-flash") {
    return "Gemini 3.6 Flash"
  }
  if (model === "acoustic-baseline") {
    return "Acoustic baseline"
  }
  return model
}

export const MethodBadge = ({ method }: { method: AnalysisMethod | string }) => {
  const config =
    method in methodConfig
      ? methodConfig[method as AnalysisMethod]
      : {
          label: method,
          className: "border-border bg-muted text-muted-foreground",
          icon: SparklesIcon,
        }
  const Icon = config.icon

  return (
    <Badge
      variant="outline"
      className={cn(
        "h-6 gap-1.5 rounded-md px-2.5 text-xs font-medium",
        config.className,
      )}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {config.label}
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
