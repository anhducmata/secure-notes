/**
 * AI Memory Agent (Find, Understand, Connect, Recall)
 * Main orchestrator for grounded knowledge retrieval and synthesis.
 *
 * Principles:
 * - Operates strictly through controlled retrieval functions (no raw DB access).
 * - Retrieved structured metadata is the ground truth.
 * - Distinguishes: Supported by evidence vs Inference vs Unknown.
 * - Concise, grounded answers; no hallucination when evidence is absent.
 * - Strict tenant isolation, prompt injection defense, and citation verification.
 */

import OpenAI from "openai"
import { parseQuery } from "./query-parser"
import { retrievalService } from "./retrieval-service"
import { rerankCandidates } from "./reranker"
import { buildAgentContext } from "./context-builder"
import { citationService } from "./citation-service"
import type {
  AgentResponse,
  AgentMetrics,
  ConversationState,
  ParsedQuery,
  RerankedChunk,
  SearchScope,
  VerifiedCitation,
} from "./types"

export interface ProcessQueryOptions {
  scope?: SearchScope
  activeNoteId?: string
  conversationHistory?: Array<{ role: "user" | "assistant"; content: string }>
  conversationState?: ConversationState
  apiKey?: string
  model?: string
  maxCandidates?: number
  provider?: "openai" | "deepseek"
  deepseekApiKey?: string
}

export class MemoryAgent {
  /**
   * Main entry point for synchronous or buffered agent execution
   */
  async processQuery(
    userId: string,
    query: string,
    options: ProcessQueryOptions = {}
  ): Promise<AgentResponse> {
    const startTime = Date.now()
    const { parsed, reranked, context, metrics } = await this.prepareContext(userId, query, options)

    // ─── Zero Evidence Guard ──────────────────────────────────────────────────
    if (reranked.length === 0) {
      const topic = parsed.cleanQuery || query.trim()
      const noEvidenceText = `The available knowledge does not contain information regarding "${topic}".`
      metrics.latencyMs = Date.now() - startTime
      return {
        answer: noEvidenceText,
        citations: [],
        noEvidence: true,
        metrics,
        conversationState: this.updateConversationState(options.conversationState, parsed, []),
        sources: [],
      }
    }

    // ─── LLM Completion ───────────────────────────────────────────────────────
    metrics.llmCalled = true
    const client = this.getLlmClient(options)
    const model = options.model || "gpt-4o-mini"

    const systemPrompt = this.buildSystemPrompt(context.formattedContext)
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      ...(options.conversationHistory?.slice(-4) || []),
      { role: "user", content: query },
    ]

    let answerText = ""
    try {
      const completion = await client.chat.completions.create({
        model,
        messages,
        temperature: 0.1, // Low temperature for high grounding accuracy
      })
      answerText = completion.choices[0]?.message?.content || ""
    } catch (err: any) {
      console.warn("[MemoryAgent] LLM completion failed, falling back to structured summary:", err?.message)
      answerText = this.buildFallbackAnswer(reranked)
    }

    // ─── Citation Extraction & Strict Validation ──────────────────────────────
    const referencedIndexes = citationService.extractReferencedIndexes(answerText)
    const verifiedCitations = await citationService.validateCitations(userId, reranked, referencedIndexes)

    metrics.latencyMs = Date.now() - startTime

