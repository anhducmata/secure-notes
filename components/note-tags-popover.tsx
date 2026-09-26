"use client"

import { useState, useRef, useEffect, useMemo } from "react"
import { Search, Plus, Check } from "lucide-react"
import { APPLE_TAG_COLORS, getTagColor } from "@/lib/tags"

interface NoteTagsPopoverProps {
  isOpen: boolean
  onClose: () => void
  selectedTags: string[]
  allTags: string[]
  tagColors: Record<string, string>
  onToggleTag: (tag: string, colorHex?: string) => void
  triggerRef?: React.RefObject<HTMLButtonElement | null>
}

export function NoteTagsPopover({
  isOpen,
  onClose,
  selectedTags,
  allTags,
  tagColors,
  onToggleTag,
  triggerRef,
}: NoteTagsPopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isCreatingTag, setIsCreatingTag] = useState(false)
  const [newTagName, setNewTagName] = useState("")
  const [newTagColor, setNewTagColor] = useState(APPLE_TAG_COLORS[1].color) // orange default

  // Reset state when opening/closing
  useEffect(() => {
    if (isOpen) {
      setSearchQuery("")
      setIsCreatingTag(false)
      setNewTagName("")
      setNewTagColor(APPLE_TAG_COLORS[1].color)
    }
  }, [isOpen])

  // Handle outside click & Escape
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
        if (isCreatingTag) {
          setIsCreatingTag(false)
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
  }, [isOpen, onClose, isCreatingTag, triggerRef])

  // Filter tags by search query
  const filteredTags = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return allTags
    return allTags.filter((t) => t.toLowerCase().includes(q))
  }, [allTags, searchQuery])

  // Check if search query matches an existing tag exactly
  const hasExactMatch = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return true
    return allTags.some((t) => t.toLowerCase() === q)
  }, [allTags, searchQuery])

  const handleCreateAndToggle = (name: string, color?: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    onToggleTag(trimmed, color)
    setSearchQuery("")
    setIsCreatingTag(false)
    setNewTagName("")
  }

  if (!isOpen) return null

  return (
    <div
      ref={popoverRef}
      data-popover-container
      className="absolute right-[-14px] top-full mt-2.5 z-50 w-60 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 shadow-xl dark:shadow-2xl text-zinc-900 dark:text-white select-none animate-[fadeSlideUp_0.12s_ease-out]"
      role="dialog"
      aria-label="Tags"
    >
      {/* Popover pointer / beak directly under the + button */}
      <div
        data-popover-beak
        className="absolute -top-1.5 right-6 w-3 h-3 rotate-45 bg-white dark:bg-zinc-900 border-t border-l border-zinc-200/80 dark:border-zinc-800"
      />

      {/* Top Search Input */}
      <div className="p-2 border-b border-zinc-100 dark:border-zinc-800">
        <div className="relative flex items-center">
          <Search className="absolute left-2.5 h-3.5 w-3.5 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            placeholder="Search tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim() && !hasExactMatch) {
                handleCreateAndToggle(searchQuery.trim())
              }
            }}
            autoFocus
            className="w-full bg-[#f4f4f6] dark:bg-zinc-800/80 pl-8 pr-2.5 py-1.5 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Tag List */}
      <div className="p-1.5 max-h-56 overflow-y-auto no-scrollbar space-y-0.5">
        {filteredTags.map((tag) => {
          const isSelected = selectedTags.some(
            (t) => t.toLowerCase() === tag.toLowerCase()
          )
          const color = getTagColor(tag, tagColors)

          return (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
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

              {/* Selection indicator: orange checkmark when selected */}
              {isSelected && (
                <span className="w-4 h-4 rounded-full bg-[#f97316] text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Check className="h-2.5 w-2.5 stroke-[3]" />
                </span>
              )}
            </button>
          )
        })}

        {/* If query has no exact match, allow instant creation */}
        {searchQuery.trim() && !hasExactMatch && (
          <button
            type="button"
            onClick={() => handleCreateAndToggle(searchQuery.trim())}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl text-xs text-amber-600 dark:text-yellow-400 hover:bg-amber-100/60 dark:hover:bg-zinc-800 transition-colors cursor-pointer text-left font-medium"
          >
            <Plus className="h-3.5 w-3.5" />
            <span className="truncate">+ Create &quot;{searchQuery.trim()}&quot;</span>
          </button>
        )}

        {filteredTags.length === 0 && (!searchQuery.trim() || hasExactMatch) && (
          <div className="py-3 text-center text-xs text-zinc-400">No tags found</div>
        )}
      </div>

      {/* Bottom Row: + New tag */}
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
                  handleCreateAndToggle(newTagName.trim(), newTagColor)
                }
                if (e.key === "Escape") setIsCreatingTag(false)
              }}
              autoFocus
              className="w-full bg-[#f4f4f6] dark:bg-zinc-800/80 px-2.5 py-1.5 rounded-xl text-xs text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none border border-zinc-200 dark:border-zinc-700"
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
                className="px-2 py-0.5 text-xs text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleCreateAndToggle(newTagName.trim(), newTagColor)}
                disabled={!newTagName.trim()}
                className="px-2.5 py-1 text-xs bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-black font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Create
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
