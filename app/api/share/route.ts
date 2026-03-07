import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis, SHARE_LINK_KEY } from "@/lib/redis"
import { nanoid } from "nanoid"

// TTL for share links: 24 hours
const SHARE_LINK_TTL = 60 * 60 * 24 // 24 hours in seconds

interface ShareLinkData {
  noteTitle: string
  noteContent: string
  createdAt: string
  creatorEmail: string
}

/**
 * Get authenticated user email from session
 */
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
 * Creates a one-time share link for a note
 * The note content is passed decrypted from the client (since only the client can decrypt)
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
    const { noteTitle, noteContent } = body

    if (!noteTitle || typeof noteContent !== "string") {
      return NextResponse.json(
        { error: "Note title and content are required" },
        { status: 400 }
      )
    }

    // Generate a unique share ID
    const shareId = nanoid(21)
    
    // Store the share link data in Redis with TTL
    const shareData: ShareLinkData = {
      noteTitle,
      noteContent,
      createdAt: new Date().toISOString(),
      creatorEmail: userEmail,
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
      expiresIn: "24 hours (or after one view)"
    })
  } catch (err) {
    console.error("[v0] Share link creation error:", err)
    return NextResponse.json(
      { error: "Failed to create share link" },
      { status: 500 }
    )
  }
}
