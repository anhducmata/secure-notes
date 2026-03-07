"use client"

import { useState, useEffect, useCallback } from "react"
import useSWR from "swr"
import { Plus, Search, ChevronLeft, Check, Loader2 } from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { AvatarButton } from "@/components/avatar-button"
import {
  encryptNote,
  decryptNote,
  type EncryptedPayload,
  type DecryptedNote,
} from "@/lib/crypto"

// ─── Types ────────────────────────────────────────────────────────────────────

interface DecryptedNoteWithMeta extends DecryptedNote {
  id: string
  date: Date
  folder: string
}

interface EncryptedNoteFromServer {
  id: string
  encryptedData: EncryptedPayload
  date: string
  folder: string
}

interface User {
  name: string
  email: string
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DEMO_ENCRYPTION_PASSWORD = "demo-secure-key-123"

const fetcher = (url: string) => fetch(url).then((r) => r.json())

// ─── Hooks ────────────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])

  return debouncedValue
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotesApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [localNotes, setLocalNotes] = useState<DecryptedNoteWithMeta[]>([])
  const [selectedNote, setSelectedNote] = useState<DecryptedNoteWithMeta | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle")
  const [pendingChanges, setPendingChanges] = useState<DecryptedNoteWithMeta | null>(null)

  const [encryptionPassword] = useState(DEMO_ENCRYPTION_PASSWORD)

  const userId = user?.email || "anonymous"

  // Fetch encrypted notes from Redis
  const { data, isLoading, mutate } = useSWR<{
    notes: EncryptedNoteFromServer[]
    encrypted: boolean
  }>(`/api/notes?userId=${encodeURIComponent(userId)}`, fetcher)

  // Decrypt notes when data arrives
  useEffect(() => {
    if (!data?.notes) return

    const decryptAllNotes = async () => {
      const decrypted: DecryptedNoteWithMeta[] = []

      for (const encNote of data.notes) {
        try {
          if (encNote.encryptedData.ciphertext.startsWith("DEMO_PLACEHOLDER")) {
            continue
          }

          const decryptedContent = await decryptNote(encNote.encryptedData, encryptionPassword)
          decrypted.push({
            id: encNote.id,
            title: decryptedContent.title,
            content: decryptedContent.content,
            date: new Date(encNote.date),
            folder: encNote.folder,
          })
        } catch {
          // Note couldn't be decrypted
        }
      }

      setLocalNotes(decrypted)
    }

    decryptAllNotes()
  }, [data, encryptionPassword])

  // Debounce pending changes for auto-save (500ms)
  const debouncedNote = useDebounce(pendingChanges, 500)

