"use client"

import React, { useState, useEffect } from "react"
import {
  X,
  Copy,
  Check,
  Loader2,
  Link2,
  Users,
  Shield,
  Eye,
  Edit3,
  UserPlus,
  Trash2,
  Folder as FolderIcon,
  FileText,
} from "lucide-react"
import { generateShareKey, encryptForShare } from "@/lib/crypto"
import type { SharedCollaborator } from "@/lib/folders"
import { APPLE_TAG_COLORS } from "@/lib/tags"

export type ShareTarget =
  | {
      type: "note"
      id: string
      title: string
      content: string
      tags?: string[]
      audioRecording?: any
      transcriptSegments?: any
      sharedWith?: SharedCollaborator[]
    }
  | {
      type: "folder"
      id: string
      name: string
      notes: Array<{
        id: string
        title: string
        content: string
        date: string | Date
        tags?: string[]
        audioRecording?: any
        transcriptSegments?: any
      }>
      sharedWith?: SharedCollaborator[]
    }

interface ShareModalProps {
  isOpen: boolean
  onClose: () => void
  target: ShareTarget | null
  onUpdateCollaborators: (collaborators: SharedCollaborator[]) => void
}

const AVATAR_BG_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#3b82f6", // blue
  "#a855f7", // purple
  "#ec4899", // pink
]

