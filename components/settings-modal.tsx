"use client"

import { useState } from "react"
import { Check, Crown, X } from "lucide-react"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail: string
}

export function SettingsModal({ isOpen, onClose, userEmail }: SettingsModalProps) {
  const [loading, setLoading] = useState(false)
  if (!isOpen) return null

  const startCheckout = async () => {
    setLoading(true)
    try {
      const response = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: userEmail }),
      })
      const data = await response.json()
      if (data.url) window.location.href = data.url
      else window.alert(data.error || "Checkout is not available yet.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="w-full max-w-md rounded-2xl border border-zinc-800 bg-zinc-950 p-6 text-white shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <div><h2 id="settings-title" className="text-lg font-semibold">Settings</h2><p className="text-xs text-zinc-500">{userEmail}</p></div>
          <button onClick={onClose} className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-800 hover:text-white" aria-label="Close settings"><X /></button>
        </div>
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-500/10 p-4">
          <div className="flex items-start gap-3"><Crown className="mt-0.5 text-yellow-400" /><div><h3 className="font-semibold">SecureNotes Pro</h3><p className="mt-1 text-sm text-zinc-300">Unlimited chat, Smart Search with Agent chat, and 2 hours of transcription every day.</p></div></div>
          <ul className="mt-4 flex flex-col gap-2 text-sm text-zinc-300"><li className="flex gap-2"><Check className="text-yellow-400" />Unlimited chat</li><li className="flex gap-2"><Check className="text-yellow-400" />Agent chat (Smart Search)</li><li className="flex gap-2"><Check className="text-yellow-400" />2h transcription daily</li></ul>
          <button onClick={startCheckout} disabled={loading} className="mt-5 w-full rounded-lg bg-yellow-400 px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-60">{loading ? "Opening checkout…" : "Upgrade to Pro"}</button>
        </div>
        <div className="mt-4 rounded-xl border border-zinc-800 p-4 text-sm text-zinc-400"><p className="font-medium text-zinc-200">Free plan</p><p className="mt-1">30 minutes of transcription per day.</p></div>
      </div>
    </div>
  )
}
