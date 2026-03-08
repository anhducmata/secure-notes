"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import useSWR from "swr"
import { Plus, Search, ChevronLeft, Lock, Share2, Trash2 } from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { AvatarButton } from "@/components/avatar-button"
import { SettingsModal } from "@/components/settings-modal"
import { PinLoginModal, storePinData, getPinData, removePinData } from "@/components/pin-login-modal"
import {
  encryptNote,
  decryptNote,
  type EncryptedPayload,
  type DecryptedNote,
} from "@/lib/crypto"
import { ShareModal } from "@/components/share-modal"

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
  encryptionKey?: string // User's password used as encryption key
}

const fetcher = (url: string) => fetch(url, { credentials: "include" }).then((r) => r.json())

// Limits (must match server-side)
const MAX_NOTES_PER_USER = 100
const MAX_CONTENT_LENGTH = 50000 // ~50,000 characters

// Tab-visibility lock thresholds
const PIN_TIMEOUT = 60 * 60 * 1000          // 1 hour  → show PIN login
const LOGOUT_TIMEOUT = 12 * 60 * 60 * 1000  // 12 hours → full logout

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
  const [authChecked, setAuthChecked] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [pinLoginOpen, setPinLoginOpen] = useState(false)
  const [hasPin, setHasPin] = useState(false)
  const [localNotes, setLocalNotes] = useState<DecryptedNoteWithMeta[]>([])
  const [selectedNote, setSelectedNote] = useState<DecryptedNoteWithMeta | null>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle") // Keep for auto-save logic
  const [pendingChanges, setPendingChanges] = useState<DecryptedNoteWithMeta | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)

  // Encryption key derived from user's password (set during login)
  const encryptionPassword = user?.encryptionKey || ""

  // Persisted across effect re-runs so a user-state change cannot reset the clock
  const hiddenAtRef = useRef<number | null>(null)

  // Tab-visibility auto-lock: lock based on how long the tab was hidden
  useEffect(() => {
    if (!user?.encryptionKey) return

    const applyLock = (hiddenDuration: number) => {
      if (hiddenDuration >= LOGOUT_TIMEOUT) {
        // Hidden > 12 h → full logout
        setUser({ ...user, encryptionKey: undefined })
      } else if (hiddenDuration >= PIN_TIMEOUT) {
        // Hidden 1 h – 12 h → show PIN login
        const pinData = getPinData()
        if (pinData && pinData.email === user.email) {
          setUser({ ...user, encryptionKey: undefined })
          setPinLoginOpen(true)
        } else {
          // No PIN set → full logout
          setUser({ ...user, encryptionKey: undefined })
        }
      }
      // Hidden < 1 h → do nothing, notes remain accessible
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenAtRef.current = Date.now()
      } else if (document.visibilityState === "visible" && hiddenAtRef.current !== null) {
        const hiddenDuration = Date.now() - hiddenAtRef.current
        hiddenAtRef.current = null
        applyLock(hiddenDuration)
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  }, [user])

  // Check for existing session and PIN on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        // Check for PIN data first
        const pinData = getPinData()
        if (pinData) {
          setHasPin(true)
        }

        const res = await fetch("/api/auth/session", { credentials: "include" })
        const data = await res.json()
        
        if (data.user && data.user.encryptionKey) {
          // User has valid session with encryption key - fully authenticated
          setUser(data.user)
          // Check if PIN exists for this user
          if (pinData && pinData.email === data.user.email) {
            setHasPin(true)
          }
        } else if (data.user) {
          // User has session but no encryption key
          // Check if they have a valid PIN for quick access
          if (pinData && pinData.email === data.user.email) {
            setUser({ ...data.user, encryptionKey: undefined })
            setPinLoginOpen(true)
          } else {
            setUser({ ...data.user, encryptionKey: undefined })
          }
        }
      } catch (e) {
        console.error("Session check failed:", e)
      } finally {
        setAuthChecked(true)
      }
    }
    checkSession()
  }, [])

  // Fetch encrypted notes from S3 (only when user is fully authenticated with encryption key)
  const { data, isLoading, mutate } = useSWR<{
    notes: EncryptedNoteFromServer[]
    encrypted: boolean
    authenticated?: boolean
  }>(
    user?.encryptionKey ? "/api/notes" : null,
    fetcher
  )

  // Decrypt notes when data arrives
  useEffect(() => {
    if (!data?.notes || !encryptionPassword) return

    const decryptAllNotes = async () => {
      const decrypted: DecryptedNoteWithMeta[] = []

      for (const encNote of data.notes) {
        try {
          const decryptedContent = await decryptNote(encNote.encryptedData, encryptionPassword)
          decrypted.push({
            id: encNote.id,
            title: decryptedContent.title,
            content: decryptedContent.content,
            date: new Date(encNote.date),
            folder: encNote.folder,
          })
        } catch {
          // Note couldn't be decrypted (wrong key or corrupted data)
          console.error("Failed to decrypt note:", encNote.id)
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
    if (!debouncedNote || !encryptionPassword) return

    const saveNoteEncrypted = async () => {
      setSaveStatus("saving")

      try {
        const encrypted = await encryptNote(
          { title: debouncedNote.title, content: debouncedNote.content },
          encryptionPassword
        )

        await fetch("/api/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
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
  }, [debouncedNote, encryptionPassword])

  // Refetch when user logs in with encryption key
  useEffect(() => {
    if (user?.encryptionKey) {
      mutate()
    }
  }, [user?.encryptionKey, mutate])

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
    
    // Check content length limit
    if (content.length > MAX_CONTENT_LENGTH) {
      setLimitError(`Note content exceeds the maximum of ${MAX_CONTENT_LENGTH.toLocaleString()} characters`)
      return
    }
    setLimitError(null)
    
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
    if (!encryptionPassword) {
      setAuthOpen(true)
      return
    }

    // Check notes limit
    if (localNotes.length >= MAX_NOTES_PER_USER) {
      setLimitError(`You have reached the maximum of ${MAX_NOTES_PER_USER} notes. Please delete some notes to create new ones.`)
      return
    }
    setLimitError(null)

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

      const res = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          id: newNote.id,
          encryptedData: encrypted,
          date: newNote.date.toISOString(),
          folder: newNote.folder,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        if (data.code === "NOTES_LIMIT_REACHED") {
          setLimitError(data.message)
          // Remove the note from local state
          setLocalNotes(prev => prev.filter(n => n.id !== newNote.id))
          setSelectedNote(null)
        }
      }
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
        `/api/notes?noteId=${selectedNote.id}`,
        { method: "DELETE", credentials: "include" }
      )
    } catch {
      // Silent fail
    }
  }

  // Sign out handler
  const handleSignOut = async () => {
    try {
      await fetch("/api/auth/session", { method: "DELETE", credentials: "include" })
    } catch (e) {
      console.error("Sign out failed:", e)
    }
    removePinData()
    setHasPin(false)
    setUser(null)
    setLocalNotes([])
    setSelectedNote(null)
  }

  // PIN handlers
  const handlePinSet = (pin: string) => {
    if (user?.encryptionKey) {
      storePinData(pin, user.encryptionKey, user.email)
      setHasPin(true)
    }
  }

  const handlePinRemove = () => {
    removePinData()
    setHasPin(false)
  }

  const handlePinLoginSuccess = (encryptionKey: string) => {
    if (user) {
      setUser({ ...user, encryptionKey })
      setPinLoginOpen(false)
    }
  }

  // ── Shared UI fragments ───────────────────────────────────────────────────

  const avatarButton = (
    <div className="absolute bottom-5 left-5 z-20">
      <AvatarButton
        user={user?.encryptionKey ? user : null}
        onClick={() => setAuthOpen(true)}
        onSignOut={handleSignOut}
        onSettings={() => setSettingsOpen(true)}
      />
    </div>
  )

  // ── Not logged in view ─────────────────────────────────────────────────────
  if (!user?.encryptionKey) {
    return (
      <div className="relative flex h-screen w-full items-center justify-center bg-black text-white">
        <div className="text-center max-w-sm px-6">
          <div
            className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl"
            style={{ background: "rgba(234,179,8,0.15)", border: "1px solid rgba(234,179,8,0.25)" }}
          >
            <Lock className="h-8 w-8 text-yellow-500" />
          </div>
          <h1 className="text-2xl font-semibold text-white mb-2">Welcome to Notes</h1>
          <p className="text-gray-400 mb-6 text-sm leading-relaxed">
            Your notes are encrypted end-to-end. Sign in to access your secure notes across all devices.
          </p>
          <button
            onClick={() => setAuthOpen(true)}
            className="w-full rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]"
            style={{
              background: "linear-gradient(135deg, rgb(234,179,8) 0%, rgb(202,138,4) 100%)",
              color: "rgb(0,0,0)",
              boxShadow: "0 4px 16px rgba(234,179,8,0.3)",
            }}
          >
            Sign In
          </button>
          <p className="mt-4 text-xs text-gray-500">
            {authChecked ? "Create an account or sign in to get started" : "Checking session..."}
          </p>
        </div>
        <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSignIn={(u) => setUser(u)} />
        <PinLoginModal
          isOpen={pinLoginOpen}
          onClose={() => setPinLoginOpen(false)}
          onSuccess={handlePinLoginSuccess}
          onSwitchToPassword={() => {
            setPinLoginOpen(false)
            setAuthOpen(true)
          }}
          userName={user?.name || ""}
        />
      </div>
    )
  }

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
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setShareModalOpen(true)}
                    className="p-2 rounded-lg text-gray-400 hover:text-yellow-500 hover:bg-zinc-800 transition-colors"
                    aria-label="Share note"
                  >
                    <Share2 className="h-4 w-4" />
                  </button>
                  <button 
                    onClick={handleDeleteNote} 
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-zinc-800 transition-colors" 
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <input
                type="text"
                className="w-full bg-transparent text-xl font-semibold text-yellow-500 focus:outline-none"
                value={selectedNote.title}
                onChange={(e) => handleTitleChange(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-400">{formatDate(selectedNote.date)}</p>
                <p className={`text-xs ${selectedNote.content.length > MAX_CONTENT_LENGTH * 0.9 ? 'text-red-400' : 'text-gray-500'}`}>
                  {selectedNote.content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()}
                </p>
              </div>
            </div>
            {limitError && (
              <div className="mx-4 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{limitError}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-4">
              <textarea
                className="note-editor-content h-full w-full resize-none bg-transparent text-white focus:outline-none"
                value={selectedNote.content}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Type something..."
                spellCheck
                autoCapitalize="sentences"
                autoCorrect="on"
                maxLength={MAX_CONTENT_LENGTH + 100}
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
                  autoComplete="off"
                />
              </div>
            </div>
            <div className="flex h-12 items-center justify-between border-b border-gray-800 px-4">
              <span className="text-sm text-gray-400">
                {filteredNotes.length} / {MAX_NOTES_PER_USER} Notes
              </span>
              <button 
                onClick={handleCreateNote} 
                className={`rounded-full p-2 ${localNotes.length >= MAX_NOTES_PER_USER ? 'text-gray-600 cursor-not-allowed' : 'text-yellow-500'}`} 
                aria-label="New note"
                disabled={localNotes.length >= MAX_NOTES_PER_USER}
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            {limitError && !selectedNote && (
              <div className="mx-4 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-xs text-red-400">{limitError}</p>
              </div>
            )}
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
        <SettingsModal
          isOpen={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          user={user}
          onPinSet={handlePinSet}
          hasPin={hasPin}
          onPinRemove={handlePinRemove}
        />
        <ShareModal
          isOpen={shareModalOpen}
          onClose={() => setShareModalOpen(false)}
          noteTitle={selectedNote?.title || ""}
          noteContent={selectedNote?.content || ""}
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
          <h1 className="text-xl font-semibold text-yellow-500 mb-4">Notes</h1>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search"
              className="w-full rounded-md bg-zinc-800 py-2 pl-8 pr-4 text-sm text-white placeholder-gray-400 focus:outline-none"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              autoComplete="off"
            />
          </div>
        </div>

        <div className="flex h-12 items-center justify-between border-b border-gray-800 px-4">
          <span className="text-sm text-gray-400">
            {filteredNotes.length} / {MAX_NOTES_PER_USER} Notes
          </span>
          <button
            onClick={handleCreateNote}
            className={`rounded-full p-2 transition-colors ${localNotes.length >= MAX_NOTES_PER_USER ? 'text-gray-600 cursor-not-allowed' : 'text-yellow-500 hover:bg-zinc-800'}`}
            aria-label="New note"
            disabled={localNotes.length >= MAX_NOTES_PER_USER}
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>

        {limitError && !selectedNote && (
          <div className="mx-4 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
            <p className="text-xs text-red-400">{limitError}</p>
          </div>
        )}

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
                <div className="flex items-center gap-1 ml-4">
                  <button
                    onClick={() => setShareModalOpen(true)}
                    className="p-2 rounded-lg text-gray-400 hover:text-yellow-500 hover:bg-zinc-800 transition-colors"
                    aria-label="Share note"
                  >
                    <Share2 className="h-5 w-5" />
                  </button>
                  <button
                    onClick={handleDeleteNote}
                    className="p-2 rounded-lg text-gray-400 hover:text-red-500 hover:bg-zinc-800 transition-colors"
                    aria-label="Delete note"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">{formatDate(selectedNote.date)}</p>
                <p className={`text-xs ${selectedNote.content.length > MAX_CONTENT_LENGTH * 0.9 ? 'text-red-400' : 'text-gray-500'}`}>
                  {selectedNote.content.length.toLocaleString()} / {MAX_CONTENT_LENGTH.toLocaleString()} characters
                </p>
              </div>
            </div>
            {limitError && (
              <div className="mx-6 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                <p className="text-sm text-red-400">{limitError}</p>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6">
              <textarea
                className="note-editor-content h-full w-full resize-none bg-transparent text-lg text-white focus:outline-none"
                value={selectedNote.content}
                onChange={(e) => handleNoteChange(e.target.value)}
                placeholder="Type something..."
                spellCheck
                autoCapitalize="sentences"
                autoCorrect="on"
                maxLength={MAX_CONTENT_LENGTH + 100}
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
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        user={user}
        onPinSet={handlePinSet}
        hasPin={hasPin}
        onPinRemove={handlePinRemove}
      />
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => setShareModalOpen(false)}
        noteTitle={selectedNote?.title || ""}
        noteContent={selectedNote?.content || ""}
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
