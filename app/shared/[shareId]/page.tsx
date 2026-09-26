"use client"

import { useState, useEffect, useRef } from "react"
import {
  AlertCircle,
  Loader2,
  Lock,
  Copy,
  Check,
  Folder as FolderIcon,
  FileText,
  AudioWaveform,
  Play,
  Pause,
  Clock,
  User,
} from "lucide-react"
import { importShareKey, decryptFromShare, getNoteDisplayTitle } from "@/lib/crypto"
import { ThemeToggle } from "@/components/theme-toggle"
import { getTagColor, getStoredTagColors } from "@/lib/tags"

interface SharedNoteItem {
  id?: string
  title: string
  content: string
  date?: string
  tags?: string[]
  audioRecording?: {
    dataUrl: string
    duration: number
    mimeType: string
  }
  transcriptSegments?: Array<{
    id: string
    speaker_id: string
    start: number
    end: number
    text: string
  }>
}

interface SharedFolderData {
  type: "folder"
  folderName: string
  notes: SharedNoteItem[]
}

interface SharedNoteData {
  type?: "note"
  title: string
  content: string
  tags?: string[]
  audioRecording?: any
  transcriptSegments?: any
}

export default function SharedPage({ params }: { params: Promise<{ shareId: string }> }) {
  const [data, setData] = useState<SharedFolderData | SharedNoteData | null>(null)
  const [selectedNoteIndex, setSelectedNoteIndex] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [shareId, setShareId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [isPlayingAudio, setIsPlayingAudio] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const fetchedShareIds = useRef(new Set<string>())
  const [tagColors, setTagColors] = useState<Record<string, string>>({})

  // Unwrap params
  useEffect(() => {
    params.then((p) => setShareId(p.shareId))
    setTagColors(getStoredTagColors())
  }, [params])

  // Copy content to clipboard
  const copyToClipboard = async (content: string) => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      const textArea = document.createElement("textarea")
      textArea.value = content
      document.body.appendChild(textArea)
      textArea.select()
      document.execCommand("copy")
      document.body.removeChild(textArea)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  // Fetch and decrypt
  useEffect(() => {
    if (!shareId || fetchedShareIds.current.has(shareId)) return
    fetchedShareIds.current.add(shareId)

    const fetchAndDecrypt = async () => {
      try {
        const hash = window.location.hash
        const keyMatch = hash.match(/[#&]key=([^&]*)/)
        if (!keyMatch) {
          setError("Invalid share link: missing decryption key in URL fragment.")
          setIsLoading(false)
          return
        }
        const keyBase64 = decodeURIComponent(keyMatch[1])

        let res: Response
        let resData: any
        try {
          res = await fetch(`/api/share/${shareId}`)
          resData = await res.json()
        } catch {
          setError("Failed to load shared content. Please check your connection.")
          setIsLoading(false)
          return
        }

        if (!res.ok) {
          setError(resData.message || resData.error || "Failed to load shared content.")
          setIsLoading(false)
          return
        }

        let shareKey: CryptoKey
        try {
          shareKey = await importShareKey(keyBase64)
        } catch {
          setError("Invalid share link: the decryption key is malformed.")
          setIsLoading(false)
          return
        }

        try {
          const { encryptedData } = resData.share
          const plaintext = await decryptFromShare(
            encryptedData.ciphertext,
            encryptedData.iv,
            shareKey
          )
          const parsed = JSON.parse(plaintext)
          setData(parsed)
        } catch {
          setError("Failed to decrypt content. The link or decryption key is invalid.")
        }
      } finally {
        setIsLoading(false)
      }
    }

    fetchAndDecrypt()
  }, [shareId])

  // Audio playback toggle
  const togglePlayAudio = (dataUrl?: string) => {
    if (!dataUrl) return
    if (!audioRef.current) {
      audioRef.current = new Audio(dataUrl)
      audioRef.current.onended = () => setIsPlayingAudio(false)
    }
    if (isPlayingAudio) {
      audioRef.current.pause()
      setIsPlayingAudio(false)
    } else {
      audioRef.current.play()
      setIsPlayingAudio(true)
    }
  }

  // Cleanup audio on unmount
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [])

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#fafafb] text-zinc-900 dark:bg-black dark:text-white flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-amber-500 dark:text-yellow-500 mx-auto mb-4" />
          <p className="text-zinc-500 dark:text-gray-400 text-sm">Decrypting shared content...</p>
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-[#fafafb] text-zinc-900 dark:bg-black dark:text-white flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 border border-red-500/20 text-red-500">
            <AlertCircle className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Link Unavailable</h1>
          <p className="text-zinc-500 dark:text-gray-400 text-sm mb-4">{error || "Item not found"}</p>
          <p className="text-xs text-zinc-400 dark:text-gray-600">
            Make sure you opened the full URL including the decryption key fragment.
          </p>
        </div>
      </div>
    )
  }

  const isFolder = data.type === "folder"
  const folderData = isFolder ? (data as SharedFolderData) : null
  const currentNote: SharedNoteItem = isFolder
    ? folderData!.notes[selectedNoteIndex] || { title: "Untitled", content: "" }
    : (data as SharedNoteItem)

  return (
    <div className="min-h-screen bg-[#fafafb] text-zinc-900 dark:bg-black dark:text-white transition-colors duration-150 flex flex-col">
      {/* Top Banner */}
      <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md px-6 py-3.5 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600 dark:text-yellow-400">
            <Lock className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-xs font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
              <span>Secure Shared {isFolder ? "Folder" : "Note"}</span>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                Read-Only
              </span>
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => copyToClipboard(currentNote.content)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-xs font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-700 cursor-pointer"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            <span>{copied ? "Copied" : "Copy Note"}</span>
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Container */}
      <div className="flex-1 max-w-5xl w-full mx-auto p-4 md:p-8 flex flex-col md:flex-row gap-6">
        {/* If Folder: Left column list of notes */}
        {isFolder && (
          <aside className="w-full md:w-64 border border-zinc-200 dark:border-zinc-800 rounded-2xl bg-white dark:bg-zinc-900/60 p-3 flex flex-col shrink-0 max-h-[75vh]">
            <div className="flex items-center gap-2 px-2 py-2 mb-2 border-b border-zinc-100 dark:border-zinc-800">
              <FolderIcon className="h-4 w-4 text-amber-500" />
              <div className="truncate flex-1">
                <h3 className="text-xs font-bold text-zinc-900 dark:text-white truncate">{folderData!.folderName}</h3>
                <p className="text-[10px] text-zinc-400">{folderData!.notes.length} notes</p>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1">
              {folderData!.notes.map((note, index) => {
                const isSelected = index === selectedNoteIndex
                return (
                  <button
                    key={note.id || index}
                    onClick={() => {
                      setSelectedNoteIndex(index)
                      setIsPlayingAudio(false)
                      if (audioRef.current) audioRef.current.pause()
                    }}
                    className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex items-center justify-between ${
                      isSelected
                        ? "bg-zinc-100 dark:bg-zinc-800 font-semibold text-zinc-950 dark:text-white shadow-2xs"
                        : "text-zinc-600 dark:text-zinc-400 hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    }`}
                  >
                    <div className="truncate flex-1 mr-2">
                      <p className="truncate">{getNoteDisplayTitle(note) || "Note"}</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                        {note.content?.slice(0, 40) || "No text"}
                      </p>
                    </div>
                    {note.audioRecording?.dataUrl && (
                      <AudioWaveform className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          </aside>
        )}

        {/* Note Content Display */}
        <main className="flex-1 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 md:p-8 shadow-sm flex flex-col">
          {/* Note Title & Metadata */}
          <div className="mb-6 pb-4 border-b border-zinc-100 dark:border-zinc-800">
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white mb-2">
              {currentNote.title || "Untitled"}
            </h2>

            <div className="flex items-center gap-2 flex-wrap text-xs text-zinc-400">
              {currentNote.date && (
                <span>
                  {new Date(currentNote.date).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              )}

              {/* Tags */}
              {currentNote.tags && currentNote.tags.length > 0 && (
                <>
                  <span>·</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {currentNote.tags.map((t) => (
                      <span
                        key={t}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: getTagColor(t, tagColors) }}
                        />
                        <span>{t}</span>
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Audio Player Bar (if note has recorded audio) */}
          {currentNote.audioRecording?.dataUrl && (
            <div className="mb-6 p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => togglePlayAudio(currentNote.audioRecording?.dataUrl)}
                  className="w-8 h-8 rounded-full bg-amber-500 text-black flex items-center justify-center hover:bg-amber-400 transition-colors cursor-pointer shadow-xs"
                >
                  {isPlayingAudio ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4 ml-0.5" />}
                </button>
                <div>
                  <p className="text-xs font-semibold text-amber-900 dark:text-yellow-400">Audio Recording</p>
                  <p className="text-[11px] text-amber-700/80 dark:text-yellow-500/80">
                    {currentNote.audioRecording.duration
                      ? `${Math.floor(currentNote.audioRecording.duration)} seconds`
                      : "Voice memo"}
                  </p>
                </div>
              </div>
              <AudioWaveform className="h-5 w-5 text-amber-500" />
            </div>
          )}

          {/* Note Content Text */}
          <div className="flex-1 whitespace-pre-wrap font-sans text-sm md:text-base leading-relaxed text-zinc-800 dark:text-zinc-200">
            {currentNote.content || <span className="italic text-zinc-400">No content in this note</span>}
          </div>

          {/* Diarized Transcript Segments */}
          {currentNote.transcriptSegments && currentNote.transcriptSegments.length > 0 && (
            <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                Transcription Segments
              </h4>
              <div className="space-y-2">
                {currentNote.transcriptSegments.map((seg) => (
                  <div
                    key={seg.id}
                    className="p-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800 text-xs"
                  >
                    <div className="flex items-center justify-between mb-1 text-[11px] text-zinc-400">
                      <span className="font-semibold text-zinc-700 dark:text-zinc-300">
                        {seg.speaker_id || "Speaker"}
                      </span>
                      <span>
                        {Math.floor(seg.start)}s - {Math.floor(seg.end)}s
                      </span>
                    </div>
                    <p className="text-zinc-800 dark:text-zinc-200 leading-normal">{seg.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  )
}
