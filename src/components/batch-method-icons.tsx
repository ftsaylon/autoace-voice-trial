"use client"

import { METHOD_VISUAL } from "@/components/batch-badges"
import { METHODS, type MethodId } from "@/application/methods"
import { cn } from "@/lib/utils"

export const BatchMethodIcons = ({
  methods,
  size = "sm",
  className,
}: {
  methods: MethodId[]
  size?: "sm" | "xs"
  className?: string
}) => {
  const unique = [...new Set(methods)]
  if (unique.length === 0) {
    return null
  }

  const boxSize = size === "xs" ? "size-4" : "size-5"
  const iconSize = size === "xs" ? "size-2.5" : "size-3"

  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {unique.map((methodId) => {
        const visual = METHOD_VISUAL[methodId]
        const Icon = visual.icon
        return (
          <span
            key={methodId}
            title={METHODS[methodId].label}
            className={cn(
              "inline-flex shrink-0 items-center justify-center rounded border",
              boxSize,
              visual.className,
            )}
          >
            <Icon className={iconSize} aria-hidden />
          </span>
        )
      })}
    </span>
  )
}
