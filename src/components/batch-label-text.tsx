import {
  formatBatchLabel,
  getBatchLabelParts,
  type BatchLabelVariant,
} from "@/lib/batch-label"
import { cn } from "@/lib/utils"

export type BatchLabelTextProps = {
  batch: { name: string; datasetName?: string | null }
  variant?: BatchLabelVariant
  className?: string
  codeClassName?: string
  datasetClassName?: string
}

export const BatchLabelText = ({
  batch,
  variant = "full",
  className,
  codeClassName,
  datasetClassName,
}: BatchLabelTextProps) => {
  const { codeLabel, datasetName } = getBatchLabelParts(batch, { variant })
  const fullLabel = formatBatchLabel(batch, { variant })

  if (!datasetName) {
    return (
      <span
        className={cn(
          "block min-w-0 truncate font-mono tabular-nums tracking-tight",
          className,
          codeClassName,
        )}
        title={fullLabel}
      >
        {codeLabel}
      </span>
    )
  }

  if (variant === "compact") {
    return (
      <span
        className={cn(
          "flex w-full min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden",
          className,
        )}
        title={fullLabel}
      >
        <span
          className={cn("min-w-0 flex-1 truncate", datasetClassName)}
          title={datasetName}
        >
          {datasetName}
        </span>
        <span
          className={cn(
            "shrink-0 font-mono tabular-nums tracking-tight",
            codeClassName,
          )}
        >
          {codeLabel}
        </span>
      </span>
    )
  }

  return (
    <span
      className={cn(
        "flex w-full min-w-0 max-w-full items-baseline gap-1.5 overflow-hidden",
        className,
      )}
      title={fullLabel}
    >
      <span
        className={cn(
          "shrink-0 font-mono tabular-nums tracking-tight",
          codeClassName,
        )}
      >
        {codeLabel}
      </span>
      <span
        className="shrink-0 px-0.5 text-muted-foreground"
        aria-hidden
      >
        ·
      </span>
      <span
        className={cn("min-w-0 flex-1 truncate", datasetClassName)}
        title={datasetName}
      >
        {datasetName}
      </span>
    </span>
  )
}
