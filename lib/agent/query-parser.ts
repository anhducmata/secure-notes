/**
 * Deterministic Query Understanding & Parser
 * Analyzes natural language questions to extract:
 * - Speaker identities (matching against user's speaker repository)
 * - Folder filters (matching against user's folder hierarchy)
 * - Tag filters (matching against user's tags)
 * - Temporal ranges (last month, yesterday, specific months/years)
 * - Source type preferences (notes vs recordings vs files)
 * - Proper nouns and key search terms
 * - Scopes (this note, this folder, global)
 */

import { SpeakerRepository, FolderRepository, TagRepository } from "@/lib/db/repositories"
import type { ParsedQuery, SearchScope, DateRange } from "./types"

export interface ParseQueryOptions {
  activeScope?: SearchScope
  activeNoteId?: string
  conversationState?: {
    referencedSpeakerIds?: string[]
    referencedSourceIds?: string[]
    referencedDates?: string[]
    lastTopic?: string
  }
}

/**
 * Parses date references deterministically without an LLM
 */
export function parseTemporalExpressions(text: string, referenceDate = new Date()): DateRange | undefined {
  const lower = text.toLowerCase()
  const refYear = referenceDate.getFullYear()
  const refMonth = referenceDate.getMonth() // 0-indexed

  // "last month"
  if (lower.includes("last month") || lower.includes("previous month")) {
    const prevMonthDate = new Date(refYear, refMonth - 1, 1)
    const start = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth(), 1)
    const end = new Date(prevMonthDate.getFullYear(), prevMonthDate.getMonth() + 1, 0, 23, 59, 59, 999)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: "last month",
    }
  }

  // "this month"
  if (lower.includes("this month") || lower.includes("current month")) {
    const start = new Date(refYear, refMonth, 1)
    const end = new Date(refYear, refMonth + 1, 0, 23, 59, 59, 999)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: "this month",
    }
  }

  // "yesterday"
  if (lower.includes("yesterday")) {
    const start = new Date(referenceDate)
    start.setDate(start.getDate() - 1)
    start.setHours(0, 0, 0, 0)
    const end = new Date(start)
    end.setHours(23, 59, 59, 999)
    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      label: "yesterday",
    }
  }

  // Specific Month Name (e.g., "in July", "in September 2026")
  const months = [
    { name: "january", month: 0 },
    { name: "february", month: 1 },
    { name: "march", month: 2 },
    { name: "april", month: 3 },
    { name: "may", month: 4 },
    { name: "june", month: 5 },
    { name: "july", month: 6 },
    { name: "august", month: 7 },
    { name: "september", month: 8 },
    { name: "october", month: 9 },
    { name: "november", month: 10 },
    { name: "december", month: 11 },
  ]

  for (const m of months) {
    if (lower.includes(m.name)) {
      // Check for explicit year like "september 2026"
      const yearMatch = text.match(new RegExp(`${m.name}\\s+(20\\d\\d)`, "i"))
      const year = yearMatch ? parseInt(yearMatch[1], 10) : refYear
      const start = new Date(year, m.month, 1)
      const end = new Date(year, m.month + 1, 0, 23, 59, 59, 999)
      return {
        startDate: start.toISOString(),
        endDate: end.toISOString(),
        label: `${m.name} ${year}`,
      }
    }
  }

  return undefined
}

/**
 * Extracts proper nouns and key technical terms (capitalized words or acronyms)
 */
export function extractProperNouns(query: string): string[] {
  const words = query.split(/\s+/)
  const stopWords = new Set([
    "What", "When", "Where", "Who", "Why", "How", "Did", "Does", "Can", "Could", "Should", "Would",
    "Show", "Tell", "Find", "Summarize", "List", "Give", "About", "From", "With", "In", "On", "At",
    "The", "This", "That", "These", "Those", "My", "Our", "We", "I", "You", "He", "She", "They",
  ])

  const properNouns: string[] = []
  for (const w of words) {
    const clean = w.replace(/[^a-zA-Z0-9_-]/g, "")
    if (!clean || clean.length < 2) continue
    if (stopWords.has(clean)) continue

    // Capitalized or all-caps technical term (e.g. Stripe, Apollo, CSV, DOCX, SQL)
    if (/^[A-Z][a-zA-Z0-9_-]+$/.test(clean) || /^[A-Z0-9]{2,}$/.test(clean)) {
      properNouns.push(clean)
    }
  }
  return Array.from(new Set(properNouns))
}

