import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis, SHARE_LINK_KEY } from "@/lib/redis"
import { nanoid } from "nanoid"

// TTL for share links: 7 days
const SHARE_LINK_TTL = 60 * 60 * 24 * 7 // 7 days in seconds

interface EncryptedSharePayload {
  ciphertext: string
  iv: string
}

interface ShareLinkData {
  type: "note" | "folder"
  encryptedData: EncryptedSharePayload
  createdAt: string
  creatorEmail: string
  permission: "read" | "write"
}

function isValidEncryptedSharePayload(payload: unknown): payload is EncryptedSharePayload {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.ciphertext === "string" &&
    typeof p.iv === "string" &&
    p.ciphertext.length > 0 &&
    p.iv.length > 0
  )
}

async function getAuthenticatedUserEmail(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get("session")?.value
  
  if (!sessionToken) return null
  
  const rawSessionData = await redis.get(`session:${sessionToken}`)
  if (!rawSessionData) return null
  
  const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
  return sessionData.email
}

/**
 * POST /api/share
 * Creates a share link for a note or folder.
 * Caller encrypts content client-side; server stores ciphertext.
 */
export async function POST(request: Request) {
  try {
    const userEmail = await getAuthenticatedUserEmail()
    
    if (!userEmail) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401 }
      )
    }

    const body = await request.json()
    const { encryptedData, type = "note", permission = "read" } = body

    if (!isValidEncryptedSharePayload(encryptedData)) {
      return NextResponse.json(
        { error: "Invalid payload: content must be encrypted before sharing" },
        { status: 400 }
      )
    }

    // Generate a unique share ID
    const shareId = nanoid(21)
    
    const shareData: ShareLinkData = {
      type: type === "folder" ? "folder" : "note",
      encryptedData,
      createdAt: new Date().toISOString(),
      creatorEmail: userEmail,
      permission: permission === "write" ? "write" : "read",
    }

    await redis.set(
      SHARE_LINK_KEY(shareId),
      JSON.stringify(shareData),
      { ex: SHARE_LINK_TTL }
    )

    // Generate the share URL
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
    const shareUrl = `${baseUrl}/shared/${shareId}`

    return NextResponse.json({ 
      success: true, 
      shareUrl,
      shareId,
      type: shareData.type,
      permission: shareData.permission,
      expiresIn: "7 days"
    })
  } catch (err) {
    console.error("[v0] Share link creation error:", err)
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    )
  }
}
