import { NextResponse } from "next/server"
import { redis, NOTES_KEY } from "@/lib/redis"

export interface Note {
  id: string
  title: string
  content: string
  date: string
  folder: string
}

const DEMO_NOTES: Note[] = [
  {
    id: "1",
    title: "Shopping List",
    content: "Milk\nEggs\nBread\nCheese\nApples",
    date: new Date(2025, 3, 14).toISOString(),
    folder: "notes",
  },
  {
    id: "2",
    title: "Meeting Notes",
    content: "Discuss project timeline\nReview quarterly goals\nAssign new tasks",
    date: new Date(2025, 3, 13).toISOString(),
    folder: "notes",
  },
  {
    id: "3",
    title: "Ideas",
    content: "App concept for productivity\nNew workout routine\nWeekend trip planning",
    date: new Date(2025, 3, 12).toISOString(),
    folder: "notes",
  },
  {
    id: "4",
    title: "Books to Read",
    content:
      "1. Atomic Habits\n2. Deep Work\n3. The Psychology of Money\n4. Project Hail Mary",
    date: new Date(2025, 3, 10).toISOString(),
    folder: "notes",
  },
  {
    id: "5",
    title: "Travel Plans",
    content:
      "Flight on May 15th\nHotel reservation\nPlaces to visit:\n- Museum\n- Beach\n- Downtown",
    date: new Date(2025, 3, 8).toISOString(),
    folder: "notes",
  },
]

/**
 * GET /api/notes
 * Fetches notes from Redis. Seeds with demo notes if empty.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
    const key = NOTES_KEY(userId)
    let notes = await redis.get<Note[]>(key)

    // Seed demo notes if no notes exist
    if (!notes || notes.length === 0) {
      await redis.set(key, DEMO_NOTES)
      notes = DEMO_NOTES
    }

    return NextResponse.json({ notes, source: "redis" })
  } catch (err) {
    console.error("[v0] Redis fetch error:", err)
    return NextResponse.json({ notes: DEMO_NOTES, source: "fallback" })
  }
}

/**
 * POST /api/notes
 * Creates a new note
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
    const note: Note = await request.json()
    const key = NOTES_KEY(userId)
    
    let notes = await redis.get<Note[]>(key) || []
    notes = [note, ...notes]
    
    await redis.set(key, notes)
    
    return NextResponse.json({ success: true, note })
  } catch (err) {
    console.error("[v0] Redis create error:", err)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}

/**
 * PUT /api/notes
 * Updates an existing note (auto-save)
 */
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
    const updatedNote: Note = await request.json()
    const key = NOTES_KEY(userId)
    
    let notes = await redis.get<Note[]>(key) || []
    const index = notes.findIndex((n) => n.id === updatedNote.id)
    
    if (index === -1) {
      // Note doesn't exist, add it
      notes = [updatedNote, ...notes]
    } else {
      // Update existing note
      notes[index] = { ...notes[index], ...updatedNote, date: new Date().toISOString() }
    }
    
    await redis.set(key, notes)
    
    return NextResponse.json({ success: true, note: updatedNote })
  } catch (err) {
    console.error("[v0] Redis update error:", err)
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 })
  }
}

/**
 * DELETE /api/notes
 * Deletes a note by ID
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"
  const noteId = searchParams.get("noteId")

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 })
  }

  try {
    const key = NOTES_KEY(userId)
    let notes = await redis.get<Note[]>(key) || []
    notes = notes.filter((n) => n.id !== noteId)
    
    await redis.set(key, notes)
    
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Redis delete error:", err)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
