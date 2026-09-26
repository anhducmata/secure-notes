import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { uploadNote, deleteNote } from "@/lib/blob"
import { getAuthenticatedUser } from "@/lib/auth"
import { NoteRepository, KnowledgeRepository, FolderRepository } from "@/lib/db/repositories"
import { db } from "@/lib/db/database"

// Redis key for user's notes cache
const NOTES_CACHE_KEY = (userId: string) => `notes:${userId}`

const MAX_NOTES_PER_USER = 500
const MAX_PAYLOAD_SIZE_BYTES = 5 * 1024 * 1024 // 5MB limit for rich media notes

export interface EncryptedPayload {
  ciphertext: string
  iv: string
  salt: string
  version: number
}

export interface EncryptedNote {
  id: string
  encryptedData: EncryptedPayload
  date: string
  folder: string
}

function isValidEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.ciphertext === "string" &&
    typeof p.iv === "string" &&
    typeof p.salt === "string" &&
    typeof p.version === "number" &&
    p.ciphertext.length > 0 &&
    p.iv.length > 0 &&
    p.salt.length > 0
  )
}

function getPayloadSize(payload: EncryptedPayload): number {
  return new TextEncoder().encode(JSON.stringify(payload)).length
}

/**
 * GET /api/notes
 * Fetches encrypted notes from Redis cache or database.
 */
export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ notes: [], authenticated: false })
    }

    const cacheKey = NOTES_CACHE_KEY(user.email)
    const rawNotes = await redis.get(cacheKey)

    if (!rawNotes) {
      return NextResponse.json({ notes: [], source: "cache", encrypted: true })
    }

    const notes = typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes
    const sortedNotes = (notes as EncryptedNote[]).sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    )

    return NextResponse.json({ notes: sortedNotes, source: "cache", encrypted: true })
  } catch (err) {
    console.error("[/api/notes GET] error:", err)
    return NextResponse.json({ notes: [], source: "fallback", encrypted: true })
  }
}

/**
 * POST /api/notes
 * Creates a new note in database and cache.
 */
export async function POST(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json()

    if (!body.encryptedData || !isValidEncryptedPayload(body.encryptedData)) {
      return NextResponse.json(
        { error: "Invalid payload: notes must be encrypted before upload" },
        { status: 400 }
      )
    }

    const payloadSize = getPayloadSize(body.encryptedData)
    if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
      return NextResponse.json(
        {
          error: "Note too large",
          message: `Note content exceeds maximum size of ${MAX_PAYLOAD_SIZE_BYTES / (1024 * 1024)}MB`,
        },
        { status: 413 }
      )
    }

    const noteDate = body.date || new Date().toISOString()
    let folderId: string | null = null
    if (body.folder && body.folder !== "all") {
      const folder = await FolderRepository.getById(body.folder, user.id)
      if (folder) folderId = folder.id
    }

    const note: EncryptedNote = {
      id: body.id,
      encryptedData: body.encryptedData,
      date: noteDate,
      folder: folderId || "all",
    }

    // 1. Relational Database Persistence
    await NoteRepository.upsert({
      id: note.id,
      user_id: user.id,
      folder_id: folderId,
      title: "Encrypted Note",
      content: JSON.stringify(note.encryptedData),
      created_at: noteDate,
    })

    // 2. Cache Update
    const cacheKey = NOTES_CACHE_KEY(user.email)
    const rawNotes = await redis.get(cacheKey)
    const existingNotes = rawNotes
      ? ((typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[])
      : []

    if (existingNotes.length >= MAX_NOTES_PER_USER) {
      return NextResponse.json(
        { error: "Notes limit reached", message: `Maximum of ${MAX_NOTES_PER_USER} notes reached.` },
        { status: 403 }
      )
    }

    const notes = [note, ...existingNotes.filter((n) => n.id !== note.id)]
    await redis.set(cacheKey, JSON.stringify(notes))

    // 3. Blob Backup (async)
    uploadNote(user.email, note.id, note).catch(() => {})

    return NextResponse.json({ success: true, note, encrypted: true })
  } catch (err) {
    console.error("[/api/notes POST] error:", err)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}

/**
 * PUT /api/notes
 * Updates an encrypted note.
 */
export async function PUT(request: Request) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await request.json()

    if (!body.encryptedData || !isValidEncryptedPayload(body.encryptedData)) {
      return NextResponse.json(
        { error: "Invalid payload: notes must be encrypted before upload" },
        { status: 400 }
      )
    }

    const payloadSize = getPayloadSize(body.encryptedData)
    if (payloadSize > MAX_PAYLOAD_SIZE_BYTES) {
      return NextResponse.json(
        { error: "Note too large", message: "Payload exceeds size limit" },
        { status: 413 }
      )
    }

    // Verify tenant ownership of the note to prevent cross-tenant overwrites
    const existingRows = await db.query<{ user_id: string }>(
      "SELECT user_id FROM notes WHERE id = ? LIMIT 1",
      [body.id]
    )
    if (existingRows.length > 0 && existingRows[0].user_id !== user.id) {
      return NextResponse.json({ error: "Access denied to note" }, { status: 403 })
    }

    const noteDate = body.date || new Date().toISOString()
    let folderId: string | null = null
    if (body.folder && body.folder !== "all") {
      const folder = await FolderRepository.getById(body.folder, user.id)
      if (folder) folderId = folder.id
    }

    const updatedNote: EncryptedNote = {
      id: body.id,
      encryptedData: body.encryptedData,
      date: noteDate,
      folder: folderId || "all",
    }

    // 1. Relational Database Update
    await NoteRepository.upsert({
      id: updatedNote.id,
      user_id: user.id,
      folder_id: folderId,
      title: "Encrypted Note",
      content: JSON.stringify(updatedNote.encryptedData),
      created_at: noteDate,
    })

    // 2. Cache Update
    const cacheKey = NOTES_CACHE_KEY(user.email)
    const rawNotes = await redis.get(cacheKey)
    let notes = rawNotes
      ? ((typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[])
      : []

    const index = notes.findIndex((n) => n.id === updatedNote.id)
    if (index >= 0) {
      notes[index] = updatedNote
    } else {
      notes.unshift(updatedNote)
    }
    await redis.set(cacheKey, JSON.stringify(notes))

    // 3. Blob Backup
    uploadNote(user.email, updatedNote.id, updatedNote).catch(() => {})

    return NextResponse.json({ success: true, note: updatedNote, encrypted: true })
  } catch (err) {
    console.error("[/api/notes PUT] error:", err)
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 })
  }
}

/**
 * DELETE /api/notes
 * Deletes a note and cleanly cascades to remove derived knowledge documents, chunks, and cache.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const noteId = searchParams.get("noteId")

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 })
  }

  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const note = await NoteRepository.getById(noteId, user.id)
    if (!note) {
      return NextResponse.json({ error: "Note not found or access denied" }, { status: 404 })
    }

    // 1. Delete from Relational Database
    await NoteRepository.permanentDelete(noteId, user.id)

    // 2. Cascade delete derived Knowledge Documents and Chunks (no orphaned data!)
    await KnowledgeRepository.deleteBySource("note", noteId, user.id)

    // 3. Update Redis cache
    const cacheKey = NOTES_CACHE_KEY(user.email)
    const rawNotes = await redis.get(cacheKey)
    if (rawNotes) {
      let notes = (typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[]
      notes = notes.filter((n) => n.id !== noteId)
      await redis.set(cacheKey, JSON.stringify(notes))
    }

    // 4. Delete from Blob Backup
    deleteNote(user.email, noteId).catch(() => {})

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[/api/notes DELETE] error:", err)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
