"use client"

import { useSyncExternalStore } from "react"
import Link from "next/link"
import { useLinkStatus } from "next/link"
import { usePathname } from "next/navigation"
import {
  AudioLinesIcon,
  LayersIcon,
  LogOutIcon,
  MoonIcon,
  PanelLeftIcon,
  ScrollTextIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useTheme } from "next-themes"
import { cn } from "@/lib/utils"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { Button } from "@/components/ui/button"

const NAV = [
  { href: "/batches", label: "Batches", icon: LayersIcon },
  { href: "/logs", label: "Logs", icon: ScrollTextIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
]

const isNavActive = (href: string, pathname: string) => {
  if (href === "/batches") {
    return pathname === "/batches" || pathname.startsWith("/batches/")
  }
  return pathname === href
}

const NavLinkPending = () => {
  const { pending } = useLinkStatus()
  if (!pending) {
    return null
  }
  return (
    <span
      aria-hidden
      className="ml-auto size-1.5 shrink-0 rounded-full bg-sidebar-foreground/60 group-data-[collapsible=icon]:hidden"
    />
  )
}

const SidebarCollapseControl = () => {
  const { state, toggleSidebar } = useSidebar()
  const collapsed = state === "collapsed"
  const label = collapsed ? "Expand sidebar" : "Collapse sidebar"

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          onClick={toggleSidebar}
        >
          <PanelLeftIcon />
          <span className="sr-only">{label}</span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start">
        {label}
      </TooltipContent>
    </Tooltip>
  )
}

const emptySubscribe = () => () => {}

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const { signOut } = useAuthActions()
  const { resolvedTheme, setTheme } = useTheme()
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const isDark = mounted && resolvedTheme === "dark"

  const handleSignOut = () => {
    void signOut()
  }

  const handleToggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar collapsible="icon">
        <SidebarHeader className="group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:pb-2">
          <Link
            href="/batches"
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 outline-hidden ring-sidebar-ring focus-visible:ring-2",
              "group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
            )}
            title="AutoAce"
          >
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
              <AudioLinesIcon className="size-4" />
            </span>
            <span className="min-w-0 group-data-[collapsible=icon]:hidden">
              <span className="block truncate text-sm font-semibold leading-tight">
                AutoAce
              </span>
              <span className="block truncate text-xs text-sidebar-foreground/70">
                Tone & noise
              </span>
            </span>
          </Link>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {NAV.map((item) => {
                  const Icon = item.icon
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isNavActive(item.href, pathname)}
                        tooltip={item.label}
                      >
                        <Link href={item.href} prefetch={true}>
                          <Icon />
                          <span>{item.label}</span>
                          <NavLinkPending />
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="group-data-[collapsible=icon]:px-1">
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip={isDark ? "Switch to light mode" : "Switch to dark mode"}
                onClick={handleToggleTheme}
              >
                {isDark ? <SunIcon /> : <MoonIcon />}
                <span>{isDark ? "Light" : "Dark"}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip="Sign out" onClick={handleSignOut}>
                <LogOutIcon />
                <span>Sign out</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-0 overflow-hidden">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:px-3">
          <div className="flex items-center gap-2 md:hidden">
            <SidebarTrigger />
            <span className="text-sm font-medium">AutoAce</span>
          </div>
          <div className="hidden md:flex">
            <SidebarCollapseControl />
          </div>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
