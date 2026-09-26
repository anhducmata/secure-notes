import type { Metadata, Viewport } from "next"
import { ThemeProvider } from "@/components/theme-provider"
import "./globals.css"

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export const metadata: Metadata = {
  title: "Notes",
  description: "Apple Notes Clone",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Notes",
  },
  icons: {
    icon: "/favicon.svg",
  },
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="font-sans overscroll-none bg-white text-zinc-900 dark:bg-black dark:text-white transition-colors duration-150">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange={false}>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
