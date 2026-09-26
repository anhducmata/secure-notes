"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import {
  Calendar,
  FileText,
  Tag as TagIcon,
  User,
  ChevronDown,
  Check,
  X,
  Plus,
  Search,
} from "lucide-react"
import {
  APPLE_TAG_COLORS,
  getTagColor,
  addStoredTag,
  saveStoredTagColor,
} from "@/lib/tags"

export interface NoteFilterCriteria {
  titleQuery: string
  speakerId: string // "all" or specific speaker_id
  datePreset?: "all" | "today" | "this_week" | "this_month" | "custom"
  dateFrom: string  // "YYYY-MM-DD"
  dateTo: string    // "YYYY-MM-DD"
  content?: "all" | "audio" | "transcript" | "text_only"
  selectedTags: string[]
}

export const EMPTY_NOTE_FILTERS: NoteFilterCriteria = {
  titleQuery: "",
  speakerId: "all",
  datePreset: "all",
  dateFrom: "",
  dateTo: "",
  content: "all",
  selectedTags: [],
}

export interface SpeakerOption {
  id: string
  name: string
  noteCount: number
}

interface NoteFilterModalProps {
  isOpen: boolean
  onClose: () => void
  currentCriteria: NoteFilterCriteria
  onApply: (criteria: NoteFilterCriteria) => void
  onReset: () => void
  availableSpeakers: SpeakerOption[]
  availableTags: string[]
  calculateMatches?: (criteria: NoteFilterCriteria) => number
  triggerRef?: React.RefObject<HTMLButtonElement | null>
  tagColors?: Record<string, string>
  onSaveTagColor?: (tag: string, color: string) => void
}

function getDatePresetRange(preset: string): { from: string; to: string } {
  const now = new Date()
  const toStr = now.toISOString().slice(0, 10)

  if (preset === "today") {
    return { from: toStr, to: toStr }
  }
  if (preset === "this_week") {
    const day = now.getDay()
    const diff = now.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(now)
    monday.setDate(diff)
    return { from: monday.toISOString().slice(0, 10), to: toStr }
  }
  if (preset === "this_month") {
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1)
    return { from: firstDay.toISOString().slice(0, 10), to: toStr }
  }
  return { from: "", to: "" }
}

