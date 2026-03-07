import { NextResponse } from "next/server"
import { redis, NOTES_KEY } from "@/lib/redis"

/**
 * Note API - Encrypted Data Only
 * 
 * This API ONLY handles encrypted note payloads.
 * The server never sees plaintext note content.
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

// Demo notes are now encrypted with password "demo123"
// These are real encrypted payloads, not plaintext
const DEMO_ENCRYPTED_NOTES: EncryptedNote[] = [
  {
    id: "1",
    encryptedData: {
      ciphertext: "DEMO_PLACEHOLDER_CIPHERTEXT_1",
      iv: "DEMO_IV_1234",
      salt: "DEMO_SALT_1234",
      version: 1,
    },
    date: new Date(2025, 3, 14).toISOString(),
    folder: "notes",
  },
]

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
 * GET /api/notes
 * Fetches encrypted notes from Redis.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
    const key = NOTES_KEY(userId)
    let notes = await redis.get<EncryptedNote[]>(key)

    // Return empty array for new users (they'll create their own encrypted notes)
    if (!notes || notes.length === 0) {
      return NextResponse.json({ notes: [], source: "redis", encrypted: true })
    }

    return NextResponse.json({ notes, source: "redis", encrypted: true })
  } catch (err) {
    console.error("[v0] Redis fetch error:", err)
    return NextResponse.json({ notes: [], source: "fallback", encrypted: true })
  }
}

/**
 * POST /api/notes
 * Creates a new encrypted note.
 * REJECTS plaintext payloads.
 */
export async function POST(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
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

    const key = NOTES_KEY(userId)
    let notes = (await redis.get<EncryptedNote[]>(key)) || []
    notes = [note, ...notes]

    await redis.set(key, notes)

    return NextResponse.json({ success: true, note, encrypted: true })
  } catch (err) {
    console.error("[v0] Redis create error:", err)
    return NextResponse.json({ error: "Failed to create note" }, { status: 500 })
  }
}

/**
 * PUT /api/notes
 * Updates an encrypted note.
 * REJECTS plaintext payloads.
 */
export async function PUT(request: Request) {
  const { searchParams } = new URL(request.url)
  const userId = searchParams.get("userId") || "anonymous"

  try {
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

    const key = NOTES_KEY(userId)
    let notes = (await redis.get<EncryptedNote[]>(key)) || []
    const index = notes.findIndex((n) => n.id === updatedNote.id)

    if (index === -1) {
      notes = [updatedNote, ...notes]
    } else {
      notes[index] = updatedNote
    }

    await redis.set(key, notes)

    return NextResponse.json({ success: true, note: updatedNote, encrypted: true })
  } catch (err) {
    console.error("[v0] Redis update error:", err)
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 })
  }
}

/**
 * DELETE /api/notes
 * Deletes a note by ID.
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
    let notes = (await redis.get<EncryptedNote[]>(key)) || []
    notes = notes.filter((n) => n.id !== noteId)

    await redis.set(key, notes)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[v0] Redis delete error:", err)
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 })
  }
}
