/**
 * Semantic Text Chunker & Embedding Generator
 * Splits Knowledge Markdown documents into 300–500 token windows with 50-token overlap,
 * preserving audio millisecond timestamps and speaker IDs.
 */

import crypto from "crypto"

export interface ChunkMetadata {
  title?: string
  sourceType: "note" | "recording" | "asset"
  sourceId: string
  folderId?: string | null
  tags?: string[]
  date?: string | null
  startedAt?: string | null
  createdAt?: string | null
}

export interface GeneratedChunk {
  id: string
  content: string
  startMs?: number | null
  endMs?: number | null
  speakerId?: string | null
  embedding?: number[] | null
  metadata: Record<string, unknown>
}

/**
 * Splits text into chunks respecting sentence and paragraph boundaries (~350 words / ~450 tokens)
 */
export function chunkText(
  text: string,
  targetWords = 350,
  overlapWords = 50
): string[] {
  if (!text || text.trim().length === 0) return []

  const paragraphs = text.split(/\n\s*\n/)
  const chunks: string[] = []
  let currentChunk: string[] = []
  let currentWordCount = 0

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed) continue

    const paraWords = trimmed.split(/\s+/).length

    if (currentWordCount + paraWords > targetWords && currentChunk.length > 0) {
      chunks.push(currentChunk.join("\n\n"))

      // Handle overlap by retaining the last elements up to overlapWords
      let overlap: string[] = []
      let overlapCount = 0
      for (let i = currentChunk.length - 1; i >= 0; i--) {
        const words = currentChunk[i].split(/\s+/).length
        if (overlapCount + words <= overlapWords) {
          overlap.unshift(currentChunk[i])
          overlapCount += words
        } else {
          break
        }
      }

      currentChunk = [...overlap, trimmed]
      currentWordCount = overlapCount + paraWords
    } else {
      currentChunk.push(trimmed)
      currentWordCount += paraWords
    }
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk.join("\n\n"))
  }

  return chunks
}

/**
 * Parses timestamp from markdown lines formatted as: **Speaker** [MM:SS – MM:SS]:
 */
function extractTimeAndSpeaker(line: string): { startMs?: number; endMs?: number; speaker?: string; speakerId?: string } {
  const match = line.match(/\*\*([^*]+)\*\*\s+\[(\d{1,2}:\d{2}(?::\d{2})?)\s*–\s*(\d{1,2}:\d{2}(?::\d{2})?)\](?:\s*<!--\s*spk_id:([^\s>]+)\s*-->)?:/)
  if (!match) return {}

  const parseToMs = (str: string): number => {
    const parts = str.split(":").map(Number)
    if (parts.length === 3) {
      return (parts[0] * 3600 + parts[1] * 60 + parts[2]) * 1000
    }
    return (parts[0] * 60 + parts[1]) * 1000
  }

  return {
    speaker: match[1],
    startMs: parseToMs(match[2]),
    endMs: parseToMs(match[3]),
    speakerId: match[4] || undefined,
  }
}

/**
 * Splits document into chunks while extracting segment metadata
 */
export function chunkDocument(
  documentId: string,
  markdown: string,
  metadata: ChunkMetadata
): GeneratedChunk[] {
  const rawChunks = chunkText(markdown)
  const result: GeneratedChunk[] = []

  for (let idx = 0; idx < rawChunks.length; idx++) {
    const chunkText = rawChunks[idx]
    const chunkId = `chk_${documentId}_${idx}`

    // Scan chunk lines for any audio timestamps
    let startMs: number | null = null
    let endMs: number | null = null
    let speaker: string | null = null
    let speakerId: string | null = null

    const lines = chunkText.split("\n")
    for (const line of lines) {
      const extracted = extractTimeAndSpeaker(line)
      if (extracted.startMs !== undefined && startMs === null) {
        startMs = extracted.startMs
      }
      if (extracted.endMs !== undefined) {
        endMs = extracted.endMs
      }
      if (extracted.speaker && !speaker) {
        speaker = extracted.speaker
      }
      if (extracted.speakerId && !speakerId) {
        speakerId = extracted.speakerId
      }
    }

    result.push({
      id: chunkId,
      content: chunkText,
      startMs,
      endMs,
      speakerId,
      metadata: {
        ...metadata,
        speakerName: speaker,
        chunkIndex: idx,
        totalChunks: rawChunks.length,
      },
    })
  }

  return result
}

/**
 * Generates vector embeddings for chunks using OpenAI API, or fallback hash vector
 */
export async function generateEmbeddings(
  texts: string[],
  apiKey?: string
): Promise<number[][]> {
  const effectiveKey = apiKey || process.env.OPENAI_API_KEY

  if (effectiveKey) {
    try {
      const res = await fetch("https://api.openai.com/v1/embeddings", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${effectiveKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "text-embedding-3-small",
          input: texts.map((t) => t.slice(0, 8000)),
        }),
      })

      if (res.ok) {
        const data = await res.json()
        return data.data.map((d: any) => d.embedding)
      }
    } catch (err) {
      console.warn("OpenAI embedding API failed, falling back to local vector:", err)
    }
  }

  // Deterministic 1536-dimensional hash embedding fallback for offline/local dev
  return texts.map((text) => createDeterministicEmbedding(text, 1536))
}

export function createDeterministicEmbedding(text: string, dimensions = 1536): number[] {
  const vector = new Array(dimensions).fill(0)
  const words = text.toLowerCase().split(/\s+/)

  for (const word of words) {
    const hash = crypto.createHash("sha256").update(word).digest()
    for (let i = 0; i < 32; i++) {
      const dim = (hash[i] * 47 + i) % dimensions
      vector[dim] += 1
    }
  }

  // L2 normalize
  const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0))
  if (norm === 0) return vector
  return vector.map((val) => val / norm)
}

/**
 * Computes cosine similarity between two float vectors
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}
