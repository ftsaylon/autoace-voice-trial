import { AppShell } from "@/components/app-shell"
import { ErrorBoundary } from "@/components/error-boundary"
import type { ReactNode } from "react"

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AppShell>
      <ErrorBoundary>
        <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-auto px-8 py-8">
          {children}
        </div>
      </ErrorBoundary>
    </AppShell>
  )
}
