"use client"

import Link from "next/link"
import { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import { useEffect, useState } from "react"
import { useConvexAuth, useQuery } from "convex/react"
import { HistoryIcon } from "lucide-react"
import { api } from "@convex/_generated/api"
import { BatchMethodIcons } from "@/components/batch-method-icons"
import { StatusIcon } from "@/components/status-icon"
import { Spinner } from "@/components/waveform-spinner"
import { BatchLabelText } from "@/components/batch-label-text"
import { formatBatchLabel, isBatchCode } from "@/lib/batch-label"
import { relativeTime } from "@/lib/format-time"
import { cn } from "@/lib/utils"
import { METHODS, type MethodId } from "@/application/methods"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"

const SIDEBAR_BATCH_LIMIT = 24
const SIDEBAR_EXPAND_MS = 200

const BatchLinkPending = () => {
  const { pending } = useLinkStatus()
  if (!pending) {
    return null
  }
  return (
    <span
      aria-hidden
      className="ml-auto size-1.5 shrink-0 rounded-full bg-sidebar-foreground/60"
    />
  )
}

const batchMethods = (batch: {
  method: MethodId
  methodIds?: MethodId[]
}): MethodId[] => {
  if (batch.methodIds && batch.methodIds.length > 0) {
    return batch.methodIds
  }
  return [batch.method]
}

export const SidebarBatchHistory = () => {
  const pathname = usePathname()
  const { isAuthenticated } = useConvexAuth()
  const { state } = useSidebar()
  const expanded = state === "expanded"
  const [contentReady, setContentReady] = useState(expanded)
  const batches = useQuery(api.batches.list, isAuthenticated ? {} : "skip")

  useEffect(() => {
    if (!expanded) {
      setContentReady(false)
      return
    }
    const timer = window.setTimeout(() => setContentReady(true), SIDEBAR_EXPAND_MS)
    return () => window.clearTimeout(timer)
  }, [expanded])

  const recent =
    batches
      ?.filter((batch) => isBatchCode(batch.name))
      .slice(0, SIDEBAR_BATCH_LIMIT) ?? []
  const historyActive = pathname === "/history"

  if (!expanded) {
    return (
      <SidebarGroup className="py-0 group-data-[collapsible=icon]:px-1">
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                asChild
                isActive={historyActive}
                tooltip="All history"
              >
                <Link href="/history" prefetch={true}>
                  <HistoryIcon />
                  <span>All history</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    )
  }

  return (
    <SidebarGroup className="min-h-0 flex-1 overflow-hidden">
      <SidebarGroupLabel>History</SidebarGroupLabel>
      <SidebarGroupContent
        className={cn(
          "min-h-0 w-[calc(var(--sidebar-width)-1rem)] overflow-x-hidden overflow-y-auto",
          contentReady ? "opacity-100" : "opacity-0",
          "transition-opacity duration-150",
        )}
      >
        <SidebarMenu>
          {batches === undefined ? (
            <SidebarMenuItem>
              <SidebarMenuButton disabled tooltip="Loading batches">
                <Spinner size={16} className="text-muted-foreground" />
                <span>Loading…</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : recent.length === 0 ? (
            <SidebarMenuItem>
              <SidebarMenuButton disabled tooltip="No batches yet">
                <HistoryIcon />
                <span>No batches yet</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ) : (
            recent.map((batch) => {
              const href = `/batches/${batch._id}`
              const active = pathname === href
              const label = formatBatchLabel(batch, { variant: "compact" })
              const methods = batchMethods(batch)
              return (
                <SidebarMenuItem key={batch._id}>
                  <SidebarMenuButton
                    asChild
                    isActive={active}
                    tooltip={`${label} · ${methods.map((methodId) => METHODS[methodId].label).join(", ")} · ${relativeTime(batch.createdAt)}`}
                    className="!h-auto min-h-14 items-start py-2.5"
                  >
                    <Link href={href} prefetch={true} className="flex w-full min-w-0 flex-col gap-2">
                      <span className="flex w-full min-w-0 items-center gap-2">
                        <StatusIcon status={batch.status} className="shrink-0" />
                        <BatchLabelText
                          batch={batch}
                          variant="compact"
                          className="min-w-0 flex-1 text-sm"
                        />
                        <span className="ml-auto shrink-0 text-xs text-sidebar-foreground/60">
                          {relativeTime(batch.createdAt)}
                        </span>
                        <BatchLinkPending />
                      </span>
                      <BatchMethodIcons methods={methods} size="xs" className="pl-6" />
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )
            })
          )}
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={historyActive}
              tooltip="All history"
              className={cn(historyActive && "font-medium")}
            >
              <Link href="/history" prefetch={true}>
                <HistoryIcon />
                <span>All history</span>
                <BatchLinkPending />
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  )
}
