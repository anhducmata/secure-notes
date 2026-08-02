import { useState } from 'react'
import { signUpWithUsername, signInWithUsername } from './authService'
import { User, Lock, Sparkles, AlertCircle, X, ArrowRight } from 'lucide-react'

interface AuthModalProps {
  onSuccess: (user: any) => void
  onClose?: () => void
}

export function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!username.trim()) {
      setError('Please enter your Username.')
      return
    }
    if (!password || password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)
    try {
      if (mode === 'signup') {
        const { user, error: signUpErr } = await signUpWithUsername(username, password)
        if (signUpErr) {
          setError(signUpErr)
        } else if (user) {
          onSuccess(user)
        }
      } else {
        const { user, error: signInErr } = await signInWithUsername(username, password)
        if (signInErr) {
          setError(signInErr)
        } else if (user) {
          onSuccess(user)
        }
      }
    } catch (err: any) {
      setError(err.message || 'Authentication error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[10000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      {/* Lean Notion-Style Dialog Card */}
      <div className="w-full max-w-sm bg-[#0f172a] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col text-slate-100">
        
        {/* Header */}
        <div className="p-5 pb-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white tracking-tight">
                {mode === 'signin' ? 'Welcome Back' : 'Create Account'}
              </h2>
              <p className="text-xs text-slate-400">
                {mode === 'signin' ? 'Sign in with Username & Password' : 'Sign up to persist workspace data'}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Minimal Tab Switcher */}
        <div className="p-1 mx-5 mt-4 bg-slate-950/60 rounded-xl border border-white/10 flex gap-1">
          <button
            type="button"
            onClick={() => { setMode('signin'); setError(null) }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'signin'
                ? 'bg-slate-800 text-white border border-white/10 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode('signup'); setError(null) }}
            className={`flex-1 py-1.5 text-xs font-medium rounded-lg transition-all ${
              mode === 'signup'
                ? 'bg-slate-800 text-white border border-white/10 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sign Up
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mx-5 mt-3 p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form Controls */}
        <form onSubmit={handleSubmit} className="p-5 flex flex-col gap-3.5">
          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Username</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                placeholder="Username"
                required
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-slate-300">Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                minLength={6}
                className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-white/10 rounded-xl text-xs text-white placeholder:text-slate-600 focus:outline-none focus:border-blue-500 transition-all"
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="mt-1 w-full py-2 px-4 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all disabled:opacity-60 flex items-center justify-center gap-1.5"
          >
            {loading ? (
              <span>Authenticating…</span>
            ) : (
              <>
                <span>{mode === 'signin' ? 'Sign In' : 'Create Account'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}
