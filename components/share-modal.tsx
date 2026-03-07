"use client"

import { useState } from "react"
import { X, Share2, Copy, Check, Loader2, Link2, AlertTriangle } from "lucide-react"

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  noteTitle: string
  noteContent: string
}

export function ShareModal({ isOpen, onClose, noteTitle, noteContent }: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleGenerateLink = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ noteTitle, noteContent }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create share link")
      }

      setShareUrl(data.shareUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share link")
    } finally {
      setIsLoading(false)
    }
  }

  const handleCopy = async () => {
    if (!shareUrl) return

    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = shareUrl
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleClose = () => {
    setShareUrl(null)
    setError(null)
    setCopied(false)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={handleClose} />

      {/* Modal */}
      <div className="relative w-full max-w-md rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
            >
              <Share2 className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">Share Note</h2>
              <p className="text-xs text-gray-500">One-time secure link</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5">
          {!shareUrl ? (
            <>
              {/* Note preview */}
              <div className="mb-4 p-4 rounded-xl bg-zinc-800/50 border border-zinc-700">
                <p className="text-sm text-gray-400 mb-1">Sharing:</p>
                <p className="text-white font-medium truncate">{noteTitle}</p>
                <p className="text-xs text-gray-500 mt-1 truncate">
                  {noteContent.slice(0, 100) || "No content"}
                  {noteContent.length > 100 && "..."}
                </p>
              </div>

              {/* Warning */}
              <div className="mb-5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                <div className="flex gap-2">
                  <AlertTriangle className="h-4 w-4 text-yellow-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-yellow-500 font-medium">One-time viewing</p>
                    <p className="text-xs text-yellow-600/80 mt-0.5">
                      This link can only be viewed once and expires in 24 hours.
                      The note content will be visible to anyone with the link.
                    </p>
                  </div>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-sm text-red-400">{error}</p>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                style={{
                  background: "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(202,138,4) 100%)",
                  color: "rgb(0,0,0)",
                  boxShadow: "0 4px 16px rgba(234,179,8,0.3)",
                }}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    Generate Share Link
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Success state - show link */}
              <div className="mb-4 p-3 rounded-lg bg-green-500/10 border border-green-500/20">
                <div className="flex items-center gap-2 text-green-500 mb-1">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">Link Generated</span>
                </div>
                <p className="text-xs text-green-600/80">
                  Share this link with the recipient. It will expire after one view.
                </p>
              </div>

              {/* Link display */}
              <div className="mb-5">
                <label className="block text-xs text-gray-500 mb-2">Share Link</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-4 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors flex items-center gap-2"
                  >
                    {copied ? (
                      <>
                        <Check className="h-4 w-4 text-green-500" />
                        <span className="text-sm text-green-500">Copied</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 text-gray-400" />
                        <span className="text-sm text-gray-400">Copy</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Done button */}
              <button
                onClick={handleClose}
                className="w-full py-3 rounded-xl text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
              >
                Done
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
