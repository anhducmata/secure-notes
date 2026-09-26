/**
 * Memory Agent Types & Interfaces
 * Core domain contracts for Query Understanding, Retrieval, Reranking,
 * Context Construction, Citation Validation, and Grounding.
 */

import type { KnowledgeSourceType, Note, Recording, Speaker, TranscriptSegment } from "@/lib/db/schema"
import type { SearchResult } from "@/lib/search"

export type ScopeType =
  | "this_note"
  | "this_folder"
  | "selected_notes"
  | "all_notes"
  | "all_recordings"
  | "everything"

export interface SearchScope {
  type: ScopeType
  noteId?: string
  noteIds?: string[]
  folderId?: string
}

export interface DateRange {
  startDate?: string // ISO string
  endDate?: string // ISO string
  label?: string
}

export interface ParsedQuery {
  originalQuery: string
  cleanQuery: string
  speakerId?: string
  speakerName?: string
  folderId?: string
  folderName?: string
  tagIds?: string[]
  tagNames?: string[]
  dateRange?: DateRange
  sourceType?: KnowledgeSourceType
  scope?: SearchScope
  isTemporal?: boolean
  properNouns?: string[]
}

export interface CandidateChunk extends SearchResult {
  sourceType: KnowledgeSourceType
  sourceId: string
  title: string
  speakerName?: string | null
  createdAt?: string
  date?: string
}

export interface RerankedChunk extends CandidateChunk {
  compositeScore: number
  scoreBreakdown: {
    baseRrfScore: number
    exactPhraseBoost: number
    properNounBoost: number
    speakerMatchBoost: number
    dateMatchBoost: number
    scopeMatchBoost: number
    sourceTypeBoost: number
  }
}

export interface VerifiedCitation {
  index: number
  sourceType: KnowledgeSourceType
  sourceId: string
  title: string
  startMs?: number | null
  endMs?: number | null
  timestamp?: string
  speakerId?: string | null
  speakerName?: string | null
  deepLink: string
  snippet: string
}

export interface ConversationState {
  lastQuery?: string
  referencedSourceIds: string[]
  referencedSpeakerIds: string[]
  referencedDates: string[]
  activeScope?: SearchScope
  lastTopic?: string
  updatedAt: number
}

export interface AgentMetrics {
  retrievalCount: number
  candidateCount: number
  contextCount: number
  llmCalled: boolean
  approximateTokens?: number
  latencyMs: number
}

export interface AgentResponse {
  answer: string
  citations: VerifiedCitation[]
  noEvidence: boolean
  metrics: AgentMetrics
  conversationState: ConversationState
  sources: Array<{
    title: string
    sourceType: KnowledgeSourceType
    sourceId: string
    timestamp?: string
    speakerName?: string
  }>
}
