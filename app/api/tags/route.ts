/**
 * Tags API
 * Provides relational persistence for reusable tags and colors.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { TagRepository } from "@/lib/db/repositories"

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const tags = await TagRepository.listByUser(user.id)
    return NextResponse.json({ tags })
  } catch (err) {
    console.error("[/api/tags GET]", err)
    return NextResponse.json({ error: "Failed to fetch tags" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await req.json()
    const { name, color = "#3b82f6" } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Tag name is required" }, { status: 400 })
    }

    const trimmed = name.trim()
    const existing = await TagRepository.findByName(user.id, trimmed)
    if (existing) {
      return NextResponse.json({ success: true, tag: existing })
    }

    const tagId = `tag_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const created = await TagRepository.create({
      id: tagId,
      user_id: user.id,
      name: trimmed,
      color,
    })

    return NextResponse.json({ success: true, tag: created })
  } catch (err) {
    console.error("[/api/tags POST]", err)
    return NextResponse.json({ error: "Failed to save tag" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")
    if (!id) {
      return NextResponse.json({ error: "Tag ID required" }, { status: 400 })
    }

    await TagRepository.delete(id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[/api/tags DELETE]", err)
    return NextResponse.json({ error: "Failed to delete tag" }, { status: 500 })
  }
}
