/**
 * Folders API
 * Provides relational persistence for folder trees, replacing client-side localStorage.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { FolderRepository } from "@/lib/db/repositories"

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const folders = await FolderRepository.listByUser(user.id)
    return NextResponse.json({ folders })
  } catch (err) {
    console.error("[/api/folders GET]", err)
    return NextResponse.json({ error: "Failed to fetch folders" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await req.json()
    const { id, name, parentId, icon = "custom", isArchived = false } = body

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Folder name is required" }, { status: 400 })
    }

    let validParentId: string | null = null
    if (parentId && parentId !== "all") {
      const parentFolder = await FolderRepository.getById(parentId, user.id)
      if (!parentFolder) {
        return NextResponse.json(
          { error: "Parent folder not found or access denied" },
          { status: 404 }
        )
      }
      validParentId = parentFolder.id
    }

    const folderId = id || `fld_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`

    const folder = await FolderRepository.create({
      id: folderId,
      user_id: user.id,
      name: name.trim(),
      parent_id: validParentId,
      icon,
      is_system: false,
      is_archived: isArchived,
    })

    return NextResponse.json({ success: true, folder })
  } catch (err) {
    console.error("[/api/folders POST]", err)
    return NextResponse.json({ error: "Failed to save folder" }, { status: 500 })
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
      return NextResponse.json({ error: "Folder ID required" }, { status: 400 })
    }

    await FolderRepository.delete(id, user.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[/api/folders DELETE]", err)
    return NextResponse.json({ error: "Failed to delete folder" }, { status: 500 })
  }
}
