/**
 * Speaker Profiles & Voice Management
 */

export interface VoiceSample {
  id: string
  audioDataUrl: string
  duration: number
  createdAt: string
  spectralFeature?: number[] // Mel/spectral feature vector for voice matching
}

export interface SpeakerProfile {
  id: string              // e.g. "speaker_1", "spk_john", etc.
  name: string            // e.g. "John", "Mata", "Speaker 1"
  isCustomNamed: boolean  // true if renamed by user
  voiceSamples: VoiceSample[]
  usedNoteCount?: number
  updatedAt: string
}

export interface TranscriptSegment {
  id: string
  speaker_id: string // internal stable speaker ID (e.g. "speaker_1")
  start: number      // in seconds
  end: number        // in seconds
  text: string       // segment transcription
}

const SPEAKERS_STORAGE_KEY = "secure_notes_speakers_v2"

export function getStoredSpeakers(): SpeakerProfile[] {
  if (typeof window === "undefined") return []
  try {
    const raw = localStorage.getItem(SPEAKERS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (p: SpeakerProfile) =>
          !["speaker_mata", "speaker_john", "speaker_sarah"].includes(p.id)
      )
    }
    return []
  } catch {
    return []
  }
}

export function saveStoredSpeakers(speakers: SpeakerProfile[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(SPEAKERS_STORAGE_KEY, JSON.stringify(speakers))
  } catch (err) {
    console.error("Failed to save speaker profiles:", err)
  }
}

/**
 * Returns a human-friendly display name for a speaker_id.
 * e.g., "speaker_1" -> "John" (if mapped) or "Speaker 1" (if unknown).
 */
export function resolveSpeakerName(speakerId: string, profiles: SpeakerProfile[]): string {
  const profile = profiles.find((p) => p.id === speakerId)
  if (profile && profile.name.trim()) {
    return profile.name.trim()
  }

  // If speakerId looks like "speaker_1" or "speaker_2", format as "Speaker 1"
  const match = speakerId.match(/^speaker_?(\d+)$/i)
  if (match) {
    return `Speaker ${match[1]}`
  }

  if (speakerId.toLowerCase() === "you" || speakerId === "speaker_me") return "You"
  if (speakerId.toLowerCase() === "other") return "Other"

  return speakerId
}

/**
 * Normalizes speaker ID string to a canonical "speaker_N" format
 */
export function normalizeSpeakerId(raw: string | number): string {
  const str = String(raw).trim()
  const match = str.match(/\d+/)
  if (match) {
    return `speaker_${match[0]}`
  }
  return `speaker_${str.toLowerCase().replace(/\s+/g, "_")}`
}

/**
 * Format timestamp in MM:SS
 */
export function formatTimeSec(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
}

/**
 * Format timestamp range: [00:00 – 00:44]
 */
export function formatTimeRange(start: number, end: number): string {
  return `[${formatTimeSec(start)} – ${formatTimeSec(end)}]`
}

/**
 * Generate Note Plain Text from structured segments
 */
export function formatSegmentsToNoteText(
  segments: TranscriptSegment[],
  profiles: SpeakerProfile[]
): string {
  if (!segments || segments.length === 0) return ""

  // Group consecutive segments by same speaker if contiguous, or format per segment
  return segments
    .filter((s) => s.text.trim().length > 0)
    .map((s) => {
      const name = resolveSpeakerName(s.speaker_id, profiles)
      const time = formatTimeRange(s.start, s.end)
      return `${name} ${time}:\n${s.text.trim()}`
    })
    .join("\n\n")
}

/**
 * Re-formats existing Note content when speaker names change.
 * If note text has segments in format: Name [00:00 – 00:44]:
 * or old speaker prefixes, this helps replace them cleanly.
 */
export function updateNoteTextSpeakerName(
  noteContent: string,
  oldName: string,
  newName: string
): string {
  if (!noteContent || !oldName || !newName || oldName === newName) return noteContent
  const escapedOld = oldName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const regex = new RegExp(`(^|\\n)${escapedOld}(\\s+\\[\\d{2}:\\d{2}\\s*–\\s*\\d{2}:\\d{2}\\]:)`, "gm")
  return noteContent.replace(regex, `$1${newName}$2`)
}
