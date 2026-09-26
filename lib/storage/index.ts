/**
 * Asset Storage Abstraction
 * Handles original binary assets (audio, DOCX, CSV, images).
 * Default: Local filesystem in .storage/assets/
 * Production: S3 / Cloudflare R2 / MinIO compatible
 */

import fs from "fs"
import path from "path"
import crypto from "crypto"

export interface AssetStorage {
  put(storageKey: string, data: Buffer | Uint8Array, mimeType: string): Promise<void>
  get(storageKey: string): Promise<Buffer | null>
  delete(storageKey: string): Promise<void>
  getUrl(storageKey: string): Promise<string>
  generateKey(userId: string, filename: string): string
}

// ─── Local Storage Driver ─────────────────────────────────────────────────────

class LocalStorageDriver implements AssetStorage {
  private baseDir: string

  constructor() {
    this.baseDir = path.join(process.cwd(), ".storage", "assets")
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true })
    }
  }

  private resolvePath(storageKey: string): string {
    if (storageKey.includes("\0") || storageKey.includes("..")) {
      throw new Error("Invalid storage key: path traversal sequence detected")
    }
    const resolved = path.resolve(this.baseDir, storageKey)
    const basePrefix = this.baseDir.endsWith(path.sep) ? this.baseDir : this.baseDir + path.sep
    if (!resolved.startsWith(basePrefix)) {
      throw new Error("Invalid storage key: target is outside storage directory")
    }
    return resolved
  }

  generateKey(userId: string, filename: string): string {
    const ext = path.extname(filename) || ""
    const rand = crypto.randomBytes(8).toString("hex")
    const date = new Date().toISOString().slice(0, 10)
    return `${userId}/${date}/${rand}${ext}`
  }

  async put(storageKey: string, data: Buffer | Uint8Array, _mimeType: string): Promise<void> {
    const target = this.resolvePath(storageKey)
    const dir = path.dirname(target)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.writeFileSync(target, Buffer.from(data))
  }

  async get(storageKey: string): Promise<Buffer | null> {
    const target = this.resolvePath(storageKey)
    if (!fs.existsSync(target)) return null
    return fs.readFileSync(target)
  }

  async delete(storageKey: string): Promise<void> {
    const target = this.resolvePath(storageKey)
    if (fs.existsSync(target)) {
      fs.unlinkSync(target)
    }
  }

  async getUrl(storageKey: string): Promise<string> {
    return `/api/assets/raw?key=${encodeURIComponent(storageKey)}`
  }
}

// ─── S3 / R2 Storage Driver (Optional Production) ─────────────────────────────

class S3StorageDriver implements AssetStorage {
  private bucket: string
  private endpoint?: string
  private accessKey?: string
  private secretKey?: string

  constructor(bucket: string, endpoint?: string, accessKey?: string, secretKey?: string) {
    this.bucket = bucket
    this.endpoint = endpoint
    this.accessKey = accessKey
    this.secretKey = secretKey
  }

  generateKey(userId: string, filename: string): string {
    const ext = path.extname(filename) || ""
    const rand = crypto.randomBytes(8).toString("hex")
    const date = new Date().toISOString().slice(0, 10)
    return `assets/${userId}/${date}/${rand}${ext}`
  }

  async put(storageKey: string, data: Buffer | Uint8Array, mimeType: string): Promise<void> {
    // If aws-sdk or fetch client is available
    if (this.endpoint) {
      // Basic S3 PUT
      const url = `${this.endpoint}/${this.bucket}/${storageKey}`
      await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": mimeType },
        body: Buffer.from(data),
      })
    }
  }

  async get(storageKey: string): Promise<Buffer | null> {
    if (!this.endpoint) return null
    const url = `${this.endpoint}/${this.bucket}/${storageKey}`
    const res = await fetch(url)
    if (!res.ok) return null
    const ab = await res.arrayBuffer()
    return Buffer.from(ab)
  }

  async delete(storageKey: string): Promise<void> {
    if (!this.endpoint) return
    const url = `${this.endpoint}/${this.bucket}/${storageKey}`
    await fetch(url, { method: "DELETE" })
  }

  async getUrl(storageKey: string): Promise<string> {
    if (this.endpoint) {
      return `${this.endpoint}/${this.bucket}/${storageKey}`
    }
    return `/api/assets/raw?key=${encodeURIComponent(storageKey)}`
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

function createStorage(): AssetStorage {
  const bucket = process.env.S3_BUCKET
  if (bucket) {
    return new S3StorageDriver(
      bucket,
      process.env.S3_ENDPOINT,
      process.env.S3_ACCESS_KEY_ID,
      process.env.S3_SECRET_ACCESS_KEY
    )
  }
  return new LocalStorageDriver()
}

export const assetStorage = createStorage()
