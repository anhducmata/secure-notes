import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { uploadNote, getNote, deleteNote, listUserNotes } from "@/lib/s3"

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
  
  console.log("[v0] Session token:", sessionToken ? sessionToken.substring(0, 8) + "..." : "none")
  
  if (!sessionToken) return null
  
  const rawSessionData = await redis.get(`session:${sessionToken}`)
  console.log("[v0] Raw session data type:", typeof rawSessionData)
  
  if (!rawSessionData) return null
  
  // Upstash may return already parsed object or string
  const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
  console.log("[v0] Session user email:", sessionData.email)
  
  return sessionData.email
}

/**
 * GET /api/notes
 * Fetches encrypted notes from S3.
 * Requires authentication.
 */
export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    
    if (!userId) {
      return NextResponse.json({ notes: [], authenticated: false })
    }

    // List all note IDs for the user
    const noteIds = await listUserNotes(userId)
    
    if (noteIds.length === 0) {
      return NextResponse.json({ notes: [], source: "s3", encrypted: true })
    }
    
    // Fetch all notes in parallel
    const notePromises = noteIds.map(async (noteId) => {
      const noteData = await getNote(userId, noteId)
      return noteData as EncryptedNote | null
    })
    
    const notes = (await Promise.all(notePromises))
      .filter((n): n is EncryptedNote => n !== null)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

    return NextResponse.json({ notes, source: "s3", encrypted: true })
  } catch (err) {
    console.error("[v0] S3 fetch error:", err)
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

    // Upload to S3
    await uploadNote(userId, note.id, note)

    return NextResponse.json({ success: true, note, encrypted: true })
  } catch (err) {
    console.error("[v0] S3 create error:", err)
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

    // Upload to S3 (overwrites existing)
    await uploadNote(userId, updatedNote.id, updatedNote)

    return NextResponse.json({ success: true, note: updatedNote, encrypted: true })
  } catch (err) {
    console.error("[v0] S3 update error:", err)
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

    // Delete from S3
    await deleteNote(userId, noteId)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] S3 delete error:", err)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
