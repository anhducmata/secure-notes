"use client"

import { useState, useEffect } from "react"
import { FileText, AlertCircle, Loader2, Lock } from "lucide-react"

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

  // Unwrap params
  useEffect(() => {
    params.then((p) => setShareId(p.shareId))
  }, [params])

  // Fetch the shared note (one-time)
  useEffect(() => {
    if (!shareId) return

    const fetchNote = async () => {
      try {
        const res = await fetch(`/api/share/${shareId}`)
        const data = await res.json()

        if (!res.ok) {
          setError(data.message || data.error || "Failed to load note")
          return
        }

        setNote(data.note)
      } catch {
        setError("Failed to load the shared note")
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
          <p className="text-gray-400">Loading shared note...</p>
        </div>
      </div>
    )
  }

  // Error state (link expired or already used)
  if (error) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}
          >
            <AlertCircle className="h-8 w-8 text-red-500" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Link Unavailable</h1>
          <p className="text-gray-400 text-sm leading-relaxed mb-6">{error}</p>
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-800">
            <div className="flex items-center gap-2 text-yellow-500 mb-2">
              <Lock className="h-4 w-4" />
              <span className="text-sm font-medium">One-Time Links</span>
            </div>
            <p className="text-xs text-gray-500">
              Share links can only be viewed once and expire after 24 hours for security.
            </p>
          </div>
        </div>
      </div>
    )
  }

  // Success state - show the note
  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
            >
              <FileText className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Shared Note</p>
              <p className="text-xs text-gray-600">
                {note?.sharedAt && new Date(note.sharedAt).toLocaleDateString("en-US", {
                  month: "long",
                  day: "numeric",
                  year: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>
          <h1 className="text-3xl font-semibold text-yellow-500">{note?.title}</h1>
        </div>

        {/* Note content */}
        <div className="prose prose-invert max-w-none">
          <div className="whitespace-pre-wrap text-gray-300 leading-relaxed">
            {note?.content || <span className="text-gray-500 italic">No content</span>}
          </div>
        </div>

        {/* Footer notice */}
        <div className="mt-12 p-4 rounded-xl bg-zinc-900 border border-zinc-800">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-gray-300 font-medium mb-1">This link has been used</p>
              <p className="text-xs text-gray-500">
                For security, this shared note link is now expired and cannot be accessed again.
                If you need to share this note again, ask the owner to create a new share link.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
