/**
 * Hybrid Search Engine
 * Combines Full-Text Search (BM25 / FTS5) with Semantic Vector Embeddings
 * using Reciprocal Rank Fusion (RRF), with filters for folders, tags, speakers, and dates.
 */

import { KnowledgeRepository } from "@/lib/db/repositories"
import { cosineSimilarity, generateEmbeddings } from "@/lib/ingestion/chunker"
import type { KnowledgeChunk } from "@/lib/db/schema"

export interface SearchFilter {
  folderId?: string
  tagId?: string
  speakerId?: string
  sourceType?: "note" | "recording" | "asset"
  noteId?: string
  noteIds?: string[]
  startDate?: string
  endDate?: string
}

export interface SearchResult {
  chunkId: string
  documentId: string
  content: string
  startMs?: number | null
  endMs?: number | null
  speakerId?: string | null
  score: number
  ftsRank?: number
  vectorRank?: number
  metadata: Record<string, unknown>
}

const RRF_K = 60

/**
 * Executes a hybrid search combining keyword and vector retrieval
 */
export async function hybridSearch(
  userId: string,
  query: string,
  filter: SearchFilter = {},
  limit = 10,
  apiKey?: string
): Promise<SearchResult[]> {
  const trimmed = query.trim()
  const hasFilter = Boolean(
    filter.folderId ||
    filter.tagId ||
    filter.speakerId ||
    filter.sourceType ||
    filter.noteId ||
    (filter.noteIds && filter.noteIds.length > 0) ||
    filter.startDate ||
    filter.endDate
  )

  if (!trimmed) {
    if (!hasFilter) return []

    const allUserChunks = await KnowledgeRepository.getAllChunksForUser(userId)
    const results: SearchResult[] = []

    for (const chunk of allUserChunks) {
      const meta = (chunk.metadata || {}) as Record<string, any>

      if (filter.folderId && meta.folderId !== filter.folderId) continue
      if (filter.tagId && (!meta.tags || !meta.tags.includes(filter.tagId))) continue
      if (filter.speakerId && chunk.speaker_id !== filter.speakerId) continue
      if (filter.sourceType && meta.sourceType !== filter.sourceType) continue
      if (filter.noteId && (meta.sourceId !== filter.noteId || meta.sourceType !== "note")) continue
      if (filter.noteIds && filter.noteIds.length > 0 && (!meta.sourceId || !filter.noteIds.includes(meta.sourceId))) continue

      if (filter.startDate || filter.endDate) {
        const dateStr = (meta.date || meta.startedAt || meta.createdAt || chunk.created_at) as string | undefined
        if (dateStr) {
          const time = new Date(dateStr).getTime()
          if (filter.startDate && time < new Date(filter.startDate).getTime()) continue
          if (filter.endDate && time > new Date(filter.endDate).getTime()) continue
        }
      }

      results.push({
        chunkId: chunk.id,
        documentId: chunk.knowledge_document_id,
        content: chunk.content,
        startMs: chunk.start_ms,
        endMs: chunk.end_ms,
        speakerId: chunk.speaker_id,
        score: 1.0,
        metadata: meta,
      })
    }

    return results.slice(0, limit)
  }

  // 1. Keyword Full-Text Search
  const keywordChunks = await KnowledgeRepository.searchChunksKeyword(userId, trimmed, 30)

  // 2. Vector Semantic Search
  const allUserChunks = await KnowledgeRepository.getAllChunksForUser(userId)
  let vectorRankedChunks: { chunk: KnowledgeChunk; sim: number }[] = []

  if (allUserChunks.length > 0) {
    try {
      const [queryEmbedding] = await generateEmbeddings([trimmed], apiKey)
      if (queryEmbedding && queryEmbedding.length > 0) {
        vectorRankedChunks = allUserChunks
          .filter((c) => c.embedding && c.embedding.length > 0)
          .map((c) => ({
            chunk: c,
            sim: cosineSimilarity(queryEmbedding, c.embedding!),
          }))
          .filter(({ sim }) => sim >= 0.22)
          .sort((a, b) => b.sim - a.sim)
          .slice(0, 30)
      }
    } catch (err) {
      console.warn("[hybridSearch] vector embedding failed, continuing with keyword search:", err)
    }
  }

  // 3. Reciprocal Rank Fusion (RRF)
  const scoreMap = new Map<
    string,
    {
      chunk: KnowledgeChunk
      score: number
      ftsRank?: number
      vectorRank?: number
    }
  >()

  // Add FTS scores
  keywordChunks.forEach((chunk, idx) => {
    const rank = idx + 1
    const rrf = 1 / (RRF_K + rank)
    scoreMap.set(chunk.id, {
      chunk,
      score: rrf,
      ftsRank: rank,
    })
  })

  // Add Vector scores
  vectorRankedChunks.forEach(({ chunk }, idx) => {
    const rank = idx + 1
    const rrf = 1 / (RRF_K + rank)
    if (scoreMap.has(chunk.id)) {
      const existing = scoreMap.get(chunk.id)!
      existing.score += rrf
      existing.vectorRank = rank
    } else {
      scoreMap.set(chunk.id, {
        chunk,
        score: rrf,
        vectorRank: rank,
      })
    }
  })

  // 4. Apply Filters (folder, tag, speaker, source, note, date)
  const results: SearchResult[] = []

  for (const entry of scoreMap.values()) {
    const chunk = entry.chunk
    const meta = (chunk.metadata || {}) as Record<string, any>

    if (filter.folderId && meta.folderId !== filter.folderId) continue
    if (filter.tagId && (!meta.tags || !meta.tags.includes(filter.tagId))) continue
    if (filter.speakerId && chunk.speaker_id !== filter.speakerId) continue
    if (filter.sourceType && meta.sourceType !== filter.sourceType) continue
    if (filter.noteId && (meta.sourceId !== filter.noteId || meta.sourceType !== "note")) continue
    if (filter.noteIds && filter.noteIds.length > 0 && (!meta.sourceId || !filter.noteIds.includes(meta.sourceId))) continue

    if (filter.startDate || filter.endDate) {
      const dateStr = (meta.date || meta.startedAt || meta.createdAt || chunk.created_at) as string | undefined
      if (dateStr) {
        const time = new Date(dateStr).getTime()
        if (filter.startDate && time < new Date(filter.startDate).getTime()) continue
        if (filter.endDate && time > new Date(filter.endDate).getTime()) continue
      }
    }

    results.push({
      chunkId: chunk.id,
      documentId: chunk.knowledge_document_id,
      content: chunk.content,
      startMs: chunk.start_ms,
      endMs: chunk.end_ms,
      speakerId: chunk.speaker_id,
      score: entry.score,
      ftsRank: entry.ftsRank,
      vectorRank: entry.vectorRank,
      metadata: meta,
    })
  }

  return results.sort((a, b) => b.score - a.score).slice(0, limit)
}