export function NoteFilterModal({
  isOpen,
  onClose,
  currentCriteria,
  onApply,
  onReset,
  availableSpeakers,
  availableTags,
  triggerRef,
  tagColors,
  onSaveTagColor,
}: NoteFilterModalProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [activeDropdown, setActiveDropdown] = useState<"date" | "content" | "tags" | "speakers" | null>(null)
  
  // Custom date state
  const [showCustomDate, setShowCustomDate] = useState(false)
  const [customFrom, setCustomFrom] = useState(currentCriteria.dateFrom || "")
  const [customTo, setCustomTo] = useState(currentCriteria.dateTo || "")

  // Search states for submenus
  const [tagSearch, setTagSearch] = useState("")
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(APPLE_TAG_COLORS[1].color) // orange default

  const [speakerSearch, setSpeakerSearch] = useState("")

  // Reset secondary state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setActiveDropdown(null)
      setShowCustomDate(currentCriteria.datePreset === "custom")
      setCustomFrom(currentCriteria.dateFrom || "")
      setCustomTo(currentCriteria.dateTo || "")
      setTagSearch("")
      setIsCreatingTag(false)
      setNewTagName("")
      setSpeakerSearch("")
    }
  }, [isOpen, currentCriteria.datePreset, currentCriteria.dateFrom, currentCriteria.dateTo])

  // Outside click & Escape handlers
  useEffect(() => {
    if (!isOpen) return

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        popoverRef.current &&
        !popoverRef.current.contains(target) &&
        (!triggerRef?.current || !triggerRef.current.contains(target))
      ) {
        onClose()
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeDropdown) {
          setActiveDropdown(null)
        } else {
          onClose()
        }
      }
    }

    document.addEventListener("mousedown", handleMouseDown)
    window.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isOpen, onClose, activeDropdown, triggerRef])

  // Display texts & active states
  const dateDisplay = useMemo(() => {
    if (currentCriteria.datePreset === "today") return "Today"
    if (currentCriteria.datePreset === "this_week") return "This week"
    if (currentCriteria.datePreset === "this_month") return "This month"
    if (currentCriteria.datePreset === "custom" || currentCriteria.dateFrom || currentCriteria.dateTo) {
      if (currentCriteria.dateFrom && currentCriteria.dateTo) {
        if (currentCriteria.dateFrom === currentCriteria.dateTo) return currentCriteria.dateFrom
        return `${currentCriteria.dateFrom} → ${currentCriteria.dateTo}`
      }
      if (currentCriteria.dateFrom) return `From ${currentCriteria.dateFrom}`
      if (currentCriteria.dateTo) return `To ${currentCriteria.dateTo}`
      return "Custom"
    }
    return "All"
  }, [currentCriteria.datePreset, currentCriteria.dateFrom, currentCriteria.dateTo])

  const isDateActive = currentCriteria.datePreset !== "all" || Boolean(currentCriteria.dateFrom) || Boolean(currentCriteria.dateTo)

  const contentDisplay = useMemo(() => {
    if (currentCriteria.content === "audio") return "With audio"
    if (currentCriteria.content === "transcript") return "With transcript"
    if (currentCriteria.content === "text_only") return "Text only"
    return "All"
  }, [currentCriteria.content])

  const isContentActive = currentCriteria.content && currentCriteria.content !== "all"

  const tagsCount = currentCriteria.selectedTags?.length || 0
  const tagsDisplay = useMemo(() => {
    if (tagsCount === 0) return "Any"
    return `${tagsCount} selected`
  }, [tagsCount])

  const isTagsActive = tagsCount > 0

  const speakerDisplay = useMemo(() => {
    if (!currentCriteria.speakerId || currentCriteria.speakerId === "all") return "Any"
    const found = availableSpeakers.find((s) => s.id === currentCriteria.speakerId)
    return found ? found.name : "1 selected"
  }, [currentCriteria.speakerId, availableSpeakers])

  const isSpeakerActive = currentCriteria.speakerId && currentCriteria.speakerId !== "all"

  const isAnyActive = isDateActive || isContentActive || isTagsActive || isSpeakerActive

  if (!isOpen) return null

  // Date selection handlers
  const handleSelectDatePreset = (preset: "all" | "today" | "this_week" | "this_month" | "custom") => {
    if (preset === "custom") {
      setShowCustomDate(true)
      return
    }
    const { from, to } = getDatePresetRange(preset)
    onApply({
      ...currentCriteria,
      datePreset: preset,
      dateFrom: from,
      dateTo: to,
    })
    setActiveDropdown(null)
    setShowCustomDate(false)
  }

  const handleApplyCustomDate = () => {
    onApply({
      ...currentCriteria,
      datePreset: "custom",
      dateFrom: customFrom,
      dateTo: customTo,
    })
    setActiveDropdown(null)
  }

  // Content selection handlers
  const handleSelectContent = (content: "all" | "audio" | "transcript" | "text_only") => {
    onApply({
      ...currentCriteria,
      content,
    })
    setActiveDropdown(null)
  }

  // Tags selection handlers
  const handleToggleTag = (tag: string) => {
    const current = currentCriteria.selectedTags || []
    const exists = current.some((t) => t.toLowerCase() === tag.toLowerCase())
    const updated = exists
      ? current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
      : [...current, tag]
    onApply({
      ...currentCriteria,
      selectedTags: updated,
    })
  }

  const handleRemoveTag = (tag: string) => {
    const current = currentCriteria.selectedTags || []
    const updated = current.filter((t) => t.toLowerCase() !== tag.toLowerCase())
    onApply({
      ...currentCriteria,
      selectedTags: updated,
    })
  }

  const handleCreateAndSelectTag = (name: string, color?: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    addStoredTag(trimmed, color)
    if (color) {
      saveStoredTagColor(trimmed, color)
      if (onSaveTagColor) onSaveTagColor(trimmed, color)
    }
    handleToggleTag(trimmed)
    setTagSearch("")
    setIsCreatingTag(false)
    setNewTagName("")
  }

  // Speaker selection handlers
  const handleSelectSpeaker = (speakerId: string) => {
    onApply({
      ...currentCriteria,
      speakerId,
    })
    setActiveDropdown(null)
  }

  // Clear all filters
  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onReset()
    setActiveDropdown(null)
    setShowCustomDate(false)
  }

  // Filtered tags for picker
  const filteredTags = availableTags.filter((t) =>
    t.toLowerCase().includes(tagSearch.trim().toLowerCase())
  )
  const hasExactTagMatch = availableTags.some(
    (t) => t.toLowerCase() === tagSearch.trim().toLowerCase()
  )

  // Filtered speakers for picker
  const filteredSpeakers = availableSpeakers.filter((s) =>
    s.name.toLowerCase().includes(speakerSearch.trim().toLowerCase())
  )

  return (
    <div
      ref={popoverRef}
      data-popover-container
      style={{ width: "max-content", maxWidth: "200px" }}
      className="absolute top-full right-0 mt-2 z-50 w-max max-w-[200px] rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl dark:shadow-2xl text-zinc-900 dark:text-white select-none animate-[fadeSlideUp_0.12s_ease-out]"
      role="dialog"
      aria-label="Filter notes"
    >
      {/* Popover beak / pointer */}
      <div
        data-popover-beak
        className="absolute -top-1.5 right-3 w-3 h-3 rotate-45 bg-white dark:bg-zinc-900 border-t border-l border-zinc-200/80 dark:border-zinc-800"
      />

      {/* Header */}
      <div className="px-4 py-2.5 flex items-center justify-between">
        <span className="text-[14px] font-semibold text-zinc-900 dark:text-white tracking-tight">Filter</span>
        <button
          onClick={handleClear}
          disabled={!isAnyActive}
          className={`text-xs transition-colors cursor-pointer ${
            isAnyActive
              ? "text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white font-medium"
              : "text-zinc-300 dark:text-zinc-600 cursor-default"
          }`}
        >
          Clear
        </button>
      </div>

      <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

      {/* Rows */}
      <div className="flex flex-col text-xs">
        {/* 1. Date Row */}
        <div className="relative">
          <div
            data-hover-row
            data-active={isDateActive ? "true" : undefined}
            onClick={() => setActiveDropdown(activeDropdown === "date" ? null : "date")}
            className={`px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
              isDateActive
                ? "bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-400 font-medium"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <Calendar className={`h-4 w-4 shrink-0 ${isDateActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-600 dark:text-zinc-400"}`} />
              <span className="text-[13px]">Date</span>
            </div>
            <div className="flex items-center gap-1">
              {!isDateActive && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  All
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isDateActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-400 dark:text-zinc-500"
                } ${activeDropdown === "date" ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          {/* Chosen Date pill below row, with 10px padding on container */}
          {isDateActive && (
            <div style={{ padding: "10px" }} className="p-[10px] flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-300 shadow-sm border border-transparent dark:border-yellow-500/20">
                <span>{dateDisplay}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectDatePreset("all")
                  }}
                  className="text-amber-700 hover:text-amber-950 dark:text-yellow-400 dark:hover:text-white transition-colors ml-0.5 cursor-pointer"
                  title="Clear date filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {/* Date Secondary Menu - Standard Mac Checkmark style (no circles) */}
          {activeDropdown === "date" && (
            <div
              data-popover-container
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-full mt-1.5 z-40 w-44 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl py-1 text-xs select-none animate-[fadeSlideUp_0.1s_ease-out]"
            >
              {[
                { id: "all", label: "All" },
                { id: "today", label: "Today" },
                { id: "this_week", label: "This week" },
                { id: "this_month", label: "This month" },
                { id: "custom", label: "Custom…" },
              ].map((opt) => {
                const isSelected =
                  opt.id === "custom"
                    ? currentCriteria.datePreset === "custom"
                    : (currentCriteria.datePreset || "all") === opt.id

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectDatePreset(opt.id as any)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400" />
                    )}
                  </button>
                )
              })}

              {/* Custom Date Inputs */}
              {showCustomDate && (
                <div className="px-3 pt-2 pb-1 border-t border-zinc-100 dark:border-white/10 space-y-2 mt-1">
                  <div>
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-400 uppercase font-medium">From</label>
                    <input
                      type="date"
                      value={customFrom}
                      onChange={(e) => setCustomFrom(e.target.value)}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-amber-500 dark:focus:border-yellow-500/50 [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-400 dark:text-zinc-400 uppercase font-medium">To</label>
                    <input
                      type="date"
                      value={customTo}
                      onChange={(e) => setCustomTo(e.target.value)}
                      className="w-full text-xs bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 text-zinc-800 dark:text-zinc-200 focus:outline-none focus:border-amber-500 dark:focus:border-yellow-500/50 [color-scheme:light] dark:[color-scheme:dark]"
                    />
                  </div>
                  <button
                    data-primary-btn
                    onClick={handleApplyCustomDate}
                    className="w-full py-1 text-xs bg-amber-500 hover:bg-amber-600 dark:bg-yellow-500 dark:hover:bg-yellow-400 text-black font-semibold rounded-md transition-colors cursor-pointer"
                  >
                    Apply
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-white/10" />

        {/* 2. Content Row */}
        <div className="relative">
          <div
            data-hover-row
            data-active={isContentActive ? "true" : undefined}
            onClick={() => setActiveDropdown(activeDropdown === "content" ? null : "content")}
            className={`px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
              isContentActive
                ? "bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-400 font-medium"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <FileText className={`h-4 w-4 shrink-0 ${isContentActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-600 dark:text-zinc-400"}`} />
              <span className="text-[13px]">Content</span>
            </div>
            <div className="flex items-center gap-1">
              {!isContentActive && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  All
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isContentActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-400 dark:text-zinc-500"
                } ${activeDropdown === "content" ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          {/* Chosen Content pill below row, with 10px padding on container */}
          {isContentActive && (
            <div style={{ padding: "10px" }} className="p-[10px] flex items-center gap-1.5 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-300 shadow-sm border border-transparent dark:border-yellow-500/20">
                <span>{contentDisplay}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectContent("all")
                  }}
                  className="text-amber-700 hover:text-amber-950 dark:text-yellow-400 dark:hover:text-white transition-colors ml-0.5 cursor-pointer"
                  title="Clear content filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {/* Content Secondary Menu - Standard Mac Checkmark style (no circles) */}
          {activeDropdown === "content" && (
            <div
              data-popover-container
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-full mt-1.5 z-40 w-44 rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl py-1 text-xs select-none animate-[fadeSlideUp_0.1s_ease-out]"
            >
              {[
                { id: "all", label: "All" },
                { id: "audio", label: "With audio" },
                { id: "transcript", label: "With transcript" },
                { id: "text_only", label: "Text only" },
              ].map((opt) => {
                const isSelected = (currentCriteria.content || "all") === opt.id

                return (
                  <button
                    key={opt.id}
                    onClick={() => handleSelectContent(opt.id as any)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <span>{opt.label}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        {/* 3. Tags Row */}
        <div className="relative">
          <div
            data-hover-row
            data-active={isTagsActive ? "true" : undefined}
            onClick={() => setActiveDropdown(activeDropdown === "tags" ? null : "tags")}
            className={`px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
              isTagsActive
                ? "bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-400 font-medium"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2.5">
              <TagIcon className={`h-4 w-4 shrink-0 ${isTagsActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-600 dark:text-zinc-400"}`} />
              <span className="text-[13px]">Tags</span>
            </div>
            <div className="flex items-center gap-1">
              {!isTagsActive && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  Any
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isTagsActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-400 dark:text-zinc-500"
                } ${activeDropdown === "tags" ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          {/* Selected Tag Pills & Add tag button, with 10px padding on container */}
          {isTagsActive && (
            <div style={{ padding: "10px" }} className="p-[10px] flex items-center gap-1.5 flex-wrap">
              {currentCriteria.selectedTags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-normal bg-[#f0f2f5] dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 shadow-xs border border-transparent dark:border-zinc-700"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                    style={{ backgroundColor: getTagColor(tag, tagColors) }}
                  />
                  <span className="capitalize">{tag}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleRemoveTag(tag)
                    }}
                    className="text-zinc-400 hover:text-zinc-700 dark:hover:text-white transition-colors ml-0.5 cursor-pointer"
                    title={`Remove ${tag}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  setActiveDropdown(activeDropdown === "tags" ? null : "tags")
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-[#f4f4f6] hover:bg-[#eaeaea] dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-white transition-colors cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5 text-zinc-400" />
                <span>Add tag...</span>
              </button>
            </div>
          )}

          {/* Tags Secondary Popover - CIRCLE CHOOSE KEPT ONLY HERE */}
          {activeDropdown === "tags" && (
            <div
              data-popover-container
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-full mt-1.5 z-40 w-60 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-2xl text-zinc-900 dark:text-white select-none animate-[fadeSlideUp_0.1s_ease-out]"
            >
              {/* Pointer beak pointing up */}
              <div
                data-popover-beak
                className="absolute -top-1.5 right-6 w-3 h-3 rotate-45 bg-white dark:bg-zinc-900 border-t border-l border-zinc-200/80 dark:border-zinc-800"
              />

              {/* Search tags input */}
              <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search tags..."
                    value={tagSearch}
                    onChange={(e) => setTagSearch(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && tagSearch.trim() && !hasExactTagMatch) {
                        handleCreateAndSelectTag(tagSearch.trim())
                      }
                    }}
                    autoFocus
                    className="w-full bg-[#f4f4f6] dark:bg-zinc-800/80 pl-8 pr-2.5 py-1.5 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none border border-transparent dark:border-zinc-700"
                  />
                </div>
              </div>

              {/* Tag List with Circle Choose */}
              <div className="p-1.5 max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
                {filteredTags.map((tag) => {
                  const isSelected = (currentCriteria.selectedTags || []).some(
                    (t) => t.toLowerCase() === tag.toLowerCase()
                  )
                  const color = getTagColor(tag, tagColors)

                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => handleToggleTag(tag)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left group"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs text-zinc-800 dark:text-zinc-200 capitalize truncate">
                          {tag}
                        </span>
                      </div>

                      {/* Orange checkmark when selected, nothing when unselected */}
                      {isSelected && (
                        <span className="w-4 h-4 rounded-full bg-[#f97316] text-white flex items-center justify-center shrink-0 shadow-xs">
                          <Check className="h-2.5 w-2.5 stroke-[3]" />
                        </span>
                      )}
                    </button>
                  )
                })}

                {/* If query has no exact match, allow instant creation */}
                {tagSearch.trim() && !hasExactTagMatch && (
                  <button
                    type="button"
                    onClick={() => handleCreateAndSelectTag(tagSearch.trim())}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-amber-600 dark:text-yellow-400 hover:bg-amber-100/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left font-medium"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span className="truncate">+ Create &quot;{tagSearch.trim()}&quot;</span>
                  </button>
                )}

                {filteredTags.length === 0 && (!tagSearch.trim() || hasExactTagMatch) && (
                  <div className="py-3 text-center text-xs text-zinc-400 dark:text-zinc-500">No tags found</div>
                )}
              </div>

              {/* Bottom: + New tag */}
              <div className="p-1 border-t border-zinc-100 dark:border-zinc-800">
                {!isCreatingTag ? (
                  <button
                    type="button"
                    onClick={() => setIsCreatingTag(true)}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>New tag</span>
                  </button>
                ) : (
                  <div className="p-1.5 space-y-2">
                    <input
                      type="text"
                      placeholder="Tag name..."
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newTagName.trim()) {
                          handleCreateAndSelectTag(newTagName.trim(), newTagColor)
                        }
                        if (e.key === "Escape") setIsCreatingTag(false)
                      }}
                      autoFocus
                      className="w-full bg-[#f4f4f6] dark:bg-zinc-800/80 px-2.5 py-1.5 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none border border-zinc-200 dark:border-zinc-700"
                    />

                    {/* Apple Color Palette */}
                    <div className="flex items-center justify-between px-0.5 pt-0.5">
                      {APPLE_TAG_COLORS.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setNewTagColor(c.color)}
                          className={`w-4 h-4 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                            newTagColor === c.color
                              ? "scale-115 ring-2 ring-offset-1 ring-zinc-500 dark:ring-zinc-400"
                              : "hover:scale-105 opacity-80 hover:opacity-100"
                          }`}
                          style={{ backgroundColor: c.color }}
                          title={c.name}
                        />
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsCreatingTag(false)}
                        className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-200 cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        data-primary-btn
                        type="button"
                        onClick={() => handleCreateAndSelectTag(newTagName.trim(), newTagColor)}
                        disabled={!newTagName.trim()}
                        className="px-2.5 py-1 text-xs bg-[#f97316] hover:bg-[#ea580c] disabled:opacity-40 text-white font-medium rounded-lg transition-colors cursor-pointer shadow-xs"
                      >
                        Create
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-px bg-zinc-100 dark:bg-zinc-800" />

        {/* 4. Speakers Row */}
        <div className="relative">
          <div
            data-hover-row
            data-active={isSpeakerActive ? "true" : undefined}
            onClick={() => setActiveDropdown(activeDropdown === "speakers" ? null : "speakers")}
            className={`px-4 py-2.5 flex items-center justify-between transition-colors cursor-pointer ${
              !isSpeakerActive ? "rounded-b-2xl" : ""
            } ${
              isSpeakerActive
                ? "bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-400 font-medium"
                : "hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-800 dark:text-zinc-200"
            }`}
          >
            <div className="flex items-center gap-2.5 pr-2">
              <User className={`h-4 w-4 shrink-0 ${isSpeakerActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-600 dark:text-zinc-400"}`} />
              <span className="text-[13px]">Speakers</span>
            </div>
            <div className="flex items-center gap-1">
              {!isSpeakerActive && (
                <span className="text-[13px] text-zinc-400 dark:text-zinc-500">
                  Any
                </span>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${
                  isSpeakerActive ? "text-amber-700 dark:text-yellow-400" : "text-zinc-400 dark:text-zinc-500"
                } ${activeDropdown === "speakers" ? "rotate-180" : ""}`}
              />
            </div>
          </div>

          {/* Chosen Speaker pill below row, with 10px padding on container */}
          {isSpeakerActive && (
            <div style={{ padding: "10px" }} className="p-[10px] flex items-center gap-1.5 flex-wrap rounded-b-2xl">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-900 dark:bg-yellow-500/20 dark:text-yellow-300 shadow-sm border border-transparent dark:border-yellow-500/20">
                <span>{speakerDisplay}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleSelectSpeaker("all")
                  }}
                  className="text-amber-700 hover:text-amber-950 dark:text-yellow-400 dark:hover:text-white transition-colors ml-0.5 cursor-pointer"
                  title="Clear speaker filter"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            </div>
          )}

          {/* Speakers Secondary Menu - Standard Mac Checkmark style (no circles) */}
          {activeDropdown === "speakers" && (
            <div
              data-popover-container
              onClick={(e) => e.stopPropagation()}
              className="absolute right-2 top-full mt-1.5 z-40 w-48 max-h-52 overflow-y-auto no-scrollbar rounded-xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl py-1 text-xs select-none animate-[fadeSlideUp_0.1s_ease-out]"
            >
              {/* Any option */}
              <button
                type="button"
                onClick={() => handleSelectSpeaker("all")}
                className="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <span>Any</span>
                {(!currentCriteria.speakerId || currentCriteria.speakerId === "all") && (
                  <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400" />
                )}
              </button>

              {availableSpeakers.length === 0 ? (
                <div className="px-3 py-2 text-[11px] text-zinc-400 dark:text-zinc-500">No speakers found</div>
              ) : (
                availableSpeakers.map((speaker) => {
                  const isSelected = currentCriteria.speakerId === speaker.id

                  return (
                    <button
                      key={speaker.id}
                      type="button"
                      onClick={() => handleSelectSpeaker(speaker.id)}
                      className="w-full flex items-center justify-between px-3 py-1.5 text-left text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors cursor-pointer"
                    >
                      <span className="truncate">{speaker.name}</span>
                      {isSelected && (
                        <Check className="h-3.5 w-3.5 text-amber-600 dark:text-yellow-400 shrink-0 ml-1.5" />
                      )}
                    </button>
                  )
                })
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
