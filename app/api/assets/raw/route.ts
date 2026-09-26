/**
 * Asset Streaming Route
 * Serves original stored binary assets (audio, DOCX, CSV, images) with byte-range support.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { assetStorage } from "@/lib/storage"
import { AssetRepository } from "@/lib/db/repositories"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const key = searchParams.get("key")
    if (!key) {
      return NextResponse.json({ error: "Storage key required" }, { status: 400 })
    }

    // Reject path traversal and null bytes immediately
    if (key.includes("..") || key.includes("\0")) {
      return NextResponse.json({ error: "Invalid storage key" }, { status: 400 })
    }

    // Verify tenant ownership of storage key by prefix
    if (!key.startsWith(user.id) && !key.includes(`/${user.id}/`)) {
      return NextResponse.json({ error: "Unauthorized asset access" }, { status: 403 })
    }

    // Verify that this asset is registered in the database for this authenticated user
    const dbAsset = await AssetRepository.findByStorageKey(key, user.id)
    if (!dbAsset) {
      return NextResponse.json({ error: "Asset not found or access denied" }, { status: 404 })
    }

    const buffer = await assetStorage.get(key)
    if (!buffer) {
      return NextResponse.json({ error: "Asset not found in storage" }, { status: 404 })
    }

    // Determine MIME type
    let contentType = dbAsset.mime_type || "application/octet-stream"
    if (contentType === "application/octet-stream") {
      if (key.endsWith(".webm")) contentType = "audio/webm"
      else if (key.endsWith(".mp4") || key.endsWith(".m4a")) contentType = "audio/mp4"
      else if (key.endsWith(".png")) contentType = "image/png"
      else if (key.endsWith(".jpg") || key.endsWith(".jpeg")) contentType = "image/jpeg"
      else if (key.endsWith(".csv")) contentType = "text/csv"
      else if (key.endsWith(".docx")) contentType = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    }

    // Handle HTTP Range Requests (RFC 7233) for audio playback & scrub seeking
    const rangeHeader = req.headers.get("range")
    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const parts = rangeHeader.replace(/bytes=/, "").split("-")
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : buffer.length - 1

      if (isNaN(start) || start >= buffer.length || (end && end < start)) {
        return new Response(null, {
          status: 416,
          headers: {
            "Content-Range": `bytes */${buffer.length}`,
          },
        })
      }

      const clampedEnd = Math.min(end, buffer.length - 1)
      const chunk = buffer.subarray(start, clampedEnd + 1)
      const contentLength = (clampedEnd - start + 1).toString()

      return new Response(new Uint8Array(chunk), {
        status: 206,
        headers: {
          "Content-Type": contentType,
          "Content-Range": `bytes ${start}-${clampedEnd}/${buffer.length}`,
          "Content-Length": contentLength,
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, max-age=3600",
        },
      })
    }

    // Standard 200 response
    return new Response(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": buffer.length.toString(),
        "Accept-Ranges": "bytes",
        "Cache-Control": "private, max-age=3600",
      },
    })
  } catch (err) {
    console.error("[/api/assets/raw GET]", err)
    return NextResponse.json({ error: "Failed to stream asset" }, { status: 500 })
  }
}
