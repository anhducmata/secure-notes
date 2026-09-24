'use client'

import { Check, Crown, Headphones, MessageSquare, Shield, Sparkles, X, Zap } from 'lucide-react'

interface SettingsPanelProps {
  isOpen: boolean
  isPro: boolean
  onClose: () => void
  onUpgrade: () => void
}

export function SettingsPanel({ isOpen, isPro, onClose, onUpgrade }: SettingsPanelProps) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-3xl border border-white/10 bg-zinc-950 shadow-2xl sm:rounded-3xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-zinc-950/95 px-5 py-4 backdrop-blur-xl sm:px-7">
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-yellow-500">Account</p>
            <h2 id="settings-title" className="mt-1 text-xl font-semibold text-white">Settings</h2>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-zinc-400 transition-colors hover:bg-white/10 hover:text-white" aria-label="Close settings">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5 sm:p-7">
          <section className="overflow-hidden rounded-2xl border border-yellow-500/25 bg-gradient-to-br from-yellow-500/15 via-zinc-900 to-zinc-900 p-5">
            <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Crown className="h-4 w-4 text-yellow-400" />
                  <span className="text-sm font-semibold text-yellow-300">{isPro ? 'SecureNotes Pro' : 'SecureNotes Free'}</span>
                </div>
                <h3 className="text-2xl font-semibold text-white">{isPro ? 'Your notes, without limits.' : 'Unlock the full workspace.'}</h3>
                <p className="mt-2 max-w-md text-sm leading-relaxed text-zinc-400">Go Pro for unlimited chats, Agent smart search, and 2 hours of daily transcription.</p>
              </div>
              {!isPro && <button onClick={onUpgrade} className="shrink-0 rounded-xl bg-yellow-400 px-4 py-3 text-sm font-semibold text-black transition-transform hover:bg-yellow-300 active:scale-95">Upgrade to Pro</button>}
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold text-white">Plan & usage</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <UsageCard icon={MessageSquare} title="Chat messages" value={isPro ? 'Unlimited' : '20 messages / day'} detail={isPro ? 'No daily message cap' : 'Upgrade for unlimited chat'} active={isPro} />
              <UsageCard icon={Headphones} title="Daily transcription" value={isPro ? '2 hours' : '30 minutes'} detail={isPro ? 'Resets every day' : 'Free plan limit'} active={isPro} />
              <UsageCard icon={Sparkles} title="Agent smart search" value={isPro ? 'Included' : 'Pro only'} detail="Search across all your notes" active={isPro} />
              <UsageCard icon={Shield} title="Encrypted notes" value="End-to-end" detail="Your notes stay private" active={true} />
            </div>
          </section>

          {!isPro && <div className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400"><Zap className="mt-0.5 h-4 w-4 shrink-0 text-yellow-400" /><p>Pro access is ready to activate. Choose Upgrade to Pro to continue to secure checkout.</p></div>}
        </div>
      </div>
    </div>
  )
}

function UsageCard({ icon: Icon, title, value, detail, active }: { icon: typeof Check; title: string; value: string; detail: string; active: boolean }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-2 text-zinc-400"><Icon className="h-4 w-4" /><span className="text-xs font-medium uppercase tracking-wide">{title}</span></div><p className={`mt-3 text-lg font-semibold ${active ? 'text-yellow-300' : 'text-white'}`}>{value}</p><p className="mt-1 text-xs text-zinc-500">{detail}</p></div>
}

export const proFeatures = ['Unlimited chat', 'Agent smart search', '2h transcription daily']
export const freeFeatures = ['20 chat messages daily', '30m transcription daily']
