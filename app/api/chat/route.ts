/**
 * AI Memory Agent (Find, Understand, Connect, Recall)
 * Performs hybrid retrieval (BM25 + pgvector via RRF) across notes, audio transcripts,
 * and attached documents, citing exact note IDs and audio timestamps.
 */

import { NextRequest, NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { getAuthenticatedUser } from "@/lib/auth"
import { hybridSearch } from "@/lib/search"
import { SpeakerRepository } from "@/lib/db/repositories"
import { formatMsToTime } from "@/lib/ingestion/markdown-generator"
import { parseDocx } from "@/lib/ingestion/docx"
import { parseCsv } from "@/lib/ingestion/csv"
import { extractTextFromImage } from "@/lib/ingestion/ocr"
import OpenAI, { toFile } from "openai"
import { CONVS_KEY, CONV_KEY } from "@/lib/chat-keys"
import { memoryAgent } from "@/lib/agent"

function getClient(provider: "openai" | "deepseek", reqHeaders: Headers) {
  if (provider === "deepseek") {
    return new OpenAI({
      apiKey: reqHeaders.get("x-deepseek-key") || process.env.DEEPSEEK_API_KEY || "dummy-key",
      baseURL: "https://api.deepseek.com",
    })
  }
  return new OpenAI({
    apiKey: reqHeaders.get("x-openai-key") || process.env.OPENAI_API_KEY || "dummy-key",
  })
}

function clientForModel(model: string, reqHeaders: Headers) {
  return model.startsWith("deepseek") ? getClient("deepseek", reqHeaders) : getClient("openai", reqHeaders)
}

/**
 * Extracts content from attached files using open-source parsers (DOCX, CSV, OCR)
 */
async function processAttachments(files: File[], reqHeaders: Headers): Promise<string> {
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
        const result = await getClient("openai", reqHeaders).audio.transcriptions.create({
          file: openaiFile,
          model: "whisper-1",
        })
        parts.push(`[Audio file: ${name}]\nTranscript:\n${result.text}`)
      } catch (e) {
        parts.push(`[Audio file: ${name}]\n(Transcription failed)`)
      }
    } else if (name.endsWith(".docx")) {
      try {
        const ab = await file.arrayBuffer()
        const parsed = parseDocx(Buffer.from(ab))
        parts.push(`[DOCX Document: ${name}]\n${parsed.markdown.slice(0, 5000)}`)
      } catch (e) {
        parts.push(`[DOCX Document: ${name}]\n(Parsing failed)`)
      }
    } else if (name.endsWith(".csv") || mime === "text/csv") {
      try {
        const text = await file.text()
        const parsed = parseCsv(text, 100)
        parts.push(`[CSV Data Table: ${name}]\n${parsed.markdownTable}`)
      } catch (e) {
        parts.push(`[CSV Table: ${name}]\n(Parsing failed)`)
      }
    } else if (mime.startsWith("image/")) {
      try {
        const ab = await file.arrayBuffer()
        const ocr = await extractTextFromImage(Buffer.from(ab), mime)
        parts.push(`[Image: ${name} (OCR: ${ocr.engine})]\n${ocr.text}`)
      } catch (e) {
        parts.push(`[Image: ${name}]\n(OCR extraction failed)`)
      }
    } else {
      try {
        const text = await file.text()
        parts.push(`[Text file: ${name}]\n${text.slice(0, 4000)}`)
      } catch (e) {
        parts.push(`[File: ${name}]\n(Could not read content)`)
      }
    }
  }

  return parts.join("\n\n")
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    let question: string,
      conversationHistory: { role: "user" | "assistant"; content: string; citations?: unknown[] }[],
      conversationId: string,
      files: File[],
      selectedModel: string,
      scopeInput: any = undefined

    const contentType = req.headers.get("content-type") ?? ""
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData()
      question = (form.get("question") as string) ?? ""
      conversationHistory = JSON.parse((form.get("conversationHistory") as string) ?? "[]")
      conversationId = (form.get("conversationId") as string) ?? ""
      selectedModel = (form.get("model") as string) ?? "gpt-5.5"
      files = form.getAll("files") as File[]
      const rawScope = form.get("scope") as string | null
      if (rawScope) {
        try {
          scopeInput = JSON.parse(rawScope)
        } catch {}
      }
    } else {
      const body = await req.json()
      question = body.question
      conversationHistory = body.conversationHistory || []
      conversationId = body.conversationId || ""
      selectedModel = body.model ?? "gpt-5.5"
      files = []
      scopeInput = body.scope
    }

    if (!conversationId) {
      conversationId = `conv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    }

    const cleanHistory = conversationHistory.map(({ role, content }) => ({ role, content }))

    // Process any attached query files
    const attachmentContext = await processAttachments(files, req.headers)
    const effectiveQuestion = attachmentContext ? `${attachmentContext}\n\nUser Question:\n${question}` : question

    const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY
    const deepseekApiKey = req.headers.get("x-deepseek-key") || process.env.DEEPSEEK_API_KEY
    const provider = selectedModel.startsWith("deepseek") ? "deepseek" : "openai"

    const stream = memoryAgent.streamQuery(user.id, effectiveQuestion, {
      scope: scopeInput,
      conversationHistory: cleanHistory,
      apiKey,
      deepseekApiKey,
      provider,
      model: selectedModel,
    })

    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let fullAnswer = ""
        let verifiedCitations: any[] = []

        try {
          for await (const chunk of stream) {
            if (chunk.delta) {
              fullAnswer += chunk.delta
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ delta: chunk.delta })}\n\n`))
            }
            if (chunk.done) {
              verifiedCitations = chunk.citations || []
            }
            if (chunk.error) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true })}\n\n`))
              controller.close()
              return
            }
          }
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: true })}\n\n`))
          controller.close()
          return
        }

        // Format citations for client compatibility
        const clientCitations = verifiedCitations.map((c) => ({
          index: c.index,
          title: c.title,
          noteId: c.sourceId,
          sourceType: c.sourceType,
          sourceId: c.sourceId,
          timestamp: c.timestamp,
          startMs: c.startMs,
          endMs: c.endMs,
          speaker: c.speakerName,
          speakerName: c.speakerName,
          deepLink: c.deepLink,
          snippet: c.snippet,
        }))

        // Send citations in final event
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, citations: clientCitations })}\n\n`))

        // Persist conversation
        const updatedHistory = [
          ...conversationHistory,
          { role: "user" as const, content: question },
          { role: "assistant" as const, content: fullAnswer, citations: clientCitations },
        ]
        await redis.set(CONV_KEY(user.email, conversationId), JSON.stringify(updatedHistory))

        const raw = await redis.get(CONVS_KEY(user.email))
        const convs: { id: string; title: string; updatedAt: string }[] = raw
          ? typeof raw === "string"
            ? JSON.parse(raw)
            : raw
          : []
        const existing = convs.find((c) => c.id === conversationId)
        const title = existing?.title ?? question.slice(0, 60)
        const updatedConvs = [
          { id: conversationId, title, updatedAt: new Date().toISOString() },
          ...convs.filter((c) => c.id !== conversationId),
        ]
        await redis.set(CONVS_KEY(user.email), JSON.stringify(updatedConvs))

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
    return NextResponse.json({ error: "Failed to process chat query" }, { status: 500 })
  }
}
