/**
 * Deterministic Knowledge Pipeline
 * Pipeline lifecycle:
 * SOURCE -> CONTENT EXTRACTION -> STRUCTURED KNOWLEDGE -> KNOWLEDGE MARKDOWN -> CHUNKING -> EMBEDDING -> SEARCH INDEX
 *
 * Guarantees:
 * - Deterministic, idempotent processing
 * - SHA-256 checksum caching (skips chunking & embeddings on unchanged content)
 * - Atomic index replacement (embedding generation outside TX, DB write inside TX)
 * - Concurrency & race protection (aborts if source deleted or modified during embedding)
 * - Observability logging without leaking user note content or secrets
 */

import crypto from "crypto"
import {
  NoteRepository,
  KnowledgeRepository,
  FolderRepository,
  RecordingRepository,
  TranscriptRepository,
  SpeakerRepository,
  AssetRepository,
} from "@/lib/db/repositories"
import type {
  KnowledgeDocument,
  KnowledgeSourceType,
  TranscriptSegment,
} from "@/lib/db/schema"
import { generateKnowledgeMarkdown, formatMsToTime } from "./markdown-generator"
import { chunkDocument, generateEmbeddings, type ChunkMetadata } from "./chunker"

export interface ProcessSourceOptions {
  force?: boolean
  apiKey?: string
  checkVersion?: string
  simulateFailure?: boolean
}

export interface ProcessResult {
  success: boolean
  cached?: boolean
  aborted?: boolean
  reason?: string
  documentId?: string
  chunksCount?: number
  checksum?: string
  error?: string
}

export interface PipelineLogData {
  event: string
  sourceType: string
  sourceId: string
  durationMs?: number
  chunksCount?: number
  status?: string
  reason?: string
  error?: string
  checksum?: string
}

/**
 * Structured observability logger (safe: no content or secrets logged)
 */
export function pipelineLog(data: PipelineLogData): void {
  const logObj = {
    timestamp: new Date().toISOString(),
    pipeline: "knowledge",
    ...data,
  }
  console.log(`[Pipeline] ${logObj.event}: ${logObj.sourceType}/${logObj.sourceId} - ${JSON.stringify(logObj)}`)
}

/**
 * Executes the full deterministic knowledge pipeline for a source entity
 */
