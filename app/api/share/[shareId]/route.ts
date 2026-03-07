import { NextResponse } from "next/server"
import { redis, SHARE_LINK_KEY } from "@/lib/redis"

interface ShareLinkData {
  noteTitle: string
  noteContent: string
  createdAt: string
  creatorEmail: string
}

/**
 * GET /api/share/[shareId]
 * Retrieves and consumes a one-time share link
 * After successful retrieval, the link is deleted (one-time use)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> }
) {
  try {
    const { shareId } = await params

    if (!shareId) {
      return NextResponse.json(
        { error: "Share ID is required" },
        { status: 400 }
      )
    }

    const key = SHARE_LINK_KEY(shareId)
    
    // Get the share data
    const rawData = await redis.get(key)
    
    if (!rawData) {
      return NextResponse.json(
        { 
          error: "Link expired or already used",
          message: "This share link has either expired, been viewed already, or doesn't exist."
        },
        { status: 404 }
      )
    }

    // Parse the data
    const shareData: ShareLinkData = typeof rawData === "string" 
      ? JSON.parse(rawData) 
      : rawData as ShareLinkData

    // Delete the link immediately after reading (one-time use)
    await redis.del(key)

    // Return the note data (without creator email for privacy)
    return NextResponse.json({
      success: true,
      note: {
        title: shareData.noteTitle,
        content: shareData.noteContent,
        sharedAt: shareData.createdAt,
      }
    })
  } catch (err) {
    console.error("[v0] Share link retrieval error:", err)
    return NextResponse.json(
      { error: "Failed to retrieve shared note" },
      { status: 500 }
    )
  }
}