/**
 * Cleans conversational preamble to extract the core topic
 */
export function cleanQueryKeywords(query: string): string {
  let cleaned = query
    // Remove common conversational questions
    .replace(/^what\s+(did|does|do|is|was|were|are)\s+[a-zA-Z0-9_\s]+\s+(say|discuss|talk|mention|decide|write)\s+(about|in|during|on)?\s*/i, "")
    .replace(/^what\s+(did|does|do|is|was|were|are)\s+we\s+(say|discuss|talk|mention|decide)\s+(about|in|during|on)?\s*/i, "")
    .replace(/^what\s+(did|does|do|is|was|were|are)\s+I\s+(write|say|discuss)\s+(in|about|on)?\s*/i, "")
    .replace(/^what\s+(notes|recordings|documents|files|conversations)\s+(were\s+)?(created|made|added|recorded|written)\s+(in|during|on)?\s*/i, "")
    .replace(/^tell\s+me\s+about\s+/i, "")
    .replace(/^show\s+(me\s+)?(all\s+)?(my\s+)?conversations\s+with\s+[a-zA-Z0-9_\s]+\s+about\s+/i, "")
    .replace(/^show\s+(me\s+)?(all\s+)?(my\s+)?conversations\s+with\s+[a-zA-Z0-9_\s]+/i, "")
    .replace(/^find\s+(all\s+)?(notes\s+|recordings\s+|conversations\s+|documents\s+)?(about\s+|with\s+|tagged\s+)?/i, "")
    .replace(/^summarize\s+(this\s+note|this|the\s+note)?/i, "")
    .replace(/^what\s+happened\s+(in|during|on)?\s*/i, "")
    .replace(/^which\s+documents\s+mention\s+/i, "")
    .replace(/^have\s+we\s+discussed\s+/i, "")
    .replace(/\s+before\??$/i, "")
    .replace(/\s+last\s+month\??$/i, "")
    .replace(/\s+this\s+month\??$/i, "")
    .replace(/\s+yesterday\??$/i, "")
    .replace(/[?!.]+$/, "")
    .trim()

  return cleaned
}

/**
 * Parses user query into structured retrieval parameters
 */