  // Auto-save effect with encryption
  useEffect(() => {
    if (!debouncedNote) return

    const saveNoteEncrypted = async () => {
      setSaveStatus("saving")

      try {
        const encrypted = await encryptNote(
          { title: debouncedNote.title, content: debouncedNote.content },
          encryptionPassword
        )

        await fetch(`/api/notes?userId=${encodeURIComponent(userId)}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: debouncedNote.id,
            encryptedData: encrypted,
            date: debouncedNote.date instanceof Date
              ? debouncedNote.date.toISOString()
              : debouncedNote.date,
            folder: debouncedNote.folder,
          }),
        })

        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 1500)
      } catch {
        setSaveStatus("idle")
      }
    }

    saveNoteEncrypted()
  }, [debouncedNote, userId, encryptionPassword])

  // Refetch when user changes
  useEffect(() => {
    mutate()
  }, [userId, mutate])

  // Mobile check
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const formatDate = (date: Date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === today.toDateString()) return "Today"
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday"
    return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
  }

  const filteredNotes = localNotes.filter(
    (n) =>
      searchQuery === "" ||
      n.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      n.content.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleNoteSelect = useCallback((note: DecryptedNoteWithMeta) => {
    setSelectedNote(note)
  }, [])

  const handleNoteChange = (content: string) => {
    if (!selectedNote) return
    const updatedNote = { ...selectedNote, content, date: new Date() }
    const updated = localNotes.map((n) => (n.id === selectedNote.id ? updatedNote : n))
    setLocalNotes(updated)
    setSelectedNote(updatedNote)
    setPendingChanges(updatedNote)
  }

  const handleTitleChange = (title: string) => {
    if (!selectedNote) return
    const updatedNote = { ...selectedNote, title, date: new Date() }
    const updated = localNotes.map((n) => (n.id === selectedNote.id ? updatedNote : n))
    setLocalNotes(updated)
    setSelectedNote(updatedNote)
    setPendingChanges(updatedNote)
  }

  const handleCreateNote = async () => {
    const newNote: DecryptedNoteWithMeta = {
      id: Date.now().toString(),
      title: "New Note",
      content: "",
      date: new Date(),
      folder: "notes",
    }

    setLocalNotes([newNote, ...localNotes])
    setSelectedNote(newNote)

    try {
      const encrypted = await encryptNote(
        { title: newNote.title, content: newNote.content },
        encryptionPassword
      )

      await fetch(`/api/notes?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: newNote.id,
          encryptedData: encrypted,
          date: newNote.date.toISOString(),
          folder: newNote.folder,
        }),
      })
    } catch {
      // Silent fail
    }
  }

  const handleDeleteNote = async () => {
    if (!selectedNote) return

    setLocalNotes(localNotes.filter((n) => n.id !== selectedNote.id))
    setSelectedNote(null)

    try {
      await fetch(
        `/api/notes?userId=${encodeURIComponent(userId)}&noteId=${selectedNote.id}`,
        { method: "DELETE" }
      )
    } catch {
      // Silent fail
    }
  }

  // ── Save status indicator ─────────────────────────────────────────────────
  const SaveIndicator = () => {
    if (saveStatus === "idle") return null
    return (
      <div className="flex items-center gap-1.5 text-xs text-gray-400">
        {saveStatus === "saving" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <Check className="h-3 w-3 text-green-500" />
            <span className="text-green-500">Saved</span>
          </>
        )}
      </div>
    )
  }

  // ── Shared UI fragments ───────────────────────────────────────────────────

  const avatarButton = (
    <div className="absolute bottom-5 left-5 z-20">
      <AvatarButton
        user={user}
        onClick={() => setAuthOpen(true)}
        onSignOut={() => setUser(null)}
      />
    </div>
  )

  // ── Mobile view ───────────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="relative h-screen w-full bg-black text-white">
        {selectedNote ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={() => setSelectedNote(null)}
                  className="flex items-center text-sm text-yellow-500"
                  aria-label="Back to notes list"
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  Notes
                </button>
                <div className="flex items-center gap-3">
                  <SaveIndicator />
                  <button onClick={handleDeleteNote} className="text-sm text-red-500" aria-label="Delete note">
                    Delete
                  </button>
                </div>
              </div>
              <input
                type="text"
                className="w-full bg-transparent text-xl font-semibold text-yellow-500 focus:outline-none"
                value={selectedNote.title}
                onChange={(e) => handleTitleChange(e.target.value)}
              />
              <p className="text-xs text-gray-400">{formatDate(selectedNote.date)}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                className="note-editor-content h-full w-full resize-none bg-transparent text-white focus:outline-none"
                value={selectedNote.content}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Type something..."
                spellCheck
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-800 p-4">
              <h1 className="text-xl font-semibold text-yellow-500 mb-4">Notes</h1>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search"
                  className="w-full rounded-md bg-zinc-800 py-2 pl-8 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>
            <div className="flex h-12 items-center justify-between border-b border-gray-800 px-4">
              <span className="text-sm text-gray-400">{filteredNotes.length} Notes</span>
              <button onClick={handleCreateNote} className="rounded-full p-2 text-yellow-500" aria-label="New note">
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto momentum-scroll pb-20">
              {isLoading ? (
                <NotesSkeleton />
              ) : (
                <NotesList notes={filteredNotes} selectedId={null} onSelect={handleNoteSelect} formatDate={formatDate} />
              )}
            </div>
          </div>
        )}

        {avatarButton}

        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSignIn={(u) => setUser(u)} />
      </div>
    )
  }

  // ── Desktop view ──────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-screen w-full bg-black text-white">
      {/* Notes list panel */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        <div className="border-b border-gray-800 p-6">
          <h1 className="text-xl font-semibold text-yellow-500 mb-4">Notes</h1>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full rounded-md bg-zinc-800 py-2 pl-8 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex h-12 items-center justify-between border-b border-gray-800 px-4">
          <span className="text-sm text-gray-400">{filteredNotes.length} Notes</span>
          <button
            onClick={handleCreateNote}
            className="rounded-full p-2 text-yellow-500 hover:bg-zinc-800 transition-colors"
            aria-label="New note"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto momentum-scroll pb-20">
          {isLoading ? (
            <NotesSkeleton />
          ) : (
            <NotesList
              notes={filteredNotes}
              selectedId={selectedNote?.id ?? null}
              onSelect={handleNoteSelect}
              formatDate={formatDate}
            />
          )}
        </div>
      </div>

      {/* Editor panel */}
      <div className="flex-1 overflow-hidden">
        {selectedNote ? (
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-800 p-6">
              <div className="flex items-center justify-between mb-2">
                <input
                  type="text"
                  className="flex-1 bg-transparent text-2xl font-semibold text-yellow-500 focus:outline-none"
                  value={selectedNote.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />
                <div className="flex items-center gap-4 ml-4">
                  <SaveIndicator />
                  <button
                    onClick={handleDeleteNote}
                    className="text-sm text-red-500 transition-opacity hover:opacity-70"
                    aria-label="Delete note"
                  >
                    Delete
                  </button>
                </div>
              </div>
              <p className="text-sm text-gray-400">{formatDate(selectedNote.date)}</p>
            </div>
            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                className="note-editor-content h-full w-full resize-none bg-transparent text-lg text-white focus:outline-none"
                value={selectedNote.content}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Type something..."
                spellCheck
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="mb-4 text-sm">Select a note or create a new one</p>
              <button
                onClick={handleCreateNote}
                className="rounded-md bg-yellow-500 px-4 py-2 text-sm text-black hover:bg-yellow-600 transition-colors"
              >
                Create New Note
              </button>
            </div>
          </div>
        )}
      </div>

      {avatarButton}

      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSignIn={(u) => setUser(u)} />
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function NotesList({
  notes,
  selectedId,
  onSelect,
  formatDate,
}: {
  notes: DecryptedNoteWithMeta[]
  selectedId: string | null
  onSelect: (note: DecryptedNoteWithMeta) => void
  formatDate: (date: Date) => string
}) {
  if (notes.length === 0) {
    return (
      <li className="flex h-32 list-none items-center justify-center text-gray-500 text-sm">
        No notes found
      </li>
    )
  }
  return (
    <ul>
      {notes.map((note) => (
        <li key={note.id} className="border-b border-gray-800">
          <button
            className={`w-full p-4 text-left transition-colors ${
              selectedId === note.id ? "bg-zinc-800" : "hover:bg-zinc-900"
            }`}
            onClick={() => onSelect(note)}
          >
            <h3 className="font-medium text-white truncate">{note.title}</h3>
            <p className="mt-1 text-sm text-gray-400 truncate">
              {formatDate(note.date)} — {note.content.slice(0, 50) || "No content"}
            </p>
          </button>
        </li>
      ))}
    </ul>
  )
}

function NotesSkeleton() {
  return (
    <div className="p-4 space-y-4">
      {[1, 2, 3].map((i) => (
        <div key={i} className="animate-pulse">
          <div className="h-4 w-3/4 rounded bg-zinc-800" />
          <div className="mt-2 h-3 w-1/2 rounded bg-zinc-800" />
        </div>
      ))}
    </div>
  )
}
