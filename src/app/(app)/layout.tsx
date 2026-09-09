import { cookies } from "next/headers"
import { AppShell } from "@/components/app-shell"
import { ErrorBoundary } from "@/components/error-boundary"
import { SIDEBAR_COOKIE_NAME } from "@/lib/sidebar"
import type { ReactNode } from "react"

export default async function AppLayout({ children }: { children: ReactNode }) {
  const cookieStore = await cookies()
  const sidebarCookie = cookieStore.get(SIDEBAR_COOKIE_NAME)?.value
  const defaultSidebarOpen = sidebarCookie !== "false"

  return (
    <AppShell defaultSidebarOpen={defaultSidebarOpen}>
      <ErrorBoundary>
        <div className="mx-auto min-h-0 w-full max-w-6xl flex-1 overflow-auto px-8 py-8">
          {children}
        </div>
      </ErrorBoundary>
    </AppShell>
  )
}
