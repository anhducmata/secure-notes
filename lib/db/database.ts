/**
 * Unified Database Client supporting:
 * 1. PostgreSQL (with pgvector) when DATABASE_URL is configured
 * 2. SQLite (Node.js built-in node:sqlite with FTS5 and in-process vector cosine similarity)
 *    for local development and offline desktop Electron execution.
 */

import path from "path"
import fs from "fs"
import { DatabaseSync } from "node:sqlite"
import { SQLITE_SCHEMA_SQL, POSTGRES_SCHEMA_SQL } from "./schema"

export interface DatabaseClient {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  execute(sql: string, params?: unknown[]): Promise<{ rowsAffected: number }>
  transaction<T>(fn: (db: DatabaseClient) => Promise<T>): Promise<T>
  isPostgres(): boolean
}

// ─── SQLite Driver Implementation ─────────────────────────────────────────────

class SQLiteDriver implements DatabaseClient {
  private db: any
  private initialized = false
  private dbPath: string

  constructor(dbPath: string) {
    this.dbPath = dbPath
  }

  private getDb() {
    if (!this.db) {
      const dir = path.dirname(this.dbPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      this.db = new DatabaseSync(this.dbPath)
      this.db.exec("PRAGMA journal_mode = WAL;")
      this.db.exec("PRAGMA foreign_keys = ON;")
    }
    if (!this.initialized) {
      this.db.exec(SQLITE_SCHEMA_SQL)
      this.runMigrations()
      this.initialized = true
    }
    return this.db
  }

  private runMigrations() {
    try {
      const tableInfo = this.db.prepare("PRAGMA table_info(knowledge_documents)").all() as { name: string }[]
      const colNames = new Set(tableInfo.map((c) => c.name))
      if (colNames.size > 0) {
        if (!colNames.has("status")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN status TEXT NOT NULL DEFAULT 'completed';")
        }
        if (!colNames.has("error_message")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN error_message TEXT;")
        }
        if (!colNames.has("attempt_count")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;")
        }
        if (!colNames.has("source_version")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN source_version TEXT;")
        }
        if (!colNames.has("embedding_model")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small';")
        }
        if (!colNames.has("embedding_version")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN embedding_version TEXT NOT NULL DEFAULT 'v1';")
        }
        if (!colNames.has("started_at")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN started_at TEXT;")
        }
        if (!colNames.has("completed_at")) {
          this.db.exec("ALTER TABLE knowledge_documents ADD COLUMN completed_at TEXT;")
        }
        this.db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_kdocs_source ON knowledge_documents(user_id, source_type, source_id);")
      }
    } catch {
      // Ignore migration errors if table doesn't exist yet
    }
  }

  isPostgres(): boolean {
    return false
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const db = this.getDb()
    const stmt = db.prepare(sql)
    const rows = stmt.all(...params)
    return rows as T[]
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    const db = this.getDb()
    const stmt = db.prepare(sql)
    const result = stmt.run(...params)
    return { rowsAffected: Number(result?.changes ?? 0) }
  }

  private transactionLock: Promise<void> = Promise.resolve()

  async transaction<T>(fn: (db: DatabaseClient) => Promise<T>): Promise<T> {
    const prevLock = this.transactionLock
    let releaseLock: () => void = () => {}
    this.transactionLock = new Promise<void>((resolve) => {
      releaseLock = resolve
    })

    await prevLock

    const db = this.getDb()
    db.exec("BEGIN TRANSACTION;")
    try {
      const res = await fn(this)
      db.exec("COMMIT;")
      return res
    } catch (err) {
      db.exec("ROLLBACK;")
      throw err
    } finally {
      releaseLock()
    }
  }
}

// ─── PostgreSQL Driver Implementation ─────────────────────────────────────────

class PostgresDriver implements DatabaseClient {
  private pool: any
  private initialized = false
  private connectionString: string

  constructor(connectionString: string) {
    this.connectionString = connectionString
  }

  private async getPool() {
    if (!this.pool) {
      try {
        const pgModule = "pg"
        const pg = await import(/* webpackIgnore: true */ pgModule)
        const Pool = (pg as any).Pool || (pg as any).default?.Pool
        this.pool = new Pool({ connectionString: this.connectionString })
      } catch (err) {
        console.warn("pg driver not installed, falling back to SQLite:", err)
        return null
      }
    }
    if (!this.initialized && this.pool) {
      try {
        await this.pool.query(POSTGRES_SCHEMA_SQL)
        this.initialized = true
      } catch (e) {
        console.error("Failed to initialize PostgreSQL schema:", e)
      }
    }
    return this.pool
  }

  isPostgres(): boolean {
    return true
  }

  private normalizePlaceholders(sql: string): string {
    let index = 1
    let inString = false
    let stringChar = ""
    let result = ""

    for (let i = 0; i < sql.length; i++) {
      const char = sql[i]
      if (inString) {
        result += char
        if (char === stringChar) {
          if (i + 1 < sql.length && sql[i + 1] === stringChar) {
            result += sql[++i]
          } else {
            inString = false
          }
        }
      } else {
        if (char === "'" || char === '"') {
          inString = true
          stringChar = char
          result += char
        } else if (char === "?") {
          result += `$${index++}`
        } else {
          result += char
        }
      }
    }
    return result
  }

  async query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    const pool = await this.getPool()
    if (!pool) throw new Error("PostgreSQL pool not available")
    const res = await pool.query(this.normalizePlaceholders(sql), params)
    return res.rows as T[]
  }

  async execute(sql: string, params: unknown[] = []): Promise<{ rowsAffected: number }> {
    const pool = await this.getPool()
    if (!pool) throw new Error("PostgreSQL pool not available")
    const res = await pool.query(this.normalizePlaceholders(sql), params)
    return { rowsAffected: res.rowCount ?? 0 }
  }

  async transaction<T>(fn: (db: DatabaseClient) => Promise<T>): Promise<T> {
    const pool = await this.getPool()
    if (!pool) throw new Error("PostgreSQL pool not available")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      const scopedDb: DatabaseClient = {
        query: async <R>(s: string, p: unknown[] = []) => (await client.query(this.normalizePlaceholders(s), p)).rows as R[],
        execute: async (s: string, p: unknown[] = []) => ({ rowsAffected: (await client.query(this.normalizePlaceholders(s), p)).rowCount ?? 0 }),
        transaction: () => { throw new Error("Nested transactions not supported") },
        isPostgres: () => true,
      }
      const result = await fn(scopedDb)
      await client.query("COMMIT")
      return result
    } catch (e) {
      await client.query("ROLLBACK")
      throw e
    } finally {
      client.release()
    }
  }
}

// ─── Singleton Factory ────────────────────────────────────────────────────────

function createDatabaseClient(): DatabaseClient {
  const dbUrl = process.env.DATABASE_URL
  if (dbUrl && (dbUrl.startsWith("postgres://") || dbUrl.startsWith("postgresql://"))) {
    return new PostgresDriver(dbUrl)
  }

  const defaultDbPath = path.join(process.cwd(), ".storage", "app.db")
  return new SQLiteDriver(defaultDbPath)
}

export const db = createDatabaseClient()
