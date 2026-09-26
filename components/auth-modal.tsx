"use client"

import { useState } from "react"
import Link from "next/link"
import { X, Mail, Lock, User, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"

type Tab = "signin" | "signup" | "forgot"

interface AuthModalProps {
  isOpen: boolean
  onClose: () => void
  onSignIn: (user: { name: string; email: string; encryptionKey: string }) => void
}

export function AuthModal({ isOpen, onClose, onSignIn }: AuthModalProps) {
  const [tab, setTab] = useState<Tab>("signin")
  const [showPassword, setShowPassword] = useState(false)
  const [emailSent, setEmailSent] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Sign In state
  const [signInEmail, setSignInEmail] = useState("")
  const [signInPassword, setSignInPassword] = useState("")

  // Sign Up state
  const [signUpName, setSignUpName] = useState("")
  const [signUpEmail, setSignUpEmail] = useState("")
  const [signUpPassword, setSignUpPassword] = useState("")

  // Forgot Password state
  const [forgotEmail, setForgotEmail] = useState("")
  const [resetEmailSent, setResetEmailSent] = useState(false)

  if (!isOpen) return null

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signInEmail, password: signInPassword }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to sign in")
        setIsLoading(false)
        return
      }

      // Pass password as encryption key (used for client-side note encryption)
      onSignIn({ name: data.user.name, email: data.user.email, encryptionKey: signInPassword })
      onClose()
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    if (signUpPassword.length < 6) {
      setError("Password must be at least 6 characters")
      setIsLoading(false)
      return
    }

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signUpEmail,
          password: signUpPassword,
          name: signUpName,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to create account")
        setIsLoading(false)
        return
      }

      setEmailSent(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: forgotEmail }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to send reset email")
        setIsLoading(false)
        return
      }

      setResetEmailSent(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendEmail = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: signUpEmail,
          password: signUpPassword,
          name: signUpName,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        // If user exists, they may have already verified
        if (data.error?.includes("already exists")) {
          setError("This email is already registered. Try signing in.")
        }
      }
    } catch {
      setError("Failed to resend email")
    } finally {
      setIsLoading(false)
    }
  }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const switchTab = (t: Tab) => {
    setTab(t)
    setEmailSent(false)
    setResetEmailSent(false)
    setError(null)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Authentication"
    >
      <div
        data-popover-container
        className="relative w-full max-w-sm rounded-2xl overflow-hidden bg-white/95 text-zinc-900 border border-zinc-200 shadow-2xl backdrop-blur-3xl dark:bg-zinc-900 dark:text-white dark:border-zinc-800 dark:shadow-[0_32px_64px_rgba(0,0,0,0.7)]"
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 z-10 flex h-7 w-7 items-center justify-center rounded-full transition-colors bg-zinc-100 hover:bg-zinc-200 text-zinc-500 hover:text-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/60 dark:hover:text-white"
          aria-label="Close modal"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {/* Header */}
        <div className="px-6 pt-7 pb-5 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-yellow-500"
          >
            {tab === "forgot" ? (
              <Mail className="h-5 w-5" />
            ) : (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white tracking-tight">
            {tab === "forgot" ? "Reset Password" : "Notes"}
          </h2>
          <p className="mt-1 text-xs text-zinc-500 dark:text-white/50">
            {tab === "forgot" 
              ? "Enter your email to receive a reset link" 
              : "Sign in to sync your notes across devices"}
          </p>
        </div>

        {/* Tab switcher - hide when in forgot password mode */}
        {tab !== "forgot" && (
          <div className="mx-6 mb-5 flex rounded-xl p-1 bg-zinc-100 border border-zinc-200/60 dark:bg-white/10 dark:border-transparent">
            {(["signin", "signup"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => switchTab(t)}
                className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${
                  tab === t
                    ? "bg-white text-zinc-950 shadow-sm border border-zinc-200/80 dark:bg-white/20 dark:text-white dark:border-transparent"
                    : "text-zinc-600 hover:text-zinc-950 dark:text-white/50 dark:hover:text-white"
                }`}
              >
                {t === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div
            className="mx-6 mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form area */}
        <div className="px-6 pb-7">
          {tab === "forgot" ? (
            resetEmailSent ? (
              <ResetEmailConfirmation 
                email={forgotEmail} 
                onBack={() => switchTab("signin")} 
              />
            ) : (
              <form onSubmit={handleForgotPassword} className="flex flex-col gap-3">
                <InputField
                  type="email"
                  placeholder="Email"
                  value={forgotEmail}
                  onChange={setForgotEmail}
                  icon={<Mail className="h-4 w-4" />}
                  required
                />
                <SubmitButton label="Send Reset Link" isLoading={isLoading} />
                <button
                  type="button"
                  onClick={() => switchTab("signin")}
                  className="text-xs mt-1 text-zinc-500 hover:text-zinc-800 dark:text-white/50 dark:hover:text-white"
                >
                  Back to Sign In
                </button>
              </form>
            )
          ) : tab === "signin" ? (
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
                    className="text-zinc-400 hover:text-zinc-700 dark:text-white/35 dark:hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <button
                type="button"
                onClick={() => switchTab("forgot")}
                className="text-right text-xs text-amber-700 hover:text-amber-800 dark:text-yellow-400 dark:hover:text-yellow-300 font-medium"
              >
                Forgot password?
              </button>
              <SubmitButton label="Sign In" isLoading={isLoading} />
            </form>
          ) : emailSent ? (
            <EmailConfirmation email={signUpEmail} onBack={() => setEmailSent(false)} onResend={handleResendEmail} isLoading={isLoading} />
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
                placeholder="Password (min 6 characters)"
                value={signUpPassword}
                onChange={setSignUpPassword}
                icon={<Lock className="h-4 w-4" />}
                required
                suffix={
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="text-zinc-400 hover:text-zinc-700 dark:text-white/35 dark:hover:text-white"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />
              <SubmitButton label="Create Account" isLoading={isLoading} />
              <p className="text-center text-xs leading-relaxed text-zinc-500 dark:text-white/40">
                By creating an account, you agree to our{" "}
                <Link href="/terms" target="_blank" className="hover:underline text-amber-700 dark:text-yellow-400 font-medium">Terms of Service</Link> and{" "}
                <Link href="/privacy" target="_blank" className="hover:underline text-amber-700 dark:text-yellow-400 font-medium">Privacy Policy</Link>.
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
      className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 transition-all bg-zinc-50 border border-zinc-200 focus-within:border-amber-500 focus-within:bg-white focus-within:ring-1 focus-within:ring-amber-500 dark:bg-white/5 dark:border-white/10 dark:focus-within:bg-white/10 dark:focus-within:border-yellow-500/50"
    >
      <span className="text-zinc-400 dark:text-white/30">{icon}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="flex-1 bg-transparent text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none dark:text-white dark:placeholder-white/30"
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
      className="mt-1 w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-400 text-black shadow-md hover:shadow-lg disabled:opacity-50 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black dark:shadow-[0_4px_16px_rgba(234,179,8,0.3)] cursor-pointer"
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

function EmailConfirmation({ email, onBack, onResend, isLoading }: { email: string; onBack: () => void; onResend: () => void; isLoading: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-yellow-500"
      >
        <CheckCircle className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Check your email</p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-white/40">
          We sent a confirmation link to
          <br />
          <span className="font-medium text-zinc-800 dark:text-white/70">
            {email}
          </span>
        </p>
      </div>
      <p className="text-xs text-zinc-400 dark:text-white/30">
        Didn&apos;t receive it?{" "}
        <button type="button" onClick={onResend} disabled={isLoading} className="text-amber-600 hover:underline dark:text-yellow-400">
          {isLoading ? "Sending..." : "Resend email"}
        </button>
      </p>
      <button
        onClick={onBack}
        type="button"
        className="text-xs text-zinc-500 hover:text-zinc-800 dark:text-white/40 dark:hover:text-white"
      >
        Back to sign up
      </button>
    </div>
  )
}

function ResetEmailConfirmation({ email, onBack }: { email: string; onBack: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-2 text-center">
      <div
        className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-yellow-500"
      >
        <CheckCircle className="h-7 w-7" />
      </div>
      <div>
        <p className="text-sm font-semibold text-zinc-900 dark:text-white">Check your email</p>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-500 dark:text-white/40">
          If an account exists for
          <br />
          <span className="font-medium text-zinc-800 dark:text-white/70">
            {email}
          </span>
          <br />
          you will receive a password reset link.
        </p>
      </div>
      <p className="text-xs text-zinc-400 dark:text-white/30">
        Link expires in 1 hour
      </p>
      <button
        onClick={onBack}
        type="button"
        className="text-xs text-amber-600 hover:underline dark:text-yellow-400"
      >
        Back to Sign In
      </button>
    </div>
  )
}
