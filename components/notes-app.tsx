"use client"

import { useState, useEffect } from "react"
import useSWR from "swr"
import { Plus, Search, ChevronLeft } from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { AvatarButton } from "@/components/avatar-button"

interface Note {
  id: string
  title: string
  content: string
  date: Date
  folder: string
}

interface User {
  name: string
  email: string
}

const fetcher = (url: string) => fetch(url).then((r) => r.json())

export function NotesApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [localNotes, setLocalNotes] = useState<Note[]>([])
  const [selectedNote, setSelectedNote] = useState<Note | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)

  // Fetch notes from /api/notes (falls back to demo data if S3 not configured)
  const { data, isLoading } = useSWR<{ notes: Array<Omit<Note, "date"> & { date: string }> }>(
    "/api/notes",
    fetcher
  )

  // Hydrate notes from API response
  useEffect(() => {
    if (data?.notes) {
      setLocalNotes(
        data.notes.map((n) => ({ ...n, date: new Date(n.date) }))
      )
    }
  }, [data])

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

  const handleNoteSelect = (note: Note) => setSelectedNote(note)

  const handleNoteChange = (content: string) => {
    if (!selectedNote) return
    const updated = localNotes.map((n) => (n.id === selectedNote.id ? { ...n, content } : n))
    setLocalNotes(updated)
    setSelectedNote({ ...selectedNote, content })
  }

  const handleTitleChange = (title: string) => {
    if (!selectedNote) return
    const updated = localNotes.map((n) => (n.id === selectedNote.id ? { ...n, title } : n))
    setLocalNotes(updated)
    setSelectedNote({ ...selectedNote, title })
  }

  const handleCreateNote = () => {
    const newNote: Note = {
      id: Date.now().toString(),
      title: "New Note",
      content: "",
      date: new Date(),
      folder: "notes",
    }
    setLocalNotes([newNote, ...localNotes])
    setSelectedNote(newNote)
  }

  const handleDeleteNote = () => {
    if (!selectedNote) return
    setLocalNotes(localNotes.filter((n) => n.id !== selectedNote.id))
    setSelectedNote(null)
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
                <button onClick={handleDeleteNote} className="text-sm text-red-500" aria-label="Delete note">
                  Delete
                </button>
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
              <h1 className="mb-4 text-xl font-semibold text-yellow-500">Notes</h1>
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

        <AuthModal
          isOpen={authOpen}
          onClose={() => setAuthOpen(false)}
          onSignIn={(u) => setUser(u)}
        />
      </div>
    )
  }

  // ── Desktop view ──────────────────────────────────────────────────────────
  return (
    <div className="relative flex h-screen w-full bg-black text-white">
      {/* Notes list panel */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        <div className="border-b border-gray-800 p-6">
          <h1 className="mb-4 text-xl font-semibold text-yellow-500">Notes</h1>
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
                  className="w-full bg-transparent text-2xl font-semibold text-yellow-500 focus:outline-none"
                  value={selectedNote.title}
                  onChange={(e) => handleTitleChange(e.target.value)}
                />
                <button
                  onClick={handleDeleteNote}
                  className="ml-4 text-sm text-red-500 transition-opacity hover:opacity-70"
                  aria-label="Delete note"
                >
                  Delete
                </button>
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

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onSignIn={(u) => setUser(u)}
      />
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
  notes: Note[]
  selectedId: string | null
  onSelect: (note: Note) => void
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
            className={`w-full px-4 py-3 text-left transition-colors ${
              selectedId === note.id ? "bg-zinc-800" : "hover:bg-zinc-900"
            }`}
            onClick={() => onSelect(note)}
          >
            <h3 className="mb-1 font-medium text-white truncate">{note.title}</h3>
            <div className="flex text-xs text-gray-400 gap-1">
              <span>{formatDate(note.date)}</span>
              <span>•</span>
              <span className="truncate">
                {note.content.substring(0, 32)}{note.content.length > 32 ? "..." : ""}
              </span>
            </div>
          </button>
        </li>
      ))}
    </ul>
  )
}

function NotesSkeleton() {
  return (
    <ul>
      {[1, 2, 3, 4].map((i) => (
        <li key={i} className="border-b border-gray-800 px-4 py-3">
          <div
            className="mb-2 h-4 w-3/4 rounded"
            style={{ background: "rgba(255,255,255,0.07)", animation: "pulse 1.5s ease-in-out infinite" }}
          />
          <div
            className="h-3 w-1/2 rounded"
            style={{ background: "rgba(255,255,255,0.04)", animation: "pulse 1.5s ease-in-out infinite" }}
          />
        </li>
      ))}
    </ul>
  )
}
