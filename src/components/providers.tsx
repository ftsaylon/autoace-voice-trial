"use client"

import { ConvexAuthNextjsProvider } from "@convex-dev/auth/nextjs"
import { ConvexReactClient } from "convex/react"
import { ThemeProvider } from "next-themes"
import { type ReactNode } from "react"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { BatchToastWatcher } from "@/components/batch-toast-watcher"

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL
const convex = new ConvexReactClient(convexUrl ?? "")

export const ClientProviders = ({ children }: { children: ReactNode }) => {
  return (
    <ConvexAuthNextjsProvider client={convex}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          {children}
          <BatchToastWatcher />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </ConvexAuthNextjsProvider>
  )
}
