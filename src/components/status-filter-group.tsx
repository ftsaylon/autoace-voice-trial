"use client"

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

export type StatusFilterTone =
  | "neutral"
  | "info"
  | "warn"
  | "error"
  | "running"
  | "queued"
  | "complete"
  | "failed"
  | "draft"

export type StatusFilterOption<T extends string> = {
  value: T
  label: string
  tone?: StatusFilterTone
  count?: number
}

const toneDotClass: Record<Exclude<StatusFilterTone, "neutral">, string> = {
  info: "bg-sky-500",
  warn: "bg-amber-500",
  error: "bg-red-500",
  running: "bg-blue-500 motion-safe:animate-pulse",
  queued: "bg-muted-foreground/50",
  complete: "bg-emerald-500",
  failed: "bg-red-500",
  draft: "bg-muted-foreground/30 ring-1 ring-muted-foreground/40",
}

const StatusFilterDot = ({ tone }: { tone: StatusFilterTone }) => {
  if (tone === "neutral") {
    return null
  }

  return (
    <span
      aria-hidden
      className={cn("size-1.5 shrink-0 rounded-full", toneDotClass[tone])}
    />
  )
}

type StatusFilterGroupProps<T extends string> = {
  value: T
  onValueChange: (value: T) => void
  options: readonly StatusFilterOption<T>[]
  ariaLabel: string
}

export const StatusFilterGroup = <T extends string>({
  value,
  onValueChange,
  options,
  ariaLabel,
}: StatusFilterGroupProps<T>) => {
  const handleValueChange = (next: string) => {
    if (next) {
      onValueChange(next as T)
    }
  }

  return (
    <div className="inline-flex rounded-lg bg-muted p-1 ring-1 ring-foreground/5">
      <ToggleGroup
        type="single"
        value={value}
        onValueChange={handleValueChange}
        spacing={0}
        variant="default"
        aria-label={ariaLabel}
        className="gap-0"
      >
        {options.map((option) => (
          <ToggleGroupItem
            key={option.value}
            value={option.value}
            aria-label={option.label}
            className={cn(
              "h-8 min-w-0 rounded-md border-0 bg-transparent px-3 text-muted-foreground shadow-none hover:bg-transparent hover:text-foreground",
              "data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm",
            )}
          >
            {option.tone ? <StatusFilterDot tone={option.tone} /> : null}
            <span>{option.label}</span>
            {option.count !== undefined ? (
              <span className="tabular-nums text-xs text-muted-foreground">
                {option.count}
              </span>
            ) : null}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
