"use client"

import { cn } from "@/lib/utils"
import {
  METHOD_LIST,
  METHOD_ROLES,
  ROLE_LABEL,
  type MethodId,
  type MethodRole,
} from "@/application/methods"

export const MethodCards = ({
  value,
  onChange,
}: {
  value: MethodId
  onChange: (method: MethodId) => void
}) => {
  return (
    <div className="space-y-6">
      {METHOD_ROLES.map((role) => (
        <RoleGroup
          key={role}
          role={role}
          value={value}
          onChange={onChange}
        />
      ))}
    </div>
  )
}

const RoleGroup = ({
  role,
  value,
  onChange,
}: {
  role: MethodRole
  value: MethodId
  onChange: (method: MethodId) => void
}) => {
  const methods = METHOD_LIST.filter((method) => method.role === role)
  return (
    <div className="space-y-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {ROLE_LABEL[role]}
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        {methods.map((method) => {
          const selected = value === method.id
          return (
            <button
              key={method.id}
              type="button"
              onClick={() => onChange(method.id)}
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
