"use client"

import { useConvexAuth, useMutation, useQuery } from "convex/react"
import { toast } from "sonner"
import { api } from "@convex/_generated/api"
import { MethodCards } from "@/components/method-cards"
import type { AnalysisMethod } from "@/application/select-classifier"

export const SettingsPanel = () => {
  const { isAuthenticated } = useConvexAuth()
  const settings = useQuery(api.settings.get, isAuthenticated ? {} : "skip")
  const setDefaultMethod = useMutation(api.settings.setDefaultMethod)

  if (!settings) {
    return <p className="text-sm text-muted-foreground">Loading settings…</p>
  }

  const handleMethod = async (method: AnalysisMethod) => {
    try {
      await setDefaultMethod({ defaultMethod: method })
      toast.success(`Default method set to ${method}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save settings")
    }
  }

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div>
          <h2 className="text-sm font-medium">Default method</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            New batches start on this method. You can still override it before Run.
          </p>
        </div>
        <MethodCards value={settings.defaultMethod} onChange={(method) => void handleMethod(method)} />
      </section>
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-sm font-medium">Production model</h2>
        <p className="mt-2 text-sm text-muted-foreground">{settings.productionModel}</p>
        <h2 className="mt-6 text-sm font-medium">Cost ceiling</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          ${settings.costCeilingUsdPerMinute.toFixed(3)} per audio minute
        </p>
        <h2 className="mt-6 text-sm font-medium">Auth</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Convex Auth Password. Trial login maps <code>autoace</code> to{" "}
          <code>autoace@eval.local</code>.
        </p>
      </section>
    </div>
  )
}
