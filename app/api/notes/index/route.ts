import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { vectorIndex } from "@/lib/vector"
import { ENTITY_KEY, emptyEntityStore, mergeEntities, type EntityStore } from "@/lib/entities"
import OpenAI, { toFile } from "openai"

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "dummy-key",
  baseURL: "https://api.deepseek.com",
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key" })

interface NoteAttachmentInput {
  id: string
  name: string
  type: "image" | "audio" | "text"
  dataUrl?: string
}

function attCacheKey(userId: string, attId: string) {
  return `att_text:${userId}:${attId}`
}

async function extractAttachmentText(
  userId: string,
  att: NoteAttachmentInput
): Promise<string> {
  // Check cache first
  const cached = await redis.get(attCacheKey(userId, att.id))
  if (cached) return typeof cached === "string" ? cached : JSON.stringify(cached)

  if (!att.dataUrl) return ""

  const [meta, b64] = att.dataUrl.split(",")
  const mimeMatch = meta.match(/data:([^;]+)/)
  const mime = mimeMatch?.[1] ?? "application/octet-stream"
  const buffer = Buffer.from(b64, "base64")

  let text = ""
  try {
    if (att.type === "audio") {
      const openaiFile = await toFile(buffer, att.name, { type: mime })
      const result = await openai.audio.transcriptions.create({ file: openaiFile, model: "whisper-1" })
      text = `[Audio: ${att.name}]\nTranscript: ${result.text}`
    } else if (att.type === "image") {
      const result = await openai.chat.completions.create({
        model: "gpt-5.5",
        messages: [{
          role: "user",
          content: [
            { type: "text", text: "Describe this image in detail. Include all text, data, people, objects, and any meaningful context." },
            { type: "image_url", image_url: { url: att.dataUrl } },
          ],
        }],
        max_tokens: 600,
      })
      text = `[Image: ${att.name}]\nDescription: ${result.choices[0]?.message?.content ?? ""}`
    } else {
      const decoded = buffer.toString("utf-8")
      text = `[File: ${att.name}]\n${decoded.slice(0, 3000)}`
    }
  } catch (err) {
    console.error(`[att extract] failed for ${att.name}:`, err)
    text = `[Attachment: ${att.name}] (processing failed)`
  }

  if (text) await redis.set(attCacheKey(userId, att.id), text, { ex: 60 * 60 * 24 * 30 }) // 30 days
  return text
}

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get("session")?.value
  if (!sessionToken) return null
  const rawSessionData = await redis.get(`session:${sessionToken}`)
  if (!rawSessionData) return null
  const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
  return sessionData.email
}

async function extractEntitiesFromNote(
  noteId: string,
  noteTitle: string,
  content: string
): Promise<Partial<EntityStore>> {
  const prompt = `Extract structured knowledge entities from this note. Return ONLY valid JSON, no markdown.

Note title: "${noteTitle}"
Note content:
${content.slice(0, 4000)}

Return this exact JSON structure (use empty objects/arrays if nothing found):
{
  "people": {
    "<normalized_name_key>": {
      "name": "Full Name",
      "aliases": ["nickname", "short name"],
      "role": "their role/title or unknown",
      "organization": "their org/company or unknown",
      "mentions": [{"noteId": "${noteId}", "noteTitle": "${noteTitle}", "snippet": "relevant quote/context under 200 chars"}]
    }
  },
  "projects": {
    "<normalized_project_key>": {
      "name": "Project Name",
      "description": "what this project is about",
      "status": "active/completed/planning/unknown",
      "team": ["person name"],
      "mentions": [{"noteId": "${noteId}", "noteTitle": "${noteTitle}", "snippet": "relevant context under 200 chars"}]
    }
  },
  "conversations": [
    {
      "id": "${noteId}_conv_0",
      "participants": ["name1", "name2"],
      "topic": "what was discussed",
      "summary": "key outcomes/decisions in 1-2 sentences",
      "noteId": "${noteId}",
      "noteTitle": "${noteTitle}",
      "date": "ISO date if mentioned or empty string"
    }
  ]
}`

  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0,
  })

  const raw = response.choices[0]?.message?.content ?? "{}"
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  return JSON.parse(cleaned)
}

export async function DELETE(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { noteId } = await req.json() as { noteId: string }
    if (!noteId) return NextResponse.json({ error: "Missing noteId" }, { status: 400 })

    await vectorIndex.delete(`${userId}:${noteId}`)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error("[/api/notes/index DELETE]", err)
    return NextResponse.json({ error: "Failed to remove from index" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { notes } = await req.json() as {
      notes: { id: string; title: string; content: string; attachments?: NoteAttachmentInput[] }[]
    }

    if (!notes?.length) return NextResponse.json({ indexed: 0 })

    // Process attachments and build enriched text per note
    const enrichedNotes = await Promise.all(
      notes.map(async (note) => {
        let attachmentText = ""
        if (note.attachments?.length) {
          const parts = await Promise.all(
            note.attachments.map((att) => extractAttachmentText(userId, att))
          )
          attachmentText = parts.filter(Boolean).join("\n\n")
        }
        return { ...note, attachmentText }
      })
    )

    // Vector index upsert — include attachment text in indexed data
    const records = enrichedNotes.map((note) => {
      const fullText = [note.title, note.content, note.attachmentText].filter(Boolean).join("\n\n")
      const snippet = note.content.slice(0, 800) + (note.attachmentText ? `\n\n${note.attachmentText.slice(0, 200)}` : "")
      return {
        id: `${userId}:${note.id}`,
        data: fullText.slice(0, 8000),
        metadata: { userId, noteId: note.id, title: note.title, snippet: snippet.slice(0, 1000) },
      }
    })
    await vectorIndex.upsert(records)

    // Entity extraction — run async, don't block the response
    extractAndStoreEntities(userId, enrichedNotes.map(n => ({
      id: n.id,
      title: n.title,
      content: [n.content, n.attachmentText].filter(Boolean).join("\n\n"),
    }))).catch((err) =>
      console.error("[/api/notes/index] entity extraction failed:", err)
    )

    return NextResponse.json({ indexed: records.length })
  } catch (err) {
    console.error("[/api/notes/index]", err)
    return NextResponse.json({ error: "Failed to index notes" }, { status: 500 })
  }
}

async function extractAndStoreEntities(
  userId: string,
  notes: { id: string; title: string; content: string }[]
) {
  const raw = await redis.get(ENTITY_KEY(userId))
  let store = raw
    ? (typeof raw === "string" ? JSON.parse(raw) : raw) as EntityStore
    : emptyEntityStore()

  for (const note of notes) {
    try {
      const extracted = await extractEntitiesFromNote(note.id, note.title, note.content)
      store = mergeEntities(store, extracted, note.id, note.title)
    } catch (err) {
      console.error(`[entities] failed on note ${note.id}:`, err)
    }
  }

  await redis.set(ENTITY_KEY(userId), JSON.stringify(store))
}
