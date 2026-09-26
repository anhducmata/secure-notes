"use client"

import React, { useState, useEffect, useRef, useMemo } from "react"
import { Search, FileText, ArrowRight, CornerDownLeft, AudioWaveform, Folder as FolderIcon, X } from "lucide-react"
import { HighlightText } from "@/lib/highlight"
import type { FolderItem } from "@/lib/folders"
import { getTagColor, getStoredTagColors } from "@/lib/tags"
import { getNoteDisplayTitle } from "@/lib/crypto"

interface DecryptedNoteWithMeta {
  id: string
  title: string
  content: string
  date: Date
  folder: string
  tags?: string[]
  transcriptSegments?: Array<{
    id: string
    speaker_id: string
    start: number
    end: number
    text: string
  }>
  audioRecording?: {
    dataUrl: string
    duration: number
    mimeType: string
  }
}

interface SpotlightSearchModalProps {
  isOpen: boolean
  onClose: () => void
  notes: DecryptedNoteWithMeta[]
  folders: FolderItem[]
  onSelectNote: (note: DecryptedNoteWithMeta) => void
}

export function SpotlightSearchModal({
  isOpen,
  onClose,
  notes,
  folders,
  onSelectNote,
}: SpotlightSearchModalProps) {
  const [query, setQuery] = useState("")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const resultsContainerRef = useRef<HTMLDivElement>(null)
  const [tagColors, setTagColors] = useState<Record<string, string>>({})

  useEffect(() => {
    if (isOpen) {
      setTagColors(getStoredTagColors())
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    } else {
      setQuery("")
    }
  }, [isOpen])

  // Filter notes
  const filteredNotes = useMemo(() => {
    if (!query.trim()) {
      return notes.filter((n) => n.folder !== "trash").slice(0, 8)
    }
    const q = query.trim().toLowerCase()
    return notes
      .filter((n) => {
        if (n.folder === "trash") return false
        const displayTitle = getNoteDisplayTitle(n)
        const inTitle = displayTitle.toLowerCase().includes(q)
        const inContent = (n.content || "").toLowerCase().includes(q)
        const inTags = (n.tags || []).some((t) => t.toLowerCase().includes(q))
        const inTranscripts = (n.transcriptSegments || []).some((s) => s.text.toLowerCase().includes(q))
        return inTitle || inContent || inTags || inTranscripts
      })
      .slice(0, 15)
  }, [notes, query])

  // Reset selected index when filtered list changes
  useEffect(() => {
    setSelectedIndex(0)
  }, [filteredNotes.length])

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filteredNotes.length))
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 + filteredNotes.length) % Math.max(1, filteredNotes.length))
    } else if (e.key === "Enter") {
      e.preventDefault()
      if (filteredNotes[selectedIndex]) {
        onSelectNote(filteredNotes[selectedIndex])
        onClose()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (!resultsContainerRef.current) return
    const activeEl = resultsContainerRef.current.children[selectedIndex] as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: "nearest" })
    }
  }, [selectedIndex])

  const getFolderName = (folderId: string) => {
    if (folderId === "all") return "All Notes"
    const f = folders.find((item) => item.id.toLowerCase() === folderId.toLowerCase())
    return f ? f.name : "All Notes"
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-[95] flex justify-center">
      {/* Darkened backdrop (slightly darker as requested) */}
      <div
        className="fixed inset-0 bg-black/65 backdrop-blur-xs transition-opacity duration-150"
        onClick={onClose}
      />

      {/* Spotlight modal box ~30% below top */}
      <div
        className="fixed top-[28%] left-1/2 -translate-x-1/2 w-full max-w-xl mx-4 z-[96] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[55vh] animate-in fade-in zoom-in-95 duration-100"
        onKeyDown={handleKeyDown}
      >
        {/* Search input bar */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-zinc-100 dark:border-zinc-800">
          <Search className="h-5 w-5 text-amber-500 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes, audio, tags..."
            className="flex-1 bg-transparent text-sm text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200/60 dark:border-zinc-700/60">
                ⌘ Space
              </span>
              <span className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-zinc-100 dark:bg-zinc-800 text-zinc-400 dark:text-zinc-500 border border-zinc-200/60 dark:border-zinc-700/60">
                ESC
              </span>
            </div>
          )}
        </div>

        {/* Results List */}
        <div
          ref={resultsContainerRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 momentum-scroll divide-y-0"
        >
          {filteredNotes.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 dark:text-zinc-500">
              No notes found matching &quot;{query}&quot;
            </div>
          ) : (
            filteredNotes.map((note, index) => {
              const isSelected = index === selectedIndex
              const hasAudio = Boolean(
                note.audioRecording?.dataUrl ||
                  (note.transcriptSegments && note.transcriptSegments.length > 0)
              )

              // Snippet excerpt
              const contentText = note.content || ""
              let snippet = contentText.slice(0, 90)
              if (query.trim()) {
                const matchPos = contentText.toLowerCase().indexOf(query.trim().toLowerCase())
                if (matchPos > 30) {
                  snippet = "..." + contentText.slice(matchPos - 20, matchPos + 70)
                }
              }

              return (
                <div
                  key={note.id}
                  onClick={() => {
                    onSelectNote(note)
                    onClose()
                  }}
                  onMouseEnter={() => setSelectedIndex(index)}
                  className={`group px-3.5 py-2.5 rounded-xl cursor-pointer transition-colors flex items-start justify-between gap-3 text-left ${
                    isSelected
                      ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-950 dark:text-white"
                      : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300"
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className={`h-3.5 w-3.5 shrink-0 ${isSelected ? "text-amber-500" : "text-zinc-400"}`} />
                      <h4 className="text-xs font-semibold truncate">
                        <HighlightText text={getNoteDisplayTitle(note) || "Note"} query={query} />
                      </h4>
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 flex items-center gap-1 shrink-0 ml-1">
                        <FolderIcon className="h-2.5 w-2.5" />
                        <span>{getFolderName(note.folder)}</span>
                      </span>
                    </div>

                    {snippet && (
                      <p className="text-[11px] text-zinc-500 dark:text-zinc-400 line-clamp-1">
                        <HighlightText text={snippet} query={query} />
                      </p>
                    )}

                    {/* Tags row */}
                    {note.tags && note.tags.length > 0 && (
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {note.tags.map((t) => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] bg-zinc-200/60 dark:bg-zinc-700/60 text-zinc-700 dark:text-zinc-300"
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: getTagColor(t, tagColors) }}
                            />
                            <span>{t}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0 self-center">
                    {hasAudio && (
                      <span className="p-1 rounded-md bg-amber-500/10 text-amber-600 dark:text-yellow-400" title="Contains audio">
                        <AudioWaveform className="h-3 w-3" />
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] text-zinc-400 flex items-center gap-1 font-mono">
                        <span>Select</span>
                        <CornerDownLeft className="h-3 w-3" />
                      </span>
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer shortcuts hint */}
        <div className="px-4 py-2 border-t border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/50 flex items-center justify-between text-[10px] text-zinc-400">
          <div className="flex items-center gap-3">
            <span>↑↓ Navigate</span>
            <span>↵ Select</span>
            <span>ESC Close</span>
          </div>
          <span className="font-mono">{filteredNotes.length} notes</span>
        </div>
      </div>
    </div>
  )
}
