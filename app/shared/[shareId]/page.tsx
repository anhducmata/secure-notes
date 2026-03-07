"use client"

import { useState, useEffect } from "react"
import { AlertCircle, Loader2, Lock, Copy, Check } from "lucide-react"
import { importShareKey, decryptFromShare } from "@/lib/crypto"

interface SharedNote {
  title: string
  content: string
  sharedAt: string
}

export default function SharedNotePage({ params }: { params: Promise<{ shareId: string }> }) {
  const [note, setNote] = useState<SharedNote | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [shareId, setShareId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [autoCopied, setAutoCopied] = useState(false)

  // Unwrap params
  useEffect(() => {
    params.then((p) => setShareId(p.shareId))
  }, [params])

  // Copy content to clipboard
  const copyToClipboard = async (content: string, isAuto = false) => {
    try {
      await navigator.clipboard.writeText(content)
      if (isAuto) {
        setAutoCopied(true)
      } else {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    } catch {
      // Fallback for older browsers
      const textArea = document.createElement("textarea")
      textArea.value = content
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      if (isAuto) {
        setAutoCopied(true)
      } else {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }
    }
  }

  // Fetch and decrypt the shared note (one-time)
  useEffect(() => {
    if (!shareId) return

    const fetchNote = async () => {
      try {
        // Extract the decryption key from the URL fragment.
        // Fragments are never sent to the server, so the key stays client-side.
        const hash = window.location.hash
        const keyMatch = hash.match(/[#&]key=([^&]*)/)
        if (!keyMatch) {
          setError("Invalid share link: missing decryption key")
          setIsLoading(false)
          return
        }
        const keyBase64 = decodeURIComponent(keyMatch[1])

        let res: Response
        let data: { message?: string; error?: string; note?: { encryptedData: { ciphertext: string; iv: string }; sharedAt: string } }
        try {
          res = await fetch(`/api/share/${shareId}`)
          data = await res.json()
        } catch {
          setError("Failed to load the shared note. Please check your connection.")
          setIsLoading(false)
          return
        }

        if (!res.ok) {
          setError(data.message || data.error || "Failed to load note")
          setIsLoading(false)
          return
        }

        // Decrypt the note content client-side using the key from the URL fragment
        let shareKey: CryptoKey
        try {
          shareKey = await importShareKey(keyBase64)
        } catch {
          setError("Invalid share link: the decryption key is malformed.")
          setIsLoading(false)
          return
        }

        try {
          const { encryptedData, sharedAt } = data.note!
          const plaintext = await decryptFromShare(encryptedData.ciphertext, encryptedData.iv, shareKey)
          const { title, content } = JSON.parse(plaintext) as { title: string; content: string }

          const decryptedNote: SharedNote = { title, content, sharedAt }
          setNote(decryptedNote)

          // Auto-copy content when note is loaded
          if (content) {
            copyToClipboard(content, true)
          }
        } catch {
          setError("Failed to decrypt the shared note. The link may be corrupted or the key is incorrect.")
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchNote()
  }, [shareId])

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-yellow-500 mx-auto mb-4" />
          <p className="text-gray-400 text-sm">Loading shared note...</p>
        </div>
      </div>
    )
  }

  // Error state (link expired or already used)
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div
            className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle className="h-7 w-7 text-red-500" />
          </div>
          <h1 className="text-xl font-semibold text-white mb-2">Link Unavailable</h1>
          <p className="text-gray-400 text-sm mb-4">{error}</p>
          <p className="text-xs text-gray-600">
            Share links can only be viewed once and expire after 24 hours.
          </p>
        </div>
      </div>
    )
  }

  // Success state - show the note
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-gray-500 mb-1">Shared Note</p>
          <h1 className="text-2xl font-semibold text-yellow-500">{note?.title}</h1>
          <p className="text-xs text-gray-600 mt-1">
            {note?.sharedAt && new Date(note.sharedAt).toLocaleDateString("en-US", {
              month: "short",
              day: "numeric",
              year: "numeric",
              hour: "numeric",
              minute: "2-digit",
            })}
          </p>
        </div>

        {/* Auto-copied notification */}
        {autoCopied && (
          <div className="mb-4 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center gap-2">
            <Check className="h-3.5 w-3.5 text-green-500" />
            <p className="text-xs text-green-500">Content copied to clipboard</p>
          </div>
        )}

        {/* Note content in code block style */}
        <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
          {/* Code block header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800/50 border-b border-zinc-800">
            <span className="text-xs text-gray-500 font-mono">content</span>
            <button
              onClick={() => copyToClipboard(note?.content || "")}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-gray-400 hover:text-white hover:bg-zinc-700 transition-colors"
              aria-label="Copy content"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-green-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          
          {/* Content area */}
          <div className="p-4">
            <pre className="whitespace-pre-wrap text-sm text-gray-300 leading-relaxed font-sans">
              {note?.content || <span className="text-gray-600 italic">No content</span>}
            </pre>
          </div>
        </div>

        {/* Footer notice */}
        <div className="mt-6 flex items-center gap-2 text-xs text-gray-600">
          <Lock className="h-3.5 w-3.5" />
          <span>This link has expired and cannot be accessed again.</span>
        </div>
      </div>
    </div>
  )
}
