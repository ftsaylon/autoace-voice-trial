"use client"

import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

const BAR_DELAYS = ["0ms", "120ms", "240ms", "360ms"] as const

export const Spinner = ({
  className,
  barClassName,
  size = 16,
  title = "Loading",
}: {
  className?: string
  barClassName?: string
  size?: number
  title?: string
}) => {
  return (
    <span
      className={cn("inline-flex shrink-0 items-center gap-px text-foreground", className)}
      style={{ height: size }}
      role="img"
      aria-label={title}
    >
      {BAR_DELAYS.map((delay) => (
        <span
          key={delay}
          className={cn(
            "w-0.5 origin-center rounded-full bg-current animate-[waveform-bar_0.85s_ease-in-out_infinite]",
            barClassName,
          )}
          style={{ height: size, animationDelay: delay }}
        />
      ))}
    </span>
  )
}

/** @deprecated Use `Spinner` */
export const WaveformSpinner = Spinner

export const LoadingMessage = ({
  children,
  className,
  size,
}: {
  children: ReactNode
  className?: string
  size?: number
}) => {
  return (
    <p
      className={cn(
        "inline-flex items-center gap-2 text-sm text-muted-foreground",
        className,
      )}
    >
      <Spinner size={size} />
      {children}
    </p>
  )
}
