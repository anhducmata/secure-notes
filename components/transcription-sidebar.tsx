"use client"

import React, { useState, useRef, useEffect, useMemo } from "react"
import {
  X,
  Search,
  Play,
  Pause,
  MoreHorizontal,
  Volume2,
  Clock,
  Check,
  MicOff,
} from "lucide-react"
import {
  TranscriptSegment,
  SpeakerProfile,
  resolveSpeakerName,
  formatTimeSec,
  formatTimeRange,
} from "@/lib/speakers"

interface TranscriptionSidebarProps {
  isOpen: boolean
  onClose: () => void
  segments: TranscriptSegment[]
  audioRecording?: {
    dataUrl: string
    duration: number
    mimeType: string
  }
  speakerProfiles: SpeakerProfile[]
  onRenameSpeaker: (
    speakerId: string,
    newName: string,
    scope: "note" | "global"
  ) => void
}

export function TranscriptionSidebar({
  isOpen,
  onClose,
  segments,
  audioRecording,
  speakerProfiles,
  onRenameSpeaker,
}: TranscriptionSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedSpeakerFilter, setSelectedSpeakerFilter] = useState<string>("all")
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(audioRecording?.duration || 0)
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1)

  // Rename modal / popover state
  const [renamingSpeakerId, setRenamingSpeakerId] = useState<string | null>(null)
  const [renameInput, setRenameInput] = useState("")
  const [renameScope, setRenameScope] = useState<"note" | "global">("global")

  const audioRef = useRef<HTMLAudioElement | null>(null)

  // Initialize or update audio element when recording changes
  useEffect(() => {
    if (audioRecording?.dataUrl) {
      if (!audioRef.current) {
        audioRef.current = new Audio()
      }
      audioRef.current.src = audioRecording.dataUrl
      audioRef.current.playbackRate = playbackSpeed
      audioRef.current.onloadedmetadata = () => {
        if (audioRef.current) {
          setDuration(audioRef.current.duration || audioRecording.duration)
        }
      }
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) {
          setCurrentTime(audioRef.current.currentTime)
        }
      }
      audioRef.current.onended = () => {
        setIsPlaying(false)
      }
    } else {
      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
      setIsPlaying(false)
      setCurrentTime(0)
      setDuration(0)
    }

    return () => {
      if (audioRef.current) {
        audioRef.current.pause()
      }
    }
  }, [audioRecording?.dataUrl, audioRecording?.duration])

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = playbackSpeed
    }
  }, [playbackSpeed])

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose()
      }
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [isOpen, onClose])

  // Count occurrences per speaker
  const speakerCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const seg of segments) {
      counts[seg.speaker_id] = (counts[seg.speaker_id] || 0) + 1
    }
    return counts
  }, [segments])

  // Collect unique speaker IDs in this transcript
  const uniqueSpeakers = useMemo(() => {
    const ids = Array.from(new Set(segments.map((s) => s.speaker_id)))
    return ids.map((id) => ({
      id,
      name: resolveSpeakerName(id, speakerProfiles),
      count: speakerCounts[id] || 0,
    }))
  }, [segments, speakerProfiles, speakerCounts])

  // Filtered segments
  const filteredSegments = useMemo(() => {
    return segments.filter((s) => {
      const matchesSearch =
        searchQuery === "" ||
        s.text.toLowerCase().includes(searchQuery.toLowerCase()) ||
        resolveSpeakerName(s.speaker_id, speakerProfiles)
          .toLowerCase()
          .includes(searchQuery.toLowerCase())

      const matchesSpeaker =
        selectedSpeakerFilter === "all" || s.speaker_id === selectedSpeakerFilter

      return matchesSearch && matchesSpeaker
    })
  }, [segments, searchQuery, selectedSpeakerFilter, speakerProfiles])

  const togglePlayPause = () => {
    if (!audioRef.current && !audioRecording?.dataUrl) return

    if (!audioRef.current && audioRecording?.dataUrl) {
      audioRef.current = new Audio(audioRecording.dataUrl)
      audioRef.current.playbackRate = playbackSpeed
      audioRef.current.ontimeupdate = () => {
        if (audioRef.current) setCurrentTime(audioRef.current.currentTime)
      }
      audioRef.current.onended = () => setIsPlaying(false)
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    }
  }

  const jumpToTime = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = seconds
      if (!isPlaying) {
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    }
  }

  const cycleSpeed = () => {
    const speeds = [1, 1.25, 1.5, 2]
    const nextIdx = (speeds.indexOf(playbackSpeed) + 1) % speeds.length
    setPlaybackSpeed(speeds[nextIdx])
  }

  const startRename = (speakerId: string) => {
    setRenamingSpeakerId(speakerId)
    setRenameInput(resolveSpeakerName(speakerId, speakerProfiles))
    setRenameScope("global")
  }

  const confirmRename = () => {
    if (renamingSpeakerId && renameInput.trim()) {
      onRenameSpeaker(renamingSpeakerId, renameInput.trim(), renameScope)
    }
    setRenamingSpeakerId(null)
  }

  if (!isOpen) return null

  const hasRecording = Boolean(audioRecording?.dataUrl && audioRecording.dataUrl.trim().length > 0)

  // Calculate maximum duration from recording or segments
  const effectiveDuration = hasRecording
    ? duration > 0
      ? duration
      : audioRecording?.duration || (segments.length > 0 ? Math.max(...segments.map((s) => s.end), 1) : 1)
    : 0

  return (
    <>
      {/* Mobile / Tablet backdrop overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/20 backdrop-blur-[2px] z-30 xl:hidden transition-opacity"
        aria-hidden="true"
      />
      <aside
        aria-label="Transcription Sidebar"
        className="w-80 md:w-84 max-w-[85vw] border-l border-zinc-200/80 dark:border-zinc-800 flex flex-col bg-white dark:bg-black h-full transition-all z-40 shrink-0 select-none max-xl:fixed max-xl:right-0 max-xl:top-0 max-xl:bottom-0 max-xl:shadow-2xl xl:relative xl:shadow-none"
      >
      {/* ── Top Header ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-100 dark:border-zinc-800/80">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-white tracking-tight">
          Transcription
        </h2>
        <button
          onClick={onClose}
          className="p-1 rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 dark:text-zinc-500 dark:hover:text-white dark:hover:bg-zinc-800 transition-colors cursor-pointer"
          title="Close transcription"
          aria-label="Close transcription"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Search Input ──────────────────────────────────────────── */}
      <div className="px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/60">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
          <input
            type="text"
            placeholder="Search transcript..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#f8f8fa] dark:bg-zinc-900/80 border border-transparent dark:border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none focus:bg-white focus:border-amber-500/50 dark:focus:border-amber-500/50 transition-colors"
          />
        </div>
      </div>

      {/* ── Speaker Filter Chips ───────────────────────────────────── */}
      <div className="px-4 py-2.5 border-b border-zinc-100 dark:border-zinc-800/60 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
        <button
          onClick={() => setSelectedSpeakerFilter("all")}
          className={`px-3 py-1 rounded-full text-xs transition-colors shrink-0 ${
            selectedSpeakerFilter === "all"
              ? "bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 shadow-xs"
              : "bg-zinc-100/70 text-zinc-600 hover:bg-zinc-200/70 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
          }`}
        >
          All ({segments.length})
        </button>
        {uniqueSpeakers.map((spk) => (
          <button
            key={spk.id}
            onClick={() => setSelectedSpeakerFilter(spk.id)}
            className={`px-3 py-1 rounded-full text-xs transition-colors shrink-0 ${
              selectedSpeakerFilter === spk.id
                ? "bg-zinc-100 text-zinc-950 font-semibold border border-zinc-200/80 dark:bg-zinc-800 dark:text-white dark:border-zinc-700 shadow-xs"
                : "bg-zinc-100/70 text-zinc-600 hover:bg-zinc-200/70 dark:bg-zinc-800/60 dark:text-zinc-400 dark:hover:bg-zinc-800"
            }`}
          >
            {spk.name} ({spk.count})
          </button>
        ))}
      </div>

      {/* ── Segments List ─────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 divide-y divide-zinc-100 dark:divide-zinc-800/60 momentum-scroll">
        {filteredSegments.length === 0 ? (
          <div className="h-44 flex flex-col items-center justify-center text-center p-4">
            <Volume2 className="h-6 w-6 text-zinc-300 dark:text-zinc-700 mb-2" />
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {segments.length === 0
                ? "No transcription segments for this note yet. Click Record to begin."
                : "No matching segments found."}
            </p>
          </div>
        ) : (
          filteredSegments.map((segment) => {
            const speakerName = resolveSpeakerName(segment.speaker_id, speakerProfiles)
            const isActive = currentTime >= segment.start && currentTime <= segment.end

            return (
              <div
                key={segment.id}
                onClick={() => hasRecording && jumpToTime(segment.start)}
                className={`py-3.5 first:pt-1 last:pb-1 flex items-start gap-3 group transition-colors ${
                  hasRecording ? "cursor-pointer" : ""
                } ${
                  isActive && hasRecording ? "bg-zinc-100 dark:bg-zinc-800/70 -mx-2 px-2 rounded-xl" : ""
                }`}
              >
                {/* Circular Play Button or Timestamp Indicator */}
                {hasRecording ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      jumpToTime(segment.start)
                    }}
                    className="w-8 h-8 rounded-full bg-zinc-100 group-hover:bg-zinc-200/80 dark:bg-zinc-800 dark:group-hover:bg-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-300 shrink-0 transition-colors mt-0.5 cursor-pointer"
                    title="Play from here"
                  >
                    <Play className="h-3 w-3 fill-current ml-0.5" />
                  </button>
                ) : (
                  <div
                    className="w-8 h-8 rounded-full bg-zinc-100/70 dark:bg-zinc-800/60 flex items-center justify-center text-zinc-400 dark:text-zinc-500 shrink-0 mt-0.5"
                    title="Timestamp"
                  >
                    <Clock className="h-3.5 w-3.5 opacity-60" />
                  </div>
                )}

                {/* Segment Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500">
                      {formatTimeSec(segment.start)} – {formatTimeSec(segment.end)}
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        startRename(segment.speaker_id)
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-700 dark:hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                      title="Rename speaker"
                    >
                      <MoreHorizontal className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <p
                    onClick={(e) => {
                      e.stopPropagation()
                      startRename(segment.speaker_id)
                    }}
                    className="text-xs font-semibold text-zinc-900 dark:text-white hover:underline cursor-pointer inline-block"
                  >
                    {speakerName}
                  </p>

                  <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed mt-1 select-text">
                    {segment.text}
                  </p>
                </div>
              </div>
            )
          })
        )}
      </div>

      {/* ── Speaker Rename Popover / Modal ───────────────────────── */}
      {renamingSpeakerId && (
        <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xl slide-in">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-zinc-900 dark:text-white">
              Rename speaker
            </span>
            <button
              onClick={() => setRenamingSpeakerId(null)}
              className="text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          <input
            type="text"
            value={renameInput}
            onChange={(e) => setRenameInput(e.target.value)}
            placeholder="Speaker name..."
            autoFocus
            className="w-full bg-[#f8f8fa] dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-3 py-2 text-xs text-zinc-900 dark:text-white mb-3 focus:outline-none focus:border-amber-500"
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmRename()
              if (e.key === "Escape") setRenamingSpeakerId(null)
            }}
          />

          <div className="space-y-1.5 mb-3 text-xs">
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="renameScope"
                checked={renameScope === "note"}
                onChange={() => setRenameScope("note")}
                className="accent-amber-500"
              />
              <span>Apply to this note</span>
            </label>
            <label className="flex items-center gap-2 text-zinc-700 dark:text-zinc-300 cursor-pointer">
              <input
                type="radio"
                name="renameScope"
                checked={renameScope === "global"}
                onChange={() => setRenameScope("global")}
                className="accent-amber-500"
              />
              <span>Apply to all past notes</span>
            </label>
          </div>

          <button
            onClick={confirmRename}
            disabled={!renameInput.trim()}
            className="w-full py-1.5 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-xs font-semibold text-white dark:text-black transition-colors cursor-pointer"
          >
            Save
          </button>
        </div>
      )}

      {/* ── Waveform & Playback Bar / Empty State ──────────────────── */}
      <div className="p-4 border-t border-zinc-100 dark:border-zinc-800/80 bg-white dark:bg-black">
        {hasRecording ? (
          <div>
            <div className="flex items-center gap-3">
              {/* Circular Play/Pause */}
              <button
                onClick={togglePlayPause}
                className="w-9 h-9 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-yellow-500 dark:text-black dark:hover:bg-yellow-400 flex items-center justify-center transition-all shrink-0 cursor-pointer shadow-xs active:scale-95"
                title={isPlaying ? "Pause" : "Play"}
                aria-label={isPlaying ? "Pause audio" : "Play audio"}
              >
                {isPlaying ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current ml-0.5" />
                )}
              </button>

              {/* Waveform Bars */}
              <div
                className="flex-1 h-9 flex items-center gap-[2px] cursor-pointer py-1"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  const clickX = e.clientX - rect.left
                  const fraction = Math.max(0, Math.min(1, clickX / rect.width))
                  jumpToTime(fraction * effectiveDuration)
                }}
              >
                {Array.from({ length: 36 }).map((_, i) => {
                  const fraction = i / 36
                  const isPassed = fraction <= currentTime / effectiveDuration
                  // Pleasing visual waveform pattern
                  const height = 8 + Math.abs(Math.sin((i + 1) * 0.9) * 18)

                  return (
                    <div
                      key={i}
                      className={`flex-1 rounded-full transition-colors ${
                        isPassed
                          ? "bg-zinc-800 dark:bg-yellow-400"
                          : "bg-zinc-200 dark:bg-zinc-800"
                      }`}
                      style={{ height: `${height}px` }}
                    />
                  )
                })}
              </div>
            </div>

            {/* Bottom Time and Speed row */}
            <div className="flex items-center justify-between mt-2.5 text-xs text-zinc-500 dark:text-zinc-400">
              <div className="font-mono text-[11px]">
                {formatTimeSec(currentTime)} / {formatTimeSec(effectiveDuration)}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {}}
                  className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors"
                  title="Timestamp marker"
                >
                  <Clock className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={cycleSpeed}
                  className="px-1.5 py-0.5 rounded text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Playback speed"
                >
                  {playbackSpeed}x
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 py-1 text-xs text-zinc-400 dark:text-zinc-500 font-medium">
            <MicOff className="h-3.5 w-3.5 opacity-60" />
            <span>No records</span>
          </div>
        )}
      </div>
    </aside>
  </>
  )
}
