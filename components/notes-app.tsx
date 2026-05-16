"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import useSWR from "swr"
import { Plus, Search, ChevronLeft, Lock, Share2, Trash2, Brain, Send, Bot, User, Loader2, FileText, MessageSquare, Trash, Eye, EyeOff, Download, Play, Pause, X } from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { AvatarButton } from "@/components/avatar-button"
import { SettingsModal, getSonioxApiKey, getSilenceTimeout, getTranscriptionLang, getOpenAiApiKey, getDeepseekApiKey } from "@/components/settings-modal"
import { PinLoginModal, storePinData, getPinData, removePinData } from "@/components/pin-login-modal"
import {
  encryptNote,
  decryptNote,
  type EncryptedPayload,
  type DecryptedNote,
  type NoteAttachment,
} from "@/lib/crypto"
import { ShareModal } from "@/components/share-modal"
import { VoiceRecorder } from "@/components/voice-recorder"
import type { Citation, Message } from "@/components/ai-chat-modal"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

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

// ─── Chat helpers ─────────────────────────────────────────────────────────────

const WELCOME_MSG: Message = {
  id: "welcome",
  role: "ai",
  content: "Hey! I'm your AI assistant — got access to all your notes. What do you want to look up?",
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-")
          return isBlock
            ? <code className="block bg-zinc-800 rounded p-2 text-xs font-mono my-2 overflow-x-auto whitespace-pre">{children}</code>
            : <code className="bg-zinc-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-yellow-500/50 pl-3 text-gray-400 italic my-2">{children}</blockquote>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="border-zinc-700 my-3" />,
        a: ({ href, children }) => <a href={href} className="text-yellow-400 underline hover:text-yellow-300" target="_blank" rel="noopener noreferrer">{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function injectCitations(
  text: string,
  citations: Citation[],
  onJump: (noteId: string) => void,
): React.ReactNode {
  const parts = text.split(/(\[\d+\])/g)
  if (parts.length === 1) return text
  return (
    <>
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (match) {
          const idx = parseInt(match[1])
          const citation = citations.find((c) => c.index === idx)
          if (citation) {
            return (
              <button
                key={i}
                onClick={() => onJump(citation.noteId)}
                className="inline-flex items-center justify-center rounded px-1 text-[11px] font-semibold bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/30 hover:text-yellow-300 transition-colors mx-0.5 cursor-pointer whitespace-nowrap"
                title={`Jump to: ${citation.title}`}
              >
                ({idx})
              </button>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </>
  )
}

function processChildren(
  children: React.ReactNode,
  citations: Citation[],
  onJump: (noteId: string) => void,
): React.ReactNode {
  return (Array.isArray(children) ? children : [children]).map((child, i) => {
    if (typeof child === "string") return <span key={i}>{injectCitations(child, citations, onJump)}</span>
    return child
  })
}

function MarkdownWithCitations({ content, citations, onJump }: {
  content: string
  citations: Citation[]
  onJump: (noteId: string) => void
}) {
  const inject = (children: React.ReactNode) => processChildren(children, citations, onJump)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{inject(children)}</p>,
        h1: ({ children }) => <h1 className="text-lg font-bold mb-2 mt-3 first:mt-0">{inject(children)}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold mb-2 mt-3 first:mt-0">{inject(children)}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0">{inject(children)}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{inject(children)}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-")
          return isBlock
            ? <code className="block bg-zinc-800 rounded p-2 text-xs font-mono my-2 overflow-x-auto whitespace-pre">{children}</code>
            : <code className="bg-zinc-800 rounded px-1 py-0.5 text-xs font-mono">{children}</code>
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-yellow-500/50 pl-3 text-gray-400 italic my-2">{children}</blockquote>,
        strong: ({ children }) => <strong className="font-semibold text-white">{inject(children)}</strong>,
        em: ({ children }) => <em className="italic">{inject(children)}</em>,
        hr: () => <hr className="border-zinc-700 my-3" />,
        a: ({ href, children }) => <a href={href} className="text-yellow-400 underline hover:text-yellow-300" target="_blank" rel="noopener noreferrer">{children}</a>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function renderWithCitations(
  content: string,
  citations: Citation[],
  onJump: (noteId: string) => void,
) {
  return <MarkdownWithCitations content={content} citations={citations} onJump={onJump} />
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
  const [activeTab, setActiveTab] = useState<"notes" | "agent">("notes")
  const [notePreview, setNotePreview] = useState(false)
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved">("idle") // Keep for auto-save logic
  const [pendingChanges, setPendingChanges] = useState<DecryptedNoteWithMeta | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [sonioxApiKey, setSonioxApiKey] = useState("")
  const [silenceTimeoutSec] = useState(() => getSilenceTimeout())
  const [transcriptionLang, setTranscriptionLang] = useState("en")

  // ── Agent / AI chat state ─────────────────────────────────────────────────
  const [chatConversations, setChatConversations] = useState<{ id: string; title: string; updatedAt: string }[]>([])
  const [chatActiveConvId, setChatActiveConvId] = useState<string>(() => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  const [chatMessages, setChatMessages] = useState<Message[]>([WELCOME_MSG])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Snapshot of note content when recording starts — transcription appends to this
  const recordingBaseContentRef = useRef<string>("")

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
            attachments: decryptedContent.attachments,
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
          { title: debouncedNote.title, content: debouncedNote.content, attachments: debouncedNote.attachments },
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

        // Re-index this note in the vector store so AI chat stays up to date
        fetch("/api/notes/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ notes: [{ id: debouncedNote.id, title: debouncedNote.title, content: debouncedNote.content, attachments: debouncedNote.attachments }] }),
        }).catch(() => { })
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

  // Load Soniox API key from localStorage
  useEffect(() => {
    setSonioxApiKey(getSonioxApiKey())
    setTranscriptionLang(getTranscriptionLang())
  }, [])

  // Load chat conversation history when switching to agent tab
  useEffect(() => {
    if (activeTab !== "agent" || !user?.encryptionKey) return
    fetch("/api/chat/history", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.conversations?.length) {
          setChatConversations(data.conversations)
          loadChatConversation(data.conversations[0].id)
        }
      })
      .catch(() => { })
    // Re-index notes
    if (localNotes.length > 0) {
      fetch("/api/notes/index", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ notes: localNotes.map(n => ({ id: n.id, title: n.title, content: n.content, attachments: n.attachments })) }),
      }).catch(() => { })
    }
  }, [activeTab, user?.encryptionKey])

  // Scroll chat to bottom
  useEffect(() => {
    if (activeTab === "agent") chatEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [chatMessages, activeTab])

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

  const handleJumpToNote = useCallback((noteId: string) => {
    const note = localNotes.find((n) => n.id === noteId)
    if (note) setSelectedNote(note)
  }, [localNotes])

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

  const addFiles = async (files: File[]) => {
    if (!selectedNote) return
    const newAttachments = await Promise.all(
      files.map(async (file) => {
        const buffer = await file.arrayBuffer()
        let base64 = ""
        if (file.type.startsWith("image/") || file.type.startsWith("audio/")) {
          const bytes = new Uint8Array(buffer)
          let binary = ""
          for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i])
          }
          base64 = `data:${file.type};base64,${btoa(binary)}`
        }
        let type: "image" | "text" | "audio" = "text"
        if (file.type.startsWith("image/")) type = "image"
        if (file.type.startsWith("audio/")) type = "audio"
        return {
          id: Date.now().toString() + Math.random().toString(36).slice(2, 7),
          name: file.name,
          type,
          size: file.size,
          dataUrl: base64,
        }
      })
    )
    const updatedNote = {
      ...selectedNote,
      attachments: [...(selectedNote.attachments || []), ...newAttachments],
      date: new Date(),
    }
    const updated = localNotes.map((n) => (n.id === selectedNote.id ? updatedNote : n))
    setLocalNotes(updated)
    setSelectedNote(updatedNote)
    setPendingChanges(updatedNote)
  }

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files.length > 0) {
      e.preventDefault()
      addFiles(Array.from(e.clipboardData.files))
    }
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    if (e.dataTransfer.files.length > 0) {
      addFiles(Array.from(e.dataTransfer.files))
    }
  }

  const removeAttachment = (attId: string) => {
    if (!selectedNote) return
    const updatedNote = {
      ...selectedNote,
      attachments: (selectedNote.attachments || []).filter((a) => a.id !== attId),
      date: new Date(),
    }
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
      attachments: [],
    }

    setLocalNotes([newNote, ...localNotes])
    setSelectedNote(newNote)

    try {
      const encrypted = await encryptNote(
        { title: newNote.title, content: newNote.content, attachments: newNote.attachments },
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

    const deletedId = selectedNote.id
    try {
      await fetch(`/api/notes?noteId=${deletedId}`, { method: "DELETE", credentials: "include" })
      // Remove from vector index so AI chat no longer references this note
      fetch("/api/notes/index", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ noteId: deletedId }),
      }).catch(() => { })
    } catch {
      // Silent fail
    }
  }

  // Voice recorder handlers
  const handleRecordingStart = useCallback(() => {
    recordingBaseContentRef.current = selectedNote?.content ?? ""
    // Refresh API key from storage each time recording starts (user may have updated it)
    setSonioxApiKey(getSonioxApiKey())
    setTranscriptionLang(getTranscriptionLang())

    // Auto-title new notes with recording timestamp
    if (selectedNote && selectedNote.title === "New Note") {
      const now = new Date()
      const dateStr = now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      const title = `Recorded on ${dateStr} ${timeStr}`
      const updated = { ...selectedNote, title, date: now }
      setSelectedNote(updated)
      setPendingChanges(updated)
    }
  }, [selectedNote])

  const handleRecordingStop = useCallback(() => {
    // nothing extra needed — transcript already committed
  }, [])

  const handleTranscriptUpdate = useCallback((transcript: string) => {
    if (!selectedNote) return
    const base = recordingBaseContentRef.current
    const separator = base && !base.endsWith("\n") ? "\n\n" : ""
    const newContent = base + separator + transcript
    if (newContent.length > MAX_CONTENT_LENGTH) return
    const updated = { ...selectedNote, content: newContent }
    setSelectedNote(updated)
    setPendingChanges(updated)
  }, [selectedNote])

  // ── Chat handlers ─────────────────────────────────────────────────────────

  const loadChatConversation = useCallback(async (convId: string) => {
    setChatActiveConvId(convId)
    try {
      const res = await fetch(`/api/chat/history?id=${convId}`, { credentials: "include" })
      const data = await res.json()
      if (data.messages?.length) {
        const restored: Message[] = data.messages.map(
          (m: { role: string; content: string; citations?: Citation[] }, i: number) => ({
            id: `hist-${convId}-${i}`,
            role: m.role === "user" ? "user" : "ai",
            content: m.content,
            citations: m.citations ?? [],
          })
        )
        setChatMessages([WELCOME_MSG, ...restored])
      } else {
        setChatMessages([WELCOME_MSG])
      }
    } catch {
      setChatMessages([WELCOME_MSG])
    }
  }, [])

  const handleNewChat = () => {
    const id = `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    setChatActiveConvId(id)
    setChatMessages([WELCOME_MSG])
    setChatInput("")
  }

  const handleDeleteConv = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    await fetch(`/api/chat/history?id=${convId}`, { method: "DELETE", credentials: "include" }).catch(() => { })
    const updated = chatConversations.filter((c) => c.id !== convId)
    setChatConversations(updated)
    if (convId === chatActiveConvId) {
      if (updated.length > 0) loadChatConversation(updated[0].id)
      else handleNewChat()
    }
  }

  const handleChatJump = (noteId: string) => {
    const note = localNotes.find((n) => n.id === noteId)
    if (note) {
      setActiveTab("notes")
      setSelectedNote(note)
    }
  }

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: chatInput.trim() }
    const aiMsgId = (Date.now() + 1).toString()
    setChatMessages((prev) => [...prev, userMsg, { id: aiMsgId, role: "ai", content: "", citations: [] }])
    setChatInput("")
    setChatLoading(true)
    try {
      const conversationHistory = chatMessages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role === "user" ? "user" as const : "assistant" as const,
          content: m.content,
          ...(m.citations?.length ? { citations: m.citations } : {}),
        }))
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ question: userMsg.content, conversationHistory, conversationId: chatActiveConvId }),
      })

      if (!res.ok || !res.body) throw new Error("Request failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() ?? ""
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const data = JSON.parse(line.slice(6))
            if (data.delta) {
              setChatMessages((prev) =>
                prev.map((m) => m.id === aiMsgId ? { ...m, content: m.content + data.delta } : m)
              )
            }
            if (data.done) {
              setChatMessages((prev) =>
                prev.map((m) => m.id === aiMsgId ? { ...m, citations: data.citations ?? [] } : m)
              )
              setChatConversations((prev) => {
                const existing = prev.find((c) => c.id === chatActiveConvId)
                const title = existing?.title ?? userMsg.content.slice(0, 60)
                return [
                  { id: chatActiveConvId, title, updatedAt: new Date().toISOString() },
                  ...prev.filter((c) => c.id !== chatActiveConvId),
                ]
              })
            }
            if (data.error) throw new Error("Stream error")
          } catch {/* skip malformed lines */ }
        }
      }
    } catch {
      setChatMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, content: "Something went wrong. Please try again." } : m)
      )
    } finally {
      setChatLoading(false)
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
        {/* Note editor — full screen when a note is selected */}
        {selectedNote && activeTab === "notes" ? (
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
                  <VoiceRecorder
                    apiKey={sonioxApiKey}
                    lang={transcriptionLang}
                    silenceTimeoutSec={silenceTimeoutSec}
                    onTranscriptUpdate={handleTranscriptUpdate}
                    onRecordingStart={handleRecordingStart}
                    onRecordingStop={handleRecordingStop}
                  />
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
                  <button
                    onClick={() => setNotePreview((v) => !v)}
                    className={`p-2 rounded-lg transition-colors ${notePreview ? 'text-yellow-500 bg-zinc-800' : 'text-gray-400'}`}
                    aria-label="Toggle preview"
                  >
                    {notePreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
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
            <div className="flex-1 overflow-y-auto p-4 flex flex-col">
              {notePreview ? (
                <div className="prose prose-invert prose-base max-w-none text-white text-base">
                  <MarkdownContent content={selectedNote.content || "*Nothing to preview*"} />
                </div>
              ) : (
                <textarea
                  className="note-editor-content flex-1 w-full resize-none bg-transparent text-white text-base focus:outline-none"
                  value={selectedNote.content}
                  onChange={(e) => handleNoteChange(e.target.value)}
                  onPaste={handlePaste}
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  placeholder="Type something..."
                  spellCheck
                  autoCapitalize="sentences"
                  autoCorrect="on"
                  maxLength={MAX_CONTENT_LENGTH + 100}
                />
              )}
            </div>
            {selectedNote.attachments && selectedNote.attachments.length > 0 && (
              <div className="h-[30%] min-h-[220px] border-t border-gray-800 p-4 bg-zinc-950/50 flex flex-col">
                <h3 className="text-sm font-medium text-white mb-3">Attachments ({selectedNote.attachments.length})</h3>
                <div className="flex-1 overflow-x-auto flex gap-4 pb-2 items-start custom-scrollbar">
                  {selectedNote.attachments.map((att) => (
                    <AttachmentCard key={att.id} attachment={att} onRemove={() => removeAttachment(att.id)} />
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            {/* Mobile header with brand + tabs */}
            <div className="border-b border-gray-800 px-4 pt-4 pb-0">
              <div className="mb-3">
                <h1 className="text-lg font-medium tracking-wide text-white">notes</h1>
              </div>
              <div className="flex gap-0 p-4">
                <button
                  onClick={() => setActiveTab("notes")}
                  className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "notes" ? "border-yellow-500 text-yellow-500" : "border-transparent text-gray-500"
                    }`}
                >
                  Notes
                </button>
                <button
                  onClick={() => setActiveTab("agent")}
                  className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "agent" ? "border-yellow-500 text-yellow-500" : "border-transparent text-gray-500"
                    }`}
                >
                  Agent
                </button>
              </div>
            </div>

            {activeTab === "notes" ? (
              <>
                <div className="p-4 border-b border-gray-800">
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
                  <span className="text-sm text-gray-400">{filteredNotes.length} / {MAX_NOTES_PER_USER} Notes</span>
                  <button
                    onClick={handleCreateNote}
                    className={`rounded-full p-2 ${localNotes.length >= MAX_NOTES_PER_USER ? 'text-gray-600 cursor-not-allowed' : 'text-yellow-500'}`}
                    aria-label="New note"
                    disabled={localNotes.length >= MAX_NOTES_PER_USER}
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                {limitError && (
                  <div className="mx-4 mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                    <p className="text-xs text-red-400">{limitError}</p>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto momentum-scroll pb-20">
                  {isLoading ? <NotesSkeleton /> : (
                    <NotesList notes={filteredNotes} selectedId={null} onSelect={handleNoteSelect} formatDate={formatDate} />
                  )}
                </div>
              </>
            ) : (
              /* Mobile agent view */
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="flex-1 overflow-y-auto p-4 space-y-4 momentum-scroll">
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`flex items-start gap-2 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                      <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${msg.role === "user" ? "bg-zinc-800" : "bg-yellow-500 text-black"}`}>
                        {msg.role === "user" ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
                      </div>
                      <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${msg.role === "user" ? "bg-zinc-800 text-white rounded-tr-sm" : "bg-zinc-900 border border-zinc-800 text-gray-200 rounded-tl-sm"
                        }`}>
                        {msg.role === "ai" && msg.citations?.length
                          ? renderWithCitations(msg.content, msg.citations, handleChatJump)
                          : <MarkdownContent content={msg.content} />
                        }
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="flex items-start gap-2">
                      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-black">
                        <Bot className="h-3 w-3" />
                      </div>
                      <div className="rounded-2xl rounded-tl-sm px-3 py-2 bg-zinc-900 border border-zinc-800">
                        <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </div>
                <div className="px-4 py-3 border-t border-zinc-800 bg-zinc-900/30 pb-24">
                  <form onSubmit={(e) => { e.preventDefault(); handleChatSend() }} className="relative flex items-center">
                    <input
                      type="text"
                      placeholder="Ask about your notes..."
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      className="w-full rounded-2xl bg-zinc-800 py-3 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none"
                      disabled={chatLoading}
                    />
                    <button
                      type="submit"
                      disabled={!chatInput.trim() || chatLoading}
                      className="absolute right-2 p-2 rounded-xl bg-yellow-500 text-black disabled:opacity-50"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  </form>
                </div>
              </div>
            )}
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
      {/* Left panel */}
      <div className="w-80 border-r border-gray-800 flex flex-col">
        {/* Brand + tabs */}
        <div className="border-b border-gray-800 px-4 pt-10 pb-0">

          <div className="flex gap-0 p-4">
            <button
              onClick={() => setActiveTab("notes")}
              className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "notes"
                ? "border-yellow-500 text-yellow-500"
                : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
            >Notes</button>
            <button
              onClick={() => setActiveTab("agent")}
              className={`flex-1 pb-2 text-sm font-semibold border-b-2 transition-colors ${activeTab === "agent"
                ? "border-yellow-500 text-yellow-500"
                : "border-transparent text-gray-500 hover:text-gray-300"
                }`}
            >Agent</button>
          </div>
        </div>

        {activeTab === "notes" ? (
          <>
            <div className="p-4 border-b border-gray-800">
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
              {isLoading ? <NotesSkeleton /> : (
                <NotesList notes={filteredNotes} selectedId={selectedNote?.id ?? null} onSelect={handleNoteSelect} formatDate={formatDate} />
              )}
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
              <button
                onClick={handleNewChat}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-xs font-medium transition-colors"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </div>
            <div className="flex-1 overflow-y-auto py-2">
              {chatConversations.length === 0 ? (
                <p className="px-4 py-6 text-xs text-gray-600 text-center">No conversations yet</p>
              ) : (
                chatConversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => loadChatConversation(conv.id)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && loadChatConversation(conv.id)}
                    className={`w-full flex items-start gap-2 px-3 py-2.5 text-left group transition-colors rounded-lg mx-1 cursor-pointer ${conv.id === chatActiveConvId
                      ? "bg-yellow-500/10 text-yellow-300"
                      : "hover:bg-zinc-800/50 text-gray-400 hover:text-gray-200"
                      }`}
                    style={{ width: "calc(100% - 8px)" }}
                  >
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight">{conv.title}</p>
                      <p className="text-[10px] opacity-50 mt-0.5">{formatRelativeTime(conv.updatedAt)}</p>
                    </div>
                    <button
                      onClick={(e) => handleDeleteConv(e, conv.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all shrink-0"
                    >
                      <Trash className="h-3 w-3" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>

      {/* Right panel */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "notes" ? (
          selectedNote ? (
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
                    <VoiceRecorder
                      apiKey={sonioxApiKey}
                      lang={transcriptionLang}
                      silenceTimeoutSec={silenceTimeoutSec}
                      onTranscriptUpdate={handleTranscriptUpdate}
                      onRecordingStart={handleRecordingStart}
                      onRecordingStop={handleRecordingStop}
                    />
                    <button
                      onClick={() => setNotePreview((v) => !v)}
                      className={`p-2 rounded-lg transition-colors ${notePreview ? 'text-yellow-500 bg-zinc-800' : 'text-gray-400 hover:text-yellow-500 hover:bg-zinc-800'}`}
                      aria-label="Toggle preview"
                      title={notePreview ? "Edit" : "Preview markdown"}
                    >
                      {notePreview ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
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
              <div className="flex-1 overflow-y-auto p-6 flex flex-col">
                {notePreview ? (
                  <div className="prose prose-invert max-w-none text-lg text-white">
                    <MarkdownContent content={selectedNote.content || "*Nothing to preview*"} />
                  </div>
                ) : (
                  <textarea
                    className="note-editor-content flex-1 w-full resize-none bg-transparent text-lg text-white focus:outline-none"
                    value={selectedNote.content}
                    onChange={(e) => handleNoteChange(e.target.value)}
                    onPaste={handlePaste}
                    onDrop={handleDrop}
                    onDragOver={(e) => e.preventDefault()}
                    placeholder="Type something..."
                    spellCheck
                    autoCapitalize="sentences"
                    autoCorrect="on"
                    maxLength={MAX_CONTENT_LENGTH + 100}
                  />
                )}
              </div>
              {selectedNote.attachments && selectedNote.attachments.length > 0 && (
                <div className="h-[30%] min-h-[240px] border-t border-gray-800 p-6 bg-zinc-950/50 flex flex-col">
                  <h3 className="text-sm font-medium text-white mb-4">Attachments ({selectedNote.attachments.length})</h3>
                  <div className="flex-1 overflow-x-auto flex gap-4 pb-2 items-start custom-scrollbar">
                    {selectedNote.attachments.map((att) => (
                      <AttachmentCard key={att.id} attachment={att} onRemove={() => removeAttachment(att.id)} />
                    ))}
                  </div>
                </div>
              )}
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
          )
        ) : (
          /* Agent chat panel */
          <div className="flex flex-col h-full">
            {/* Chat header */}
            <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-800 bg-zinc-900/50">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <Brain className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight">AI Assistant</h2>
                <p className="text-[10px] text-gray-500">Query your secure knowledge base</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5 momentum-scroll">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${msg.role === "user" ? "bg-zinc-800 text-white" : "bg-yellow-500 text-black"}`}>
                    {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div className={`flex max-w-[78%] flex-col gap-2 rounded-2xl px-4 py-3 text-sm ${msg.role === "user"
                    ? "bg-zinc-800 text-white rounded-tr-sm"
                    : "bg-zinc-900/80 border border-zinc-800/50 text-gray-200 rounded-tl-sm shadow-sm"
                    }`}>
                    {msg.role === "ai" && msg.citations?.length
                      ? renderWithCitations(msg.content, msg.citations, handleChatJump)
                      : <MarkdownContent content={msg.content} />
                    }
                    {msg.citations && msg.citations.length > 0 && (() => {
                      const usedIndices = new Set([...msg.content.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1])))
                      const usedCitations = msg.citations.filter((c) => usedIndices.has(c.index))
                      if (!usedCitations.length) return null
                      return (
                        <div className="mt-1.5 pt-2 border-t border-zinc-700/50 flex flex-col gap-1">
                          {usedCitations.map((c) => (
                            <button key={c.noteId} onClick={() => handleChatJump(c.noteId)}
                              className="flex items-center gap-2 text-xs text-gray-400 hover:text-yellow-400 transition-colors text-left group">
                              <span className="flex items-center justify-center rounded px-1 bg-yellow-500/10 text-yellow-500 font-semibold text-[11px] shrink-0 group-hover:bg-yellow-500/20">({c.index})</span>
                              <FileText className="h-3 w-3 shrink-0 opacity-50" />
                              <span className="truncate">{c.title}</span>
                            </button>
                          ))}
                        </div>
                      )
                    })()}
                  </div>
                </div>
              ))}
              {chatLoading && chatMessages[chatMessages.length - 1]?.content === "" && (
                <div className="flex items-start gap-3 -mt-4">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-black">
                    <Bot className="h-3.5 w-3.5" />
                  </div>
                  <div className="flex rounded-2xl rounded-tl-sm px-4 py-3 bg-zinc-900/80 border border-zinc-800/50">
                    <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Input */}
            <div className="px-6 py-4 border-t border-zinc-800/50 bg-zinc-900/30">
              <form onSubmit={(e) => { e.preventDefault(); handleChatSend() }} className="relative flex items-center">
                <input
                  type="text"
                  placeholder="Ask about your notes..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="w-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 py-3.5 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all"
                  disabled={chatLoading}
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="absolute right-2 p-2 rounded-xl bg-yellow-500 text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
                >
                  <Send className="h-3.5 w-3.5" />
                </button>
              </form>
              <p className="text-center text-[10px] text-gray-600 mt-2">
                AI can make mistakes. Consider verifying important information.
              </p>
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
            className={`w-full p-4 text-left transition-colors ${selectedId === note.id ? "bg-zinc-800" : "hover:bg-zinc-900"
              }`}
            onClick={() => onSelect(note)}
          >
            <h3 className="font-medium text-white truncate">{note.title}</h3>
            <p className="mt-1 text-sm text-gray-400 truncate">
              {formatDate(note.date)} — {note.attachments && note.attachments.length > 0 ? `${note.attachments.length} attachment${note.attachments.length > 1 ? 's' : ''}` : (note.content.slice(0, 50) || "No content")}
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

function AttachmentCard({ attachment, onRemove }: { attachment: NoteAttachment; onRemove: () => void }) {
  const isImage = attachment.type === "image"
  const isAudio = attachment.type === "audio"
  const isText = attachment.type === "text"

  const [viewerOpen, setViewerOpen] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    if (isAudio && attachment.dataUrl) {
      audioRef.current = new Audio(attachment.dataUrl)
      audioRef.current.onended = () => setIsPlaying(false)
    }
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [isAudio, attachment.dataUrl])

  const toggleAudio = () => {
    if (!audioRef.current) return
    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      audioRef.current.play()
      setIsPlaying(true)
    }
  }

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + " B"
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB"
    return (bytes / (1024 * 1024)).toFixed(1) + " MB"
  }

  const getBadge = () => {
    if (isImage) return "IMG"
    if (isAudio) return "M4A"
    return "TXT"
  }

  const getBadgeColor = () => {
    if (isImage) return "bg-blue-600/90"
    if (isAudio) return "bg-purple-600/90"
    return "bg-cyan-700/90"
  }

  return (
    <>
      <div className="group relative flex-shrink-0 w-64 rounded-xl border border-white/10 bg-[#1C1C1E] overflow-hidden shadow-sm shadow-black/50 flex flex-col transition-colors hover:bg-[#2C2C2E]">
        <div
          className={`h-32 bg-[#151516] relative flex items-center justify-center overflow-hidden border-b border-white/5 ${isImage ? 'cursor-pointer' : ''}`}
          onClick={() => { if (isImage) setViewerOpen(true) }}
        >
          <div className={`absolute top-2 left-2 px-1.5 py-0.5 rounded text-[9px] font-bold text-white tracking-wider z-10 ${getBadgeColor()}`}>
            {getBadge()}
          </div>
          {isImage && attachment.dataUrl && (
            <img src={attachment.dataUrl} alt={attachment.name} className="w-full h-full object-cover" />
          )}
          {isText && <FileText className="h-12 w-12 text-white" strokeWidth={1} />}
          {isAudio && (
            <div className="flex items-center justify-center gap-1 w-full h-full px-6 opacity-80">
              <div className={`h-4 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "0ms" }} />
              <div className={`h-8 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "100ms" }} />
              <div className={`h-12 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "200ms" }} />
              <div className={`h-16 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "300ms" }} />
              <div className={`h-10 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "400ms" }} />
              <div className={`h-6 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "500ms" }} />
              <div className={`h-12 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "600ms" }} />
              <div className={`h-8 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "700ms" }} />
              <div className={`h-3 w-1.5 bg-purple-400 rounded-full ${isPlaying ? 'animate-pulse' : ''}`} style={{ animationDelay: "800ms" }} />
            </div>
          )}
        </div>
        <div className="p-3 flex flex-col justify-between h-20">
          <p className="text-sm text-white font-medium truncate">{attachment.name}</p>
          <div className="flex items-center justify-between">
            <p className="text-xs text-gray-500">{formatSize(attachment.size)}</p>
            <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
              {isAudio && (
                <button className="text-gray-400 hover:text-white" title={isPlaying ? "Pause" : "Play"} onClick={toggleAudio}>
                  {isPlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                </button>
              )}
              <button className="text-gray-400 hover:text-white" title="Download" onClick={() => {
                if (attachment.dataUrl) {
                  const a = document.createElement("a")
                  a.href = attachment.dataUrl
                  a.download = attachment.name
                  a.click()
                }
              }}><Download className="h-3.5 w-3.5" /></button>
              <button className="text-gray-400 hover:text-red-500" title="Delete" onClick={onRemove}><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>
      </div>
      {viewerOpen && isImage && attachment.dataUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4" onClick={() => setViewerOpen(false)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <button className="absolute top-2 right-2 z-10 text-white/70 hover:text-white p-1 bg-black/60 rounded-full transition-colors" onClick={() => setViewerOpen(false)}>
              <X className="h-5 w-5" />
            </button>
            <img src={attachment.dataUrl} alt={attachment.name} className="max-h-[90vh] max-w-[90vw] object-contain shadow-2xl rounded" />
          </div>
        </div>
      )}
    </>
  )
}
