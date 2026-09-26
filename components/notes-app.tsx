"use client"

import React, { useState, useEffect, useCallback, useRef, useMemo } from "react"
import useSWR from "swr"
import {
  Plus,
  Search,
  ChevronLeft,
  Lock,
  Share2,
  Trash2,
  Brain,
  Send,
  Bot,
  User,
  Loader2,
  FileText,
  MessageSquare,
  Trash,
  Eye,
  EyeOff,
  Download,
  Play,
  Pause,
  X,
  AudioWaveform,
  SlidersHorizontal,
  Folder as FolderIcon,
  FolderOpen,
  Archive,
  Settings as SettingsIcon,
  Sparkles,
  PanelLeft,
  MoreHorizontal,
  FolderInput,
  Notebook,
  AlertTriangle,
  RotateCcw,
  Edit3,
  CornerDownRight,
  Check,
  Users,
} from "lucide-react"
import { AuthModal } from "@/components/auth-modal"
import { AvatarButton } from "@/components/avatar-button"
import { ThemeToggle } from "@/components/theme-toggle"
import { getSilenceTimeout, getTranscriptionLang } from "@/lib/user-settings"
import { PinLoginModal, storePinData, getPinData, removePinData } from "@/components/pin-login-modal"
import {
  encryptNote,
  decryptNote,
  getNoteDisplayTitle,
  type EncryptedPayload,
  type DecryptedNote,
  type NoteAttachment,
} from "@/lib/crypto"
import { ShareModal, type ShareTarget } from "@/components/share-modal"
import { SpotlightSearchModal } from "@/components/spotlight-search-modal"
import { HighlightText } from "@/lib/highlight"
import { VoiceRecorder, type AudioRecordingData } from "@/components/voice-recorder"
import { TranscriptionSidebar } from "@/components/transcription-sidebar"
import { SettingsModal } from "@/components/settings-modal"
import {
  NoteFilterModal,
  type NoteFilterCriteria,
  EMPTY_NOTE_FILTERS,
  type SpeakerOption,
} from "@/components/note-filter-modal"
import { NoteTagsPopover } from "@/components/note-tags-popover"
import {
  type SpeakerProfile,
  type TranscriptSegment,
  getStoredSpeakers,
  saveStoredSpeakers,
  resolveSpeakerName,
  updateNoteTextSpeakerName,
} from "@/lib/speakers"
import {
  getStoredTags,
  saveStoredTags,
  addStoredTag,
  APPLE_TAG_COLORS,
  getStoredTagColors,
  getTagColor,
} from "@/lib/tags"
import {
  type FolderItem,
  type SharedCollaborator,
  getStoredFolders,
  addStoredFolder,
  renameStoredFolder,
  deleteStoredFolder,
  archiveStoredFolder,
  moveFolderToParent,
  getFlattenedFolderTree,
  updateFolderCollaborators,
  DEFAULT_FOLDERS,
} from "@/lib/folders"
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

// Limits
const MAX_NOTES_PER_USER = 100
const MAX_CONTENT_LENGTH = 50000 // ~50,000 characters

// Tab-visibility lock thresholds
const PIN_TIMEOUT = 60 * 60 * 1000 // 1 hour
const LOGOUT_TIMEOUT = 12 * 60 * 60 * 1000 // 12 hours

// ─── Helper Functions ─────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay)
    return () => clearTimeout(handler)
  }, [value, delay])
  return debouncedValue
}

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

// Format: 15 July, 2026
function formatDateStandard(date: Date | string): string {
  const d = new Date(date)
  if (isNaN(d.getTime())) return formatDateStandard(new Date())
  const day = d.getDate()
  const month = d.toLocaleString("en-US", { month: "long" })
  const year = d.getFullYear()
  return `${day} ${month}, ${year}`
}

function getTagPillClass(tag: string): string {
  const lower = tag.toLowerCase()
  if (lower === "work") {
    return "bg-amber-100/80 text-amber-800 dark:bg-amber-950/60 dark:text-yellow-300"
  }
  if (lower === "meeting") {
    return "bg-zinc-100 text-zinc-600 dark:bg-zinc-800/80 dark:text-zinc-300"
  }
  if (lower === "amili") {
    return "bg-sky-100/80 text-sky-800 dark:bg-sky-950/60 dark:text-sky-300"
  }
  if (lower === "product") {
    return "bg-rose-100/80 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
  }
  if (lower === "personal") {
    return "bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300"
  }
  return "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-zinc-800 dark:text-zinc-200">{children}</p>,
        h1: ({ children }) => <h1 className="text-xl font-bold mb-2 mt-4 first:mt-0 text-zinc-900 dark:text-white">{children}</h1>,
        h2: ({ children }) => <h2 className="text-lg font-bold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-white">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold mb-1 mt-2 first:mt-0 text-zinc-900 dark:text-white">{children}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-zinc-800 dark:text-zinc-200">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-zinc-800 dark:text-zinc-200">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-")
          return isBlock ? (
            <code className="block bg-zinc-100 border border-zinc-200 rounded p-2 text-xs font-mono my-2 overflow-x-auto whitespace-pre text-zinc-900 dark:bg-zinc-800 dark:border-transparent dark:text-white">{children}</code>
          ) : (
            <code className="bg-zinc-100 border border-zinc-200 rounded px-1 py-0.5 text-xs font-mono text-zinc-900 dark:bg-zinc-800 dark:border-transparent dark:text-white">{children}</code>
          )
        },
        pre: ({ children }) => <>{children}</>,
        blockquote: ({ children }) => <blockquote className="border-l-2 border-amber-500 pl-3 text-zinc-600 dark:text-gray-400 italic my-2">{children}</blockquote>,
        strong: ({ children }) => <strong className="font-semibold text-zinc-900 dark:text-white">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        hr: () => <hr className="border-zinc-200 dark:border-zinc-700 my-4" />,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

