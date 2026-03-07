"use client"

import { useState, useEffect } from "react"
import { Plus, Search, ChevronLeft } from "lucide-react"

// Sample data
const initialNotes = [
  {
    id: "1",
    title: "Shopping List",
    content: "Milk\nEggs\nBread\nCheese\nApples",
    date: new Date(2025, 3, 14),
    folder: "notes",
  },
  {
    id: "2",
    title: "Meeting Notes",
    content: "Discuss project timeline\nReview quarterly goals\nAssign new tasks",
    date: new Date(2025, 3, 13),
    folder: "notes",
  },
  {
    id: "3",
    title: "Ideas",
    content: "App concept for productivity\nNew workout routine\nWeekend trip planning",
    date: new Date(2025, 3, 12),
    folder: "notes",
  },
  {
    id: "4",
    title: "Books to Read",
    content: "1. Atomic Habits\n2. Deep Work\n3. The Psychology of Money\n4. Project Hail Mary",
    date: new Date(2025, 3, 10),
    folder: "notes",
  },
  {
    id: "5",
    title: "Travel Plans",
    content: "Flight on May 15th\nHotel reservation\nPlaces to visit:\n- Museum\n- Beach\n- Downtown",
    date: new Date(2025, 3, 8),
    folder: "notes",
  },
]

export function NotesApp() {
  const [notes, setNotes] = useState(initialNotes)
  const [selectedNote, setSelectedNote] = useState(null)
  const [searchQuery, setSearchQuery] = useState("")
  const [isMobile, setIsMobile] = useState(false)

  // Check if mobile on mount and window resize
  useEffect(() => {
    const checkIfMobile = () => setIsMobile(window.innerWidth < 768)
    checkIfMobile()
    window.addEventListener("resize", checkIfMobile)
    return () => window.removeEventListener("resize", checkIfMobile)
  }, [])

  // Format date as "Today", "Yesterday", or "MM/DD/YY"
  const formatDate = (date) => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)

    if (date.toDateString() === today.toDateString()) {
      return "Today"
    } else if (date.toDateString() === yesterday.toDateString()) {
      return "Yesterday"
    } else {
      return date.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" })
    }
  }

  const filteredNotes = notes.filter(
    (note) =>
      searchQuery === "" ||
      note.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      note.content.toLowerCase().includes(searchQuery.toLowerCase()),
  )

  const handleNoteSelect = (note) => {
    setSelectedNote(note)
  }

  const handleNoteChange = (content) => {
    if (!selectedNote) return

    const updatedNotes = notes.map((note) => (note.id === selectedNote.id ? { ...note, content } : note))
    setNotes(updatedNotes)
    setSelectedNote({ ...selectedNote, content })
  }

  const handleTitleChange = (title) => {
    if (!selectedNote) return

    const updatedNotes = notes.map((note) => (note.id === selectedNote.id ? { ...note, title } : note))
    setNotes(updatedNotes)
    setSelectedNote({ ...selectedNote, title })
  }

  const handleCreateNote = () => {
    const newNote = {
      id: Date.now().toString(),
      title: "New Note",
      content: "",
      date: new Date(),
      folder: "notes",
    }
    setNotes([newNote, ...notes])
    setSelectedNote(newNote)
  }

  const handleBackToList = () => {
    setSelectedNote(null)
  }

  const handleDeleteNote = () => {
    if (!selectedNote) return

    const updatedNotes = notes.filter((note) => note.id !== selectedNote.id)
    setNotes(updatedNotes)
    setSelectedNote(null)
  }

  // Mobile view: show either notes list or editor
  if (isMobile) {
    return (
      <div className="h-screen w-full bg-black text-white">
        {selectedNote ? (
          // Note editor view (mobile)
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-800 p-4">
              <div className="flex items-center justify-between mb-2">
                <button
                  onClick={handleBackToList}
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
                spellCheck="true"
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>
          </div>
        ) : (
          // Notes list view (mobile)
          <div className="flex h-full flex-col">
            <div className="border-b border-gray-800 p-4">
              <h1 className="mb-4 text-xl font-semibold text-yellow-500">Notes</h1>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
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
                className="rounded-full p-2 text-yellow-500"
                aria-label="Create new note"
              >
                <Plus className="h-5 w-5" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto momentum-scroll">
              <ul>
                {filteredNotes.length > 0 ? (
                  filteredNotes.map((note) => (
                    <li key={note.id} className="border-b border-gray-800">
                      <button className="w-full px-4 py-3 text-left" onClick={() => handleNoteSelect(note)}>
                        <h3 className="mb-1 font-medium text-white">{note.title}</h3>
                        <div className="flex text-xs text-gray-400">
                          <span>{formatDate(note.date)}</span>
                          <span className="mx-1">•</span>
                          <span className="truncate">
                            {note.content.substring(0, 30)}
                            {note.content.length > 30 ? "..." : ""}
                          </span>
                        </div>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="flex h-32 items-center justify-center text-gray-500">No notes found</li>
                )}
              </ul>
            </div>
          </div>
        )}
      </div>
    )
  }

  // Desktop view: simplified two-panel layout
  return (
    <div className="flex h-screen w-full bg-black text-white">
      {/* Notes list panel (left) */}
      <div className="w-80 border-r border-gray-800">
        <div className="border-b border-gray-800 p-6">
          <h1 className="mb-4 text-xl font-semibold text-yellow-500">Notes</h1>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform text-gray-400" />
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
            className="rounded-full p-2 text-yellow-500 hover:bg-zinc-800"
            aria-label="Create new note"
          >
            <Plus className="h-5 w-5" />
          </button>
        </div>
        <div className="h-[calc(100%-8.5rem)] overflow-y-auto momentum-scroll">
          <ul>
            {filteredNotes.length > 0 ? (
              filteredNotes.map((note) => (
                <li key={note.id} className="border-b border-gray-800">
                  <button
                    className={`w-full px-4 py-3 text-left ${
                      selectedNote?.id === note.id ? "bg-zinc-800" : "hover:bg-zinc-900"
                    }`}
                    onClick={() => handleNoteSelect(note)}
                  >
                    <h3 className="mb-1 font-medium text-white">{note.title}</h3>
                    <div className="flex text-xs text-gray-400">
                      <span>{formatDate(note.date)}</span>
                      <span className="mx-1">•</span>
                      <span className="truncate">
                        {note.content.substring(0, 30)}
                        {note.content.length > 30 ? "..." : ""}
                      </span>
                    </div>
                  </button>
                </li>
              ))
            ) : (
              <li className="flex h-32 items-center justify-center text-gray-500">No notes found</li>
            )}
          </ul>
        </div>
      </div>

      {/* Note editor panel (right) */}
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
                <button onClick={handleDeleteNote} className="text-sm text-red-500 ml-4" aria-label="Delete note">
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
                spellCheck="true"
                autoCapitalize="sentences"
                autoCorrect="on"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full items-center justify-center text-gray-500">
            <div className="text-center">
              <p className="mb-4">Select a note or create a new one</p>
              <button
                onClick={handleCreateNote}
                className="rounded-md bg-yellow-500 px-4 py-2 text-black hover:bg-yellow-600"
              >
                Create New Note
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
