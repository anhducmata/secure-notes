/**
 * Search API Route
 * Exposes fast hybrid keyword + vector search for the Spotlight search modal and clients.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { hybridSearch } from "@/lib/search"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q") || ""
    const folderId = searchParams.get("folder") || undefined
    const tagId = searchParams.get("tag") || undefined
    const speakerId = searchParams.get("speaker") || undefined
    const sourceType = (searchParams.get("type") as "note" | "recording" | "asset") || undefined
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 15)))

    const results = await hybridSearch(
      user.id,
      q,
      { folderId, tagId, speakerId, sourceType },
      limit
    )

    return NextResponse.json({ results })
  } catch (err) {
    console.error("[/api/search GET]", err)
    return NextResponse.json({ error: "Search failed" }, { status: 500 })
  }
}