function injectCitations(text: string, citations: Citation[], onJump: (noteId: string) => void): React.ReactNode {
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
                className="inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[11px] font-semibold bg-amber-500/15 text-amber-700 hover:bg-amber-500/25 hover:text-amber-800 dark:bg-yellow-500/15 dark:text-yellow-400 dark:hover:bg-yellow-500/30 dark:hover:text-yellow-300 transition-colors mx-0.5 cursor-pointer whitespace-nowrap"
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

function processChildren(children: React.ReactNode, citations: Citation[], onJump: (noteId: string) => void): React.ReactNode {
  return (Array.isArray(children) ? children : [children]).map((child, i) => {
    if (typeof child === "string") return <span key={i}>{injectCitations(child, citations, onJump)}</span>
    return child
  })
}

function MarkdownWithCitations({ content, citations, onJump }: { content: string; citations: Citation[]; onJump: (noteId: string) => void }) {
  const inject = (children: React.ReactNode) => processChildren(children, citations, onJump)
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-zinc-800 dark:text-zinc-200">{inject(children)}</p>,
        h1: ({ children }) => <h1 className="text-base font-bold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-white">{inject(children)}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold mb-2 mt-3 first:mt-0 text-zinc-900 dark:text-white">{inject(children)}</h2>,
        h3: ({ children }) => <h3 className="text-xs font-bold mb-1 mt-2 first:mt-0 text-zinc-900 dark:text-white">{inject(children)}</h3>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5 text-zinc-800 dark:text-zinc-200">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5 text-zinc-800 dark:text-zinc-200">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{inject(children)}</li>,
      }}
    >
      {content}
    </ReactMarkdown>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function NotesApp() {
  const [user, setUser] = useState<User | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authChecked, setAuthChecked] = useState(false)
  const [pinLoginOpen, setPinLoginOpen] = useState(false)
  const [hasPin, setHasPin] = useState(false)

  // Notes state
  const [localNotes, setLocalNotes] = useState<DecryptedNoteWithMeta[]>([])
  const [selectedNote, setSelectedNote] = useState<DecryptedNoteWithMeta | null>(null)
  const [selectedFolder, setSelectedFolder] = useState<string>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(240)
  const isResizingSidebarRef = useRef(false)
  const [activeTab, setActiveTab] = useState<"notes" | "agent">("notes")
  const [notePreview, setNotePreview] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<DecryptedNoteWithMeta | null>(null)
  const [shareModalOpen, setShareModalOpen] = useState(false)
  const [limitError, setLimitError] = useState<string | null>(null)
  const [silenceTimeoutSec] = useState(() => getSilenceTimeout())
  const [transcriptionLang, setTranscriptionLang] = useState("en")

  // Folder & Tag Management
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [isCreatingFolder, setIsCreatingFolder] = useState(false)
  const [inlineFolderName, setInlineFolderName] = useState("New folder")
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null)
  const [editingFolderName, setEditingFolderName] = useState("")
  const [folderActionMenuId, setFolderActionMenuId] = useState<string | null>(null)
  const [movingFolder, setMovingFolder] = useState<FolderItem | null>(null)
  const [draggedFolderId, setDraggedFolderId] = useState<string | null>(null)
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null)
  const [folderShareToast, setFolderShareToast] = useState<string | null>(null)
  const [collapsedFolderIds, setCollapsedFolderIds] = useState<Set<string>>(new Set())
  const [allAvailableTags, setAllAvailableTags] = useState<string[]>([])
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [selectedTagColor, setSelectedTagColor] = useState<string>(APPLE_TAG_COLORS[4].color) // blue default
  const [tagInputOpen, setTagInputOpen] = useState(false)
  const tagAddButtonRef = useRef<HTMLButtonElement>(null)
  const [newTagInput, setNewTagInput] = useState("")
  const [moreMenuOpen, setMoreMenuOpen] = useState(false)

  // Spotlight & Main Search states
  const [spotlightOpen, setSpotlightOpen] = useState(false)
  const mainSearchInputRef = useRef<HTMLInputElement>(null)
  const editorTextareaRef = useRef<HTMLTextAreaElement>(null)

  // Share modal target state
  const [shareTarget, setShareTarget] = useState<ShareTarget | null>(null)

  // Filter modal state
  const [filterModalOpen, setFilterModalOpen] = useState(false)
  const [noteFilters, setNoteFilters] = useState<NoteFilterCriteria>(EMPTY_NOTE_FILTERS)
  const filterButtonRef = useRef<HTMLButtonElement>(null)

  // Speaker & Transcription state
  const [speakerProfiles, setSpeakerProfiles] = useState<SpeakerProfile[]>([])
  const [transcriptionSidebarOpen, setTranscriptionSidebarOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // Load speaker profiles, folders, tags on mount
  useEffect(() => {
    setSpeakerProfiles(getStoredSpeakers())
    setFolders(getStoredFolders())
    setAllAvailableTags(getStoredTags())
    setTagColors(getStoredTagColors())
  }, [])

  // Close folder action menu when clicking outside
  useEffect(() => {
    if (!folderActionMenuId) return
    const handleClickOutside = () => setFolderActionMenuId(null)
    window.addEventListener("click", handleClickOutside)
    return () => window.removeEventListener("click", handleClickOutside)
  }, [folderActionMenuId])

  // Global Keyboard Shortcuts: ESC, Cmd+Space / Ctrl+Space, Cmd+F / Ctrl+F
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Cmd + Space or Ctrl + Space: Spotlight quick search
      if ((e.metaKey || e.ctrlKey) && (e.code === "Space" || e.key === " ")) {
        e.preventDefault()
        setSpotlightOpen((prev) => !prev)
        return
      }

      // 2. Cmd + F or Ctrl + F: Focus on main note search
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F")) {
        e.preventDefault()
        setActiveTab("notes")
        setTimeout(() => {
          mainSearchInputRef.current?.focus()
          mainSearchInputRef.current?.select()
        }, 10)
        return
      }

      // 3. ESC key: Close modals, dropdowns, searches, or blur active text inputs
      if (e.key === "Escape") {
        if (spotlightOpen) {
          e.preventDefault()
          setSpotlightOpen(false)
          return
        }

        if (authOpen || pinLoginOpen || shareModalOpen || settingsOpen || filterModalOpen || movingFolder) {
          e.preventDefault()
          setAuthOpen(false)
          setPinLoginOpen(false)
          setShareModalOpen(false)
          setShareTarget(null)
          setSettingsOpen(false)
          setFilterModalOpen(false)
          setMovingFolder(null)
          return
        }

        if (folderActionMenuId || moreMenuOpen || tagInputOpen) {
          e.preventDefault()
          setFolderActionMenuId(null)
          setMoreMenuOpen(false)
          setTagInputOpen(false)
          return
        }

        if (isCreatingFolder || editingFolderId) {
          e.preventDefault()
          setIsCreatingFolder(false)
          setEditingFolderId(null)
          return
        }

        if (searchQuery || document.activeElement === mainSearchInputRef.current) {
          e.preventDefault()
          setSearchQuery("")
          mainSearchInputRef.current?.blur()
          return
        }

        // Quit editing active text inputs
        if (document.activeElement && document.activeElement instanceof HTMLElement) {
          document.activeElement.blur()
        }
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown)
    return () => window.removeEventListener("keydown", handleGlobalKeyDown)
  }, [
    spotlightOpen,
    searchQuery,
    authOpen,
    pinLoginOpen,
    shareModalOpen,
    settingsOpen,
    filterModalOpen,
    movingFolder,
    folderActionMenuId,
    moreMenuOpen,
    tagInputOpen,
    isCreatingFolder,
    editingFolderId,
  ])

  // Collaborator management handlers
  const handleUpdateCollaborators = (updated: SharedCollaborator[]) => {
    if (!shareTarget) return

    if (shareTarget.type === "folder") {
      const updatedFolders = updateFolderCollaborators(shareTarget.id, updated)
      setFolders(updatedFolders)
      setShareTarget((prev) => (prev && prev.type === "folder" ? { ...prev, sharedWith: updated } : prev))
    } else if (shareTarget.type === "note") {
      if (!selectedNote) return
      const updatedNote = { ...selectedNote, sharedWith: updated, date: new Date() }
      setLocalNotes((prev) => prev.map((n) => (n.id === updatedNote.id ? updatedNote : n)))
      setSelectedNote(updatedNote)
      setPendingChanges(updatedNote)
      setShareTarget((prev) => (prev && prev.type === "note" ? { ...prev, sharedWith: updated } : prev))
    }
  }

  const handleOpenShareNote = () => {
    if (!selectedNote) return
    setShareTarget({
      type: "note",
      id: selectedNote.id,
      title: selectedNote.title,
      content: selectedNote.content,
      tags: selectedNote.tags,
      audioRecording: selectedNote.audioRecording,
      transcriptSegments: selectedNote.transcriptSegments,
      sharedWith: selectedNote.sharedWith,
    })
    setShareModalOpen(true)
    setMoreMenuOpen(false)
  }

  const handleOpenShareFolder = (folder: FolderItem) => {
    const notesInFolder = localNotes.filter(
      (n) => (n.folder || "all").toLowerCase() === folder.id.toLowerCase()
    )
    setShareTarget({
      type: "folder",
      id: folder.id,
      name: folder.name,
      notes: notesInFolder,
      sharedWith: folder.sharedWith,
    })
    setShareModalOpen(true)
    setFolderActionMenuId(null)
  }

  // Render collaborator avatars helper
  const renderCollaboratorAvatars = (collaborators?: SharedCollaborator[], max: number = 3) => {
    if (!collaborators || collaborators.length === 0) return null
    const visible = collaborators.slice(0, max)
    const extra = collaborators.length - max

    return (
      <div
        className="flex -space-x-1.5 items-center shrink-0"
        title={`Shared with: ${collaborators.map((c) => `${c.name} (${c.permission})`).join(", ")}`}
      >
        {visible.map((c) => (
          <div
            key={c.id}
            className="w-4 h-4 rounded-full text-white text-[8px] font-bold flex items-center justify-center ring-1 ring-white dark:ring-zinc-900 shrink-0 uppercase shadow-2xs"
            style={{ backgroundColor: c.avatar || "#3b82f6" }}
          >
            {c.name.slice(0, 1)}
          </div>
        ))}
        {extra > 0 && (
          <div className="w-4 h-4 rounded-full bg-zinc-700 text-white text-[8px] font-medium flex items-center justify-center ring-1 ring-white dark:ring-zinc-900 shrink-0">
            +{extra}
          </div>
        )}
      </div>
    )
  }

  // ── Agent / AI chat state ─────────────────────────────────────────────────
  const [chatConversations, setChatConversations] = useState<{ id: string; title: string; updatedAt: string }[]>([])
  const [chatActiveConvId, setChatActiveConvId] = useState<string>(() => `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`)
  const [chatMessages, setChatMessages] = useState<Message[]>([WELCOME_MSG])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const chatScrollRef = useRef<HTMLDivElement>(null)

  // Snapshot of note content when recording starts
  const recordingBaseContentRef = useRef<string>("")
  const encryptionPassword = user?.encryptionKey || ""
  const hiddenAtRef = useRef<number | null>(null)

  // Auto-lock visibility change
  useEffect(() => {
    if (!user?.encryptionKey) return

    const applyLock = (hiddenDuration: number) => {
      if (hiddenDuration >= LOGOUT_TIMEOUT) {
        setUser({ ...user, encryptionKey: undefined })
      } else if (hiddenDuration >= PIN_TIMEOUT) {
        const pinData = getPinData()
        if (pinData && pinData.email === user.email) {
          setUser({ ...user, encryptionKey: undefined })
          setPinLoginOpen(true)
        } else {
          setUser({ ...user, encryptionKey: undefined })
        }
      }
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
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange)
  }, [user])

  // Check session on mount
  useEffect(() => {
    const checkSession = async () => {
      try {
        const pinData = getPinData()
        if (pinData) setHasPin(true)

        const res = await fetch("/api/auth/session", { credentials: "include" })
        const data = await res.json()

        if (data.user && data.user.encryptionKey) {
          setUser(data.user)
          if (pinData && pinData.email === data.user.email) setHasPin(true)
        } else if (data.user) {
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

  // SWR fetch for real user notes
  const { data, isLoading, mutate } = useSWR<{
    notes: EncryptedNoteFromServer[]
    encrypted: boolean
    authenticated?: boolean
  }>(user?.encryptionKey ? "/api/notes" : null, fetcher)

  // Decrypt notes when user data arrives
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
            tags: decryptedContent.tags || [],
            transcriptSegments: decryptedContent.transcriptSegments || [],
            audioRecording: decryptedContent.audioRecording,
            attachments: decryptedContent.attachments,
            date: new Date(encNote.date),
            folder: !encNote.folder || encNote.folder === "inbox" ? "all" : encNote.folder,
          })
        } catch {
          console.error("Failed to decrypt note:", encNote.id)
        }
      }

      if (decrypted.length > 0) {
        setLocalNotes(decrypted)
        setSelectedNote(decrypted[0])
      }
    }

    decryptAllNotes()
  }, [data, encryptionPassword])

  // Debounced auto-save
  const debouncedNote = useDebounce(pendingChanges, 500)

  useEffect(() => {
    if (!debouncedNote || !encryptionPassword) return

    const saveNoteEncrypted = async () => {
      try {
        const encrypted = await encryptNote(
          {
            title: debouncedNote.title,
            content: debouncedNote.content,
            tags: debouncedNote.tags,
            transcriptSegments: debouncedNote.transcriptSegments,
            audioRecording: debouncedNote.audioRecording,
            attachments: debouncedNote.attachments,
          },
          encryptionPassword
        )

        await fetch("/api/notes", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            id: debouncedNote.id,
            encryptedData: encrypted,
            date: debouncedNote.date instanceof Date ? debouncedNote.date.toISOString() : debouncedNote.date,
            folder: debouncedNote.folder,
          }),
        })

        // Vector store index
        fetch("/api/notes/index", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            notes: [
              {
                id: debouncedNote.id,
                title: debouncedNote.title,
                content: debouncedNote.content,
                attachments: debouncedNote.attachments,
              },
            ],
          }),
        }).catch(() => { })
      } catch {
        // Silent fail
      }
    }

    saveNoteEncrypted()
  }, [debouncedNote, encryptionPassword])

  useEffect(() => {
    if (user?.encryptionKey) mutate()
  }, [user?.encryptionKey, mutate])

  // Screen resize handler
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener("resize", check)
    return () => window.removeEventListener("resize", check)
  }, [])

  const handleSidebarMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    isResizingSidebarRef.current = true
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizingSidebarRef.current) return
      const newWidth = moveEvent.clientX
      if (newWidth < 100) {
        setIsSidebarCollapsed(true)
      } else {
        setIsSidebarCollapsed(false)
        setSidebarWidth(Math.min(380, Math.max(180, newWidth)))
      }
    }

    const handleMouseUp = () => {
      isResizingSidebarRef.current = false
      document.body.style.cursor = ""
      document.body.style.userSelect = ""
      window.removeEventListener("mousemove", handleMouseMove)
      window.removeEventListener("mouseup", handleMouseUp)
    }

    window.addEventListener("mousemove", handleMouseMove)
    window.addEventListener("mouseup", handleMouseUp)
  }, [])

  useEffect(() => {
    setTranscriptionLang(getTranscriptionLang())
  }, [])

  // Agent chat history
  useEffect(() => {
    if (activeTab !== "agent" || !user?.encryptionKey) return
    fetch("/api/chat/history", { credentials: "include" })
      .then((r) => r.json())
      .then((histData) => {
        if (histData.conversations?.length) {
          setChatConversations(histData.conversations)
          loadChatConversation(histData.conversations[0].id)
        }
      })
      .catch(() => { })
  }, [activeTab, user?.encryptionKey])

  // ── Note mutations ────────────────────────────────────────────────────────

  const handleTitleChange = (title: string) => {
    if (!selectedNote) return
    const updated = { ...selectedNote, title, date: new Date() }
    setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updated : n)))
    setSelectedNote(updated)
    setPendingChanges(updated)
  }

  const handleNoteChange = (content: string) => {
    if (!selectedNote) return
    if (content.length > MAX_CONTENT_LENGTH) {
      setLimitError(`Note content exceeds the maximum of ${MAX_CONTENT_LENGTH.toLocaleString()} characters`)
      return
    }
    setLimitError(null)
    const updated = { ...selectedNote, content, date: new Date() }
    setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updated : n)))
    setSelectedNote(updated)
    setPendingChanges(updated)
  }

  const handleMoveToFolder = (targetFolderId: string) => {
    if (!selectedNote) return
    const updated = { ...selectedNote, folder: targetFolderId, date: new Date() }
    setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updated : n)))
    setSelectedNote(updated)
    setPendingChanges(updated)
    setMoreMenuOpen(false)
  }

  const handleCreateNote = async () => {
    if (localNotes.length >= MAX_NOTES_PER_USER) {
      setLimitError(`You have reached the maximum of ${MAX_NOTES_PER_USER} notes.`)
      return
    }
    setLimitError(null)

    // Determine target folder
    const targetFolder = selectedFolder === "trash" || selectedFolder === "archive" ? "all" : selectedFolder

    const newNote: DecryptedNoteWithMeta = {
      id: Date.now().toString(),
      title: "",
      content: "",
      date: new Date(),
      folder: targetFolder,
      attachments: [],
      tags: [],
    }

    setLocalNotes([newNote, ...localNotes])
    setSelectedNote(newNote)

    if (encryptionPassword) {
      try {
        const encrypted = await encryptNote(
          { title: newNote.title, content: newNote.content, attachments: newNote.attachments },
          encryptionPassword
        )
        await fetch("/api/notes", {
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
      } catch {
        // Silent fail
      }
    }
  }

  const handleDeleteNote = async () => {
    if (!selectedNote) return

    // If not in trash, move to trash first
    if (selectedNote.folder !== "trash") {
      handleMoveToFolder("trash")
      return
    }

    // Permanent delete
    await handlePermanentDeleteNote()
  }

  const handleRestoreNote = () => {
    if (!selectedNote) return
    const updated = { ...selectedNote, folder: "all", date: new Date() }
    setLocalNotes((prev) => prev.map((n) => (n.id === selectedNote.id ? updated : n)))
    setSelectedNote(updated)
    setPendingChanges(updated)
  }

  const handlePermanentDeleteNote = async () => {
    if (!selectedNote) return
    if (!confirm("Permanently delete this note? This action cannot be undone.")) return

    const deletedId = selectedNote.id
    const updated = localNotes.filter((n) => n.id !== deletedId)
    setLocalNotes(updated)
    setSelectedNote(updated.length > 0 ? updated[0] : null)

    if (encryptionPassword) {
      try {
        await fetch(`/api/notes?noteId=${deletedId}`, { method: "DELETE", credentials: "include" })
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
  }

  const handleEmptyTrash = async () => {
    const trashedNotes = localNotes.filter((n) => n.folder === "trash")
    if (trashedNotes.length === 0) return
    if (!confirm(`Are you sure you want to permanently delete all ${trashedNotes.length} note(s) in Trash? This action cannot be undone.`)) return

    const trashedIds = new Set(trashedNotes.map((n) => n.id))
    const updated = localNotes.filter((n) => !trashedIds.has(n.id))
    setLocalNotes(updated)
    setSelectedNote(updated.length > 0 ? updated[0] : null)

    if (encryptionPassword) {
      for (const note of trashedNotes) {
        try {
          fetch(`/api/notes?noteId=${note.id}`, { method: "DELETE", credentials: "include" }).catch(() => { })
          fetch("/api/notes/index", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ noteId: note.id }),
          }).catch(() => { })
        } catch { }
      }
    }
  }

  // ── Recording handlers ────────────────────────────────────────────────────

  const handleRecordingStart = useCallback(() => {
    recordingBaseContentRef.current = selectedNote?.content ?? ""
    setTranscriptionLang(getTranscriptionLang())

    if (selectedNote && selectedNote.title === "New Note") {
      const now = new Date()
      const dateStr = formatDateStandard(now)
      const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
      const title = `Recorded on ${dateStr} ${timeStr}`
      const updated = { ...selectedNote, title, date: now }
      setSelectedNote(updated)
      setPendingChanges(updated)
    }
  }, [selectedNote])

  const handleRecordingStop = useCallback(() => { }, [])

  const handleTranscriptUpdate = useCallback(
    (transcript: string, segments: TranscriptSegment[], recording?: AudioRecordingData) => {
      if (!selectedNote) return
      const base = recordingBaseContentRef.current
      const separator = base && !base.endsWith("\n") ? "\n\n" : ""
      const newContent = base + separator + transcript
      if (newContent.length > MAX_CONTENT_LENGTH) return

      // Register new speakers
      const currentProfiles = getStoredSpeakers()
      let profilesChanged = false
      const updatedProfiles = [...currentProfiles]

      for (const seg of segments) {
        if (!updatedProfiles.some((p) => p.id === seg.speaker_id)) {
          updatedProfiles.push({
            id: seg.speaker_id,
            name: resolveSpeakerName(seg.speaker_id, updatedProfiles),
            isCustomNamed: false,
            voiceSamples: [],
            usedNoteCount: 1,
            updatedAt: new Date().toISOString(),
          })
          profilesChanged = true
        }
      }

      if (profilesChanged) {
        setSpeakerProfiles(updatedProfiles)
        saveStoredSpeakers(updatedProfiles)
      }

      const updated: DecryptedNoteWithMeta = {
        ...selectedNote,
        content: newContent,
        transcriptSegments: segments,
        audioRecording: recording || selectedNote.audioRecording,
      }
      setSelectedNote(updated)
      setPendingChanges(updated)
    },
    [selectedNote]
  )

  const handleRenameSpeaker = useCallback(
    (speakerId: string, newName: string, scope: "note" | "global") => {
      const oldName = resolveSpeakerName(speakerId, speakerProfiles)

      if (scope === "global") {
        const updatedProfiles = speakerProfiles.map((p) =>
          p.id === speakerId ? { ...p, name: newName, isCustomNamed: true, updatedAt: new Date().toISOString() } : p
        )
        if (!updatedProfiles.some((p) => p.id === speakerId)) {
          updatedProfiles.push({
            id: speakerId,
            name: newName,
            isCustomNamed: true,
            voiceSamples: [],
            updatedAt: new Date().toISOString(),
          })
        }
        setSpeakerProfiles(updatedProfiles)
        saveStoredSpeakers(updatedProfiles)

        const updatedNotes = localNotes.map((note) => {
          const hasSpeaker = note.transcriptSegments?.some((s) => s.speaker_id === speakerId)
          if (hasSpeaker || note.content.includes(oldName)) {
            const updatedContent = updateNoteTextSpeakerName(note.content, oldName, newName)
            return { ...note, content: updatedContent, date: new Date() }
          }
          return note
        })
        setLocalNotes(updatedNotes)

        if (selectedNote) {
          const currentSelected = updatedNotes.find((n) => n.id === selectedNote.id)
          if (currentSelected) {
            setSelectedNote(currentSelected)
            setPendingChanges(currentSelected)
          }
        }
      } else {
        if (!selectedNote) return
        const updatedContent = updateNoteTextSpeakerName(selectedNote.content, oldName, newName)
        const updatedSegments = (selectedNote.transcriptSegments || []).map((seg) => {
          if (seg.speaker_id === speakerId) {
            return { ...seg, speaker_id: `custom_${newName.toLowerCase().replace(/\s+/g, "_")}` }
          }
          return seg
        })
        const updated: DecryptedNoteWithMeta = {
          ...selectedNote,
          content: updatedContent,
          transcriptSegments: updatedSegments,
          date: new Date(),
        }
        setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updated : n)))
        setSelectedNote(updated)
        setPendingChanges(updated)
      }
    },
    [localNotes, selectedNote, speakerProfiles]
  )

  // ── Tag Handlers ──────────────────────────────────────────────────────────

  const handleToggleTagOnSelectedNote = (tagToToggle: string, colorHex?: string) => {
    if (!selectedNote) return
    const currentTags = selectedNote.tags || []
    const isAlreadyOnNote = currentTags.some((t) => t.toLowerCase() === tagToToggle.toLowerCase())

    let updatedTags: string[]
    if (isAlreadyOnNote) {
      updatedTags = currentTags.filter((t) => t.toLowerCase() !== tagToToggle.toLowerCase())
    } else {
      updatedTags = [...currentTags, tagToToggle.trim()]
      const updatedStoreTags = addStoredTag(tagToToggle.trim(), colorHex)
      setAllAvailableTags(updatedStoreTags)
      if (colorHex) {
        setTagColors(getStoredTagColors())
      }
    }

    const updatedNote = { ...selectedNote, tags: updatedTags, date: new Date() }
    setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updatedNote : n)))
    setSelectedNote(updatedNote)
    setPendingChanges(updatedNote)
  }

  const handleAddTagToSelectedNote = (tagToAdd: string, colorHex?: string) => {
    handleToggleTagOnSelectedNote(tagToAdd, colorHex)
  }

  const handleRemoveTagFromSelectedNote = (tagToRemove: string) => {
    if (!selectedNote) return
    const currentTags = selectedNote.tags || []
    const updatedTags = currentTags.filter((t) => t !== tagToRemove)
    const updatedNote = { ...selectedNote, tags: updatedTags, date: new Date() }
    setLocalNotes(localNotes.map((n) => (n.id === selectedNote.id ? updatedNote : n)))
    setSelectedNote(updatedNote)
    setPendingChanges(updatedNote)
  }

  // ── Folder Handlers ───────────────────────────────────────────────────────

  const handleStartCreateFolder = () => {
    setIsCreatingFolder(true)
    setInlineFolderName("New folder")
    setEditingFolderId(null)
    setFolderActionMenuId(null)
  }

  const handleCommitCreateFolder = () => {
    if (!isCreatingFolder) return
    const name = inlineFolderName.trim() || "New folder"
    const updated = addStoredFolder(name)
    setFolders(updated)
    setIsCreatingFolder(false)
    setInlineFolderName("New folder")
  }

  const handleCommitRenameFolder = (folderId: string) => {
    if (editingFolderId !== folderId) return
    const name = editingFolderName.trim()
    if (name) {
      const updated = renameStoredFolder(folderId, name)
      setFolders(updated)
    }
    setEditingFolderId(null)
  }

  const handleDeleteFolderWithPrompt = (folder: FolderItem) => {
    if (folder.isSystem) return
    if (!confirm(`Are you sure you want to delete folder "${folder.name}"? Notes inside will be moved to Trash.`)) return

    setLocalNotes((prev) =>
      prev.map((n) => (n.folder === folder.id ? { ...n, folder: "trash" } : n))
    )
    const updated = deleteStoredFolder(folder.id)
    setFolders(updated)
    if (selectedFolder === folder.id) {
      setSelectedFolder("all")
    }
    setFolderActionMenuId(null)
  }

  const handleArchiveFolderToggle = (folder: FolderItem) => {
    const updated = archiveStoredFolder(folder.id, !folder.isArchived)
    setFolders(updated)
    setFolderActionMenuId(null)
  }

  const handleShareFolder = (folder: FolderItem) => {
    const noteCount = getFolderCount(folder.id)
    const text = `Folder: ${folder.name} (${noteCount} notes)`
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(text).catch(() => { })
    }
    setFolderShareToast(`Folder "${folder.name}" share summary copied!`)
    setTimeout(() => setFolderShareToast(null), 3000)
    setFolderActionMenuId(null)
  }

  // Calculate folder counts dynamically
  const getFolderCount = (folderId: string) => {
    if (folderId === "all") {
      return localNotes.filter((n) => n.folder !== "trash" && n.folder !== "archive").length
    }
    if (folderId === "trash") {
      return localNotes.filter((n) => n.folder === "trash").length
    }
    if (folderId === "archive") {
      return localNotes.filter((n) => n.folder === "archive").length
    }
    return localNotes.filter((n) => (n.folder || "all").toLowerCase() === folderId.toLowerCase()).length
  }

  // Render folder icon (uses FolderOpen when folder is opened / expanded)
  const renderFolderIcon = (icon?: string, isOpened?: boolean) => {
    switch (icon) {
      case "all":
        return <Notebook className="h-4 w-4 text-amber-600 dark:text-yellow-400" />
      case "archive":
        return <Archive className="h-4 w-4 text-zinc-500" />
      case "trash":
        return <Trash2 className="h-4 w-4 text-zinc-500" />
      default:
        return isOpened ? (
          <FolderOpen className="h-4 w-4 text-amber-500 shrink-0" />
        ) : (
          <FolderIcon className="h-4 w-4 text-amber-500/80 shrink-0" />
        )
    }
  }

  // Flattened custom folders for rendering in sidebar (respecting collapsed state)
  const flattenedCustomFolders = useMemo(() => {
    return getFlattenedFolderTree(folders, false, collapsedFolderIds)
  }, [folders, collapsedFolderIds])

  // All custom folders regardless of collapsed state (for Move dialogs and menus)
  const allCustomFolders = useMemo(() => {
    return getFlattenedFolderTree(folders, false)
  }, [folders])

  const archivedFolder = useMemo(
    () => folders.find((f) => f.id === "archive") || { id: "archive", name: "Archived", icon: "archive" as const, isSystem: true },
    [folders]
  )
  const trashFolder = useMemo(
    () => folders.find((f) => f.id === "trash") || { id: "trash", name: "Trash", icon: "trash" as const, isSystem: true },
    [folders]
  )
  const rootFolder = useMemo(
    () => folders.find((f) => f.id === "all") || { id: "all", name: "All Notes", icon: "all" as const, isSystem: true },
    [folders]
  )

  // Count records for selected note (for recording icon badge)
  const noteRecordCount = useMemo(() => {
    if (!selectedNote) return 0
    let count = 0
    if (selectedNote.audioRecording?.dataUrl && selectedNote.audioRecording.dataUrl.trim().length > 0) {
      count += 1
    }
    const audioAttachments = (selectedNote.attachments || []).filter((a) => a.type === "audio")
    count += audioAttachments.length
    return count
  }, [selectedNote])

  // Available speakers for filter modal
  const availableSpeakerOptions = useMemo<SpeakerOption[]>(() => {
    const speakerNoteCounts: Record<string, number> = {}
    for (const note of localNotes) {
      const noteSpeakers = new Set((note.transcriptSegments || []).map((s) => s.speaker_id))
      for (const spk of noteSpeakers) {
        speakerNoteCounts[spk] = (speakerNoteCounts[spk] || 0) + 1
      }
    }

    const allIds = Array.from(new Set([...Object.keys(speakerNoteCounts), ...speakerProfiles.map((p) => p.id)]))
    return allIds.map((id) => ({
      id,
      name: resolveSpeakerName(id, speakerProfiles),
      noteCount: speakerNoteCounts[id] || 0,
    }))
  }, [localNotes, speakerProfiles])

  // Available tags for filter modal
  const filterAvailableTags = useMemo(() => {
    const tagSet = new Set(allAvailableTags)
    for (const note of localNotes) {
      for (const tag of note.tags || []) {
        tagSet.add(tag)
      }
    }
    return Array.from(tagSet)
  }, [allAvailableTags, localNotes])

  // Count active filters
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (noteFilters.titleQuery.trim()) count++
    if (noteFilters.speakerId !== "all") count++
    if (noteFilters.datePreset && noteFilters.datePreset !== "all") count++
    else if (noteFilters.dateFrom || noteFilters.dateTo) count++
    if (noteFilters.content && noteFilters.content !== "all") count++
    if (noteFilters.selectedTags.length > 0) count += noteFilters.selectedTags.length
    return count
  }, [noteFilters])

  // Matching notes calculation for modal preview
  const calculateFilteredMatches = useCallback(
    (criteria: NoteFilterCriteria) => {
      return localNotes.filter((n) => {
        // Folder filter
        if (selectedFolder === "all") {
          if (n.folder === "trash" || n.folder === "archive") return false
        } else if (n.folder?.toLowerCase() !== selectedFolder.toLowerCase()) {
          return false
        }

        // Search query filter
        if (searchQuery.trim() !== "") {
          const q = searchQuery.toLowerCase()
          const displayTitle = getNoteDisplayTitle(n)
          const matches =
            displayTitle.toLowerCase().includes(q) ||
            n.content.toLowerCase().includes(q) ||
            (n.tags || []).some((t) => t.toLowerCase().includes(q))
          if (!matches) return false
        }

        // Title filter
        if (criteria.titleQuery.trim() !== "") {
          const displayTitle = getNoteDisplayTitle(n)
          if (!displayTitle.toLowerCase().includes(criteria.titleQuery.trim().toLowerCase())) {
            return false
          }
        }

        // Date From filter
        if (criteria.dateFrom) {
          const noteDate = new Date(n.date)
          if (isNaN(noteDate.getTime())) return false
          const fromDate = new Date(criteria.dateFrom)
          fromDate.setHours(0, 0, 0, 0)
          if (noteDate < fromDate) return false
        }

        // Date To filter
        if (criteria.dateTo) {
          const noteDate = new Date(n.date)
          if (isNaN(noteDate.getTime())) return false
          const toDate = new Date(criteria.dateTo)
          toDate.setHours(23, 59, 59, 999)
          if (noteDate > toDate) return false
        }

        // Content filter
        if (criteria.content === "audio") {
          const hasAudio = Boolean(n.audioRecording?.dataUrl && n.audioRecording.dataUrl.trim().length > 0) ||
            (n.attachments || []).some((a) => a.type === "audio")
          if (!hasAudio) return false
        } else if (criteria.content === "transcript") {
          const hasTranscript = (n.transcriptSegments || []).length > 0
          if (!hasTranscript) return false
        } else if (criteria.content === "text_only") {
          const hasAudio = Boolean(n.audioRecording?.dataUrl && n.audioRecording.dataUrl.trim().length > 0) ||
            (n.attachments || []).some((a) => a.type === "audio")
          const hasTranscript = (n.transcriptSegments || []).length > 0
          if (hasAudio || hasTranscript) return false
        }

        // Speaker filter
        if (criteria.speakerId && criteria.speakerId !== "all") {
          const hasSpeaker = (n.transcriptSegments || []).some(
            (s) => s.speaker_id === criteria.speakerId
          )
          if (!hasSpeaker) return false
        }

        // Tags filter
        if (criteria.selectedTags.length > 0) {
          const noteTags = (n.tags || []).map((t) => t.toLowerCase())
          const hasMatchingTag = criteria.selectedTags.some((st) =>
            noteTags.includes(st.toLowerCase())
          )
          if (!hasMatchingTag) return false
        }

        return true
      }).length
    },
    [localNotes, selectedFolder, searchQuery]
  )

  // Filter notes by search, folder, and advanced filter criteria
  const filteredNotes = useMemo(() => {
    return localNotes.filter((n) => {
      // 1. Folder filter
      if (selectedFolder === "all") {
        if (n.folder === "trash" || n.folder === "archive") return false
      } else if (n.folder?.toLowerCase() !== selectedFolder.toLowerCase()) {
        return false
      }

      // 2. Search query filter
      if (searchQuery.trim() !== "") {
        const q = searchQuery.toLowerCase()
        const displayTitle = getNoteDisplayTitle(n)
        const matches =
          displayTitle.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          (n.tags || []).some((t) => t.toLowerCase().includes(q))
        if (!matches) return false
      }

      // 3. Title filter
      if (noteFilters.titleQuery.trim() !== "") {
        const displayTitle = getNoteDisplayTitle(n)
        if (!displayTitle.toLowerCase().includes(noteFilters.titleQuery.trim().toLowerCase())) {
          return false
        }
      }

      // 4. Date From filter
      if (noteFilters.dateFrom) {
        const noteDate = new Date(n.date)
        if (isNaN(noteDate.getTime())) return false
        const fromDate = new Date(noteFilters.dateFrom)
        fromDate.setHours(0, 0, 0, 0)
        if (noteDate < fromDate) return false
      }

      // 5. Date To filter
      if (noteFilters.dateTo) {
        const noteDate = new Date(n.date)
        if (isNaN(noteDate.getTime())) return false
        const toDate = new Date(noteFilters.dateTo)
        toDate.setHours(23, 59, 59, 999)
        if (noteDate > toDate) return false
      }

      // Content filter
      if (noteFilters.content === "audio") {
        const hasAudio = Boolean(n.audioRecording?.dataUrl && n.audioRecording.dataUrl.trim().length > 0) ||
          (n.attachments || []).some((a) => a.type === "audio")
        if (!hasAudio) return false
      } else if (noteFilters.content === "transcript") {
        const hasTranscript = (n.transcriptSegments || []).length > 0
        if (!hasTranscript) return false
      } else if (noteFilters.content === "text_only") {
        const hasAudio = Boolean(n.audioRecording?.dataUrl && n.audioRecording.dataUrl.trim().length > 0) ||
          (n.attachments || []).some((a) => a.type === "audio")
        const hasTranscript = (n.transcriptSegments || []).length > 0
        if (hasAudio || hasTranscript) return false
      }

      // 6. Speaker filter
      if (noteFilters.speakerId && noteFilters.speakerId !== "all") {
        const hasSpeaker = (n.transcriptSegments || []).some(
          (s) => s.speaker_id === noteFilters.speakerId
        )
        if (!hasSpeaker) return false
      }

      // 7. Tags filter
      if (noteFilters.selectedTags.length > 0) {
        const noteTags = (n.tags || []).map((t) => t.toLowerCase())
        const hasMatchingTag = noteFilters.selectedTags.some((st) =>
          noteTags.includes(st.toLowerCase())
        )
        if (!hasMatchingTag) return false
      }

      return true
    })
  }, [localNotes, selectedFolder, searchQuery, noteFilters])

  // Chat handlers
  const loadChatConversation = useCallback(async (convId: string) => {
    setChatActiveConvId(convId)
    try {
      const res = await fetch(`/api/chat/history?id=${convId}`, { credentials: "include" })
      const chatData = await res.json()
      if (chatData.messages?.length) {
        const restored: Message[] = chatData.messages.map(
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
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
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
            const parsed = JSON.parse(line.slice(6))
            if (parsed.delta) {
              setChatMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, content: m.content + parsed.delta } : m))
              )
            }
            if (parsed.done) {
              setChatMessages((prev) =>
                prev.map((m) => (m.id === aiMsgId ? { ...m, citations: parsed.citations ?? [] } : m))
              )
            }
          } catch { }
        }
      }
    } catch {
      setChatMessages((prev) =>
        prev.map((m) => (m.id === aiMsgId ? { ...m, content: "Something went wrong. Please try again." } : m))
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
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative flex h-screen w-full bg-white text-zinc-900 dark:bg-black dark:text-white transition-colors duration-150 overflow-hidden font-sans select-none">
      {/* ── COLUMN 1: Workspace Navigation / Folders ─────────────────────── */}
      <aside
        aria-label="Workspace Navigation"
        style={{ width: isSidebarCollapsed ? 56 : sidebarWidth }}
        className="relative border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col bg-[#fbfbfd] dark:bg-black transition-[width] duration-150 shrink-0 select-none z-30"
      >
        {isSidebarCollapsed ? (
          /* Min-size: Icon Rail mode (56px) - all icons visible and functional */
          <div className="py-3.5 px-2 flex flex-col items-center h-full">
            {/* Collapse / Expand toggle */}
            <div className="flex flex-col items-center mb-2">
              <button
                onClick={() => setIsSidebarCollapsed(false)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Expand sidebar"
                aria-label="Expand sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Nav items: Notes & Agent icons */}
            <nav aria-label="Main navigation" className="flex flex-col items-center gap-1 mb-2">
              <button
                onClick={() => setActiveTab("notes")}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${activeTab === "notes"
                  ? "bg-zinc-100 text-zinc-950 border border-zinc-200/80 shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60"
                  }`}
                title="Notes"
                aria-label="Notes"
              >
                <Notebook className={`h-4 w-4 ${activeTab === "notes" ? "text-amber-600 dark:text-yellow-400" : "text-zinc-500"}`} />
              </button>
              <button
                onClick={() => setActiveTab("agent")}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-all cursor-pointer ${activeTab === "agent"
                  ? "bg-zinc-100 text-zinc-950 border border-zinc-200/80 shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                  : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/60"
                  }`}
                title="Agent"
                aria-label="Agent"
              >
                <Sparkles className={`h-4 w-4 ${activeTab === "agent" ? "text-amber-600 dark:text-yellow-400" : "text-zinc-500"}`} />
              </button>
            </nav>

            {/* Separator */}
            <div className="w-6 h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 shrink-0" />

            {/* Folders icon list */}
            <div className="flex-1 overflow-y-auto no-scrollbar w-full flex flex-col items-center gap-1 py-1">
              {/* Root All Notes */}
              <button
                onClick={() => {
                  setSelectedFolder("all")
                  setActiveTab("notes")
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${selectedFolder === "all" && activeTab === "notes"
                  ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/50"
                  }`}
                title={`All Notes (${getFolderCount("all")})`}
                aria-label="All Notes"
              >
                <span className="opacity-80">{renderFolderIcon("all")}</span>
              </button>

              {/* Custom Folders */}
              {flattenedCustomFolders.map(({ folder }) => {
                const count = getFolderCount(folder.id)
                const isSelected = selectedFolder.toLowerCase() === folder.id.toLowerCase() && activeTab === "notes"

                return (
                  <button
                    key={folder.id}
                    onClick={() => {
                      setSelectedFolder(folder.id)
                      setActiveTab("notes")
                    }}
                    className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${isSelected
                      ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/50"
                      }`}
                    title={`${folder.name} (${count})`}
                    aria-label={`${folder.name} (${count} notes)`}
                  >
                    <span className="opacity-80">{renderFolderIcon(folder.icon, isSelected)}</span>
                  </button>
                )
              })}

              <button
                onClick={() => {
                  setIsSidebarCollapsed(false)
                  handleStartCreateFolder()
                }}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Create folder"
                aria-label="Create folder"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>

              <div className="w-6 h-px bg-zinc-200/80 dark:bg-zinc-800/80 my-1 shrink-0" />

              {/* Archived */}
              <button
                onClick={() => {
                  setSelectedFolder("archive")
                  setActiveTab("notes")
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${selectedFolder === "archive" && activeTab === "notes"
                  ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/50"
                  }`}
                title={`Archived (${getFolderCount("archive")})`}
                aria-label="Archived"
              >
                <span className="opacity-80">{renderFolderIcon("archive")}</span>
              </button>

              {/* Trash */}
              <button
                onClick={() => {
                  setSelectedFolder("trash")
                  setActiveTab("notes")
                }}
                className={`w-9 h-9 flex items-center justify-center rounded-xl transition-colors cursor-pointer border ${selectedFolder === "trash" && activeTab === "notes"
                  ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                  : "border-transparent text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-900/50"
                  }`}
                title={`Trash (${getFolderCount("trash")})`}
                aria-label="Trash"
              >
                <span className="opacity-80">{renderFolderIcon("trash")}</span>
              </button>
            </div>

            {/* Bottom Actions: Settings & Avatar */}
            <div className="pt-2 border-t border-zinc-200/80 dark:border-zinc-800/80 flex flex-col items-center gap-2 shrink-0">
              <button
                onClick={() => setSettingsOpen(true)}
                className="w-9 h-9 flex items-center justify-center rounded-xl text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                title="Settings"
                aria-label="Settings"
              >
                <SettingsIcon className="h-4 w-4" />
              </button>
              <div className="flex justify-center">
                <AvatarButton
                  user={user?.encryptionKey ? user : null}
                  onClick={() => setAuthOpen(true)}
                  onSignOut={handleSignOut}
                  onOpenSettings={() => setSettingsOpen(true)}
                />
              </div>
            </div>
          </div>
        ) : (
          /* Expanded Full mode */
          <div className="p-4 flex flex-col h-full min-h-0">
            {/* macOS window traffic lights and collapse toggle */}
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setIsSidebarCollapsed(true)}
                className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors cursor-pointer"
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
            </div>

            {/* App title */}
            <h2 className="text-base font-bold tracking-tight text-zinc-900 dark:text-white px-2 mb-3">
              My Notes
            </h2>

            {/* Top workspace nav items */}
            <nav aria-label="Main navigation" className="space-y-1 mb-5">
              <button
                onClick={() => setActiveTab("notes")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-left ${activeTab === "notes"
                  ? "bg-zinc-100 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:text-white"
                  : "text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  }`}
              >
                <Notebook className={`h-4 w-4 ${activeTab === "notes" ? "text-amber-600 dark:text-yellow-400" : "text-zinc-500"}`} />
                <span>Notes</span>
              </button>
              <button
                onClick={() => setActiveTab("agent")}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm transition-all text-left ${activeTab === "agent"
                  ? "bg-zinc-100 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:text-white"
                  : "text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/60"
                  }`}
              >
                <Sparkles className={`h-4 w-4 ${activeTab === "agent" ? "text-amber-600 dark:text-yellow-400" : "text-zinc-500"}`} />
                <span>Chat</span>
              </button>
            </nav>

            {/* Folders Section */}
            <div className="flex-1 overflow-y-auto no-scrollbar">
              <div className="flex items-center justify-between px-2 mb-1.5">
                <span className="text-xs font-semibold text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">
                  Folders
                </span>
                <button
                  onClick={handleStartCreateFolder}
                  className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors cursor-pointer"
                  title="New folder"
                  aria-label="New folder"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>

              {/* Folders List */}
              <div className="space-y-0.5">
                {/* Root: All Notes */}
                <button
                  onClick={() => {
                    setSelectedFolder("all")
                    setActiveTab("notes")
                  }}
                  onDragOver={(e) => {
                    if (draggedFolderId) {
                      e.preventDefault()
                      e.stopPropagation()
                      setDragOverFolderId("all")
                      e.dataTransfer.dropEffect = "move"
                    }
                  }}
                  onDragLeave={(e) => {
                    e.stopPropagation()
                    if (dragOverFolderId === "all") setDragOverFolderId(null)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    e.stopPropagation()
                    const droppedId = e.dataTransfer.getData("text/folder-id") || draggedFolderId
                    if (droppedId) {
                      const updated = moveFolderToParent(droppedId, null)
                      setFolders(updated)
                    }
                    setDraggedFolderId(null)
                    setDragOverFolderId(null)
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-all text-left border cursor-pointer ${selectedFolder === "all"
                    ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                    : "border-transparent text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
                    } ${dragOverFolderId === "all" ? "ring-2 ring-amber-500 bg-amber-500/10 dark:bg-amber-500/20" : ""}`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="opacity-80">{renderFolderIcon("all")}</span>
                    <span className="truncate">{rootFolder.name} ({getFolderCount("all")})</span>
                  </div>
                </button>

                {/* Custom Folders Tree */}
                {flattenedCustomFolders.map(({ folder, depth }) => {
                  const count = getFolderCount(folder.id)
                  const isSelected = selectedFolder.toLowerCase() === folder.id.toLowerCase()
                  const isDragOver = dragOverFolderId === folder.id
                  const isEditing = editingFolderId === folder.id

                  if (isEditing) {
                    return (
                      <div
                        key={folder.id}
                        style={{ paddingLeft: `${12 + depth * 14}px` }}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-zinc-900 dark:text-white"
                      >
                        <FolderIcon className="h-4 w-4 text-amber-500 shrink-0" />
                        <input
                          type="text"
                          value={editingFolderName}
                          onChange={(e) => setEditingFolderName(e.target.value)}
                          autoFocus
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleCommitRenameFolder(folder.id)
                            if (e.key === "Escape") setEditingFolderId(null)
                          }}
                          onBlur={() => handleCommitRenameFolder(folder.id)}
                          className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-white focus:outline-none"
                        />
                      </div>
                    )
                  }

                  return (
                    <div
                      key={folder.id}
                      draggable
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/folder-id", folder.id)
                        setDraggedFolderId(folder.id)
                        e.dataTransfer.effectAllowed = "move"
                      }}
                      onDragEnd={() => {
                        setDraggedFolderId(null)
                        setDragOverFolderId(null)
                      }}
                      onDragOver={(e) => {
                        if (draggedFolderId && draggedFolderId !== folder.id) {
                          e.preventDefault()
                          e.stopPropagation()
                          setDragOverFolderId(folder.id)
                          e.dataTransfer.dropEffect = "move"
                        }
                      }}
                      onDragLeave={(e) => {
                        e.stopPropagation()
                        if (dragOverFolderId === folder.id) {
                          setDragOverFolderId(null)
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        const droppedId = e.dataTransfer.getData("text/folder-id") || draggedFolderId
                        if (droppedId && droppedId !== folder.id) {
                          const updated = moveFolderToParent(droppedId, folder.id)
                          setFolders(updated)
                        }
                        setDraggedFolderId(null)
                        setDragOverFolderId(null)
                      }}
                      style={{ paddingLeft: `${12 + depth * 14}px` }}
                      className={`group relative flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer border ${isSelected
                        ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                        : "border-transparent text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
                        } ${isDragOver ? "ring-2 ring-amber-500 bg-amber-500/10 dark:bg-amber-500/20" : ""}`}
                      onClick={() => {
                        setSelectedFolder(folder.id)
                        setActiveTab("notes")
                        setCollapsedFolderIds((prev) => {
                          const next = new Set(prev)
                          if (next.has(folder.id)) {
                            next.delete(folder.id)
                          } else {
                            next.add(folder.id)
                          }
                          return next
                        })
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation()
                        setEditingFolderId(folder.id)
                        setEditingFolderName(folder.name)
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setFolderActionMenuId((prev) => (prev === folder.id ? null : folder.id))
                      }}
                    >
                      <div className="flex items-center gap-2 truncate">
                        {depth > 0 && (
                          <CornerDownRight className="h-3 w-3 text-zinc-400 dark:text-zinc-500 shrink-0" />
                        )}
                        <span className="opacity-70">
                          {renderFolderIcon(folder.icon, isSelected || !collapsedFolderIds.has(folder.id))}
                        </span>
                        <span className="truncate">{folder.name}</span>
                        {renderCollaboratorAvatars(folder.sharedWith)}
                      </div>

                      <div className="flex items-center gap-1 shrink-0 ml-2">
                        {/* 3-dot More button on hover or when open */}
                        <div className="relative">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              setFolderActionMenuId((prev) => (prev === folder.id ? null : folder.id))
                            }}
                            className={`p-1 rounded-md text-zinc-400 hover:text-zinc-700 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-zinc-700/60 transition-opacity cursor-pointer ${folderActionMenuId === folder.id ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                              }`}
                            title="Folder options"
                          >
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </button>

                          {/* 3-dot dropdown menu */}
                          {folderActionMenuId === folder.id && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 top-6 z-50 w-36 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl py-1 text-xs"
                            >
                              <button
                                onClick={() => {
                                  setEditingFolderId(folder.id)
                                  setEditingFolderName(folder.name)
                                  setFolderActionMenuId(null)
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer"
                              >
                                <Edit3 className="h-3.5 w-3.5 text-zinc-400" />
                                <span>Rename</span>
                              </button>
                              <button
                                onClick={() => {
                                  setMovingFolder(folder)
                                  setFolderActionMenuId(null)
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer"
                              >
                                <FolderInput className="h-3.5 w-3.5 text-zinc-400" />
                                <span>Move...</span>
                              </button>
                              <button
                                onClick={() => handleOpenShareFolder(folder)}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer"
                              >
                                <Share2 className="h-3.5 w-3.5 text-zinc-400" />
                                <span>Share</span>
                              </button>
                              <button
                                onClick={() => handleArchiveFolderToggle(folder)}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2 cursor-pointer"
                              >
                                <Archive className="h-3.5 w-3.5 text-zinc-400" />
                                <span>{folder.isArchived ? "Unarchive" : "Archive"}</span>
                              </button>
                              <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                              <button
                                onClick={() => handleDeleteFolderWithPrompt(folder)}
                                className="w-full text-left px-3 py-1.5 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2 cursor-pointer"
                              >
                                <Trash2 className="h-3.5 w-3.5 text-red-500" />
                                <span>Delete</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}

                {/* Temporary New Folder in editing mode at bottom of custom folders */}
                {isCreatingFolder && (
                  <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/40 text-xs text-zinc-900 dark:text-white">
                    <FolderIcon className="h-4 w-4 text-amber-500 shrink-0" />
                    <input
                      type="text"
                      value={inlineFolderName}
                      onChange={(e) => setInlineFolderName(e.target.value)}
                      autoFocus
                      onFocus={(e) => e.target.select()}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCommitCreateFolder()
                        if (e.key === "Escape") setIsCreatingFolder(false)
                      }}
                      onBlur={handleCommitCreateFolder}
                      className="flex-1 bg-transparent text-xs text-zinc-900 dark:text-white focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* Divider line above Archived and Trash */}
              <hr className="mt-4 mb-4 my-2.5 border-zinc-200/80 dark:border-zinc-800" />

              {/* Pinned Bottom: Archived and Trash */}
              <div className="space-y-0.5">
                {/* Archived */}
                <button
                  onClick={() => {
                    setSelectedFolder("archive")
                    setActiveTab("notes")
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors text-left border cursor-pointer ${selectedFolder === "archive"
                    ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                    : "border-transparent text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
                    }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="opacity-70">{renderFolderIcon("archive")}</span>
                    <span className="truncate">{archivedFolder.name}</span>
                  </div>
                </button>

                {/* Trash */}
                <button
                  onClick={() => {
                    setSelectedFolder("trash")
                    setActiveTab("notes")
                  }}
                  className={`w-full flex items-center justify-between px-3 py-1.5 rounded-xl text-xs transition-colors text-left border cursor-pointer ${selectedFolder === "trash"
                    ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-semibold shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                    : "border-transparent text-zinc-600 hover:bg-zinc-100/80 dark:text-zinc-400 dark:hover:bg-zinc-900/50"
                    }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <span className="opacity-70">{renderFolderIcon("trash")}</span>
                    <span className="truncate">{trashFolder.name}</span>
                  </div>
                </button>
              </div>
            </div>

            {/* Settings at Bottom */}
            <div className="pt-3 border-t border-zinc-200/80 dark:border-zinc-800/80 flex items-center justify-between">
              <button
                onClick={() => setSettingsOpen(true)}
                className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg text-xs text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800/50 transition-colors"
              >
                <SettingsIcon className="h-4 w-4" />
                <span>Settings</span>
              </button>
              <AvatarButton
                user={user?.encryptionKey ? user : null}
                onClick={() => setAuthOpen(true)}
                onSignOut={handleSignOut}
                onOpenSettings={() => setSettingsOpen(true)}
              />
            </div>
          </div>
        )}

        {/* Drag resize handle on right border */}
        <div
          onMouseDown={handleSidebarMouseDown}
          onDoubleClick={() => {
            if (isSidebarCollapsed) {
              setIsSidebarCollapsed(false)
              setSidebarWidth(240)
            } else {
              setIsSidebarCollapsed(true)
            }
          }}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:w-1.5 hover:bg-zinc-400/40 dark:hover:bg-zinc-600/50 active:bg-amber-500 transition-all z-20"
          title="Drag to resize sidebar (double-click to toggle)"
        />
      </aside>

      {/* ── COLUMN 2: Notes List OR Agent Conversations ─────────────────── */}
      {activeTab === "notes" ? (
        <section
          aria-label="Notes List"
          className="w-72 md:w-80 border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col bg-white dark:bg-[#0c0c0e] h-full shrink-0 select-none"
        >
          {/* Top Search bar */}
          <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800/80 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
              <input
                ref={mainSearchInputRef}
                type="text"
                placeholder="Search notes..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-[#f8f8fa] dark:bg-zinc-900/80 border border-transparent dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:bg-white focus:border-amber-500/50 dark:focus:border-amber-500/50 transition-colors"
              />
            </div>
            <div className="relative">
              <button
                ref={filterButtonRef}
                onClick={() => setFilterModalOpen(!filterModalOpen)}
                className={`relative p-1.5 rounded-lg transition-colors cursor-pointer ${filterModalOpen || activeFilterCount > 0
                  ? "bg-amber-100 text-amber-800 dark:bg-yellow-500/20 dark:text-yellow-400 font-semibold"
                  : "text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:hover:text-white dark:hover:bg-zinc-800"
                  }`}
                title={activeFilterCount > 0 ? `${activeFilterCount} active filters (click to edit)` : "Filter notes"}
                aria-label="Filter notes"
              >
                <SlidersHorizontal className="h-4 w-4" />
                {activeFilterCount > 0 && !filterModalOpen && (
                  <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black dark:bg-yellow-500 dark:text-black text-[10px] font-bold flex items-center justify-center shadow-xs">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <NoteFilterModal
                isOpen={filterModalOpen}
                onClose={() => setFilterModalOpen(false)}
                currentCriteria={noteFilters}
                onApply={(updated) => setNoteFilters(updated)}
                onReset={() => setNoteFilters(EMPTY_NOTE_FILTERS)}
                availableSpeakers={availableSpeakerOptions}
                availableTags={filterAvailableTags}
                tagColors={tagColors}
                triggerRef={filterButtonRef}
                onSaveTagColor={(tag, color) => {
                  setTagColors((prev) => ({ ...prev, [tag.toLowerCase()]: color }))
                }}
              />
            </div>
          </div>

          {/* Active Filter Chips Banner */}
          {activeFilterCount > 0 && (
            <div className="px-3.5 py-1.5 bg-amber-500/10 dark:bg-yellow-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 overflow-hidden text-[11px] text-amber-900 dark:text-yellow-400 truncate">
                <SlidersHorizontal className="h-3 w-3 shrink-0" />
                <span className="truncate font-medium">
                  {noteFilters.titleQuery && `Title: "${noteFilters.titleQuery}" `}
                  {noteFilters.datePreset && noteFilters.datePreset !== "all" && `${noteFilters.datePreset.replace('_', ' ')} `}
                  {(noteFilters.dateFrom || noteFilters.dateTo) && (!noteFilters.datePreset || noteFilters.datePreset === "custom") &&
                    `Date: ${noteFilters.dateFrom || "..."} → ${noteFilters.dateTo || "..."} `}
                  {noteFilters.content && noteFilters.content !== "all" && `${noteFilters.content.replace('_', ' ')} `}
                  {noteFilters.speakerId !== "all" &&
                    `Speaker: ${resolveSpeakerName(noteFilters.speakerId, speakerProfiles)} `}
                  {noteFilters.selectedTags.length > 0 &&
                    `Tags: ${noteFilters.selectedTags.join(", ")}`}
                </span>
              </div>
              <button
                onClick={() => setNoteFilters(EMPTY_NOTE_FILTERS)}
                className="text-[10px] text-amber-800 hover:text-amber-950 dark:text-yellow-400 dark:hover:text-yellow-300 font-semibold underline shrink-0 cursor-pointer"
              >
                Clear
              </button>
            </div>
          )}

          {/* Section Heading & Note Count */}
          <div className="px-4 py-2 flex items-center justify-between text-[11px] font-semibold text-zinc-400 dark:text-zinc-500">
            {selectedFolder === "trash" ? (
              <>
                <span className="text-red-500 flex items-center gap-1 font-bold">
                  <Trash2 className="h-3 w-3" /> TRASH ({filteredNotes.length})
                </span>
                {filteredNotes.length > 0 && (
                  <button
                    onClick={handleEmptyTrash}
                    className="text-[11px] text-red-600 dark:text-red-400 hover:underline font-semibold cursor-pointer"
                  >
                    Empty Trash
                  </button>
                )}
              </>
            ) : (
              <>
                <span>TODAY</span>
                <button
                  onClick={handleCreateNote}
                  className="text-amber-600 dark:text-yellow-400 hover:opacity-80 flex items-center gap-1 font-normal cursor-pointer"
                  title="New note"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </>
            )}
          </div>

          {/* Notes items list */}
          <div className="flex-1 overflow-y-auto px-2 space-y-1 momentum-scroll pb-16">
            {filteredNotes.length === 0 ? (
              <div className="py-12 text-center text-xs text-zinc-400">No notes found</div>
            ) : (
              filteredNotes.map((note) => {
                const isSelected = selectedNote?.id === note.id

                return (
                  <div
                    key={note.id}
                    onClick={() => setSelectedNote(note)}
                    className={`relative p-3.5 rounded-xl transition-all cursor-pointer text-left border-none ${isSelected
                      ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                      : "border-transparent hover:bg-zinc-100/70 text-zinc-850 dark:text-zinc-200 dark:hover:bg-zinc-900/60"
                      }`}
                  >
                    <h3
                      className={`text-sm truncate leading-snug ${isSelected
                        ? "font-bold text-zinc-950 dark:text-white"
                        : "font-semibold text-zinc-800 dark:text-zinc-200"
                        }`}
                    >
                      <HighlightText text={getNoteDisplayTitle(note) || "Note"} query={searchQuery} />
                    </h3>

                    <p
                      className={`text-xs mt-1 line-clamp-2 ${isSelected
                        ? "text-zinc-600 dark:text-zinc-400 font-medium"
                        : "text-zinc-400 dark:text-zinc-500"
                        }`}
                    >
                      <span className="font-medium mr-2">{formatDateStandard(note.date)}</span>
                      {(() => {
                        const displayTitle = getNoteDisplayTitle(note)
                        let snippet = "No content"
                        if (note.content) {
                          const trimmed = note.content.trim()
                          if (displayTitle && trimmed.startsWith(displayTitle)) {
                            snippet = trimmed.slice(displayTitle.length).trim() || ""
                          } else {
                            snippet = trimmed.slice(0, 90)
                          }
                        }
                        return <HighlightText text={snippet} query={searchQuery} />
                      })()}
                    </p>

                    {/* Collaborator Avatars (if note is shared) */}
                    {note.sharedWith && note.sharedWith.length > 0 && (
                      <div className="mt-2 flex justify-end" title={`Shared with ${note.sharedWith.length} user(s)`}>
                        {renderCollaboratorAvatars(note.sharedWith, 3)}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </section>
      ) : (
        /* Agent Conversation history in Column 2 */
        <section
          aria-label="Agent Conversation History"
          className="w-72 md:w-80 border-r border-zinc-200/80 dark:border-zinc-800/80 flex flex-col bg-white dark:bg-[#0c0c0e] h-full shrink-0 select-none"
        >
          <div className="p-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Chat History</span>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 dark:text-yellow-400 text-xs font-medium transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {chatConversations.length === 0 ? (
              <p className="text-center text-xs text-zinc-400 py-8">No chats yet</p>
            ) : (
              chatConversations.map((conv) => {
                const isSelected = conv.id === chatActiveConvId
                return (
                  <div
                    key={conv.id}
                    onClick={() => loadChatConversation(conv.id)}
                    className={`relative p-2.5 rounded-xl cursor-pointer text-left flex items-start gap-2 border transition-all ${isSelected
                      ? "bg-zinc-100 border-zinc-200/80 text-zinc-950 font-medium shadow-xs dark:bg-zinc-800/80 dark:border-zinc-700/60 dark:text-white"
                      : "border-transparent hover:bg-zinc-100/70 text-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900/60"
                      }`}
                  >
                    {isSelected && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 bg-amber-500 dark:bg-yellow-500 rounded-r-full" />
                    )}
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 opacity-60 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs truncate font-medium">{conv.title}</p>
                      <p className="text-[10px] text-zinc-400 mt-0.5">{formatRelativeTime(conv.updatedAt)}</p>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>
      )}

      {/* ── COLUMN 3: Note Editor OR Agent Workspace ─────────────────────── */}
      <main className="flex-1 flex flex-col bg-white dark:bg-black h-full min-w-0 overflow-hidden relative">
        {activeTab === "notes" ? (
          selectedNote ? (
            <div className="flex flex-col h-full overflow-hidden">
              {/* Trash Warning Banner */}
              {selectedNote.folder === "trash" && (
                <div className="bg-amber-500/10 dark:bg-amber-500/15 border-b border-amber-500/30 px-8 py-2.5 flex items-center justify-between text-xs text-amber-900 dark:text-amber-200 shrink-0">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
                    <span className="font-medium">This note is in the Trash.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleRestoreNote}
                      className="px-3 py-1 rounded-lg bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-zinc-900 dark:text-zinc-100 hover:bg-zinc-50 font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
                      <span>Restore Note</span>
                    </button>
                    <button
                      onClick={handlePermanentDeleteNote}
                      className="px-3 py-1 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete Permanently</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Note Header Top Bar */}
              <div className="px-8 p-5 pb-4 border-b border-zinc-100 dark:border-zinc-800/80 shrink-0">
                <div className="flex items-start justify-between gap-4">
                  {/* Note title and metadata (Date & Tags directly under Notes title) */}
                  <div className="flex-1 min-w-0">
                    <input
                      type="text"
                      value={selectedNote.title}
                      onChange={(e) => handleTitleChange(e.target.value)}
                      placeholder={selectedNote.content.trim().split("\n")[0]?.trim() || "Note title..."}
                      className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white bg-transparent focus:outline-none w-full"
                    />

                    {/* Date and Tags directly under the Notes title */}
                    <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                      <span className="text-xs text-zinc-400 dark:text-zinc-500 font-medium shrink-0">
                        {formatDateStandard(selectedNote.date)}
                      </span>

                      <span className="text-zinc-300 dark:text-zinc-700 text-xs shrink-0 select-none">·</span>

                      {/* Reusable Tags Row with Apple color dots */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {(selectedNote.tags || []).map((t) => {
                          const dotColor = getTagColor(t, tagColors)
                          return (
                            <span
                              key={t}
                              className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#f0f0f2] dark:bg-white/10 text-zinc-800 dark:text-zinc-200 shadow-2xs"
                            >
                              <span
                                className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                                style={{ backgroundColor: dotColor }}
                              />
                              <span className="capitalize">{t}</span>
                              <button
                                onClick={() => handleRemoveTagFromSelectedNote(t)}
                                className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors ml-0.5 cursor-pointer"
                                title="Remove tag"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          )
                        })}

                        {/* Add Tag Popover */}
                        <div className="relative inline-flex items-center">
                          <button
                            ref={tagAddButtonRef}
                            onClick={() => setTagInputOpen((v) => !v)}
                            className="inline-flex items-center justify-center w-7 h-5 rounded-full bg-[#f0f0f2] hover:bg-zinc-200 dark:bg-white/10 dark:hover:bg-white/15 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
                            title="Add tags"
                            aria-label="Add tags"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>

                          <NoteTagsPopover
                            isOpen={tagInputOpen}
                            onClose={() => setTagInputOpen(false)}
                            selectedTags={selectedNote.tags || []}
                            allTags={allAvailableTags}
                            tagColors={tagColors}
                            onToggleTag={handleToggleTagOnSelectedNote}
                            triggerRef={tagAddButtonRef}
                          />
                        </div>

                        {/* Note Collaborator Avatars */}
                        {selectedNote.sharedWith && selectedNote.sharedWith.length > 0 && (
                          <button
                            type="button"
                            onClick={handleOpenShareNote}
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-zinc-100 hover:bg-zinc-200/80 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 border border-zinc-200/60 dark:border-zinc-700/60 shadow-2xs transition-colors cursor-pointer"
                            title="Shared note collaborators (click to manage)"
                          >
                            <Users className="h-3 w-3 text-zinc-500 dark:text-zinc-400" />
                            {renderCollaboratorAvatars(selectedNote.sharedWith, 4)}
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Top-Right Minimal Actions */}
                  <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                    {/* 3-dot More options menu: Eye, Sharing, Move to Folder, Delete */}
                    <div className="relative">
                      <button
                        onClick={() => setMoreMenuOpen((v) => !v)}
                        className={`p-2 rounded-xl transition-colors cursor-pointer ${moreMenuOpen
                          ? "text-zinc-900 bg-zinc-100 dark:text-white dark:bg-zinc-800"
                          : "text-zinc-500 hover:text-zinc-900 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-white dark:hover:bg-zinc-800"
                          }`}
                        title="More actions"
                        aria-label="More actions"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>

                      {moreMenuOpen && (
                        <div className="absolute right-0 top-10 z-40 w-52 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl py-1 text-xs">
                          {/* Markdown Preview toggle */}
                          <button
                            onClick={() => {
                              setNotePreview((v) => !v)
                              setMoreMenuOpen(false)
                            }}
                            className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                          >
                            {notePreview ? <EyeOff className="h-4 w-4 text-zinc-500" /> : <Eye className="h-4 w-4 text-zinc-500" />}
                            <span>{notePreview ? "Edit text" : "Preview markdown"}</span>
                          </button>

                          {/* Share button (only active for non-trash notes) */}
                          {selectedNote.folder !== "trash" && (
                            <button
                              onClick={handleOpenShareNote}
                              className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2.5 transition-colors cursor-pointer"
                            >
                              <Share2 className="h-4 w-4 text-zinc-500" />
                              <span>Share note...</span>
                            </button>
                          )}

                          <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                          {selectedNote.folder !== "trash" ? (
                            <>
                              {/* Move to folder submenu */}
                              <div className="px-3 py-1 font-semibold text-[10px] text-zinc-400 uppercase tracking-wider">
                                Move to Folder
                              </div>
                              <button
                                onClick={() => {
                                  handleMoveToFolder("all")
                                  setMoreMenuOpen(false)
                                }}
                                className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-between transition-colors cursor-pointer"
                              >
                                <span>All Notes</span>
                                {selectedNote.folder === "all" && (
                                  <span className="text-amber-600 dark:text-yellow-400 text-xs font-bold">✓</span>
                                )}
                              </button>
                              {allCustomFolders.map(({ folder, depth }) => (
                                <button
                                  key={folder.id}
                                  onClick={() => {
                                    handleMoveToFolder(folder.id)
                                    setMoreMenuOpen(false)
                                  }}
                                  style={{ paddingLeft: `${12 + depth * 8}px` }}
                                  className="w-full text-left px-3 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-between transition-colors cursor-pointer"
                                >
                                  <span className="truncate">{folder.name}</span>
                                  {selectedNote.folder === folder.id && (
                                    <span className="text-amber-600 dark:text-yellow-400 text-xs font-bold">✓</span>
                                  )}
                                </button>
                              ))}

                              <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />

                              {/* Delete button (moves to trash) */}
                              <button
                                onClick={() => {
                                  handleDeleteNote()
                                  setMoreMenuOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                                <span>Move to Trash</span>
                              </button>
                            </>
                          ) : (
                            <>
                              {/* Restore note */}
                              <button
                                onClick={() => {
                                  handleRestoreNote()
                                  setMoreMenuOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                              >
                                <RotateCcw className="h-4 w-4 text-zinc-500" />
                                <span>Restore note</span>
                              </button>
                              <div className="my-1 border-t border-zinc-100 dark:border-zinc-800" />
                              {/* Delete permanently */}
                              <button
                                onClick={() => {
                                  handlePermanentDeleteNote()
                                  setMoreMenuOpen(false)
                                }}
                                className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-950/30 text-red-600 dark:text-red-400 flex items-center gap-2.5 transition-colors cursor-pointer font-medium"
                              >
                                <Trash2 className="h-4 w-4 text-red-500" />
                                <span>Delete permanently</span>
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>


              {/* Note Content Editor: Plain Text First */}
              <div className="flex-1 overflow-y-auto px-8 py-4 flex flex-col momentum-scroll relative">
                {notePreview ? (
                  <div className="prose max-w-none text-base text-zinc-900 dark:prose-invert dark:text-white leading-relaxed pb-20">
                    <MarkdownContent content={selectedNote.content || "*Nothing to preview*"} />
                  </div>
                ) : (
                  <div className="relative flex-1 flex flex-col min-h-[300px]">
                    {/* Live Highlight Backdrop for Search Query (#ffdda0) */}
                    {searchQuery.trim() && (
                      <div
                        aria-hidden="true"
                        className="absolute inset-0 pointer-events-none whitespace-pre-wrap break-words font-sans text-base leading-relaxed text-transparent overflow-hidden select-none pb-20 z-0"
                        style={{ wordBreak: "break-word" }}
                      >
                        <HighlightText text={selectedNote.content || ""} query={searchQuery} />
                      </div>
                    )}
                    <textarea
                      ref={editorTextareaRef}
                      className="note-editor-content relative z-10 flex-1 w-full resize-none bg-transparent text-zinc-900 dark:text-white text-base leading-relaxed focus:outline-none placeholder-zinc-400 dark:placeholder-zinc-600 font-sans pb-20"
                      value={selectedNote.content}
                      onChange={(e) => handleNoteChange(e.target.value)}
                      placeholder={selectedNote.folder === "trash" ? "This note is in Trash." : "Type something..."}
                      spellCheck
                      autoCapitalize="sentences"
                      autoCorrect="on"
                      maxLength={MAX_CONTENT_LENGTH + 100}
                      readOnly={selectedNote.folder === "trash"}
                    />
                  </div>
                )}

                {/* Floating Action Container at bottom-right of note content (only when not in Trash) */}
                {selectedNote.folder !== "trash" && (
                  <div className="sticky bottom-6 self-end z-20 pointer-events-auto flex items-center gap-2">
                    {/* Transcription icon with badge of number of records (left to Record item) */}
                    <button
                      type="button"
                      onClick={() => setTranscriptionSidebarOpen((v) => !v)}
                      className={`relative w-10 h-10 rounded-full transition-all cursor-pointer shadow-md backdrop-blur-md border flex items-center justify-center ${transcriptionSidebarOpen
                        ? "bg-amber-500 text-black border-amber-400 dark:bg-yellow-500 dark:text-black"
                        : "bg-white/95 dark:bg-zinc-800/95 text-zinc-600 dark:text-zinc-300 border-zinc-200/80 dark:border-zinc-700 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-700"
                        }`}
                      title={
                        noteRecordCount > 0
                          ? `Show transcription (${noteRecordCount} ${noteRecordCount === 1 ? "record" : "records"})`
                          : "Show transcription"
                      }
                      aria-label="Show transcription"
                    >
                      <AudioWaveform className="h-4 w-4" />
                      {noteRecordCount > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-amber-500 text-black dark:bg-yellow-500 dark:text-black text-[10px] font-bold flex items-center justify-center shadow-xs border border-white dark:border-zinc-900">
                          {noteRecordCount}
                        </span>
                      )}
                    </button>

                    <VoiceRecorder
                      lang={transcriptionLang}
                      silenceTimeoutSec={silenceTimeoutSec}
                      speakerProfiles={speakerProfiles}
                      onTranscriptUpdate={handleTranscriptUpdate}
                      onRecordingStart={handleRecordingStart}
                      onRecordingStop={handleRecordingStop}
                    />
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-zinc-400">
              <div className="text-center">
                <p className="text-sm text-zinc-500 mb-3">No note selected</p>
                <button
                  onClick={handleCreateNote}
                  className="px-4 py-2 rounded-xl bg-zinc-900 text-white dark:bg-yellow-500 dark:text-black text-xs font-semibold"
                >
                  Create Note
                </button>
              </div>
            </div>
          )
        ) : (
          /* Agent AI Workspace */
          <div className="flex flex-col h-full bg-[#fcfcfd] dark:bg-black">
            <div className="px-6 py-3.5 border-b border-zinc-100 dark:border-zinc-800 flex items-center gap-2.5">
              <Sparkles className="h-4 w-4 text-amber-600 dark:text-yellow-400" />
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-white">AI Assistant</h2>
            </div>

            <div ref={chatScrollRef} className="flex-1 overflow-y-auto p-6 space-y-4 momentum-scroll">
              {chatMessages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}>
                  <div
                    className={`w-7 h-7 rounded-full flex items-center justify-center text-xs shrink-0 ${msg.role === "user"
                      ? "bg-zinc-200 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200"
                      : "bg-amber-500 text-black dark:bg-yellow-500 dark:text-black"
                      }`}
                  >
                    {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                  </div>
                  <div
                    className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs leading-relaxed ${msg.role === "user"
                      ? "bg-zinc-900 text-white dark:bg-zinc-800"
                      : "bg-white border border-zinc-200/80 dark:bg-zinc-900 dark:border-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-2xs"
                      }`}
                  >
                    {msg.role === "ai" && msg.citations?.length ? (
                      <MarkdownWithCitations content={msg.content} citations={msg.citations} onJump={handleChatJump} />
                    ) : (
                      <MarkdownContent content={msg.content} />
                    )}
                  </div>
                </div>
              ))}
              {chatLoading && (
                <div className="flex items-center gap-2 text-xs text-zinc-400">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Thinking...</span>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-zinc-100 dark:border-zinc-800">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleChatSend()
                }}
                className="relative flex items-center"
              >
                <input
                  type="text"
                  placeholder="Ask about your notes..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  className="w-full rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-transparent focus:border-amber-500/50 px-4 py-2.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="absolute right-2 p-1.5 rounded-lg bg-zinc-900 text-white dark:bg-yellow-500 dark:text-black disabled:opacity-40"
                >
                  <Send className="h-3 w-3" />
                </button>
              </form>
            </div>
          </div>
        )}
      </main>

      {/* ── COLUMN 4: Transcription Sidebar (conditional 4th column) ──── */}
      <TranscriptionSidebar
        isOpen={transcriptionSidebarOpen && activeTab === "notes" && !!selectedNote}
        onClose={() => setTranscriptionSidebarOpen(false)}
        segments={selectedNote?.transcriptSegments || []}
        audioRecording={selectedNote?.audioRecording}
        speakerProfiles={speakerProfiles}
        onRenameSpeaker={handleRenameSpeaker}
      />

      {/* ── Modals ──────────────────────────────────────────────────────── */}
      <AuthModal isOpen={authOpen} onClose={() => setAuthOpen(false)} onSignIn={(u) => setUser(u)} />
      <PinLoginModal
        isOpen={pinLoginOpen}
        onClose={() => setPinLoginOpen(false)}
        onSuccess={(key) => {
          if (user) setUser({ ...user, encryptionKey: key })
          setPinLoginOpen(false)
        }}
        onSwitchToPassword={() => {
          setPinLoginOpen(false)
          setAuthOpen(true)
        }}
        userName={user?.name || ""}
      />
      <ShareModal
        isOpen={shareModalOpen}
        onClose={() => {
          setShareModalOpen(false)
          setShareTarget(null)
        }}
        target={shareTarget}
        onUpdateCollaborators={handleUpdateCollaborators}
      />
      <SpotlightSearchModal
        isOpen={spotlightOpen}
        onClose={() => setSpotlightOpen(false)}
        notes={localNotes}
        folders={folders}
        onSelectNote={(note) => {
          setSelectedNote(note)
          setActiveTab("notes")
        }}
      />
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        userEmail={user?.email}
        speakers={speakerProfiles}
        onUpdateSpeakers={(updated) => setSpeakerProfiles(updated)}
      />

      {/* Move Folder Dialog */}
      {movingFolder && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-2xl space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-zinc-900 dark:text-white truncate">
                Move &quot;{movingFolder.name}&quot; to
              </h3>
              <button
                onClick={() => setMovingFolder(null)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-700 dark:hover:text-white cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-1 max-h-60 overflow-y-auto">
              <button
                onClick={() => {
                  const updated = moveFolderToParent(movingFolder.id, null)
                  setFolders(updated)
                  setMovingFolder(null)
                }}
                className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Notebook className="h-4 w-4 text-amber-500" />
                  <span>Root (All Notes)</span>
                </div>
                {!movingFolder.parentId && <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400" />}
              </button>
              {allCustomFolders
                .filter(({ folder }) => folder.id !== movingFolder.id)
                .map(({ folder, depth }) => (
                  <button
                    key={folder.id}
                    onClick={() => {
                      const updated = moveFolderToParent(movingFolder.id, folder.id)
                      setFolders(updated)
                      setMovingFolder(null)
                    }}
                    style={{ paddingLeft: `${12 + depth * 12}px` }}
                    className="w-full text-left px-3 py-2 rounded-xl text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <FolderIcon className="h-4 w-4 text-amber-500/80 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </div>
                    {movingFolder.parentId === folder.id && (
                      <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400 shrink-0" />
                    )}
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Folder Share Toast */}
      {folderShareToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] px-4 py-2 rounded-full bg-zinc-900 text-white dark:bg-white dark:text-zinc-900 text-xs font-medium shadow-2xl flex items-center gap-2 transition-all">
          <Check className="h-3.5 w-3.5 text-amber-500" />
          <span>{folderShareToast}</span>
        </div>
      )}
    </div>
  )
}
