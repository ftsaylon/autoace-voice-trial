import { LogsPanel } from "@/components/logs-panel"

export default function LogsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Logs</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Append-only diagnostics across your batches.
        </p>
      </div>
      <LogsPanel />
    </div>
  )
}
