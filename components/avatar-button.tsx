"use client"

import { useState, useRef, useEffect } from "react"
import { LogOut, User } from "lucide-react"

interface AvatarButtonProps {
  user: { name: string; email: string } | null
  onClick: () => void
  onSignOut: () => void
}

export function AvatarButton({ user, onClick, onSignOut }: AvatarButtonProps) {
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
          className="absolute bottom-14 left-0 w-52 rounded-2xl overflow-hidden"
          style={{
            background: "rgba(28,28,30,0.88)",
            backdropFilter: "blur(32px)",
            WebkitBackdropFilter: "blur(32px)",
            border: "1px solid rgba(255,255,255,0.10)",
            boxShadow: "0 16px 40px rgba(0,0,0,0.65), 0 0 0 0.5px rgba(255,255,255,0.06) inset",
            animation: "fadeSlideUp 0.15s ease-out",
          }}
          role="menu"
          aria-label="User menu"
        >
          {/* User info */}
          <div className="px-4 py-3.5" style={{ borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
            <p className="text-sm font-medium text-white truncate">{user.name}</p>
            <p className="text-xs truncate mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
              {user.email}
            </p>
          </div>

          {/* Menu items */}
          <div className="p-1.5">
            <button
              onClick={() => { setMenuOpen(false); onClick() }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors"
              style={{ color: "rgba(255,255,255,0.75)" }}
              role="menuitem"
            >
              <User className="h-4 w-4" style={{ color: "rgba(255,255,255,0.4)" }} />
              Profile
            </button>
            <button
              onClick={() => { setMenuOpen(false); onSignOut() }}
              className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm transition-colors"
              style={{ color: "rgba(239,68,68,0.85)" }}
              role="menuitem"
            >
              <LogOut className="h-4 w-4" style={{ color: "rgba(239,68,68,0.6)" }} />
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
        className="relative flex items-center justify-center rounded-full transition-transform active:scale-95"
        style={{
          width: 40,
          height: 40,
          background: user
            ? "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(180,130,4) 100%)"
            : "rgba(255,255,255,0.10)",
          border: user
            ? "2px solid rgba(234,179,8,0.4)"
            : "1.5px solid rgba(255,255,255,0.12)",
          boxShadow: user
            ? "0 0 0 3px rgba(234,179,8,0.12), 0 4px 16px rgba(0,0,0,0.5)"
            : "0 4px 12px rgba(0,0,0,0.4)",
        }}
      >
        {user ? (
          <span className="text-xs font-bold" style={{ color: "#000" }}>
            {initials}
          </span>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
              stroke="rgba(255,255,255,0.6)"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}

        {/* Online indicator (logged in) */}
        {user && (
          <span
            className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full"
            style={{
              background: "rgb(34,197,94)",
              border: "2px solid rgb(0,0,0)",
            }}
            aria-hidden="true"
          />
        )}
      </button>
    </div>
  )
}
