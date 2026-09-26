import { NextResponse } from "next/server"
import { redis, SHARE_LINK_KEY } from "@/lib/redis"

interface EncryptedSharePayload {
  ciphertext: string
  iv: string
}

interface ShareLinkData {
  type?: "note" | "folder"
  encryptedData: EncryptedSharePayload
  createdAt: string
  creatorEmail: string
  permission?: "read" | "write"
}

/**
 * GET /api/share/[shareId]
 * Retrieves a shared note or folder.
 * Returns only the encrypted payload; decryption happens client-side
 * using the key embedded in the share URL fragment.
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
    const rawData = await redis.get(key)

    if (!rawData) {
      return NextResponse.json(
        { 
          error: "Link expired or not found",
          message: "This share link has either expired or doesn't exist."
        },
        { status: 404 }
      )
    }

    const shareData: ShareLinkData = typeof rawData === "string" 
      ? JSON.parse(rawData) 
      : rawData as ShareLinkData

    return NextResponse.json({
      success: true,
      share: {
        type: shareData.type || "note",
        encryptedData: shareData.encryptedData,
        sharedAt: shareData.createdAt,
        permission: shareData.permission || "read",
      }
    })
  } catch (err) {
    console.error("[v0] Share link retrieval error:", err)
    return NextResponse.json(
      { error: "Failed to retrieve shared item" },
      { status: 500 }
    )
  }
}
