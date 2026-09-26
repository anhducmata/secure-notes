"use client"

import { useState, useRef, useEffect } from "react"
import { LogOut, Settings } from "lucide-react"
import { ThemeSegmented } from "@/components/theme-toggle"

interface AvatarButtonProps {
  user: { name: string; email: string } | null
  onClick: () => void
  onSignOut: () => void
  onOpenSettings?: () => void
}

export function AvatarButton({ user, onClick, onSignOut, onOpenSettings }: AvatarButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [])

  const initials = user
    ? user.name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2)
    : null

  const handleClick = () => {
    if (user) {
      setMenuOpen((v) => !v)
    } else {
      onClick()
    }
  }

  return (
    <div ref={menuRef} className="relative">
      {/* Popover menu (logged in) */}
      {menuOpen && user && (
        <div
          data-popover-container
          className="absolute bottom-14 left-0 z-50 w-60 rounded-2xl overflow-hidden bg-white text-zinc-900 border border-zinc-200 shadow-xl backdrop-blur-2xl dark:bg-zinc-900 dark:text-white dark:border-zinc-800 dark:shadow-2xl animate-[fadeSlideUp_0.15s_ease-out]"
          role="menu"
          aria-label="User menu"
        >
          {/* User info */}
          <div className="px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-sm font-semibold truncate text-zinc-900 dark:text-white">{user.name}</p>
            <p className="text-xs truncate mt-0.5 text-zinc-500 dark:text-zinc-400">
              {user.email}
            </p>
          </div>

          {/* Theme switcher */}
          <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
            <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500 px-2 mb-1.5 uppercase tracking-wider">Appearance</p>
            <ThemeSegmented />
          </div>

          {/* Menu items */}
          <div className="p-1.5 space-y-0.5">
            {onOpenSettings && (
              <button
                onClick={() => { setMenuOpen(false); onOpenSettings() }}
                className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
                role="menuitem"
              >
                <Settings className="h-4 w-4 opacity-75 text-amber-500 dark:text-yellow-400" />
                Settings
              </button>
            )}
            <button
              onClick={() => { setMenuOpen(false); onSignOut() }}
              data-hover-danger
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-colors text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-500/15"
              role="menuitem"
            >
              <LogOut className="h-4 w-4 opacity-75" />
              Sign Out
            </button>
          </div>
        </div>
      )}

      {/* Avatar button */}
      <button
        onClick={handleClick}
        aria-label={user ? "Open user menu" : "Sign in"}
        aria-haspopup={user ? "menu" : undefined}
        aria-expanded={user ? menuOpen : undefined}
        className={`relative flex items-center justify-center rounded-full transition-all active:scale-95 ${
          user
            ? "shadow-sm hover:opacity-95"
            : "bg-zinc-100 hover:bg-zinc-200 border border-zinc-300/80 text-zinc-600 shadow-sm dark:bg-white/10 dark:hover:bg-white/15 dark:border-white/10 dark:text-white/70"
        }`}
        style={{
          width: 40,
          height: 40,
          ...(user
            ? {
                background: "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(180,130,4) 100%)",
                border: "2px solid rgba(234,179,8,0.4)",
                boxShadow: "0 0 0 3px rgba(234,179,8,0.12), 0 4px 12px rgba(0,0,0,0.15)",
              }
            : {}),
        }}
      >
        {user ? (
          <span className="text-xs font-bold text-black">
            {initials}
          </span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Online indicator (logged in) */}
        {user && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white dark:border-black"
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  )
}
