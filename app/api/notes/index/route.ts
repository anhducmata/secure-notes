/**
 * Notes Indexing API
 * Ingests notes and attachments, converts to Knowledge Markdown, generates semantic chunks,
 * and indexes into the relational Knowledge Repository (FTS + Vector).
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { vectorIndex } from "@/lib/vector"
import {
  NoteRepository,
  KnowledgeRepository,
  FolderRepository,
  RecordingRepository,
  TranscriptRepository,
  SpeakerRepository,
  TagRepository,
} from "@/lib/db/repositories"
import { processSource } from "@/lib/ingestion/pipeline"
import { generateKnowledgeMarkdown } from "@/lib/ingestion/markdown-generator"
import { chunkDocument, generateEmbeddings } from "@/lib/ingestion/chunker"
import { parseDocx } from "@/lib/ingestion/docx"
import { parseCsv } from "@/lib/ingestion/csv"
import { extractTextFromImage } from "@/lib/ingestion/ocr"
import { db } from "@/lib/db/database"
import crypto from "crypto"

interface NoteAttachmentInput {
  id: string
  name: string
  type: "image" | "audio" | "text" | "docx" | "csv"
  dataUrl?: string
}

interface NoteInput {
  id: string
  title: string
  content: string
  folderId?: string
  tags?: string[]
  attachments?: NoteAttachmentInput[]
}

async function parseAttachmentContent(att: NoteAttachmentInput): Promise<{ type: any; markdownContent: string }> {
  if (!att.dataUrl) {
    return { type: "text", markdownContent: `[Attachment: ${att.name}]` }
  }

  const [, b64] = att.dataUrl.split(",")
  if (!b64) {
    return { type: "text", markdownContent: `[Attachment: ${att.name}]` }
  }

  const buffer = Buffer.from(b64, "base64")
  const lowerName = att.name.toLowerCase()

  if (lowerName.endsWith(".docx")) {
    try {
      const parsed = parseDocx(buffer)
      return { type: "docx", markdownContent: parsed.markdown }
    } catch {
      return { type: "docx", markdownContent: `[DOCX: ${att.name}] (Parsing failed)` }
    }
  }

  if (lowerName.endsWith(".csv")) {
    try {
      const text = buffer.toString("utf8")
      const parsed = parseCsv(text, 100)
      return { type: "csv", markdownContent: parsed.markdownTable }
    } catch {
      return { type: "csv", markdownContent: `[CSV: ${att.name}] (Parsing failed)` }
    }
  }

  if (att.type === "image" || /\.(png|jpe?g|webp|gif)$/i.test(lowerName)) {
    try {
      const ocr = await extractTextFromImage(buffer)
      return { type: "image", markdownContent: `*OCR Text (${ocr.engine}):*\n${ocr.text}` }
    } catch {
      return { type: "image", markdownContent: `[Image: ${att.name}]` }
    }
  }

  // Plain text fallback
  const text = buffer.toString("utf8")
  return { type: "text", markdownContent: text.slice(0, 4000) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notes } = (await req.json()) as { notes: NoteInput[] }
    if (!notes?.length) return NextResponse.json({ indexed: 0 })

    const userFolders = await FolderRepository.listByUser(user.id)
    const folderMap = new Map(userFolders.map((f) => [f.id, f.name]))

    const userSpeakers = await SpeakerRepository.listByUser(user.id)
    const speakerMap = new Map(userSpeakers.map((s) => [s.id, s]))

    const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY
    let totalIndexedChunks = 0

    for (const noteInput of notes) {
      // Enforce tenant ownership: skip notes owned by another user
      const existingRows = await db.query<{ user_id: string }>(
        "SELECT user_id FROM notes WHERE id = ? LIMIT 1",
        [noteInput.id]
      )
      if (existingRows.length > 0 && existingRows[0].user_id !== user.id) {
        continue
      }

      // Upsert note if needed so it is persisted
      await NoteRepository.upsert({
        id: noteInput.id,
        user_id: user.id,
        folder_id: noteInput.folderId,
        title: noteInput.title,
        content: noteInput.content,
      })

      // Add tags if provided
      if (noteInput.tags?.length) {
        for (const tagName of noteInput.tags) {
          const tag = await TagRepository.upsert(user.id, tagName)
          await NoteRepository.addTag(noteInput.id, tag.id)
        }
      }

      // Process via deterministic knowledge pipeline
      const res = await processSource(user.id, "note", noteInput.id, { apiKey })
      if (res.success && res.chunksCount) {
        totalIndexedChunks += res.chunksCount
      }
    }

    return NextResponse.json({ indexed: notes.length, chunks: totalIndexedChunks })
  } catch (err) {
    console.error("[/api/notes/index POST]", err)
    return NextResponse.json({ error: "Failed to index notes" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { noteId } = (await req.json()) as { noteId: string }
    if (!noteId) {
      return NextResponse.json({ error: "Missing noteId" }, { status: 400 })
    }

    // 1. Delete derived knowledge documents and chunks (tenant isolated)
    await KnowledgeRepository.deleteBySource("note", noteId, user.id)

    // 2. Upstash vector delete if configured
    if (process.env.UPSTASH_VECTOR_REST_URL) {
      vectorIndex.delete(`${user.email}:${noteId}`).catch(() => {})
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[/api/notes/index DELETE]", err)
    return NextResponse.json({ error: "Failed to remove from index" }, { status: 500 })
  }
}
