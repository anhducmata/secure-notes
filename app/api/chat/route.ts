import { NextRequest, NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { vectorIndex } from "@/lib/vector"
import { ENTITY_KEY, type EntityStore } from "@/lib/entities"
import OpenAI from "openai"
import { toFile } from "openai"
import { CONVS_KEY, CONV_KEY } from "@/lib/chat-keys"

const deepseek = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || "dummy-key",
  baseURL: "https://api.deepseek.com",
})

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY || "dummy-key" })

function clientForModel(model: string) {
  return model.startsWith("deepseek") ? deepseek : openai
}

async function processAttachments(files: File[]): Promise<string> {
  if (files.length === 0) return ""
  const parts: string[] = []

  for (const file of files) {
    const name = file.name
    const mime = file.type

    if (mime.startsWith("audio/")) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const buffer = Buffer.from(arrayBuffer)
        const openaiFile = await toFile(buffer, name, { type: mime })
        const result = await openai.audio.transcriptions.create({
          file: openaiFile,
          model: "whisper-1",
        })
        parts.push(`[Audio file: ${name}]\nTranscript:\n${result.text}`)
      } catch (e) {
        parts.push(`[Audio file: ${name}]\n(Transcription failed)`)
      }
    } else if (mime.startsWith("image/")) {
      try {
        const arrayBuffer = await file.arrayBuffer()
        const base64 = Buffer.from(arrayBuffer).toString("base64")
        const dataUrl = `data:${mime};base64,${base64}`
        const result = await openai.chat.completions.create({
          model: "gpt-5.5",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "Describe this image in detail. Include any text, data, people, objects, or relevant context visible." },
                { type: "image_url", image_url: { url: dataUrl } },
              ],
            },
          ],
          max_tokens: 500,
        })
        const description = result.choices[0]?.message?.content ?? "(No description)"
        parts.push(`[Image file: ${name}]\nDescription:\n${description}`)
      } catch (e) {
        parts.push(`[Image file: ${name}]\n(Image analysis failed)`)
      }
    } else {
      try {
        const text = await file.text()
        parts.push(`[Text file: ${name}]\nContent:\n${text.slice(0, 3000)}${text.length > 3000 ? "\n...(truncated)" : ""}`)
      } catch (e) {
        parts.push(`[File: ${name}]\n(Could not read content)`)
      }
    }
  }

  return parts.join("\n\n")
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

async function getEntityStore(userId: string): Promise<EntityStore | null> {
  const raw = await redis.get(ENTITY_KEY(userId))
  if (!raw) return null
  return typeof raw === "string" ? JSON.parse(raw) : raw
}

/** Ask DeepSeek to decompose the question into targeted search queries + entity lookups */
async function planRetrieval(question: string, conversationHistory: { role: string; content: string }[]): Promise<{
  queries: string[]
  peopleToLookup: string[]
  projectsToLookup: string[]
  intent: string
}> {
  const historySnippet = conversationHistory.slice(-4).map(m => `${m.role}: ${m.content}`).join("\n")
  const response = await deepseek.chat.completions.create({
    model: "deepseek-chat",
    temperature: 0,
    messages: [
      {
        role: "system",
        content: `You are a retrieval planner. Given a user question, output a JSON plan for how to retrieve relevant information from the user's personal knowledge base (notes, people, projects, conversations).`,
      },
      {
        role: "user",
        content: `Recent conversation:
${historySnippet || "(none)"}

User question: "${question}"

Return ONLY valid JSON (no markdown):
{
  "intent": "one of: person_lookup | project_lookup | conversation_search | general_search | mixed",
  "queries": ["2-3 semantic search queries to run against notes, each focusing on a different angle"],
  "peopleToLookup": ["exact or partial names of people to fetch from entity store"],
  "projectsToLookup": ["exact or partial project names to fetch from entity store"]
}`,
      },
    ],
  })

  const raw = response.choices[0]?.message?.content ?? "{}"
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim()
  try {
    return JSON.parse(cleaned)
  } catch {
    return { queries: [question], peopleToLookup: [], projectsToLookup: [], intent: "general_search" }
  }
}

/** Run multiple vector searches in parallel and dedupe results */
async function multiSearch(userId: string, queries: string[]) {
  const results = await Promise.all(
    queries.map((q) =>
      vectorIndex.query({ data: q, topK: 4, includeMetadata: true, filter: `userId = '${userId}'` })
    )
  )

  const seen = new Set<string>()
  const deduped: typeof results[0] = []
  for (const batch of results) {
    for (const r of batch) {
      if (!seen.has(r.id as string)) {
        seen.add(r.id as string)
        deduped.push(r)
      }
    }
  }
  return deduped.sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 8)
}

