"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import {
  LayersIcon,
  LogOutIcon,
  MoonIcon,
  PlusIcon,
  ScrollTextIcon,
  SettingsIcon,
  SunIcon,
} from "lucide-react"
import { useAuthActions } from "@convex-dev/auth/react"
import { useTheme } from "next-themes"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar"

const NAV = [
  { href: "/batches", label: "Batches", icon: LayersIcon },
  { href: "/batches/new", label: "New batch", icon: PlusIcon },
  { href: "/logs", label: "Logs", icon: ScrollTextIcon },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
]

const isNavActive = (href: string, pathname: string) => {
  if (href === "/batches") {
    return (
      pathname === "/batches" ||
      (pathname.startsWith("/batches/") && pathname !== "/batches/new")
    )
  }
  return pathname === href
}

export const AppShell = ({ children }: { children: React.ReactNode }) => {
  const pathname = usePathname()
  const { signOut } = useAuthActions()
  const { resolvedTheme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  const isDark = mounted && resolvedTheme === "dark"

  useEffect(() => {
    setMounted(true)
  }, [])

  const handleSignOut = () => {
    void signOut()
  }

  const handleToggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <SidebarProvider className="h-svh overflow-hidden">
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" asChild tooltip="AutoAce">
                <Link href="/batches">
                  <LayersIcon />
                  <span>AutoAce</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Workspace</SidebarGroupLabel>
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
                        <Link href={item.href}>
                          <Icon />
                          <span>{item.label}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  )
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
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
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger />
          <span className="text-sm font-medium">AutoAce</span>
        </header>
        {children}
      </SidebarInset>
    </SidebarProvider>
  )
}
