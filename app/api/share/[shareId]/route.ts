import { NextResponse } from "next/server"
import { redis, SHARE_LINK_KEY } from "@/lib/redis"

interface EncryptedSharePayload {
  ciphertext: string
  iv: string
}

interface ShareLinkData {
  encryptedData: EncryptedSharePayload
  createdAt: string
  creatorEmail: string
}

/**
 * GET /api/share/[shareId]
 * Retrieves and consumes a one-time share link.
 * After successful retrieval, the link is deleted (one-time use).
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

    // Return only the encrypted payload – the server never exposes plaintext
    return NextResponse.json({
      success: true,
      note: {
        encryptedData: shareData.encryptedData,
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
