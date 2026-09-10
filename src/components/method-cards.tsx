"use client"

import { cn } from "@/lib/utils"
import {
  METHOD_LIST,
  METHOD_ROLES,
  ROLE_LABEL,
  type MethodId,
  type MethodRole,
} from "@/application/methods"

type MethodCardsProps =
  | {
      multiple?: false
      value: MethodId
      onChange: (method: MethodId) => void
    }
  | {
      multiple: true
      value: MethodId[]
      onChange: (methods: MethodId[]) => void
    }

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
  ...props
}: { role: MethodRole } & MethodCardsProps) => {
  const methods = METHOD_LIST.filter((method) => method.role === role)
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {ROLE_LABEL[role]}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {methods.map((method) => {
          const selected = props.multiple
            ? props.value.includes(method.id)
            : props.value === method.id
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
                "rounded-xl border bg-card p-6 text-left transition-colors",
                selected
                  ? "border-foreground"
                  : "border-border hover:border-foreground/40",
              )}
            >
              <p className="text-sm font-medium">{method.label}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {ROLE_LABEL[method.role]}
              </p>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                {method.description}
              </p>
            </button>
          )
        })}
      </div>
    </div>
  )
}
