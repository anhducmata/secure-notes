"use client"

import { useState, useEffect } from "react"
import { X, Shield, Key, ChevronRight, Check, AlertCircle, Lock, Server, Eye } from "lucide-react"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  user: { name: string; email: string } | null
  onPinSet: (pin: string) => void
  hasPin: boolean
  onPinRemove: () => void
}

export function SettingsModal({ isOpen, onClose, user, onPinSet, hasPin, onPinRemove }: SettingsModalProps) {
  const [view, setView] = useState<"main" | "pin" | "security">("main")
  const [pin, setPin] = useState(["", "", "", "", "", ""])
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", ""])
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create")
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setView("main")
      setPin(["", "", "", "", "", ""])
      setConfirmPin(["", "", "", "", "", ""])
      setPinStep("create")
      setError(null)
      setSuccess(null)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handlePinInput = (index: number, value: string, isConfirm: boolean = false) => {
    if (!/^\d*$/.test(value)) return

    const arr = isConfirm ? [...confirmPin] : [...pin]
    arr[index] = value.slice(-1)

    if (isConfirm) {
      setConfirmPin(arr)
    } else {
      setPin(arr)
    }

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index + 1}`)
      nextInput?.focus()
    }

    // Check if all filled
    if (arr.every((d) => d !== "")) {
      if (!isConfirm && pinStep === "create") {
        setTimeout(() => {
          setPinStep("confirm")
          setError(null)
        }, 200)
      } else if (isConfirm && pinStep === "confirm") {
        const pinStr = pin.join("")
        const confirmStr = arr.join("")
        if (pinStr === confirmStr) {
          onPinSet(pinStr)
          setSuccess("PIN set successfully!")
          setTimeout(() => {
            setView("main")
            setSuccess(null)
          }, 1500)
        } else {
          setError("PINs do not match. Try again.")
          setConfirmPin(["", "", "", "", "", ""])
          setTimeout(() => {
            document.getElementById("confirm-pin-0")?.focus()
          }, 100)
        }
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number, isConfirm: boolean = false) => {
    if (e.key === "Backspace") {
      const arr = isConfirm ? [...confirmPin] : [...pin]
      if (arr[index] === "" && index > 0) {
        const prevInput = document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index - 1}`)
        prevInput?.focus()
      }
    }
  }

  const renderPinInputs = (values: string[], isConfirm: boolean = false) => (
    <div className="flex justify-center gap-2">
      {values.map((digit, i) => (
        <input
          key={i}
          id={`${isConfirm ? "confirm-" : ""}pin-${i}`}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handlePinInput(i, e.target.value, isConfirm)}
          onKeyDown={(e) => handleKeyDown(e, i, isConfirm)}
          className="h-12 w-10 rounded-xl text-center text-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )

  // Main menu view
  const renderMain = () => (
    <>
      <div className="px-6 pt-7 pb-5 text-center">
        <h2 className="text-lg font-semibold text-white tracking-tight">Settings</h2>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          {user?.email}
        </p>
      </div>

      <div className="px-4 pb-6 space-y-2">
        {/* PIN Setting */}
        <button
          onClick={() => setView("pin")}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "rgba(234,179,8,0.15)" }}
          >
            <Key className="h-4.5 w-4.5 text-yellow-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-white">Quick Access PIN</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {hasPin ? "PIN is set (24h access)" : "Set a 6-digit PIN for quick login"}
            </p>
          </div>
          <ChevronRight className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
        </button>

        {/* Security Info */}
        <button
          onClick={() => setView("security")}
          className="w-full flex items-center gap-3 rounded-xl px-4 py-3.5 transition-colors"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "rgba(34,197,94,0.15)" }}
          >
            <Shield className="h-4.5 w-4.5 text-green-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-white">Security</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Learn how we protect your data
            </p>
          </div>
          <ChevronRight className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
        </button>
      </div>
    </>
  )

  // PIN setup view
  const renderPin = () => (
    <>
      <div className="px-6 pt-7 pb-5 text-center">
        <button
          onClick={() => {
            setView("main")
            setPin(["", "", "", "", "", ""])
            setConfirmPin(["", "", "", "", "", ""])
            setPinStep("create")
            setError(null)
          }}
          className="absolute left-4 top-4 text-xs"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Back
        </button>
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
        >
          <Key className="h-6 w-6 text-yellow-500" />
        </div>
        <h2 className="text-lg font-semibold text-white tracking-tight">
          {hasPin ? "Update PIN" : "Set Quick Access PIN"}
        </h2>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          {pinStep === "create" ? "Enter a 6-digit PIN" : "Confirm your PIN"}
        </p>
      </div>

      <div className="px-6 pb-7">
        {success ? (
          <div className="flex flex-col items-center gap-3 py-4">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-full"
              style={{ background: "rgba(34,197,94,0.15)" }}
            >
              <Check className="h-6 w-6 text-green-500" />
            </div>
            <p className="text-sm text-green-500">{success}</p>
          </div>
        ) : (
          <>
            {error && (
              <div
                className="mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "rgb(252,165,165)",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {pinStep === "create" ? renderPinInputs(pin) : renderPinInputs(confirmPin, true)}

            <p className="mt-4 text-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              This PIN allows quick access for 24 hours on this device.
            </p>

            {hasPin && (
              <button
                onClick={() => {
                  onPinRemove()
                  setView("main")
                }}
                className="mt-4 w-full text-center text-xs text-red-400"
              >
                Remove PIN
              </button>
            )}
          </>
        )}
      </div>
    </>
  )

  // Security info view
  const renderSecurity = () => (
    <>
      <div className="px-6 pt-7 pb-5 text-center">
        <button
          onClick={() => setView("main")}
          className="absolute left-4 top-4 text-xs"
          style={{ color: "rgba(255,255,255,0.5)" }}
        >
          Back
        </button>
        <div
          className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ background: "rgba(34,197,94,0.15)", border: "1px solid rgba(34,197,94,0.25)" }}
        >
          <Shield className="h-6 w-6 text-green-500" />
        </div>
        <h2 className="text-lg font-semibold text-white tracking-tight">Security</h2>
        <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          How we protect your data
        </p>
      </div>

      <div className="px-6 pb-7 space-y-4">
        {/* End-to-End Encryption */}
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(234,179,8,0.15)" }}
            >
              <Lock className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">End-to-End Encryption</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Your notes are encrypted on your device before being stored. We use AES-256-GCM encryption with keys derived from your password using PBKDF2.
              </p>
            </div>
          </div>
        </div>

        {/* Zero Knowledge */}
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(147,51,234,0.15)" }}
            >
              <Eye className="h-4 w-4 text-purple-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Zero-Knowledge Architecture</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                We never see your notes in plain text. Your password never leaves your device - only you can decrypt your notes.
              </p>
            </div>
          </div>
        </div>

        {/* Secure Storage */}
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(59,130,246,0.15)" }}
            >
              <Server className="h-4 w-4 text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Secure Cloud Storage</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                Encrypted notes are stored securely in the cloud with redundant backups. Your password is hashed using bcrypt before storage.
              </p>
            </div>
          </div>
        </div>

        {/* PIN Security */}
        <div
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: "rgba(234,179,8,0.15)" }}
            >
              <Key className="h-4 w-4 text-yellow-500" />
            </div>
            <div>
              <p className="text-sm font-medium text-white">Quick Access PIN</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                The optional PIN provides convenient access for 24 hours. It&apos;s stored locally and automatically expires for your security.
              </p>
            </div>
          </div>
        </div>

        <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
          Your privacy is our priority.
        </p>
      </div>
    </>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        backgroundColor: "rgba(0,0,0,0.55)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden max-h-[90vh] overflow-y-auto"
        style={{
          background: "rgba(28,28,30,0.82)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.06) inset",
        }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
          aria-label="Close modal"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {view === "main" && renderMain()}
        {view === "pin" && renderPin()}
        {view === "security" && renderSecurity()}
      </div>
    </div>
  )
}
