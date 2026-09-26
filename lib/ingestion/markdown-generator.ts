/**
 * Knowledge Markdown Generator
 * Normalizes Notes, Transcripts, and Document Attachments into a unified,
 * AI-friendly Markdown representation with YAML frontmatter.
 */

import type { Note, TranscriptSegment, Speaker, Asset } from "../db/schema"

export interface KnowledgeMarkdownOptions {
  note: Note
  tags?: string[]
  folderName?: string
  transcripts?: Array<{
    recordingTitle: string
    segments: TranscriptSegment[]
  }>
  speakers?: Map<string, Speaker>
  parsedAttachments?: Array<{
    filename: string
    type: Asset["type"]
    markdownContent: string
  }>
}

/**
 * Format milliseconds into MM:SS or HH:MM:SS string
 */
export function formatMsToTime(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
}

/**
 * Generates standardized Knowledge Markdown from source entities
 */
export function generateKnowledgeMarkdown(options: KnowledgeMarkdownOptions): string {
  const { note, tags = [], folderName, transcripts = [], speakers = new Map(), parsedAttachments = [] } = options

  // 1. Build YAML Frontmatter
  const frontmatterLines = [
    "---",
    `id: "${note.id}"`,
    `title: ${JSON.stringify(note.title || "Untitled Note")}`,
    `created_at: "${note.created_at}"`,
    `updated_at: "${note.updated_at}"`,
  ]

  if (folderName) {
    frontmatterLines.push(`folder: ${JSON.stringify(folderName)}`)
  }

  if (tags.length > 0) {
    frontmatterLines.push(`tags: [${tags.map((t) => JSON.stringify(t)).join(", ")}]`)
  }

  // Extract unique speaker names
  const speakerNames = new Set<string>()
  for (const t of transcripts) {
    for (const s of t.segments) {
      if (s.speaker_id) {
        const spk = speakers.get(s.speaker_id)
        speakerNames.add(spk ? spk.name : s.speaker_id)
      }
    }
  }

  if (speakerNames.size > 0) {
    frontmatterLines.push(`speakers: [${Array.from(speakerNames).map((n) => JSON.stringify(n)).join(", ")}]`)
  }

  frontmatterLines.push("---")

  // 2. Build Markdown Body
  const sections: string[] = [frontmatterLines.join("\n")]

  // Note title & main content
  sections.push(`# ${note.title || "Untitled Note"}\n\n${note.content || ""}`.trim())

  // Transcripts section
  if (transcripts.length > 0) {
    const transcriptParts: string[] = ["## Audio Transcripts"]

    for (const t of transcripts) {
      if (t.recordingTitle) {
        transcriptParts.push(`### Recording: ${t.recordingTitle}`)
      }

      if (t.segments.length === 0) {
        transcriptParts.push("*(No speech detected)*")
      } else {
        const dialogueLines = t.segments.map((seg) => {
          const spk = seg.speaker_id ? speakers.get(seg.speaker_id)?.name || seg.speaker_id : "Speaker"
          const time = `[${formatMsToTime(seg.start_ms)} – ${formatMsToTime(seg.end_ms)}]`
          const spkIdTag = seg.speaker_id ? ` <!-- spk_id:${seg.speaker_id} -->` : ""
          return `**${spk}** ${time}${spkIdTag}:\n${seg.text.trim()}`
        })
        transcriptParts.push(dialogueLines.join("\n\n"))
      }
    }

    sections.push(transcriptParts.join("\n\n"))
  }

  // Attachments section
  if (parsedAttachments.length > 0) {
    const attachmentParts: string[] = ["## Attached Documents"]

    for (const att of parsedAttachments) {
      attachmentParts.push(`### Attachment: ${att.filename} (${att.type.toUpperCase()})\n\n${att.markdownContent}`)
    }

    sections.push(attachmentParts.join("\n\n"))
  }

  return sections.join("\n\n").trim()
}