    return {
      answer: answerText,
      citations: verifiedCitations,
      noEvidence: false,
      metrics,
      conversationState: this.updateConversationState(options.conversationState, parsed, reranked),
      sources: reranked.map((c) => ({
        title: c.title,
        sourceType: c.sourceType,
        sourceId: c.sourceId,
        timestamp: c.startMs !== null && c.startMs !== undefined ? `${c.startMs}` : undefined,
        speakerName: c.speakerName || undefined,
      })),
    }
  }

  /**
   * Streaming pipeline yielding incremental tokens and emitting final verified citations
   */
  async *streamQuery(
    userId: string,
    query: string,
    options: ProcessQueryOptions = {}
  ): AsyncGenerator<{ delta?: string; done?: boolean; citations?: VerifiedCitation[]; error?: boolean }> {
    const { parsed, reranked, context } = await this.prepareContext(userId, query, options)

    if (reranked.length === 0) {
      const topic = parsed.cleanQuery || query.trim()
      yield { delta: `The available knowledge does not contain relevant information about "${topic}".` }
      yield { done: true, citations: [] }
      return
    }

    const client = this.getLlmClient(options)
    const model = options.model || "gpt-4o-mini"
    const systemPrompt = this.buildSystemPrompt(context.formattedContext)

    let fullAnswer = ""

    try {
      const stream = await client.chat.completions.create({
        model,
        stream: true,
        temperature: 0.1,
        messages: [
          { role: "system", content: systemPrompt },
          ...(options.conversationHistory?.slice(-4) || []),
          { role: "user", content: query },
        ],
      })

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta?.content ?? ""
        if (delta) {
          fullAnswer += delta
          yield { delta }
        }
      }
    } catch (err) {
      console.error("[MemoryAgent stream]", err)
      yield { error: true }
      return
    }

    // Validate citations based on text
    const referencedIndexes = citationService.extractReferencedIndexes(fullAnswer)
    const verifiedCitations = await citationService.validateCitations(userId, reranked, referencedIndexes)

    yield { done: true, citations: verifiedCitations }
  }

  /**
   * Internal retrieval, filtering, and reranking preparation pipeline
   */
  async prepareContext(userId: string, query: string, options: ProcessQueryOptions = {}) {
    const metrics: AgentMetrics = {
      retrievalCount: 0,
      candidateCount: 0,
      contextCount: 0,
      llmCalled: false,
      latencyMs: 0,
    }

    // 1. Query Understanding
    const parsed = await parseQuery(userId, query, {
      activeScope: options.scope,
      activeNoteId: options.activeNoteId,
      conversationState: options.conversationState
        ? {
            referencedSpeakerIds: options.conversationState.referencedSpeakerIds,
            referencedSourceIds: options.conversationState.referencedSourceIds,
            referencedDates: options.conversationState.referencedDates,
            lastTopic: options.conversationState.lastTopic,
          }
        : undefined,
    })

    // 2. Controlled Hybrid Retrieval
    const candidates = await retrievalService.executeScopedSearch(
      userId,
      parsed,
      options.apiKey,
      options.maxCandidates || 15
    )
    metrics.retrievalCount = 1
    metrics.candidateCount = candidates.length

    // 3. Deterministic Domain Reranking
    const reranked = rerankCandidates(candidates, parsed, 6)
    metrics.contextCount = reranked.length

    // 4. Structured Context Building
    const context = buildAgentContext(reranked)

    return { parsed, reranked, context, metrics }
  }

  private buildSystemPrompt(formattedContext: string): string {
    return `You are the user's AI Memory Agent (Find, Understand, Connect, Recall).
Your goal is to answer questions using ONLY the user's actual notes, files, recordings, and transcripts.

CORE GROUNDING PRINCIPLES:
1. PREFER GROUNDED EVIDENCE: Base your statements strictly on evidence in the context.
2. DISTINGUISH: Clearly separate what is explicitly supported by evidence from inferences or unknowns.
   - If someone suggested or discussed an idea, say they suggested it; do NOT state it was decided unless the evidence explicitly records an agreement or decision.
3. NO HALLUCINATION: If the provided knowledge does not contain the answer, concisely state that the available knowledge does not contain evidence for that topic.
4. CITATIONS: Use inline bracketed citations [1], [2], etc., corresponding exactly to the sources provided below.
5. CONCISE FORMAT: Keep answers concise, clear, and direct. When citing spoken dialogue, mention the speaker and timestamp (e.g. "[01:15]").

${formattedContext}`
  }

  private buildFallbackAnswer(chunks: RerankedChunk[]): string {
    const lines = ["Here is the relevant information found in your knowledge base:"]
    chunks.slice(0, 3).forEach((c, i) => {
      const cite = `[${i + 1}] ${c.title}`
      const spk = c.speakerName ? ` (${c.speakerName})` : ""
      lines.push(`• ${cite}${spk}:\n  "${c.content.slice(0, 150)}..."`)
    })
    return lines.join("\n\n")
  }

  private updateConversationState(
    previousState: ConversationState | undefined,
    parsed: ParsedQuery,
    chunks: RerankedChunk[]
  ): ConversationState {
    const sourceIds = Array.from(new Set([...(previousState?.referencedSourceIds || []), ...chunks.map((c) => c.sourceId)]))
    const speakerIds = Array.from(
      new Set([
        ...(previousState?.referencedSpeakerIds || []),
        ...(parsed.speakerId ? [parsed.speakerId] : []),
        ...chunks.filter((c) => c.speakerId).map((c) => c.speakerId!),
      ])
    )
    const dates = Array.from(
      new Set([
        ...(previousState?.referencedDates || []),
        ...(parsed.dateRange?.startDate ? [parsed.dateRange.startDate] : []),
        ...chunks.filter((c) => c.date).map((c) => c.date!),
      ])
    )

    return {
      lastQuery: parsed.originalQuery,
      referencedSourceIds: sourceIds.slice(-10),
      referencedSpeakerIds: speakerIds.slice(-5),
      referencedDates: dates.slice(-5),
      activeScope: parsed.scope,
      lastTopic: parsed.cleanQuery || previousState?.lastTopic,
      updatedAt: Date.now(),
    }
  }

  private getLlmClient(options: ProcessQueryOptions): OpenAI {
    if (options.provider === "deepseek") {
      return new OpenAI({
        apiKey: options.deepseekApiKey || process.env.DEEPSEEK_API_KEY || "dummy-key",
        baseURL: "https://api.deepseek.com",
      })
    }
    return new OpenAI({
      apiKey: options.apiKey || process.env.OPENAI_API_KEY || "dummy-key",
    })
  }
}

export const memoryAgent = new MemoryAgent()
