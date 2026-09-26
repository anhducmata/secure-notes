"use client"

import React, { useEffect, useRef } from "react"
import { Search, ChevronDown, ChevronUp, X } from "lucide-react"

interface InNoteSearchBarProps {
  isOpen: boolean
  onClose: () => void
  query: string
  onQueryChange: (q: string) => void
  matchCount: number
  currentIndex: number
  onNext: () => void
  onPrev: () => void
}

export function InNoteSearchBar({
  isOpen,
  onClose,
  query,
  onQueryChange,
  matchCount,
  currentIndex,
  onNext,
  onPrev,
}: InNoteSearchBarProps) {
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [isOpen])

  if (!isOpen) return null

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault()
      if (e.shiftKey) {
        onPrev()
      } else {
        onNext()
      }
    } else if (e.key === "Escape") {
      e.preventDefault()
      onClose()
    }
  }

  return (
    <div className="sticky top-3 right-6 z-30 self-end bg-white/95 dark:bg-zinc-900/95 backdrop-blur-md border border-zinc-200 dark:border-zinc-800 rounded-xl shadow-xl px-3 py-1.5 flex items-center gap-2 text-xs animate-in fade-in slide-in-from-top-2 duration-100">
      <Search className="h-3.5 w-3.5 text-amber-500 shrink-0" />
      <input
        ref={inputRef}
        type="text"
        placeholder="Find in note..."
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-40 sm:w-48 bg-transparent text-xs text-zinc-900 dark:text-white placeholder-zinc-400 dark:placeholder-zinc-500 focus:outline-none"
      />

      {query.trim() && (
        <span className="text-[11px] font-mono text-zinc-400 dark:text-zinc-500 shrink-0 select-none">
          {matchCount > 0 ? `${currentIndex + 1}/${matchCount}` : "0 matches"}
        </span>
      )}

      <div className="flex items-center gap-0.5 border-l border-zinc-200 dark:border-zinc-800 pl-1.5 ml-0.5">
        <button
          type="button"
          onClick={onPrev}
          disabled={matchCount <= 0}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
          title="Previous match (Shift+Enter)"
          aria-label="Previous match"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={matchCount <= 0}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white disabled:opacity-30 cursor-pointer"
          title="Next match (Enter)"
          aria-label="Next match"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 cursor-pointer ml-1"
          title="Close (ESC)"
          aria-label="Close search"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}