export function ShareModal({
  isOpen,
  onClose,
  target,
  onUpdateCollaborators,
}: ShareModalProps) {
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Collaborator invite state
  const [inviteEmail, setInviteEmail] = useState("")
  const [invitePermission, setInvitePermission] = useState<"read" | "write">("read")
  const [collaborators, setCollaborators] = useState<SharedCollaborator[]>([])

  useEffect(() => {
    if (isOpen && target) {
      setCollaborators(target.sharedWith || [])
      setShareUrl(null)
      setError(null)
      setCopied(false)
      setInviteEmail("")
      setInvitePermission("read")
    }
  }, [isOpen, target])

  if (!isOpen || !target) return null

  const isFolder = target.type === "folder"
  const title = isFolder ? target.name : target.title || "Untitled"

  const handleAddCollaborator = (e: React.FormEvent) => {
    e.preventDefault()
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !email.includes("@")) {
      setError("Please enter a valid email address.")
      return
    }

    if (collaborators.some((c) => c.email.toLowerCase() === email)) {
      setError("User is already a collaborator.")
      return
    }

    const randomColor =
      AVATAR_BG_COLORS[Math.floor(Math.random() * AVATAR_BG_COLORS.length)]
    const newCollaborator: SharedCollaborator = {
      id: `collab_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      email,
      name: email.split("@")[0],
      avatar: randomColor,
      permission: invitePermission,
      sharedAt: new Date().toISOString(),
    }

    const updated = [...collaborators, newCollaborator]
    setCollaborators(updated)
    onUpdateCollaborators(updated)
    setInviteEmail("")
    setError(null)
  }

  const handleUpdatePermission = (id: string, perm: "read" | "write") => {
    const updated = collaborators.map((c) =>
      c.id === id ? { ...c, permission: perm } : c
    )
    setCollaborators(updated)
    onUpdateCollaborators(updated)
  }

  const handleRemoveCollaborator = (id: string) => {
    const updated = collaborators.filter((c) => c.id !== id)
    setCollaborators(updated)
    onUpdateCollaborators(updated)
  }

  const handleGenerateLink = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const { key, keyBase64 } = await generateShareKey()

      let plaintext = ""
      if (isFolder) {
        plaintext = JSON.stringify({
          type: "folder",
          folderName: target.name,
          notes: target.notes.map((n) => ({
            id: n.id,
            title: n.title,
            content: n.content,
            date: typeof n.date === "string" ? n.date : n.date.toISOString(),
            tags: n.tags || [],
            audioRecording: n.audioRecording,
            transcriptSegments: n.transcriptSegments,
          })),
        })
      } else {
        plaintext = JSON.stringify({
          type: "note",
          title: target.title,
          content: target.content,
          tags: target.tags || [],
          audioRecording: target.audioRecording,
          transcriptSegments: target.transcriptSegments,
        })
      }

      const encryptedData = await encryptForShare(plaintext, key)

      const res = await fetch("/api/share", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          type: isFolder ? "folder" : "note",
          encryptedData,
          permission: "read", // Anonymous mode is strictly read-only
        }),
      })

      const data = await res.json()
      if (!res.ok) {
        throw new Error(data.error || "Failed to create share link")
      }

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

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" onClick={onClose} />

      {/* Modal Card */}
      <div className="relative w-full max-w-md rounded-2xl bg-white border border-zinc-200 shadow-2xl text-zinc-900 dark:bg-zinc-900 dark:border-zinc-800 dark:text-white overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-200 dark:border-zinc-800 shrink-0">
          <div className="flex items-center gap-2.5 truncate">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-yellow-400 shrink-0">
              {isFolder ? <FolderIcon className="h-4 w-4" /> : <FileText className="h-4 w-4" />}
            </div>
            <div className="truncate">
              <h2 className="text-sm font-bold truncate">
                Share {isFolder ? "Folder" : "Note"}: &quot;{title}&quot;
              </h2>
              <p className="text-[11px] text-zinc-400 dark:text-zinc-500">
                {isFolder
                  ? `Includes all ${target.notes.length} current and future notes & records`
                  : "Includes note text, tags, and diarized audio records"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer shrink-0"
            aria-label="Close modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-4 space-y-4 overflow-y-auto momentum-scroll text-xs">
          {/* Section 1: Invite Collaborator */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
              Invite Collaborators
            </label>
            <form onSubmit={handleAddCollaborator} className="flex gap-2 items-center">
              <input
                type="email"
                placeholder="colleague@example.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:border-amber-500"
              />
              <select
                value={invitePermission}
                onChange={(e) => setInvitePermission(e.target.value as "read" | "write")}
                className="bg-zinc-50 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/80 rounded-xl px-2.5 py-2 text-xs text-zinc-900 dark:text-white focus:outline-none cursor-pointer"
              >
                <option value="read">Can view</option>
                <option value="write">Can edit</option>
              </select>
              <button
                type="submit"
                className="px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-semibold text-xs transition-colors shrink-0 cursor-pointer shadow-xs"
              >
                Share
              </button>
            </form>
          </div>

          {/* Section 2: Collaborators List */}
          <div>
            <label className="block text-[11px] font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-1.5">
              People With Access ({collaborators.length + 1})
            </label>
            <div className="divide-y divide-zinc-100 dark:divide-zinc-800/80 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden bg-zinc-50/50 dark:bg-zinc-900/50">
              {/* Owner row */}
              <div className="p-2.5 flex items-center justify-between text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-full bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 text-[10px] font-bold flex items-center justify-center">
                    You
                  </div>
                  <div>
                    <span className="font-semibold text-zinc-900 dark:text-white">You</span>
                    <span className="text-[10px] text-zinc-400 ml-1.5">(Owner)</span>
                  </div>
                </div>
                <span className="text-[11px] text-zinc-400 font-medium">Owner</span>
              </div>

              {/* Shared users */}
              {collaborators.map((c) => (
                <div key={c.id} className="p-2.5 flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-6 h-6 rounded-full text-white text-[10px] font-bold flex items-center justify-center shrink-0 uppercase shadow-2xs"
                      style={{ backgroundColor: c.avatar || "#3b82f6" }}
                    >
                      {c.name.slice(0, 2)}
                    </div>
                    <div className="truncate">
                      <p className="font-medium text-zinc-800 dark:text-zinc-200 truncate">{c.email}</p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 ml-2">
                    <select
                      value={c.permission}
                      onChange={(e) => handleUpdatePermission(c.id, e.target.value as "read" | "write")}
                      className="bg-transparent border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-[11px] text-zinc-700 dark:text-zinc-300 cursor-pointer focus:outline-none"
                    >
                      <option value="read">Can view</option>
                      <option value="write">Can edit</option>
                    </select>
                    <button
                      onClick={() => handleRemoveCollaborator(c.id)}
                      className="p-1 rounded-md text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors cursor-pointer"
                      title="Remove access"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <hr className="border-zinc-200 dark:border-zinc-800 my-1" />

          {/* Section 3: Anonymous Public Link */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <span className="text-xs font-semibold text-zinc-900 dark:text-white flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-amber-500" />
                  <span>Public Anonymous Link</span>
                </span>
                <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5">
                  Anonymous viewers see a simple, dedicated page for this {isFolder ? "folder and its notes" : "note"} only (read-only).
                </p>
              </div>
            </div>

            {!shareUrl ? (
              <button
                type="button"
                onClick={handleGenerateLink}
                disabled={isLoading}
                className="w-full mt-2 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold bg-zinc-100 hover:bg-zinc-200 text-zinc-900 dark:bg-zinc-800 dark:text-white dark:hover:bg-zinc-700 transition-colors cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Encrypting & Generating Link...</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5" />
                    <span>Create Public Share Link</span>
                  </>
                )}
              </button>
            ) : (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-1.5 rounded-xl bg-zinc-50 border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700 overflow-hidden p-1">
                  <input
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 px-2 py-1 bg-transparent text-xs text-zinc-800 dark:text-zinc-300 font-mono focus:outline-none truncate"
                  />
                  <button
                    onClick={handleCopy}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                  >
                    {copied ? (
                      <>
                        <Check className="h-3.5 w-3.5" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5" />
                        <span>Copy</span>
                      </>
                    )}
                  </button>
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                  ✓ Link generated with end-to-end zero-knowledge encryption key in URL fragment.
                </p>
              </div>
            )}
          </div>

          {/* Error display */}
          {error && (
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/80 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
