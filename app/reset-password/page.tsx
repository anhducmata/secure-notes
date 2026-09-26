"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"
import { ThemeToggle } from "@/components/theme-toggle"

function ResetPasswordContent() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const token = searchParams.get("token")

  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError("Password must be at least 6 characters")
      return
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match")
      return
    }

    setIsLoading(true)

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || "Failed to reset password")
        setIsLoading(false)
        return
      }

      setSuccess(true)
    } catch {
      setError("Something went wrong. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-[#fafafb] dark:bg-black flex items-center justify-center p-4 transition-colors duration-200">
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center bg-white/90 dark:bg-[#1c1c1e]/82 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-xl dark:shadow-[0_32px_64px_rgba(0,0,0,0.7)]"
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 border border-red-500/20 text-red-500"
          >
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Invalid Link</h1>
          <p className="text-sm text-zinc-500 dark:text-gray-400 mb-6">
            This password reset link is invalid or has expired.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-all bg-zinc-100 hover:bg-zinc-200 text-zinc-800 dark:bg-white/10 dark:hover:bg-white/15 dark:text-white/80"
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#fafafb] dark:bg-black flex items-center justify-center p-4 transition-colors duration-200">
        <div className="fixed top-4 right-4">
          <ThemeToggle />
        </div>
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center bg-white/90 dark:bg-[#1c1c1e]/82 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-xl dark:shadow-[0_32px_64px_rgba(0,0,0,0.7)]"
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10 border border-amber-500/20 dark:bg-yellow-500/12 dark:border-yellow-500/20"
          >
            <CheckCircle className="h-7 w-7 text-amber-600 dark:text-yellow-500" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white mb-2">Password Reset</h1>
          <p className="text-sm text-zinc-500 dark:text-gray-400 mb-6">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-400 text-black shadow-md hover:shadow-lg dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black dark:shadow-[0_4px_16px_rgba(234,179,8,0.3)] cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafb] dark:bg-black flex items-center justify-center p-4 transition-colors duration-200">
      <div className="fixed top-4 right-4">
        <ThemeToggle />
      </div>
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden bg-white/90 dark:bg-[#1c1c1e]/82 backdrop-blur-xl border border-zinc-200 dark:border-white/10 shadow-xl dark:shadow-[0_32px_64px_rgba(0,0,0,0.7)]"
      >
        <div className="px-6 pt-8 pb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/10 border border-amber-500/20 dark:bg-yellow-500/15 dark:border-yellow-500/25"
          >
            <Lock className="h-6 w-6 text-amber-600 dark:text-yellow-500" />
          </div>
          <h1 className="text-lg font-semibold text-zinc-900 dark:text-white tracking-tight">Reset Password</h1>
          <p className="mt-1 text-xs text-zinc-500 dark:text-white/40">
            Enter your new password below
          </p>
        </div>

        {error && (
          <div
            className="mx-6 mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs bg-red-500/10 border border-red-500/20 text-red-600 dark:bg-red-500/15 dark:border-red-500/25 dark:text-red-300"
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 pb-8 flex flex-col gap-3">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 bg-zinc-100/90 dark:bg-white/[0.07] border border-zinc-200 dark:border-white/[0.08]"
          >
            <Lock className="h-4 w-4 text-zinc-400 dark:text-white/30" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="text-zinc-400 hover:text-zinc-600 dark:text-white/35 dark:hover:text-white/60 transition-colors"
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-3 bg-zinc-100/90 dark:bg-white/[0.07] border border-zinc-200 dark:border-white/[0.08]"
          >
            <Lock className="h-4 w-4 text-zinc-400 dark:text-white/30" />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full rounded-xl py-3 text-sm font-bold tracking-wide transition-all active:scale-[0.98] bg-amber-500 hover:bg-amber-400 text-black shadow-md hover:shadow-lg disabled:opacity-50 dark:bg-yellow-500 dark:hover:bg-yellow-400 dark:text-black dark:shadow-[0_4px_16px_rgba(234,179,8,0.3)] cursor-pointer"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Resetting...
              </span>
            ) : (
              "Reset Password"
            )}
          </button>

          <button
            type="button"
            onClick={() => router.push("/")}
            className="text-xs mt-2 text-zinc-500 hover:text-zinc-800 dark:text-white/40 dark:hover:text-white/70 transition-colors"
          >
            Back to Sign In
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#fafafb] dark:bg-black flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber-600 dark:border-yellow-500 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
