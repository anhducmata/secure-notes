"use client"

import { useState } from "react"
import { X, Copy, Check, Loader2, Link2 } from "lucide-react"
import { generateShareKey, encryptForShare } from "@/lib/crypto"

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
      // Encrypt the note content client-side before sending to the server.
      // The server only ever receives ciphertext; the decryption key lives
      // exclusively in the share URL fragment and is never transmitted to or
      // stored by the server.
      const { key, keyBase64 } = await generateShareKey()
      const plaintext = JSON.stringify({ title: noteTitle, content: noteContent })
      const encryptedData = await encryptForShare(plaintext, key)

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ encryptedData }),
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || "Failed to create share link")
      }

      // Append the decryption key to the URL fragment.
      // URL fragments are never sent in HTTP requests, so the server
      // cannot learn the key from network traffic.
      setShareUrl(`${data.shareUrl}#key=${encodeURIComponent(keyBase64)}`)
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
      <div className="relative w-full max-w-sm rounded-2xl bg-zinc-900 border border-zinc-800 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-base font-semibold text-white">Share Note</h2>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
            aria-label="Close modal"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {!shareUrl ? (
            <>
              {/* Note preview */}
              <div className="mb-4 p-3 rounded-lg bg-zinc-800/50 border border-zinc-700">
                <p className="text-white font-medium text-sm truncate">{noteTitle}</p>
                <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                  {noteContent.slice(0, 80) || "No content"}
                  {noteContent.length > 80 && "..."}
                </p>
              </div>

              {/* Info text */}
              <p className="text-xs text-gray-500 mb-4">
                Link expires after one view or 24 hours.
              </p>

              {/* Error */}
              {error && (
                <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20">
                  <p className="text-xs text-red-400">{error}</p>
                </div>
              )}

              {/* Generate button */}
              <button
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed bg-yellow-500 text-black hover:bg-yellow-400"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4" />
                    <span>Create Link</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              {/* Link display with code block style */}
              <div className="mb-4">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-800 border border-zinc-700 overflow-hidden">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-3 py-2.5 bg-transparent text-xs text-gray-300 font-mono focus:outline-none truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-2.5 bg-zinc-700/50 hover:bg-zinc-700 border-l border-zinc-700 transition-colors"
                    aria-label="Copy link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-500" />
                    ) : (
                      <Copy className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                {copied && (
                  <p className="text-xs text-green-500 mt-2 text-center">Copied to clipboard</p>
                )}
              </div>

              {/* Done button */}
              <button
                onClick={handleClose}
                className="w-full py-2.5 rounded-xl text-sm font-medium bg-zinc-800 text-white hover:bg-zinc-700 transition-colors"
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
