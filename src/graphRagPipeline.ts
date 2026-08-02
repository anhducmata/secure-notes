// ── Decoupled GraphRAG Multi-Hop Pipeline ──────────────────────────────
import { buildWorkspaceGraph, findGraphEntities } from './graphService'
import { buildRagChunks, queryRagChunks, RagChunk } from './ragService'

export interface GraphRagResult {
  contextText: string
  citations: { id: string; title: string; sourceType: string }[]
  stepsCount: number
}

/**
 * Executes a controlled multi-hop GraphRAG retrieval pipeline (capped at max 3 steps)
 * Sources indexed: Recording (Transcription), Attachments, Chat history & user pastes, Notes.
 */
export function runGraphRagPipeline(
  userQuery: string,
  notes: any[],
  chatMessages: any[] = [],
  transcriptLines: any[] = [],
  maxSteps: number = 3
): GraphRagResult {
  if (!userQuery || !userQuery.trim()) {
    return { contextText: '', citations: [], stepsCount: 0 }
  }

  let currentSteps = 0

  // ── Step 1: Initial RAG Search across Recording, Attachments, Chat, Notes ──
  currentSteps++
  const allRagChunks = buildRagChunks(notes, chatMessages, transcriptLines)
  let retrievedChunks: RagChunk[] = queryRagChunks(userQuery, allRagChunks, [], 2)

  // ── Step 2: Graph Entity Exploration (Find objects & relationships) ────────
  let graphEntities: string[] = []
  if (currentSteps < maxSteps) {
    currentSteps++
    const graph = buildWorkspaceGraph(notes, chatMessages, transcriptLines)
    graphEntities = findGraphEntities(userQuery, graph, 2)
  }

  // ── Step 3: Refined RAG Search using Graph Entities ─────────────────────────
  if (currentSteps < maxSteps && graphEntities.length > 0) {
    currentSteps++
    const secondaryChunks = queryRagChunks(userQuery, allRagChunks, graphEntities, 3)

    // Deduplicate chunks
    const chunkMap = new Map<string, RagChunk>()
    retrievedChunks.forEach(c => chunkMap.set(c.id, c))
    secondaryChunks.forEach(c => chunkMap.set(c.id, c))
    retrievedChunks = Array.from(chunkMap.values()).slice(0, 3)
  }

  // Format concise context snippet for DeepSeek AI
  const contextText = retrievedChunks
    .map(c => `[Source: ${c.sourceTitle} (${c.sourceType})]\n${c.content}`)
    .join('\n\n')

  const citations = retrievedChunks.map(c => ({
    id: c.id,
    title: c.sourceTitle,
    sourceType: c.sourceType,
  }))

  return {
    contextText,
    citations,
    stepsCount: currentSteps,
  }
}
