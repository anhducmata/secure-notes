"use client"

import { useState, Suspense } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle } from "lucide-react"

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
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{
            background: "rgba(28,28,30,0.82)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.2)" }}
          >
            <AlertCircle className="h-7 w-7 text-red-400" />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Invalid Link</h1>
          <p className="text-sm text-gray-400 mb-6">
            This password reset link is invalid or has expired.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-all"
            style={{
              background: "rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.8)",
            }}
          >
            Go to Home
          </button>
        </div>
      </div>
    )
  }

  if (success) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center p-4">
        <div
          className="w-full max-w-sm rounded-2xl p-8 text-center"
          style={{
            background: "rgba(28,28,30,0.82)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <div
            className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full"
            style={{ background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.2)" }}
          >
            <CheckCircle className="h-7 w-7" style={{ color: "rgb(234,179,8)" }} />
          </div>
          <h1 className="text-lg font-semibold text-white mb-2">Password Reset</h1>
          <p className="text-sm text-gray-400 mb-6">
            Your password has been successfully reset. You can now sign in with your new password.
          </p>
          <button
            onClick={() => router.push("/")}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-all"
            style={{
              background: "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(202,138,4) 100%)",
              color: "rgb(0,0,0)",
              boxShadow: "0 4px 16px rgba(234,179,8,0.3)",
            }}
          >
            Sign In
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black flex items-center justify-center p-4">
      <div
        className="w-full max-w-sm rounded-2xl overflow-hidden"
        style={{
          background: "rgba(28,28,30,0.82)",
          backdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7)",
        }}
      >
        <div className="px-6 pt-8 pb-6 text-center">
          <div
            className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl"
            style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
          >
            <Lock className="h-6 w-6" style={{ color: "rgb(234,179,8)" }} />
          </div>
          <h1 className="text-lg font-semibold text-white tracking-tight">Reset Password</h1>
          <p className="mt-1 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
            Enter your new password below
          </p>
        </div>

        {error && (
          <div
            className="mx-6 mb-4 flex items-center gap-2 rounded-lg px-3 py-2.5 text-xs"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)", color: "rgb(252,165,165)" }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="px-6 pb-8 flex flex-col gap-3">
          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Lock className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="New password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="flex-1 bg-transparent text-sm text-white focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div
            className="flex items-center gap-2.5 rounded-xl px-3.5 py-3"
            style={{
              background: "rgba(255,255,255,0.07)",
              border: "1px solid rgba(255,255,255,0.08)",
            }}
          >
            <Lock className="h-4 w-4" style={{ color: "rgba(255,255,255,0.3)" }} />
            <input
              type={showPassword ? "text" : "password"}
              placeholder="Confirm password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              className="flex-1 bg-transparent text-sm text-white focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="mt-2 w-full rounded-xl py-3 text-sm font-semibold tracking-wide transition-all active:scale-[0.98]"
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
            className="text-xs mt-2"
            style={{ color: "rgba(255,255,255,0.4)" }}
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
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-yellow-500 border-t-transparent" />
      </div>
    }>
      <ResetPasswordContent />
    </Suspense>
  )
}