export async function processSource(
  userId: string,
  sourceType: KnowledgeSourceType,
  sourceId: string,
  options: ProcessSourceOptions = {}
): Promise<ProcessResult> {
  const startTime = Date.now()

  // ─── 1. Content Extraction & Structured Knowledge Generation ───────────────
  let markdown = ""
  let initialVersion: string | null = null
  let sourceTitle = "Untitled"
  let folderId: string | null | undefined = null
  let tags: string[] = []
  let sourceDate: string | undefined = undefined
  let recordingStartedAt: string | undefined = undefined

  if (sourceType === "note") {
    const note = await NoteRepository.getById(sourceId, userId)
    if (!note || note.deleted_at) {
      await KnowledgeRepository.deleteBySource("note", sourceId, userId)
      pipelineLog({
        event: "source_deleted_or_missing",
        sourceType,
        sourceId,
        status: "skipped",
        reason: "note_deleted_or_missing",
      })
      return { success: false, reason: "source_deleted_or_missing" }
    }

    initialVersion = options.checkVersion ?? note.updated_at
    sourceTitle = note.title
    folderId = note.folder_id
    sourceDate = note.created_at

    const noteTags = await NoteRepository.getTagsForNote(note.id)
    const tagNames = noteTags.map((t) => t.name)
    tags = [...tagNames, ...noteTags.map((t) => t.id)]

    let folderName: string | undefined
    if (note.folder_id) {
      const folders = await FolderRepository.listByUser(userId)
      folderName = folders.find((f) => f.id === note.folder_id)?.name
    }

    const recordings = await RecordingRepository.listByNote(note.id, userId)
    const transcriptsData: Array<{ recordingTitle: string; segments: TranscriptSegment[] }> = []
    for (const rec of recordings) {
      const trans = await TranscriptRepository.getByRecording(rec.id)
      if (trans) {
        transcriptsData.push({
          recordingTitle: rec.title,
          segments: trans.segments,
        })
      }
    }

    const userSpeakers = await SpeakerRepository.listByUser(userId)
    const speakerMap = new Map(userSpeakers.map((s) => [s.id, s]))

    // Build Knowledge Markdown
    markdown = generateKnowledgeMarkdown({
      note,
      tags: tagNames,
      folderName,
      transcripts: transcriptsData,
      speakers: speakerMap,
    })
  } else if (sourceType === "recording") {
    const recording = await RecordingRepository.getById(sourceId, userId)
    if (!recording) {
      await KnowledgeRepository.deleteBySource("recording", sourceId, userId)
      pipelineLog({
        event: "source_deleted_or_missing",
        sourceType,
        sourceId,
        status: "skipped",
        reason: "recording_missing",
      })
      return { success: false, reason: "source_deleted_or_missing" }
    }

    initialVersion = recording.created_at
    sourceTitle = recording.title
    sourceDate = recording.started_at || recording.created_at
    recordingStartedAt = recording.started_at

    const transData = await TranscriptRepository.getByRecording(recording.id)
    const userSpeakers = await SpeakerRepository.listByUser(userId)
    const speakerMap = new Map(userSpeakers.map((s) => [s.id, s]))
    const segments = transData?.segments ?? []

    const speakerNames = new Set<string>()
    for (const seg of segments) {
      if (seg.speaker_id) {
        const spk = speakerMap.get(seg.speaker_id)
        speakerNames.add(spk ? spk.name : seg.speaker_id)
      }
    }

    const frontmatter = [
      "---",
      `id: "${recording.id}"`,
      `title: ${JSON.stringify(recording.title)}`,
      `source_type: "recording"`,
      `started_at: "${recording.started_at}"`,
      `duration_ms: ${recording.duration_ms}`,
    ]
    if (speakerNames.size > 0) {
      frontmatter.push(`speakers: [${Array.from(speakerNames).map((n) => JSON.stringify(n)).join(", ")}]`)
    }
    frontmatter.push("---")

    const dialogueLines = segments.map((seg) => {
      const spk = seg.speaker_id ? speakerMap.get(seg.speaker_id)?.name || seg.speaker_id : "Speaker"
      const time = `[${formatMsToTime(seg.start_ms)} – ${formatMsToTime(seg.end_ms)}]`
      const spkIdTag = seg.speaker_id ? ` <!-- spk_id:${seg.speaker_id} -->` : ""
      return `**${spk}** ${time}${spkIdTag}:\n${seg.text.trim()}`
    })

    markdown = [
      frontmatter.join("\n"),
      `# Recording: ${recording.title}`,
      dialogueLines.length > 0 ? dialogueLines.join("\n\n") : "*(No speech recorded)*",
    ].join("\n\n").trim()
  } else if (sourceType === "asset") {
    const asset = await AssetRepository.getById(sourceId, userId)
    if (!asset) {
      await KnowledgeRepository.deleteBySource("asset", sourceId, userId)
      return { success: false, reason: "source_deleted_or_missing" }
    }
    initialVersion = asset.created_at
    sourceTitle = asset.filename
    sourceDate = asset.created_at
    markdown = `# Asset: ${asset.filename}\n\nType: ${asset.type}`
  } else {
    return { success: false, reason: `unsupported_source_type: ${sourceType}` }
  }

  // ─── 2. Deterministic Checksum & Caching Check ──────────────────────────────
  const checksum = crypto.createHash("sha256").update(markdown).digest("hex")
  const existingDoc = await KnowledgeRepository.getDocumentBySource(sourceType, sourceId, userId)
  const docId = existingDoc?.id || (sourceType === "note" ? `kdoc_${sourceId}` : `kdoc_${sourceType}_${sourceId}`)

  if (
    existingDoc &&
    existingDoc.checksum === checksum &&
    existingDoc.status === "completed" &&
    !options.force
  ) {
    pipelineLog({
      event: "cache_hit",
      sourceType,
      sourceId,
      status: "completed",
      reason: "checksum_identical",
      checksum,
    })
    return {
      success: true,
      cached: true,
      documentId: existingDoc.id,
      checksum,
    }
  }

  // ─── 3. Record In-Progress State ───────────────────────────────────────────
  const startedAt = new Date().toISOString()
  const attemptCount = (existingDoc?.attempt_count ?? 0) + 1

  await KnowledgeRepository.upsertDocument({
    id: docId,
    user_id: userId,
    source_type: sourceType,
    source_id: sourceId,
    content: markdown,
    checksum,
    status: "processing",
    error_message: null,
    attempt_count: attemptCount,
    source_version: initialVersion,
    started_at: startedAt,
  })

  pipelineLog({
    event: "processing_started",
    sourceType,
    sourceId,
    status: "processing",
  })

  // ─── 4. Chunking & Embeddings (Outside Transaction) ────────────────────────
  try {
    if (options.simulateFailure) {
      throw new Error("Simulated processing failure during embedding generation")
    }

    const chunkMetadata: ChunkMetadata = {
      title: sourceTitle,
      sourceType,
      sourceId,
      folderId,
      tags,
      date: sourceDate,
      startedAt: recordingStartedAt,
      createdAt: sourceDate,
    }

    const chunks = chunkDocument(docId, markdown, chunkMetadata)
    const embeddings = await generateEmbeddings(
      chunks.map((c) => c.content),
      options.apiKey
    )

    // ─── 5. Concurrency & Race Checks ────────────────────────────────────────
    if (sourceType === "note") {
      const currentNote = await NoteRepository.getById(sourceId, userId)
      // Check if note was deleted while embeddings were being generated
      if (!currentNote || currentNote.deleted_at) {
        await KnowledgeRepository.deleteBySource("note", sourceId, userId)
        pipelineLog({
          event: "delete_during_index_abort",
          sourceType,
          sourceId,
          status: "aborted",
          reason: "source_deleted_during_processing",
        })
        return {
          success: false,
          aborted: true,
          reason: "source_deleted_during_processing",
        }
      }

      // Check if note updated during embedding generation
      if (initialVersion && currentNote.updated_at !== initialVersion) {
        pipelineLog({
          event: "version_race_abort",
          sourceType,
          sourceId,
          status: "aborted",
          reason: "source_version_changed_during_processing",
        })
        return {
          success: false,
          aborted: true,
          reason: "source_version_changed_during_processing",
        }
      }
    } else if (sourceType === "recording") {
      const currentRec = await RecordingRepository.getById(sourceId, userId)
      if (!currentRec) {
        await KnowledgeRepository.deleteBySource("recording", sourceId, userId)
        pipelineLog({
          event: "delete_during_index_abort",
          sourceType,
          sourceId,
          status: "aborted",
          reason: "source_deleted_during_processing",
        })
        return {
          success: false,
          aborted: true,
          reason: "source_deleted_during_processing",
        }
      }
    }

    // ─── 6. Atomic DB Replacement (Single Transaction) ───────────────────────
    const completedAt = new Date().toISOString()
    const fullDoc: KnowledgeDocument = {
      id: docId,
      user_id: userId,
      source_type: sourceType,
      source_id: sourceId,
      content: markdown,
      checksum,
      status: "completed",
      error_message: null,
      attempt_count: attemptCount,
      source_version: initialVersion,
      embedding_model: "text-embedding-3-small",
      embedding_version: "v1",
      started_at: startedAt,
      completed_at: completedAt,
      created_at: existingDoc?.created_at || startedAt,
      updated_at: completedAt,
    }

    const chunksToInsert = chunks.map((c, i) => ({
      id: c.id,
      knowledge_document_id: docId,
      user_id: userId,
      content: c.content,
      start_ms: c.startMs,
      end_ms: c.endMs,
      speaker_id: c.speakerId,
      embedding: embeddings[i] || null,
      metadata: c.metadata,
    }))

    await KnowledgeRepository.atomicReplaceChunks(fullDoc, chunksToInsert)

    const durationMs = Date.now() - startTime
    pipelineLog({
      event: "completed",
      sourceType,
      sourceId,
      durationMs,
      chunksCount: chunksToInsert.length,
      status: "completed",
      checksum,
    })

    return {
      success: true,
      documentId: docId,
      chunksCount: chunksToInsert.length,
      checksum,
    }
  } catch (err: any) {
    const errMsg = err?.message || String(err)
    await KnowledgeRepository.updateStatus(docId, "failed", errMsg, {
      completed_at: new Date().toISOString(),
    })
    pipelineLog({
      event: "failed",
      sourceType,
      sourceId,
      status: "failed",
      error: errMsg,
    })
    return {
      success: false,
      error: errMsg,
      documentId: docId,
    }
  }
}
