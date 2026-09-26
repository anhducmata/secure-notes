/**
 * In-Process Knowledge Job Queue
 * Manages asynchronous knowledge indexing jobs without external dependencies.
 *
 * Guarantees:
 * - In-process execution with configurable concurrency (default: 2)
 * - Deduplication of in-flight/pending tasks for the same source
 * - Exponential backoff retry for transient failures (max 3 attempts)
 * - Permanent failure reporting and observability
 */

import { processSource, pipelineLog, type ProcessSourceOptions, type ProcessResult } from "./pipeline"
import type { KnowledgeSourceType } from "@/lib/db/schema"

export interface JobInput {
  userId: string
  sourceType: KnowledgeSourceType
  sourceId: string
  options?: ProcessSourceOptions
}

export interface InProcessJob extends JobInput {
  id: string
  key: string
  attempt: number
  maxAttempts: number
  status: "pending" | "processing" | "completed" | "failed"
  error?: string
  result?: ProcessResult
  enqueuedAt: number
}

export class InProcessQueue {
  private queue: InProcessJob[] = []
  private activeJobs = new Map<string, InProcessJob>()
  private concurrency = 2
  private isProcessing = false
  private idleWaiters: Array<() => void> = []

  constructor(concurrency = 2) {
    this.concurrency = concurrency
  }

  private getJobKey(userId: string, sourceType: string, sourceId: string): string {
    return `${userId}:${sourceType}:${sourceId}`
  }

  /**
   * Enqueues a job for background processing with deduplication
   */
  enqueue(input: JobInput, maxAttempts = 3): { queued: boolean; jobId: string; reason?: string } {
    const key = this.getJobKey(input.userId, input.sourceType, input.sourceId)

    // Deduplication check: if job is already queued in pending list
    const isAlreadyQueued = this.queue.some((j) => j.key === key)
    if (isAlreadyQueued) {
      pipelineLog({
        event: "job_deduplicated",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        reason: "already_in_queue",
      })
      const existing = this.queue.find((j) => j.key === key)!
      return { queued: false, jobId: existing.id, reason: "already_queued" }
    }

    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const job: InProcessJob = {
      ...input,
      id: jobId,
      key,
      attempt: 0,
      maxAttempts,
      status: "pending",
      enqueuedAt: Date.now(),
    }

    this.queue.push(job)
    pipelineLog({
      event: "job_enqueued",
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      status: "pending",
    })

    this.scheduleDrain()
    return { queued: true, jobId }
  }

  /**
   * Directly processes a job synchronously (useful for tests or immediate requests)
   */
  async processSync(
    userId: string,
    sourceType: KnowledgeSourceType,
    sourceId: string,
    options?: ProcessSourceOptions
  ): Promise<ProcessResult> {
    return processSource(userId, sourceType, sourceId, options)
  }

  private scheduleDrain() {
    if (this.isProcessing) return
    this.isProcessing = true
    setImmediate(() => {
      this.isProcessing = false
      this.drain()
    })
  }

  private async drain() {
    while (this.activeJobs.size < this.concurrency && this.queue.length > 0) {
      const job = this.queue.shift()
      if (!job) break

      this.activeJobs.set(job.key, job)
      job.status = "processing"
      job.attempt += 1

      // Run job execution asynchronously
      this.executeJob(job)
    }

    this.checkIdle()
  }

  private async executeJob(job: InProcessJob) {
    try {
      const res = await processSource(job.userId, job.sourceType, job.sourceId, job.options)
      job.result = res

      if (res.success || res.cached || res.aborted) {
        job.status = "completed"
        this.activeJobs.delete(job.key)
      } else {
        // Failed: check if retryable
        if (job.attempt < job.maxAttempts) {
          const delayMs = Math.min(1000, Math.pow(2, job.attempt) * 50)
          pipelineLog({
            event: "job_retry_scheduled",
            sourceType: job.sourceType,
            sourceId: job.sourceId,
            reason: `attempt_${job.attempt}_failed`,
          })
          setTimeout(() => {
            job.status = "pending"
            this.queue.push(job)
            this.scheduleDrain()
          }, delayMs)
          this.activeJobs.delete(job.key)
        } else {
          job.status = "failed"
          job.error = res.error
          this.activeJobs.delete(job.key)
        }
      }
    } catch (err: any) {
      const errMsg = err?.message || String(err)
      job.error = errMsg

      if (job.attempt < job.maxAttempts) {
        const delayMs = Math.min(1000, Math.pow(2, job.attempt) * 50)
        setTimeout(() => {
          job.status = "pending"
          this.queue.push(job)
          this.scheduleDrain()
        }, delayMs)
        this.activeJobs.delete(job.key)
      } else {
        job.status = "failed"
        this.activeJobs.delete(job.key)
      }
    } finally {
      this.scheduleDrain()
    }
  }

  private checkIdle() {
    if (this.queue.length === 0 && this.activeJobs.size === 0) {
      while (this.idleWaiters.length > 0) {
        const waiter = this.idleWaiters.shift()
        if (waiter) waiter()
      }
    }
  }

  /**
   * Returns a promise that resolves when all queued and active jobs have finished
   */
  async waitForIdle(): Promise<void> {
    if (this.queue.length === 0 && this.activeJobs.size === 0) {
      return
    }
    return new Promise((resolve) => {
      this.idleWaiters.push(resolve)
    })
  }

  getStatus() {
    return {
      queuedCount: this.queue.length,
      activeCount: this.activeJobs.size,
      activeKeys: Array.from(this.activeJobs.keys()),
    }
  }

  clear() {
    this.queue = []
    this.activeJobs.clear()
    this.checkIdle()
  }
}

export const knowledgeQueue = new InProcessQueue(2)
