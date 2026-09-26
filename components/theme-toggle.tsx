"use client"

import { useState, useEffect } from "react"
import { useTheme } from "next-themes"
import { Sun, Moon, Monitor } from "lucide-react"

interface ThemeToggleProps {
  className?: string
  size?: "sm" | "md"
}

export function ThemeToggle({ className = "", size = "md" }: ThemeToggleProps) {
  const { resolvedTheme, setTheme, theme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return (
      <div
        className={`rounded-lg p-2 text-transparent select-none pointer-events-none ${
          size === "sm" ? "h-8 w-8" : "h-9 w-9"
        } ${className}`}
        aria-hidden="true"
      />
    )
  }

  const isDark = resolvedTheme === "dark"

  const toggleTheme = () => {
    setTheme(isDark ? "light" : "dark")
  }

  return (
    <button
      onClick={toggleTheme}
      type="button"
      className={`relative inline-flex items-center justify-center rounded-lg text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-500 ${
        size === "sm" ? "h-8 w-8 p-1.5" : "h-9 w-9 p-2"
      } ${className}`}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? (
        <Sun className="h-4 w-4 transition-transform duration-200 rotate-0 scale-100 text-amber-400" />
      ) : (
        <Moon className="h-4 w-4 transition-transform duration-200 rotate-0 scale-100 text-zinc-600" />
      )}
    </button>
  )
}

export function ThemeSegmented({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) {
    return <div className={`h-8 w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 animate-pulse ${className}`} />
  }

  const options: { id: "light" | "system" | "dark"; label: string; icon: typeof Sun }[] = [
    { id: "light", label: "Light", icon: Sun },
    { id: "system", label: "Auto", icon: Monitor },
    { id: "dark", label: "Dark", icon: Moon },
  ]

  return (
    <div
      className={`inline-flex w-full items-center rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800/80 ${className}`}
      role="radiogroup"
      aria-label="Theme mode"
    >
      {options.map((opt) => {
        const Icon = opt.icon
        const isActive = theme === opt.id

        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => setTheme(opt.id)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-1.5 text-xs font-medium transition-all ${
              isActive
                ? "bg-white text-zinc-900 shadow-xs dark:bg-zinc-700 dark:text-white"
                : "text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{opt.label}</span>
          </button>
        )
      })}
    </div>
  )
}
