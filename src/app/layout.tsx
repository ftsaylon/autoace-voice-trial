import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import { ConvexAuthNextjsServerProvider } from "@convex-dev/auth/nextjs/server"
import { ClientProviders } from "@/components/providers"
import "./globals.css"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export const metadata: Metadata = {
  title: "AutoAce",
  description: "Operator dashboard for emotional tone and background noise on production calls.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <ConvexAuthNextjsServerProvider>
      <html
        lang="en"
        suppressHydrationWarning
        className={`${geistSans.variable} ${geistMono.variable} h-svh`}
      >
        <body className="h-svh overflow-hidden">
          <ClientProviders>{children}</ClientProviders>
        </body>
      </html>
    </ConvexAuthNextjsServerProvider>
  )
}
