"use client"

import { CheckIcon } from "lucide-react"
import { METHOD_VISUAL } from "@/components/batch-badges"
import { cn } from "@/lib/utils"
import {
  METHOD_LIST,
  METHOD_ROLES,
  ROLE_LABEL,
  type MethodId,
  type MethodRole,
} from "@/application/methods"

type MethodCardsBase = {
  allowedMethods?: MethodId[]
}

type MethodCardsProps =
  | (MethodCardsBase & {
      multiple?: false
      value: MethodId
      onChange: (method: MethodId) => void
    })
  | (MethodCardsBase & {
      multiple: true
      value: MethodId[]
      onChange: (methods: MethodId[]) => void
    })

export const MethodCards = (props: MethodCardsProps) => {
  return (
    <div className="space-y-6">
      {METHOD_ROLES.map((role) => (
        <RoleGroup key={role} role={role} {...props} />
      ))}
    </div>
  )
}

const RoleGroup = ({
  role,
  allowedMethods,
  ...props
}: { role: MethodRole } & MethodCardsProps) => {
  const allowed = allowedMethods ? new Set(allowedMethods) : null
  const methods = METHOD_LIST.filter(
    (method) =>
      method.role === role && (allowed === null || allowed.has(method.id)),
  )
  if (methods.length === 0) {
    return null
  }
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {ROLE_LABEL[role]}
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        {methods.map((method) => {
          const selected = props.multiple
            ? props.value.includes(method.id)
            : props.value === method.id
          const visual = METHOD_VISUAL[method.id]
          const Icon = visual.icon
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => {
                if (props.multiple) {
                  const next = props.value.includes(method.id)
                    ? props.value.filter((id) => id !== method.id)
                    : [...props.value, method.id]
                  if (next.length === 0) {
                    return
                  }
                  props.onChange(next)
                  return
                }
                props.onChange(method.id)
              }}
              aria-pressed={selected}
              className={cn(
                "rounded-xl border bg-card p-4 text-left transition-colors",
                selected
                  ? "border-foreground ring-1 ring-foreground/10"
                  : "border-border hover:border-foreground/40",
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg border",
                    visual.className,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{method.label}</p>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                    {method.description}
                  </p>
                </div>
                {props.multiple ? (
                  <span
                    aria-hidden
                    className={cn(
                      "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                      selected
                        ? "border-foreground bg-foreground text-background"
                        : "border-muted-foreground/40 bg-background",
                    )}
                  >
                    {selected ? <CheckIcon className="size-3" strokeWidth={3} /> : null}
                  </span>
                ) : null}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
