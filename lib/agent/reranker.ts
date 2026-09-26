/**
 * Deterministic Candidate Reranker
 * Rescores hybrid search candidates using explicit domain signals:
 * - Base RRF score
 * - Exact phrase match bonus
 * - Proper noun and technical term overlap
 * - Target speaker alignment
 * - Temporal recency / date window alignment
 * - Scope and source type alignment
 */

import type { CandidateChunk, ParsedQuery, RerankedChunk } from "./types"

export function rerankCandidates(
  candidates: CandidateChunk[],
  parsed: ParsedQuery,
  limit = 8
): RerankedChunk[] {
  if (candidates.length === 0) return []

  const cleanLower = (parsed.cleanQuery || "").toLowerCase()
  const origLower = parsed.originalQuery.toLowerCase()
  const properNouns = parsed.properNouns || []

  const scored: RerankedChunk[] = candidates.map((chunk) => {
    const contentLower = chunk.content.toLowerCase()
    const titleLower = chunk.title.toLowerCase()

    // 1. Base Score (normalized RRF score)
    const baseRrfScore = chunk.score

    // 2. Exact Phrase Match Boost
    let exactPhraseBoost = 0
    if (cleanLower.length > 3 && (contentLower.includes(cleanLower) || titleLower.includes(cleanLower))) {
      exactPhraseBoost = 0.30
    }

    // 3. Proper Noun / Technical Term Overlap Boost
    let properNounBoost = 0
    if (properNouns.length > 0) {
      let matchedCount = 0
      for (const pn of properNouns) {
        const pnLower = pn.toLowerCase()
        if (contentLower.includes(pnLower) || titleLower.includes(pnLower)) {
          matchedCount++
        }
      }
      if (matchedCount > 0) {
        properNounBoost = Math.min(0.25, matchedCount * 0.15)
      }
    }

    // 4. Speaker Alignment Boost
    let speakerMatchBoost = 0
    if (parsed.speakerId && chunk.speakerId === parsed.speakerId) {
      speakerMatchBoost = 0.25
    } else if (parsed.speakerName && chunk.speakerName?.toLowerCase().includes(parsed.speakerName.toLowerCase())) {
      speakerMatchBoost = 0.20
    }

    // 5. Date Window Alignment Boost
    let dateMatchBoost = 0
    if (parsed.dateRange?.startDate && chunk.date) {
      const chunkTime = new Date(chunk.date).getTime()
      const startTime = new Date(parsed.dateRange.startDate).getTime()
      const endTime = parsed.dateRange.endDate ? new Date(parsed.dateRange.endDate).getTime() : Date.now()
      if (chunkTime >= startTime && chunkTime <= endTime) {
        dateMatchBoost = 0.20
      }
    }

    // 6. Scope Alignment Boost
    let scopeMatchBoost = 0
    if (parsed.scope?.type === "this_note" && parsed.scope.noteId === chunk.sourceId) {
      scopeMatchBoost = 0.25
    } else if (parsed.folderId && (chunk.metadata as any)?.folderId === parsed.folderId) {
      scopeMatchBoost = 0.15
    }

    // 7. Source Type Boost
    let sourceTypeBoost = 0
    if (parsed.sourceType && chunk.sourceType === parsed.sourceType) {
      sourceTypeBoost = 0.10
    }

    const compositeScore =
      baseRrfScore +
      exactPhraseBoost +
      properNounBoost +
      speakerMatchBoost +
      dateMatchBoost +
      scopeMatchBoost +
      sourceTypeBoost

    return {
      ...chunk,
      compositeScore,
      scoreBreakdown: {
        baseRrfScore,
        exactPhraseBoost,
        properNounBoost,
        speakerMatchBoost,
        dateMatchBoost,
        scopeMatchBoost,
        sourceTypeBoost,
      },
    }
  })

  // Sort descending by composite score
  scored.sort((a, b) => b.compositeScore - a.compositeScore)
  return scored.slice(0, limit)
}
