// ── RAG Service: Context Indexing & Retrieval ─────────────────────────────

export interface RagChunk {
  id: string
  sourceType: 'transcription' | 'attachment' | 'chat' | 'note'
  sourceId: string
  sourceTitle: string
  content: string
  score?: number
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * Index data across all 3 conversation sources: Recording (Transcription), Attachments, and Chat.
 */
export function buildRagChunks(
  notes: any[],
  chatMessages: any[] = [],
  transcriptLines: any[] = []
): RagChunk[] {
  const chunks: RagChunk[] = []

  // 1. Index Recording (Transcription) Data Source
  if (transcriptLines.length > 0) {
    transcriptLines.forEach((line, idx) => {
      if (line.text && line.text.trim()) {
        chunks.push({
          id: `tx-${line.id || idx}`,
          sourceType: 'transcription',
          sourceId: line.id || String(idx),
          sourceTitle: `Live Recording (${line.source === 'mic' ? 'You' : 'System'})`,
          content: `${line.timeRange ? `[${line.timeRange}] ` : ''}${line.source === 'mic' ? 'You (Mata)' : 'Orange Fog 🍊'}: ${line.text}`,
        })
      }
    })
  }

  // 2. Index Attachments Data Source
  notes.forEach(note => {
    if (note.attachments && note.attachments.length > 0) {
      note.attachments.forEach((att: any) => {
        chunks.push({
          id: `att-${att.id}`,
          sourceType: 'attachment',
          sourceId: att.id,
          sourceTitle: `File: ${att.name}`,
          content: `Attachment in #${note.title}: ${att.name} (${att.type || 'document'}, ${att.size || 'file'}). Content summary: Strategy deck and user interview transcript metrics.`,
        })
      })
    }
  })

  // 3. Index Chat Data Source (includes user pasted content & messages)
  if (chatMessages.length > 0) {
    chatMessages.forEach(msg => {
      if (msg.text && msg.text.trim()) {
        chunks.push({
          id: `chat-${msg.id}`,
          sourceType: 'chat',
          sourceId: msg.id,
          sourceTitle: `Chat History (${msg.role})`,
          content: `${msg.role === 'user' ? 'User' : 'AI Assistant'}: ${msg.text}`,
        })
      }
    })
  }

  // 4. Index Notes Data Source
  notes.forEach(note => {
    const plainText = stripHtml(note.body)
    chunks.push({
      id: `note-${note.id}`,
      sourceType: 'note',
      sourceId: note.id,
      sourceTitle: note.title,
      content: `${note.title}: ${plainText}`,
    })
  })

  return chunks
}

/**
 * Retrieve top relevant chunks for a list of keywords or entity terms
 */
export function queryRagChunks(
  query: string,
  chunks: RagChunk[],
  entityTerms: string[] = [],
  limit: number = 3
): RagChunk[] {
  if (!query.trim() || chunks.length === 0) return []

  const cleanQuery = query.toLowerCase()
  const queryWords = cleanQuery
    .replace(/[^a-z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệđìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵ\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1)

  const scored = chunks.map(chunk => {
    let score = 0
    const lowerContent = chunk.content.toLowerCase()
    const lowerTitle = chunk.sourceTitle.toLowerCase()

    // Query exact match bonus
    if (lowerContent.includes(cleanQuery)) score += 5.0

    // Word matches
    queryWords.forEach(word => {
      if (lowerTitle.includes(word)) score += 3.0
      if (lowerContent.includes(word)) score += 1.0
    })

    // Entity graph overlap bonus
    entityTerms.forEach(term => {
      const cleanTerm = term.toLowerCase().replace(/[^a-z0-9]/gi, '')
      if (cleanTerm && lowerContent.replace(/[^a-z0-9]/gi, '').includes(cleanTerm)) {
        score += 4.0
      }
    })

    return { ...chunk, score }
  })

  scored.sort((a, b) => (b.score || 0) - (a.score || 0))
  return scored.filter(c => (c.score || 0) > 0).slice(0, limit)
}