/** Extract relevant entity context from the entity store */
function buildEntityContext(
  store: EntityStore | null,
  peopleToLookup: string[],
  projectsToLookup: string[]
): string {
  if (!store) return ""
  const parts: string[] = []

  if (peopleToLookup.length > 0) {
    for (const query of peopleToLookup) {
      const q = query.toLowerCase()
      const matches = Object.values(store.people).filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.aliases.some((a) => a.toLowerCase().includes(q))
      )
      for (const person of matches) {
        const recentMentions = person.mentions.slice(-3).map((m) => `  - [${m.noteTitle}]: ${m.snippet}`).join("\n")
        parts.push(`PERSON: ${person.name}
  Role: ${person.role}
  Organization: ${person.organization}
  Aliases: ${person.aliases.join(", ") || "none"}
  Recent mentions:\n${recentMentions}`)
      }
    }
  }

  if (projectsToLookup.length > 0) {
    for (const query of projectsToLookup) {
      const q = query.toLowerCase()
      const matches = Object.values(store.projects).filter((p) =>
        p.name.toLowerCase().includes(q)
      )
      for (const project of matches) {
        const recentMentions = project.mentions.slice(-3).map((m) => `  - [${m.noteTitle}]: ${m.snippet}`).join("\n")
        parts.push(`PROJECT: ${project.name}
  Description: ${project.description}
  Status: ${project.status}
  Team: ${project.team.join(", ") || "unknown"}
  Recent mentions:\n${recentMentions}`)
      }
    }
  }

  // Also include recent conversations if relevant
  if (store.conversations.length > 0 && (peopleToLookup.length > 0 || projectsToLookup.length > 0)) {
    const allNames = [...peopleToLookup, ...projectsToLookup].map((n) => n.toLowerCase())
    const relevantConvs = store.conversations.filter((c) =>
      allNames.some(
        (n) =>
          c.participants.some((p) => p.toLowerCase().includes(n)) ||
          c.topic.toLowerCase().includes(n) ||
          c.summary.toLowerCase().includes(n)
      )
    ).slice(-5)

    for (const conv of relevantConvs) {
      parts.push(`CONVERSATION in [${conv.noteTitle}]:
  Participants: ${conv.participants.join(", ")}
  Topic: ${conv.topic}
  Summary: ${conv.summary}`)
    }
  }

  return parts.join("\n\n")
}

export async function POST(req: NextRequest) {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    let question: string, conversationHistory: { role: "user" | "assistant"; content: string; citations?: unknown[] }[], conversationId: string, files: File[], selectedModel: string

    const contentType = req.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      question = form.get("question") as string ?? ""
      conversationHistory = JSON.parse(form.get("conversationHistory") as string ?? "[]")
      conversationId = form.get("conversationId") as string ?? ""
      selectedModel = form.get("model") as string ?? "gpt-5.5"
      files = form.getAll("files") as File[]
    } else {
      const body = await req.json()
      question = body.question
      conversationHistory = body.conversationHistory
      conversationId = body.conversationId
      selectedModel = body.model ?? "gpt-5.5"
      files = []
    }

    const cleanHistory = conversationHistory.map(({ role, content }) => ({ role, content }))

    // Process any attached files
    const attachmentContext = await processAttachments(files)

    // Step 1: Plan retrieval
    const plan = await planRetrieval(question, cleanHistory)

    // Step 2: Parallel — vector search + entity store lookup
    const [vectorResults, entityStore] = await Promise.all([
      multiSearch(userId, plan.queries.length > 0 ? plan.queries : [question]),
      getEntityStore(userId),
    ])

    // Step 3: Build context
    const citableResults = vectorResults.filter((r) => r.metadata)
    const citations = citableResults.map((r, i) => {
      const meta = r.metadata as { noteId: string; title: string; snippet: string }
      return { index: i + 1, noteId: meta.noteId, title: meta.title }
    })

    const notesContext = citableResults
      .map((r, i) => {
        const meta = r.metadata as { title: string; snippet: string }
        return `[${i + 1}] ${meta.title}\n${meta.snippet}`
      })
      .join("\n\n")

    const entityContext = buildEntityContext(entityStore, plan.peopleToLookup, plan.projectsToLookup)

    const systemPrompt = `You are a personal knowledge assistant. Always respond in clear, natural English — concise and direct. Do NOT respond in Vietnamese unless explicitly asked.

When you reference info from a note, cite inline like [1], [2], etc. Don't fabricate info not found in the context below.

${attachmentContext ? `--- ATTACHED FILES ---\n${attachmentContext}\n\n` : ""}${entityContext ? `--- STRUCTURED KNOWLEDGE ---\n${entityContext}\n\n` : ""}${notesContext ? `--- RELEVANT NOTES ---\n${notesContext}` : "No relevant notes found — let the user know briefly."}`

    // Step 4: Answer (streaming)
    const answerClient = clientForModel(selectedModel)
    const stream = await answerClient.chat.completions.create({
      model: selectedModel,
      stream: true,
      messages: [
        { role: "system", content: systemPrompt },
        ...cleanHistory,
        { role: "user", content: question },
      ],
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let fullAnswer = ""
        try {
          for await (const chunk of stream) {
            const delta = chunk.choices[0]?.delta?.content ?? ""
            if (delta) {
              fullAnswer += delta
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta })}\n\n`))
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true })}\n\n`))
          controller.close()
          return
        }

        // Send citations in final event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, citations })}\n\n`))

        // Persist conversation
        const updatedHistory = [
          ...conversationHistory,
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: fullAnswer, citations },
        ]
        await redis.set(CONV_KEY(userId, conversationId), JSON.stringify(updatedHistory))

        const raw = await redis.get(CONVS_KEY(userId))
        const convs: { id: string; title: string; updatedAt: string }[] =
          raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : []
        const existing = convs.find((c) => c.id === conversationId)
        const title = existing?.title ?? question.slice(0, 60)
        const updatedConvs = [
          { id: conversationId, title, updatedAt: new Date().toISOString() },
          ...convs.filter((c) => c.id !== conversationId),
        ]
        await redis.set(CONVS_KEY(userId), JSON.stringify(updatedConvs))

        controller.close()
      },
    })

    return new Response(readable, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    })
  } catch (err) {
    console.error("[/api/chat]", err)
    return NextResponse.json({ error: "Failed to get answer" }, { status: 500 })
  }
}
