import { Redis } from "@upstash/redis"

// Key patterns
export const NOTES_KEY = (userId: string) => `notes:${userId}`
export const NOTE_KEY = (userId: string, noteId: string) => `note:${userId}:${noteId}`
export const SHARE_LINK_KEY = (shareId: string) => `share:${shareId}`

// ─── Local file-based Redis adapter (dev only) ────────────────────────────────

import fs from "fs"
import path from "path"

const LOCAL_DB_PATH = path.join(process.cwd(), ".local-redis.json")

interface LocalEntry {
  value: string
  expiresAt?: number
}

interface LocalDB {
  keys: Record<string, LocalEntry>
  hashes: Record<string, Record<string, string>>
}

function readDB(): LocalDB {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      return JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf-8"))
    }
  } catch {}
  return { keys: {}, hashes: {} }
}

function writeDB(db: LocalDB): void {
  fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(db, null, 2))
}

function isExpired(entry: LocalEntry): boolean {
  return entry.expiresAt !== undefined && Date.now() > entry.expiresAt
}

class LocalRedis {
  async get(key: string): Promise<string | null> {
    const db = readDB()
    const entry = db.keys[key]
    if (!entry || isExpired(entry)) return null
    return entry.value
  }

  async set(key: string, value: string, opts?: { ex?: number }): Promise<"OK"> {
    const db = readDB()
    db.keys[key] = {
      value: typeof value === "string" ? value : JSON.stringify(value),
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
    }
    writeDB(db)
    return "OK"
  }

  async del(...keys: string[]): Promise<number> {
    const db = readDB()
    let count = 0
    for (const key of keys) {
      if (db.keys[key]) { delete db.keys[key]; count++ }
    }
    writeDB(db)
    return count
  }

  async hget(hash: string, field: string): Promise<string | null> {
    const db = readDB()
    return db.hashes[hash]?.[field] ?? null
  }

  async hset(hash: string, data: Record<string, string>): Promise<number> {
    const db = readDB()
    if (!db.hashes[hash]) db.hashes[hash] = {}
    let count = 0
    for (const [k, v] of Object.entries(data)) {
      if (!db.hashes[hash][k]) count++
      db.hashes[hash][k] = v
    }
    writeDB(db)
    return count
  }
}

// ─── Export: use Upstash when configured, local adapter otherwise ─────────────

function createRedis(): LocalRedis {
  const url = process.env.KV_REST_API_URL
  const token = process.env.KV_REST_API_TOKEN
  if (url && token) {
    return new Redis({ url, token }) as unknown as LocalRedis
  }
  return new LocalRedis()
}

export const redis = createRedis()
