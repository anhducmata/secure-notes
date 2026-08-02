// ── Mini RAG Context Retrieval Service ───────────────────────────────────────
import { Note } from './App'
import { runGraphRagPipeline } from './graphRagPipeline'

export interface RagSource {
  id: string
  title: string
  type: 'note' | 'attachment' | 'transcription' | 'chat'
  snippet: string
  score: number
}

export interface RagResult {
  contextText: string
  sources: RagSource[]
}

/**
 * Perform GraphRAG multi-hop retrieval across workspace notes, recordings, chat, and attachments (max 3 steps)
 */
export function retrieveWorkspaceRagContext(
  query: string,
  notes: Note[],
  activeNoteId: string,
  limit: number = 3,
  chatMessages: any[] = [],
  transcriptLines: any[] = []
): RagResult {
  const res = runGraphRagPipeline(query, notes, chatMessages, transcriptLines, 3)

  const sources: RagSource[] = res.citations.map(c => ({
    id: c.id,
    title: c.title,
    type: (c.sourceType as any) || 'note',
    snippet: '',
    score: 1.0,
  }))

  return {
    contextText: res.contextText,
    sources,
  }
}
