/**
 * Controlled Retrieval Service
 * Conceptual Agent tools executing bounded, tenant-isolated queries
 * across notes, recordings, transcripts, files, speakers, and metadata.
 *
 * Rules:
 * - The LLM never accesses the database directly.
 * - Every operation requires and enforces userId tenant isolation.
 * - Scopes (this note, this folder, selected notes) are strictly enforced at this layer.
 */

import { hybridSearch, type SearchFilter, type SearchResult } from "@/lib/search"
import {
  NoteRepository,
  RecordingRepository,
  TranscriptRepository,
  SpeakerRepository,
  FolderRepository,
  AssetRepository,
} from "@/lib/db/repositories"
import type { Note, Recording, Speaker, TranscriptSegment } from "@/lib/db/schema"
import type { CandidateChunk, ParsedQuery, SearchScope } from "./types"

export class RetrievalService {
  /**
   * Primary hybrid search across all permitted user knowledge
   */
  async searchKnowledge(
    userId: string,
    query: string,
    filter: SearchFilter = {},
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return hybridSearch(userId, query, filter, limit, apiKey)
  }

  /**
   * Search notes only
   */
  async searchNotes(
    userId: string,
    query: string,
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { sourceType: "note" }, limit, apiKey)
  }

  /**
   * Search recordings and audio transcripts only
   */
  async searchRecordings(
    userId: string,
    query: string,
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { sourceType: "recording" }, limit, apiKey)
  }

  /**
   * Search transcripts by speaker
   */
  async searchBySpeaker(
    userId: string,
    speakerId: string,
    query = "",
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { speakerId }, limit, apiKey)
  }

  /**
   * Search within a specific folder
   */
  async searchByFolder(
    userId: string,
    folderId: string,
    query = "",
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { folderId }, limit, apiKey)
  }

  /**
   * Search by tag
   */
  async searchByTag(
    userId: string,
    tagId: string,
    query = "",
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { tagId }, limit, apiKey)
  }

  /**
   * Search by date window
   */
  async searchByDate(
    userId: string,
    startDate: string,
    endDate: string,
    query = "",
    limit = 10,
    apiKey?: string
  ): Promise<SearchResult[]> {
    return this.searchKnowledge(userId, query, { startDate, endDate }, limit, apiKey)
  }

  /**
   * Direct entity access methods (tenant scoped)
   */
  async getNote(userId: string, noteId: string): Promise<Note | null> {
    const note = await NoteRepository.getById(noteId, userId)
    if (!note || note.deleted_at) return null
    return note
  }

  async getRecording(
    userId: string,
    recordingId: string
  ): Promise<{ recording: Recording; segments: TranscriptSegment[] } | null> {
    const recording = await RecordingRepository.getById(recordingId, userId)
    if (!recording) return null
    const trans = await TranscriptRepository.getByRecording(recording.id)
    return { recording, segments: trans?.segments ?? [] }
  }

  async getSpeaker(userId: string, speakerId: string): Promise<Speaker | null> {
    const speakers = await SpeakerRepository.listByUser(userId)
    return speakers.find((s) => s.id === speakerId) ?? null
  }

  /**
   * High-level scoped search executing the complete retrieval plan
   */
  async executeScopedSearch(
    userId: string,
    parsed: ParsedQuery,
    apiKey?: string,
    limit = 15
  ): Promise<CandidateChunk[]> {
    const filter: SearchFilter = {}

    // Apply speaker filter
    if (parsed.speakerId) {
      filter.speakerId = parsed.speakerId
    }

    // Apply folder filter
    if (parsed.folderId) {
      filter.folderId = parsed.folderId
    }

    // Apply tag filter
    if (parsed.tagIds?.length) {
      filter.tagId = parsed.tagIds[0]
    }

    // Apply temporal date range
    if (parsed.dateRange) {
      filter.startDate = parsed.dateRange.startDate
      filter.endDate = parsed.dateRange.endDate
    }

    // Apply conceptual scope
    if (parsed.scope) {
      const scope = parsed.scope
      if (scope.type === "this_note" && scope.noteId) {
        // Enforce tenant authorization on target note
        const note = await this.getNote(userId, scope.noteId)
        if (!note) return []
        filter.noteId = scope.noteId
        filter.sourceType = "note"
      } else if (scope.type === "this_folder" && scope.folderId) {
        const folders = await FolderRepository.listByUser(userId)
        if (!folders.some((f) => f.id === scope.folderId)) return []
        filter.folderId = scope.folderId
      } else if (scope.type === "selected_notes" && scope.noteIds?.length) {
        filter.noteIds = scope.noteIds
      } else if (scope.type === "all_notes") {
        filter.sourceType = "note"
      } else if (scope.type === "all_recordings") {
        filter.sourceType = "recording"
      }
    } else if (parsed.sourceType) {
      filter.sourceType = parsed.sourceType
    }

    // Determine effective query text: prefer cleanQuery, fall back to originalQuery
    const hasFilter = Boolean(
      parsed.speakerId ||
      parsed.folderId ||
      parsed.tagIds?.length ||
      parsed.dateRange ||
      (parsed.scope && parsed.scope.type !== "everything")
    )
    const queryText = (parsed.cleanQuery === "" && hasFilter)
      ? ""
      : (parsed.cleanQuery || parsed.originalQuery)

    // Execute hybrid search
    const results = await this.searchKnowledge(userId, queryText, filter, limit, apiKey)

    // Enrich chunks with metadata
    const userSpeakers = await SpeakerRepository.listByUser(userId)
    const speakerMap = new Map(userSpeakers.map((s) => [s.id, s.name]))

    return results.map((r) => {
      const meta = (r.metadata || {}) as Record<string, any>
      const speakerName = r.speakerId
        ? speakerMap.get(r.speakerId) || meta.speakerName || null
        : meta.speakerName || null

      return {
        ...r,
        sourceType: (meta.sourceType as any) || "note",
        sourceId: meta.sourceId || r.documentId,
        title: meta.title || "Untitled",
        speakerName,
        createdAt: (meta.createdAt as string) || undefined,
        date: (meta.createdAt || meta.startedAt) as string | undefined,
      }
    })
  }
}

export const retrievalService = new RetrievalService()
