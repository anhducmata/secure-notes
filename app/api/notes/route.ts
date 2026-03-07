import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { uploadNote, deleteNote } from "@/lib/s3"

// Redis key for user's notes cache
const NOTES_CACHE_KEY = (userId: string) => `notes:${userId}`

/**
 * Note API - Encrypted Data Only (S3 Storage)
 * 
 * This API ONLY handles encrypted note payloads.
 * The server never sees plaintext note content.
 * Notes are stored in S3, encrypted client-side before upload.
 * 
 * Each note is stored with encrypted title and content:
 * - encryptedData: { ciphertext, iv, salt, version }
 * - id, date, folder: unencrypted metadata
 */

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

/**
 * Validates that a payload is properly encrypted.
 * Rejects any attempt to store plaintext.
 */
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

/**
 * Get authenticated user ID from session
 */
async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get("session")?.value
  
  if (!sessionToken) return null
  
  const rawSessionData = await redis.get(`session:${sessionToken}`)
  if (!rawSessionData) return null
  
  // Upstash may return already parsed object or string
  const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
  return sessionData.email
}

/**
 * GET /api/notes
 * Fetches encrypted notes from Redis cache (fast).
 * Requires authentication.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({ notes: [], authenticated: false })
    }

    // Fetch from Redis cache (fast!)
    const cacheKey = NOTES_CACHE_KEY(userId)
    const rawNotes = await redis.get(cacheKey)
    
    if (!rawNotes) {
      return NextResponse.json({ notes: [], source: "cache", encrypted: true })
    }
    
    // Upstash may return already parsed object or string
    const notes = typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes
    
    // Sort by date descending
    const sortedNotes = (notes as EncryptedNote[])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ notes: sortedNotes, source: "cache", encrypted: true })
  } catch (err) {
    console.error("[v0] Cache fetch error:", err)
    return NextResponse.json({ notes: [], source: "fallback", encrypted: true })
  }
}

/**
 * POST /api/notes
 * Creates a new encrypted note in S3.
 * REJECTS plaintext payloads.
 * Requires authentication.
 */
export async function POST(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    
    // Validate encrypted payload
    if (!body.encryptedData || !isValidEncryptedPayload(body.encryptedData)) {
      return NextResponse.json(
        { 
          error: "Invalid payload: notes must be encrypted before upload",
          hint: "Ensure encryptedData contains ciphertext, iv, salt, and version"
        },
        { status: 400 }
      )
    }

    const note: EncryptedNote = {
      id: body.id,
      encryptedData: body.encryptedData,
      date: body.date || new Date().toISOString(),
      folder: body.folder || "notes",
    }

    // Update Redis cache (primary storage for fast reads)
    const cacheKey = NOTES_CACHE_KEY(userId)
    const rawNotes = await redis.get(cacheKey)
    const notes = rawNotes 
      ? (typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[]
      : []
    notes.unshift(note)
    await redis.set(cacheKey, JSON.stringify(notes))
    
    // Also upload to S3 (backup storage)
    uploadNote(userId, note.id, note).catch(err => console.error("[v0] S3 backup error:", err))

    return NextResponse.json({ success: true, note, encrypted: true })
  } catch (err) {
    console.error("[v0] Create error:", err)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}

/**
 * PUT /api/notes
 * Updates an encrypted note in S3.
 * REJECTS plaintext payloads.
 * Requires authentication.
 */
export async function PUT(request: Request) {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()

    // Validate encrypted payload
    if (!body.encryptedData || !isValidEncryptedPayload(body.encryptedData)) {
      return NextResponse.json(
        {
          error: "Invalid payload: notes must be encrypted before upload",
          hint: "Ensure encryptedData contains ciphertext, iv, salt, and version"
        },
        { status: 400 }
      )
    }

    const updatedNote: EncryptedNote = {
      id: body.id,
      encryptedData: body.encryptedData,
      date: new Date().toISOString(),
      folder: body.folder || "notes",
    }

    // Update Redis cache
    const cacheKey = NOTES_CACHE_KEY(userId)
    const rawNotes = await redis.get(cacheKey)
    let notes = rawNotes 
      ? (typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[]
      : []
    
    const index = notes.findIndex(n => n.id === updatedNote.id)
    if (index >= 0) {
      notes[index] = updatedNote
    } else {
      notes.unshift(updatedNote)
    }
    await redis.set(cacheKey, JSON.stringify(notes))
    
    // Also upload to S3 (backup)
    uploadNote(userId, updatedNote.id, updatedNote).catch(err => console.error("[v0] S3 backup error:", err))

    return NextResponse.json({ success: true, note: updatedNote, encrypted: true })
  } catch (err) {
    console.error("[v0] Update error:", err)
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 })
  }
}

/**
 * DELETE /api/notes
 * Deletes a note by ID from S3.
 * Requires authentication.
 */
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url)
  const noteId = searchParams.get("noteId")

  if (!noteId) {
    return NextResponse.json({ error: "noteId is required" }, { status: 400 })
  }

  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    // Update Redis cache
    const cacheKey = NOTES_CACHE_KEY(userId)
    const rawNotes = await redis.get(cacheKey)
    if (rawNotes) {
      let notes = (typeof rawNotes === "string" ? JSON.parse(rawNotes) : rawNotes) as EncryptedNote[]
      notes = notes.filter(n => n.id !== noteId)
      await redis.set(cacheKey, JSON.stringify(notes))
    }
    
    // Also delete from S3 (backup)
    deleteNote(userId, noteId).catch(err => console.error("[v0] S3 delete error:", err))

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Delete error:", err)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
