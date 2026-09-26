/**
 * Citation Service & Database Validator
 *
 * Guarantees:
 * - Structured citation objects with deep links (note:// or recording://?t=)
 * - Strict database verification:
 *   1. Source entity exists in DB
 *   2. Source belongs to the authenticated user (tenant isolation)
 *   3. Note is not soft-deleted (deleted_at IS NULL)
 *   4. Recording exists and timestamps are within valid bounds (0 <= startMs <= durationMs)
 *   5. Speaker exists in user's speakers table if referenced
 * - Strips any citations that fail verification or point to unresolved sources.
 */

import {
  NoteRepository,
  RecordingRepository,
  SpeakerRepository,
  AssetRepository,
} from "@/lib/db/repositories"
import { formatMsToTime } from "@/lib/ingestion/markdown-generator"
import type { RerankedChunk, VerifiedCitation } from "./types"

export class CitationService {
  /**
   * Extracts bracketed citation indexes (e.g. [1], [2]) from answer text
   */
  extractReferencedIndexes(answerText: string): number[] {
    const matches = answerText.matchAll(/\[(\d+)\]/g)
    const indexes = new Set<number>()
    for (const m of matches) {
      const idx = parseInt(m[1], 10)
      if (!isNaN(idx) && idx > 0) {
        indexes.add(idx)
      }
    }
    return Array.from(indexes)
  }

  /**
   * Validates each candidate citation against the relational database and user ownership
   */
  async validateCitations(
    userId: string,
    candidates: RerankedChunk[],
    referencedIndexes?: number[]
  ): Promise<VerifiedCitation[]> {
    // If specific indexes were referenced by the LLM, prioritize them;
    // otherwise validate all candidate chunks.
    const chunksToValidate = referencedIndexes && referencedIndexes.length > 0
      ? candidates.filter((_, idx) => referencedIndexes.includes(idx + 1))
      : candidates

    const verified: VerifiedCitation[] = []

    for (const chunk of chunksToValidate) {
      const isValid = await this.verifyChunkProvenance(userId, chunk)
      if (!isValid) {
        console.warn(`[CitationService] Dropping unverified citation for source: ${chunk.sourceType}/${chunk.sourceId}`)
        continue
      }

      // Format deep link
      let deepLink = ""
      let timestampStr: string | undefined

      if (chunk.sourceType === "recording") {
        const start = chunk.startMs ?? 0
        deepLink = `recording://${chunk.sourceId}?t=${start}`
        timestampStr = formatMsToTime(start)
      } else if (chunk.sourceType === "note") {
        deepLink = `note://${chunk.sourceId}`
      } else {
        deepLink = `asset://${chunk.sourceId}`
      }

      verified.push({
        index: verified.length + 1,
        sourceType: chunk.sourceType,
        sourceId: chunk.sourceId,
        title: chunk.title,
        startMs: chunk.startMs,
        endMs: chunk.endMs,
        timestamp: timestampStr,
        speakerId: chunk.speakerId,
        speakerName: chunk.speakerName,
        deepLink,
        snippet: chunk.content.slice(0, 200).trim(),
      })
    }

    return verified
  }

  /**
   * Verifies source entity existence, ownership, soft-delete status, and timestamp validity
   */
  private async verifyChunkProvenance(userId: string, chunk: RerankedChunk): Promise<boolean> {
    try {
      if (chunk.sourceType === "note") {
        const note = await NoteRepository.getById(chunk.sourceId, userId)
        if (!note || note.deleted_at !== null) {
          return false // Note does not exist, belongs to another user, or is soft-deleted
        }
        return true
      }

      if (chunk.sourceType === "recording") {
        const rec = await RecordingRepository.getById(chunk.sourceId, userId)
        if (!rec) return false // Recording does not exist or belongs to another user

        // Verify audio timestamp bounds
        if (chunk.startMs !== null && chunk.startMs !== undefined) {
          if (chunk.startMs < 0) return false
          if (chunk.endMs !== null && chunk.endMs !== undefined && chunk.endMs < chunk.startMs) {
            return false
          }
          if (rec.duration_ms > 0 && chunk.startMs > rec.duration_ms + 1000) {
            return false // Timestamp exceeds recording duration
          }
        }

        // Verify speaker if referenced
        if (chunk.speakerId) {
          const userSpeakers = await SpeakerRepository.listByUser(userId)
          const speakerExists = userSpeakers.some((s) => s.id === chunk.speakerId)
          if (!speakerExists) return false
        }

        return true
      }

      if (chunk.sourceType === "asset") {
        const asset = await AssetRepository.getById(chunk.sourceId, userId)
        if (!asset) return false
        return true
      }

      return false
    } catch {
      return false
    }
  }
}

export const citationService = new CitationService()
