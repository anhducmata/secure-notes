"use client"

import { useState } from "react"
import { X, Mail, Lock, User, Eye, EyeOff, CheckCircle } from "lucide-react"

type Tab = "signin" | "signup"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSignIn: (user: { name: string; email: string }) => void
}

export function AuthModal({ isOpen, onClose, onSignIn }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("signin")
  const [showPassword, setShowPassword] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("")
  const [signInPassword, setSignInPassword] = useState("")

  // Sign Up state
  const [signUpName, setSignUpName] = useState("")
  const [signUpEmail, setSignUpEmail] = useState("")
  const [signUpPassword, setSignUpPassword] = useState("")

  if (!isOpen) return null

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Simulate auth
    await new Promise((r) => setTimeout(r, 900))
    setIsLoading(false)
    const name = signInEmail.split("@")[0]
    onSignIn({ name: name.charAt(0).toUpperCase() + name.slice(1), email: signInEmail })
    onClose()
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    await new Promise((r) => setTimeout(r, 900))
    setIsLoading(false)
    setEmailSent(true)
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", backgroundColor: "rgba(0,0,0,0.55)" }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Authentication"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: "rgba(28,28,30,0.82)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.06) inset",
        }}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors"
          style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
          aria-label="Close modal"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                stroke="rgb(234,179,8)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h2 className="text-lg font-semibold text-white tracking-tight">Notes</h2>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            Sign in to sync your notes across devices
          </p>
        </div>

        {/* Tab switcher */}
        <div className="mx-6 mb-5 flex rounded-xl p-1" style={{ background: "rgba(255,255,255,0.06)" }}>
          {(["signin", "signup"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setEmailSent(false) }}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-all"
              style={{
                background: tab === t ? "rgba(255,255,255,0.12)" : "transparent",
                color: tab === t ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.4)",
                boxShadow: tab === t ? "0 1px 4px rgba(0,0,0,0.3)" : "none",
              }}
            >
              {t === "signin" ? "Sign In" : "Sign Up"}
            </button>
          ))}
        </div>

        {/* Form area */}
        <div className="px-6 pb-7">
          {tab === "signin" ? (
            <form onSubmit={handleSignIn} className="flex flex-col gap-3">
              <InputField
                type="email"
                placeholder="Email"
                value={signInEmail}
                onChange={setSignInEmail}
                icon={<Mail className="h-4 w-4" />}
                required
              />
              <InputField
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={signInPassword}
                onChange={setSignInPassword}
                icon={<Lock className="h-4 w-4" />}
                required
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{ color: "rgba(255,255,255,0.35)" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <button
                type="button"
                className="text-right text-xs"
                style={{ color: "rgba(234,179,8,0.8)" }}
              >
                Forgot password?
              </button>
              <SubmitButton label="Sign In" isLoading={isLoading} />
            </form>
          ) : emailSent ? (
            <EmailConfirmation email={signUpEmail} onBack={() => setEmailSent(false)} />
          ) : (
            <form onSubmit={handleSignUp} className="flex flex-col gap-3">
              <InputField
                type="text"
                placeholder="Full name"
                value={signUpName}
                onChange={setSignUpName}
                icon={<User className="h-4 w-4" />}
                required
              />
              <InputField
                type="email"
                placeholder="Email"
                value={signUpEmail}
                onChange={setSignUpEmail}
                icon={<Mail className="h-4 w-4" />}
                required
              />
              <InputField
                type={showPassword ? "text" : "password"}
                placeholder="Password"
                value={signUpPassword}
                onChange={setSignUpPassword}
                icon={<Lock className="h-4 w-4" />}
                required
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    style={{ color: "rgba(255,255,255,0.35)" }}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <SubmitButton label="Create Account" isLoading={isLoading} />
              <p className="text-center text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.3)" }}>
                By creating an account, you agree to our{" "}
                <span style={{ color: "rgba(234,179,8,0.7)" }}>Terms of Service</span> and{" "}
                <span style={{ color: "rgba(234,179,8,0.7)" }}>Privacy Policy</span>.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function InputField({
  type,
  placeholder,
  value,
  onChange,
  icon,
  required,
  suffix,
}: {
  type: string
  placeholder: string
  value: string
  onChange: (v: string) => void
  icon: React.ReactNode
  required?: boolean
  suffix?: React.ReactNode
}) {
  return (
    <div
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 transition-all"
      style={{
        background: "rgba(255,255,255,0.07)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span style={{ color: "rgba(255,255,255,0.3)" }}>{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 bg-transparent text-sm text-white placeholder-opacity-0 focus:outline-none"
        style={{ color: "rgba(255,255,255,0.9)" }}
        placeholder-style={{ color: "rgba(255,255,255,0.3)" }}
      />
      {suffix}
    </div>
  )
}

function SubmitButton({ label, isLoading }: { label: string; isLoading: boolean }) {
  return (
    <button
      type="submit"
      disabled={isLoading}
      className="mt-1 w-full rounded-xl py-3 text-sm font-semibold tracking-wide transition-all active:scale-[0.98]"
      style={{
        background: isLoading
          ? "rgba(234,179,8,0.5)"
          : "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(202,138,4) 100%)",
        color: "rgb(0,0,0)",
        boxShadow: isLoading ? "none" : "0 4px 16px rgba(234,179,8,0.3)",
      }}
    >
      {isLoading ? (
        <span className="flex items-center justify-center gap-2">
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Processing...
        </span>
      ) : (
        label
      )}
    </button>
  )
}

function EmailConfirmation({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full"
        style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.2)" }}
      >
        <CheckCircle className="h-7 w-7" style={{ color: "rgb(234,179,8)" }} />
      </div>
      <div>
        <p className="text-sm font-semibold text-white">Check your email</p>
        <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.4)" }}>
          We sent a confirmation link to
          <br />
          <span className="font-medium" style={{ color: "rgba(255,255,255,0.7)" }}>
            {email}
          </span>
        </p>
      </div>
      <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
        Didn&apos;t receive it?{" "}
        <button type="button" style={{ color: "rgba(234,179,8,0.8)" }}>
          Resend email
        </button>
      </p>
      <button
        onClick={onBack}
        type="button"
        className="text-xs"
        style={{ color: "rgba(255,255,255,0.3)" }}
      >
        Back to sign up
      </button>
    </div>
  )
}
