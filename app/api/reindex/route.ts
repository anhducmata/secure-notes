/**
 * Developer & Admin Reindex API
 * Supports manual, forced, or full reindexing of notes, recordings, or all user content.
 *
 * Route: POST /api/reindex
 * Payload:
 * {
 *   "scope": "note" | "recording" | "user" | "all",
 *   "id"?: string,
 *   "force"?: boolean,
 *   "async"?: boolean
 * }
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { NoteRepository, RecordingRepository } from "@/lib/db/repositories"
import { processSource } from "@/lib/ingestion/pipeline"
import { knowledgeQueue } from "@/lib/ingestion/queue"

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = await req.json().catch(() => ({}))
    const { scope = "all", id, force = false, async: isAsync = false } = body

    const apiKey = req.headers.get("x-openai-key") || process.env.OPENAI_API_KEY
    const options = { force: Boolean(force), apiKey }

    const targets: Array<{ sourceType: "note" | "recording"; sourceId: string }> = []

    if (scope === "note") {
      if (id) {
        const note = await NoteRepository.getById(id, user.id)
        if (!note) {
          return NextResponse.json({ error: "Note not found or access denied" }, { status: 404 })
        }
        targets.push({ sourceType: "note", sourceId: id })
      } else {
        const notes = await NoteRepository.listByUser(user.id)
        for (const n of notes) {
          targets.push({ sourceType: "note", sourceId: n.id })
        }
      }
    } else if (scope === "recording") {
      if (id) {
        const rec = await RecordingRepository.getById(id, user.id)
        if (!rec) {
          return NextResponse.json({ error: "Recording not found or access denied" }, { status: 404 })
        }
        targets.push({ sourceType: "recording", sourceId: id })
      } else {
        const recs = await RecordingRepository.listByUser(user.id)
        for (const r of recs) {
          targets.push({ sourceType: "recording", sourceId: r.id })
        }
      }
    } else if (scope === "user" || scope === "all") {
      const notes = await NoteRepository.listByUser(user.id)
      for (const n of notes) {
        targets.push({ sourceType: "note", sourceId: n.id })
      }
      const recs = await RecordingRepository.listByUser(user.id)
      for (const r of recs) {
        targets.push({ sourceType: "recording", sourceId: r.id })
      }
    } else {
      return NextResponse.json({ error: `Unsupported scope: ${scope}` }, { status: 400 })
    }

    if (isAsync) {
      const queuedJobs = targets.map((t) =>
        knowledgeQueue.enqueue({
          userId: user.id,
          sourceType: t.sourceType,
          sourceId: t.sourceId,
          options,
        })
      )
      return NextResponse.json({
        success: true,
        mode: "async",
        queuedCount: queuedJobs.filter((j) => j.queued).length,
        targetsCount: targets.length,
      })
    }

    // Synchronous execution
    let processed = 0
    let cached = 0
    let failed = 0
    const results = []

    for (const t of targets) {
      const res = await processSource(user.id, t.sourceType, t.sourceId, options)
      if (res.success) {
        if (res.cached) cached++
        else processed++
      } else {
        failed++
      }
      results.push({
        sourceType: t.sourceType,
        sourceId: t.sourceId,
        ...res,
      })
    }

    return NextResponse.json({
      success: true,
      mode: "sync",
      total: targets.length,
      processed,
      cached,
      failed,
      results,
    })
  } catch (err: any) {
    console.error("[/api/reindex POST]", err)
    return NextResponse.json({ error: "Reindexing failed", message: err?.message }, { status: 500 })
  }
}
