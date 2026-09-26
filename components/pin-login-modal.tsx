"use client"

import { useState, useEffect } from "react"
import { Key, AlertCircle, X } from "lucide-react"

interface PinLoginModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: (encryptionKey: string) => void
  onSwitchToPassword: () => void
  userName: string
}

export function PinLoginModal({ isOpen, onClose, onSuccess, onSwitchToPassword, userName }: PinLoginModalProps) {
  const [pin, setPin] = useState(["", "", "", "", "", ""])
  const [error, setError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)

  useEffect(() => {
    if (isOpen) {
      setPin(["", "", "", "", "", ""])
      setError(null)
      setTimeout(() => {
        document.getElementById("quick-pin-0")?.focus()
      }, 100)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handlePinInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return

    const arr = [...pin]
    arr[index] = value.slice(-1)
    setPin(arr)
    setError(null)

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`quick-pin-${index + 1}`)
      nextInput?.focus()
    }

    // Check if all filled
    if (arr.every((d) => d !== "")) {
      const enteredPin = arr.join("")
      verifyPin(enteredPin)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "Backspace") {
      if (pin[index] === "" && index > 0) {
        const prevInput = document.getElementById(`quick-pin-${index - 1}`)
        prevInput?.focus()
      }
    }
  }

  const verifyPin = (enteredPin: string) => {
    const stored = localStorage.getItem("notes_pin_data")
    if (!stored) {
      setError("PIN not found. Please sign in with password.")
      return
    }

    try {
      const data = JSON.parse(stored)
      
      // Check expiry
      if (Date.now() > data.expiresAt) {
        localStorage.removeItem("notes_pin_data")
        setError("PIN expired. Please sign in with password.")
        return
      }

      // Verify PIN hash
      const pinHash = hashPin(enteredPin, data.salt)
      if (pinHash !== data.pinHash) {
        const newAttempts = attempts + 1
        setAttempts(newAttempts)
        
        if (newAttempts >= 3) {
          localStorage.removeItem("notes_pin_data")
          setError("Too many attempts. PIN removed.")
          setTimeout(() => onSwitchToPassword(), 2000)
          return
        }
        
        setError(`Incorrect PIN. ${3 - newAttempts} attempts remaining.`)
        setPin(["", "", "", "", "", ""])
        setTimeout(() => {
          document.getElementById("quick-pin-0")?.focus()
        }, 100)
        return
      }

      // Success - decrypt and return the encryption key
      const encryptionKey = decryptKey(data.encryptedKey, enteredPin)
      onSuccess(encryptionKey)
    } catch {
      setError("Invalid PIN data. Please sign in with password.")
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Quick PIN Login"
    >
      <div
        data-popover-container
        className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-white/95 text-zinc-900 border border-zinc-200 shadow-2xl backdrop-blur-3xl dark:bg-zinc-900 dark:text-white dark:border-zinc-800 dark:shadow-[0_32px_64px_rgba(0,0,0,0.7)]"
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/60 dark:hover:text-white"
          aria-label="Close"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="px-6 pt-7 pb-5 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-yellow-500"
          >
            <Key className="h-6 w-6" />
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">Welcome back</h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-white/40">
            {userName}
          </p>
        </div>

        <div className="px-6 pb-7">
          {error && (
            <div
              className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300"
            >
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <p className="text-center text-sm font-medium text-zinc-800 dark:text-white mb-4">Enter your PIN</p>

          <div className="flex justify-center gap-2">
            {pin.map((digit, i) => (
              <input
                key={i}
                id={`quick-pin-${i}`}
                type="password"
                inputMode="numeric"
                maxLength={1}
                value={digit}
                onChange={(e) => handlePinInput(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, i)}
                className="h-12 w-10 rounded-xl text-center text-xl font-semibold bg-zinc-50 border border-zinc-200 text-zinc-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500 dark:bg-white/10 dark:border-white/10 dark:text-white dark:focus:ring-yellow-500"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                data-form-type="other"
                data-lpignore="true"
                data-1p-ignore="true"
              />
            ))}
          </div>

          <button
            onClick={onSwitchToPassword}
            className="mt-6 w-full text-center text-xs text-amber-600 hover:text-amber-700 dark:text-yellow-400/80 dark:hover:text-yellow-300"
          >
            Use password instead
          </button>
        </div>
      </div>
    </div>
  )
}

// Utility functions for PIN encryption
function hashPin(pin: string, salt: string): string {
  // Simple hash for PIN verification (not for security-critical operations)
  let hash = 0
  const str = pin + salt
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash
  }
  return hash.toString(36)
}

function decryptKey(encryptedKey: string, pin: string): string {
  // XOR-based decryption with PIN
  const keyBytes = atob(encryptedKey)
  let result = ""
  for (let i = 0; i < keyBytes.length; i++) {
    result += String.fromCharCode(keyBytes.charCodeAt(i) ^ pin.charCodeAt(i % pin.length))
  }
  return result
}

// Export utilities for use in other components
export function generateSalt(): string {
  return Math.random().toString(36).substring(2, 15)
}

export function encryptKeyWithPin(key: string, pin: string): string {
  // XOR-based encryption with PIN
  let result = ""
  for (let i = 0; i < key.length; i++) {
    result += String.fromCharCode(key.charCodeAt(i) ^ pin.charCodeAt(i % pin.length))
  }
  return btoa(result)
}

export function createPinHash(pin: string, salt: string): string {
  return hashPin(pin, salt)
}

export function storePinData(pin: string, encryptionKey: string, email: string): void {
  const salt = generateSalt()
  const pinHash = createPinHash(pin, salt)
  const encryptedKey = encryptKeyWithPin(encryptionKey, pin)
  
  const data = {
    email,
    pinHash,
    salt,
    encryptedKey,
    expiresAt: Date.now() + 12 * 60 * 60 * 1000, // 12 hours
  }
  
  localStorage.setItem("notes_pin_data", JSON.stringify(data))
}

export function getPinData(): { email: string; expiresAt: number } | null {
  const stored = localStorage.getItem("notes_pin_data")
  if (!stored) return null
  
  try {
    const data = JSON.parse(stored)
    if (Date.now() > data.expiresAt) {
      localStorage.removeItem("notes_pin_data")
      return null
    }
    return { email: data.email, expiresAt: data.expiresAt }
  } catch {
    return null
  }
}

export function removePinData(): void {
  localStorage.removeItem("notes_pin_data")
}