export async function parseQuery(
  userId: string,
  query: string,
  options: ParseQueryOptions = {}
): Promise<ParsedQuery> {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase()

  // 1. Resolve Known Speakers
  const userSpeakers = await SpeakerRepository.listByUser(userId)
  let matchedSpeakerId: string | undefined
  let matchedSpeakerName: string | undefined

  for (const spk of userSpeakers) {
    const spkLower = spk.name.toLowerCase()
    // Match full name or first name (e.g. "John" for "John Doe" or "Sarah" for "Dr. Sarah Chen")
    const parts = spkLower.split(/\s+/)
    const isMatched =
      lower.includes(spkLower) ||
      parts.some((p) => p.length >= 3 && !["dr.", "mr.", "ms.", "mrs."].includes(p) && new RegExp(`\\b${p}\\b`, "i").test(trimmed))

    if (isMatched) {
      matchedSpeakerId = spk.id
      matchedSpeakerName = spk.name
      break
    }
  }

  // 2. Resolve Known Folders
  const userFolders = await FolderRepository.listByUser(userId)
  let matchedFolderId: string | undefined
  let matchedFolderName: string | undefined

  for (const f of userFolders) {
    const fLower = f.name.toLowerCase()
    if (lower.includes(fLower) || new RegExp(`\\b${fLower}\\b`, "i").test(trimmed)) {
      matchedFolderId = f.id
      matchedFolderName = f.name
      break
    }
  }

  // 3. Resolve Known Tags
  const userTags = await TagRepository.listByUser(userId)
  const matchedTagIds: string[] = []
  const matchedTagNames: string[] = []

  for (const t of userTags) {
    const tLower = t.name.toLowerCase()
    if (lower.includes(tLower) || lower.includes(`#${tLower}`)) {
      matchedTagIds.push(t.id)
      matchedTagNames.push(t.name)
    }
  }

  // 4. Resolve Temporal Expressions
  const dateRange = parseTemporalExpressions(trimmed)
  const isTemporal =
    Boolean(dateRange) ||
    lower.includes("when") ||
    lower.includes("timeline") ||
    lower.includes("first talk") ||
    lower.includes("changed between")

  // 5. Resolve Source Type Preference
  let sourceType: ParsedQuery["sourceType"]
  if (
    lower.includes("recording") ||
    lower.includes("audio") ||
    lower.includes("transcript") ||
    lower.includes("conversation") ||
    lower.includes("call") ||
    lower.includes("what did") && matchedSpeakerId
  ) {
    sourceType = "recording"
  } else if (lower.includes("note") || lower.includes("write in") || lower.includes("memo")) {
    sourceType = "note"
  } else if (lower.includes("file") || lower.includes("document") || lower.includes("docx") || lower.includes("csv") || lower.includes("image")) {
    sourceType = "asset"
  }

  // 6. Resolve Scope
  let scope = options.activeScope
  if (!scope) {
    if (lower.includes("this note") || lower.includes("in this note") || lower.includes("summarize this")) {
      if (options.activeNoteId) {
        scope = { type: "this_note", noteId: options.activeNoteId }
      }
    } else if (matchedFolderId) {
      scope = { type: "this_folder", folderId: matchedFolderId }
    } else if (sourceType === "note") {
      scope = { type: "all_notes" }
    } else if (sourceType === "recording") {
      scope = { type: "all_recordings" }
    } else {
      scope = { type: "everything" }
    }
  }

  // 7. Follow-Up Resolution (conversational context)
  if (options.conversationState) {
    // If query asks "When was that?" or "Who said that?", inherit referenced entities
    if (lower.includes("when was that") || lower.includes("who said that") || lower.includes("tell me more about that")) {
      if (!matchedSpeakerId && options.conversationState.referencedSpeakerIds?.[0]) {
        matchedSpeakerId = options.conversationState.referencedSpeakerIds[0]
      }
      if (options.conversationState.lastTopic && !cleanQueryKeywords(trimmed)) {
        // Inherit topic
      }
    }
  }

  // 8. Proper Nouns & Cleaned Keywords
  const properNouns = extractProperNouns(trimmed)
  let cleanQuery = cleanQueryKeywords(trimmed)

  // If a date range was detected, strip the date tokens from cleanQuery so they don't spoil text search
  if (dateRange) {
    cleanQuery = cleanQuery
      .replace(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(\s+\d{4})?/gi, "")
      .replace(/\b(20\d\d)\b/g, "")
      .replace(/\bin\b|\bduring\b|\bon\b/gi, "")
      .trim()
  }

  // If a folder was matched and query specifically references the folder, clean the folder keywords
  if (matchedFolderName) {
    cleanQuery = cleanQuery
      .replace(new RegExp(`(the\\s+)?${matchedFolderName.replace(/&/g, "\\&")}(\\s+folder)?`, "gi"), "")
      .replace(/\bfolder\b/gi, "")
      .trim()
  }

  // If tags matched, clean tag phrases
  if (matchedTagNames.length > 0) {
    for (const tName of matchedTagNames) {
      cleanQuery = cleanQuery.replace(new RegExp(`(notes?\\s+)?(tagged\\s+)?#?${tName}`, "gi"), "").trim()
    }
  }

  return {
    originalQuery: trimmed,
    cleanQuery,
    speakerId: matchedSpeakerId,
    speakerName: matchedSpeakerName,
    folderId: matchedFolderId,
    folderName: matchedFolderName,
    tagIds: matchedTagIds.length > 0 ? matchedTagIds : undefined,
    tagNames: matchedTagNames.length > 0 ? matchedTagNames : undefined,
    dateRange,
    sourceType,
    scope,
    isTemporal,
    properNouns,
  }
}
