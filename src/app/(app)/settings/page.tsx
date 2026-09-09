import { SettingsPanel } from "@/components/settings-panel"

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Defaults for new runs. Model and cost ceiling are read-only.
        </p>
      </div>
      <SettingsPanel />
    </div>
  )
}
