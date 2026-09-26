/**
 * Data Access Repositories for the 14 Target Entities.
 */

import { db } from "./database"
import type {
  User,
  Folder,
  Note,
  Asset,
  Tag,
  Speaker,
  SpeakerVoiceSample,
  Recording,
  Transcript,
  TranscriptSegment,
  KnowledgeDocument,
  KnowledgeChunk,
  KnowledgeDocumentStatus,
} from "./schema"

// ─── 1. User Repository ───────────────────────────────────────────────────────

export const UserRepository = {
  async findByEmail(email: string): Promise<User | null> {
    const rows = await db.query<User>(
      "SELECT * FROM users WHERE LOWER(email) = LOWER(?) LIMIT 1",
      [email]
    )
    return rows[0] ?? null
  },

  async findById(id: string): Promise<User | null> {
    const rows = await db.query<User>("SELECT * FROM users WHERE id = ? LIMIT 1", [id])
    return rows[0] ?? null
  },

  async create(user: Omit<User, "created_at" | "updated_at">): Promise<User> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO users (id, email, password_hash, name, verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user.id, user.email.toLowerCase(), user.password_hash, user.name, user.verified ? 1 : 0, now, now]
    )
    return { ...user, created_at: now, updated_at: now }
  },

  async verify(email: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE users SET verified = 1, updated_at = ? WHERE LOWER(email) = LOWER(?)",
      [now, email]
    )
  },

  async updatePassword(email: string, passwordHash: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE users SET password_hash = ?, updated_at = ? WHERE LOWER(email) = LOWER(?)",
      [passwordHash, now, email]
    )
  },
}

// ─── 2. Folder Repository ─────────────────────────────────────────────────────

export const FolderRepository = {
  async listByUser(userId: string): Promise<Folder[]> {
    return db.query<Folder>(
      "SELECT * FROM folders WHERE user_id = ? ORDER BY is_system DESC, created_at ASC",
      [userId]
    )
  },

  async getById(id: string, userId: string): Promise<Folder | null> {
    const rows = await db.query<Folder>(
      "SELECT * FROM folders WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    )
    return rows[0] ?? null
  },

  async create(folder: Omit<Folder, "created_at" | "updated_at">): Promise<Folder> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO folders (id, user_id, parent_id, name, icon, is_system, is_archived, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        folder.id,
        folder.user_id,
        folder.parent_id ?? null,
        folder.name,
        folder.icon ?? "custom",
        folder.is_system ? 1 : 0,
        folder.is_archived ? 1 : 0,
        now,
        now,
      ]
    )
    return { ...folder, created_at: now, updated_at: now }
  },

  async rename(id: string, userId: string, name: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE folders SET name = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [name, now, id, userId]
    )
  },

  async archive(id: string, userId: string, isArchived: boolean): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE folders SET is_archived = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [isArchived ? 1 : 0, now, id, userId]
    )
  },

  async delete(id: string, userId: string): Promise<void> {
    // Unlink notes referencing this folder or subfolders before deletion
    await db.execute(
      "UPDATE notes SET folder_id = NULL WHERE (folder_id = ? OR folder_id IN (SELECT id FROM folders WHERE parent_id = ?)) AND user_id = ?",
      [id, id, userId]
    )
    // Delete target folder and any subfolders
    await db.execute("DELETE FROM folders WHERE (id = ? OR parent_id = ?) AND user_id = ?", [
      id,
      id,
      userId,
    ])
  },
}

// ─── 3. Tag Repository ────────────────────────────────────────────────────────

export const TagRepository = {
  async listByUser(userId: string): Promise<Tag[]> {
    return db.query<Tag>("SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC", [userId])
  },

  async findByName(userId: string, name: string): Promise<Tag | null> {
    const rows = await db.query<Tag>(
      "SELECT * FROM tags WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
      [userId, name.trim()]
    )
    return rows[0] ?? null
  },

  async create(tag: Omit<Tag, "created_at">): Promise<Tag> {
    const existing = await this.findByName(tag.user_id, tag.name)
    if (existing) return existing

    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO tags (id, user_id, name, color, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (user_id, name) DO NOTHING`,
      [tag.id, tag.user_id, tag.name.trim(), tag.color || "#3b82f6", now]
    )
    return { ...tag, color: tag.color || "#3b82f6", created_at: now }
  },

  async upsert(userId: string, name: string): Promise<Tag> {
    const existing = await this.findByName(userId, name)
    if (existing) return existing
    const id = `tag_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
    return this.create({ id, user_id: userId, name: name.trim(), color: "#3b82f6" })
  },

  async delete(id: string, userId: string): Promise<void> {
    await db.execute("DELETE FROM tags WHERE id = ? AND user_id = ?", [id, userId])
  },
}

// ─── 4. Note Repository ───────────────────────────────────────────────────────

export const NoteRepository = {
  async listByUser(userId: string, folderId?: string): Promise<Note[]> {
    if (folderId && folderId !== "all") {
      if (folderId === "archive") {
        return db.query<Note>(
          "SELECT * FROM notes WHERE user_id = ? AND is_archived = true AND deleted_at IS NULL ORDER BY updated_at DESC",
          [userId]
        )
      }
      if (folderId === "trash") {
        return db.query<Note>(
          "SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NOT NULL ORDER BY updated_at DESC",
          [userId]
        )
      }
      return db.query<Note>(
        "SELECT * FROM notes WHERE user_id = ? AND folder_id = ? AND is_archived = false AND deleted_at IS NULL ORDER BY updated_at DESC",
        [userId, folderId]
      )
    }

    return db.query<Note>(
      "SELECT * FROM notes WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC",
      [userId]
    )
  },

  async getById(id: string, userId: string): Promise<Note | null> {
    const rows = await db.query<Note>(
      "SELECT * FROM notes WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    )
    return rows[0] ?? null
  },

  async upsert(note: Omit<Note, "created_at" | "updated_at"> & { created_at?: string }): Promise<Note> {
    const now = new Date().toISOString()
    const createdAt = note.created_at || now
    await db.execute(
      `INSERT INTO notes (id, user_id, folder_id, title, content, is_archived, created_at, updated_at, deleted_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         folder_id = excluded.folder_id,
         title = excluded.title,
         content = excluded.content,
         is_archived = excluded.is_archived,
         updated_at = excluded.updated_at,
         deleted_at = excluded.deleted_at
       WHERE notes.user_id = excluded.user_id`,
      [
        note.id,
        note.user_id,
        note.folder_id ?? null,
        note.title,
        note.content,
        note.is_archived ? 1 : 0,
        createdAt,
        now,
        note.deleted_at ?? null,
      ]
    )
    return { ...note, created_at: createdAt, updated_at: now }
  },

  async softDelete(id: string, userId: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE notes SET deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?",
      [now, now, id, userId]
    )
  },

  async permanentDelete(id: string, userId: string): Promise<void> {
    await db.execute("DELETE FROM notes WHERE id = ? AND user_id = ?", [id, userId])
  },

  async getTagsForNote(noteId: string): Promise<Tag[]> {
    return db.query<Tag>(
      `SELECT t.* FROM tags t
       JOIN note_tags nt ON nt.tag_id = t.id
       WHERE nt.note_id = ?`,
      [noteId]
    )
  },

  async setTagsForNote(noteId: string, tagIds: string[]): Promise<void> {
    await db.execute("DELETE FROM note_tags WHERE note_id = ?", [noteId])
    for (const tagId of tagIds) {
      await db.execute(
        "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
        [noteId, tagId]
      )
    }
  },

  async addTag(noteId: string, tagId: string): Promise<void> {
    await db.execute(
      "INSERT INTO note_tags (note_id, tag_id) VALUES (?, ?) ON CONFLICT DO NOTHING",
      [noteId, tagId]
    )
  },

  async getAssetsForNote(noteId: string): Promise<Asset[]> {
    return db.query<Asset>(
      `SELECT a.* FROM assets a
       JOIN note_assets na ON na.asset_id = a.id
       WHERE na.note_id = ?`,
      [noteId]
    )
  },

  async linkAsset(noteId: string, assetId: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "INSERT INTO note_assets (note_id, asset_id, created_at) VALUES (?, ?, ?) ON CONFLICT DO NOTHING",
      [noteId, assetId, now]
    )
  },
}

// ─── 5. Asset Repository ──────────────────────────────────────────────────────

export const AssetRepository = {
  async create(asset: Omit<Asset, "created_at">): Promise<Asset> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO assets (id, user_id, type, storage_key, mime_type, filename, size_bytes, width, height, duration_ms, checksum, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        asset.id,
        asset.user_id,
        asset.type,
        asset.storage_key,
        asset.mime_type,
        asset.filename || asset.storage_key,
        asset.size_bytes,
        asset.width ?? null,
        asset.height ?? null,
        asset.duration_ms ?? null,
        asset.checksum || "",
        now,
      ]
    )
    return { ...asset, created_at: now }
  },

  async getById(id: string, userId: string): Promise<Asset | null> {
    const rows = await db.query<Asset>(
      "SELECT * FROM assets WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    )
    return rows[0] ?? null
  },

  async findByStorageKey(storageKey: string, userId: string): Promise<Asset | null> {
    const rows = await db.query<Asset>(
      "SELECT * FROM assets WHERE storage_key = ? AND user_id = ? LIMIT 1",
      [storageKey, userId]
    )
    return rows[0] ?? null
  },

  async findByChecksum(userId: string, checksum: string): Promise<Asset | null> {
    const rows = await db.query<Asset>(
      "SELECT * FROM assets WHERE user_id = ? AND checksum = ? LIMIT 1",
      [userId, checksum]
    )
    return rows[0] ?? null
  },

  async delete(id: string, userId: string): Promise<void> {
    await db.execute("DELETE FROM assets WHERE id = ? AND user_id = ?", [id, userId])
  },
}

// ─── 6. Speaker Repository ────────────────────────────────────────────────────

export const SpeakerRepository = {
  async listByUser(userId: string): Promise<Speaker[]> {
    return db.query<Speaker>("SELECT * FROM speakers WHERE user_id = ? ORDER BY name ASC", [userId])
  },

  async getById(id: string, userId: string): Promise<Speaker | null> {
    const rows = await db.query<Speaker>(
      "SELECT * FROM speakers WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    )
    return rows[0] ?? null
  },

  async findByName(userId: string, name: string): Promise<Speaker | null> {
    const rows = await db.query<Speaker>(
      "SELECT * FROM speakers WHERE user_id = ? AND LOWER(name) = LOWER(?) LIMIT 1",
      [userId, name.trim()]
    )
    return rows[0] ?? null
  },

  async create(speaker: Omit<Speaker, "created_at" | "updated_at">): Promise<Speaker> {
    const existing = await this.findByName(speaker.user_id, speaker.name)
    if (existing) return existing

    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO speakers (id, user_id, name, is_custom_named, voice_profile_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, name) DO UPDATE SET updated_at = excluded.updated_at`,
      [
        speaker.id,
        speaker.user_id,
        speaker.name.trim(),
        speaker.is_custom_named ? 1 : 0,
        speaker.voice_profile_id ?? null,
        now,
        now,
      ]
    )
    return { ...speaker, created_at: now, updated_at: now }
  },

  async updateName(id: string, userId: string, name: string): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      "UPDATE speakers SET name = ?, is_custom_named = 1, updated_at = ? WHERE id = ? AND user_id = ?",
      [name.trim(), now, id, userId]
    )
  },

  async addVoiceSample(sample: Omit<SpeakerVoiceSample, "created_at">): Promise<void> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO speaker_voice_samples (id, speaker_id, asset_id, spectral_features, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [
        sample.id,
        sample.speaker_id,
        sample.asset_id,
        sample.spectral_features ? JSON.stringify(sample.spectral_features) : null,
        now,
      ]
    )
  },

  async getVoiceSamples(speakerId: string): Promise<SpeakerVoiceSample[]> {
    const rows = await db.query<any>(
      "SELECT * FROM speaker_voice_samples WHERE speaker_id = ?",
      [speakerId]
    )
    return rows.map((r: any) => ({
      ...r,
      spectral_features: r.spectral_features ? JSON.parse(r.spectral_features) : null,
    }))
  },
}

// ─── 7. Recording & Transcript Repository ─────────────────────────────────────

export const RecordingRepository = {
  async create(recording: Omit<Recording, "created_at">): Promise<Recording> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO recordings (id, user_id, note_id, title, started_at, ended_at, duration_ms, audio_asset_id, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        recording.id,
        recording.user_id,
        recording.note_id ?? null,
        recording.title,
        recording.started_at,
        recording.ended_at ?? null,
        recording.duration_ms,
        recording.audio_asset_id,
        recording.status,
        now,
      ]
    )
    return { ...recording, created_at: now }
  },

  async listByNote(noteId: string, userId: string): Promise<Recording[]> {
    return db.query<Recording>(
      "SELECT * FROM recordings WHERE note_id = ? AND user_id = ? ORDER BY started_at ASC",
      [noteId, userId]
    )
  },

  async listByUser(userId: string): Promise<Recording[]> {
    return db.query<Recording>(
      "SELECT * FROM recordings WHERE user_id = ? ORDER BY started_at DESC",
      [userId]
    )
  },

  async getById(id: string, userId: string): Promise<Recording | null> {
    const rows = await db.query<Recording>(
      "SELECT * FROM recordings WHERE id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    )
    return rows[0] ?? null
  },

  async delete(id: string, userId: string): Promise<void> {
    await db.execute("DELETE FROM recordings WHERE id = ? AND user_id = ?", [id, userId])
  },

  async updateStatus(id: string, status: Recording["status"], durationMs?: number): Promise<void> {
    if (durationMs !== undefined) {
      await db.execute(
        "UPDATE recordings SET status = ?, duration_ms = ? WHERE id = ?",
        [status, durationMs, id]
      )
    } else {
      await db.execute("UPDATE recordings SET status = ? WHERE id = ?", [status, id])
    }
  },
}

export const TranscriptRepository = {
  async create(transcript: Omit<Transcript, "created_at">): Promise<Transcript> {
    const now = new Date().toISOString()
    await db.execute(
      `INSERT INTO transcripts (id, recording_id, language, status, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      [transcript.id, transcript.recording_id, transcript.language, transcript.status, now]
    )
    return { ...transcript, created_at: now }
  },

  async getByRecording(recordingId: string): Promise<{ transcript: Transcript; segments: TranscriptSegment[] } | null> {
    const transRows = await db.query<Transcript>(
      "SELECT * FROM transcripts WHERE recording_id = ? LIMIT 1",
      [recordingId]
    )
    if (!transRows[0]) return null

    const segments = await db.query<TranscriptSegment>(
      "SELECT * FROM transcript_segments WHERE transcript_id = ? ORDER BY sequence ASC",
      [transRows[0].id]
    )

    return { transcript: transRows[0], segments }
  },

  async bulkInsertSegments(segments: TranscriptSegment[]): Promise<void> {
    for (const seg of segments) {
      await db.execute(
        `INSERT INTO transcript_segments (id, transcript_id, speaker_id, start_ms, end_ms, text, sequence)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [seg.id, seg.transcript_id, seg.speaker_id ?? null, seg.start_ms, seg.end_ms, seg.text, seg.sequence]
      )
    }
  },
}

// ─── 8. Knowledge Repository (Markdown & Chunks) ──────────────────────────────

export const KnowledgeRepository = {
  async upsertDocument(
    doc: Pick<KnowledgeDocument, "id" | "user_id" | "source_type" | "source_id" | "content" | "checksum"> &
      Partial<Omit<KnowledgeDocument, "id" | "user_id" | "source_type" | "source_id" | "content" | "checksum">>
  ): Promise<KnowledgeDocument> {
    const now = new Date().toISOString()
    const status = doc.status || "completed"
    const attemptCount = doc.attempt_count ?? 0
    const embeddingModel = doc.embedding_model || "text-embedding-3-small"
    const embeddingVersion = doc.embedding_version || "v1"

    await db.execute(
      `INSERT INTO knowledge_documents (
         id, user_id, source_type, source_id, content, checksum,
         status, error_message, attempt_count, source_version,
         embedding_model, embedding_version, started_at, completed_at,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
         content = excluded.content,
         checksum = excluded.checksum,
         status = excluded.status,
         error_message = excluded.error_message,
         attempt_count = excluded.attempt_count,
         source_version = excluded.source_version,
         embedding_model = excluded.embedding_model,
         embedding_version = excluded.embedding_version,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         updated_at = excluded.updated_at`,
      [
        doc.id,
        doc.user_id,
        doc.source_type,
        doc.source_id,
        doc.content,
        doc.checksum,
        status,
        doc.error_message ?? null,
        attemptCount,
        doc.source_version ?? null,
        embeddingModel,
        embeddingVersion,
        doc.started_at ?? null,
        doc.completed_at ?? null,
        now,
        now,
      ]
    )
    return {
      ...doc,
      status,
      attempt_count: attemptCount,
      embedding_model: embeddingModel,
      embedding_version: embeddingVersion,
      created_at: now,
      updated_at: now,
    }
  },

  async getDocumentBySource(sourceType: string, sourceId: string, userId?: string): Promise<KnowledgeDocument | null> {
    let sql = "SELECT * FROM knowledge_documents WHERE source_type = ? AND source_id = ?"
    const params: unknown[] = [sourceType, sourceId]
    if (userId) {
      sql += " AND user_id = ?"
      params.push(userId)
    }
    sql += " LIMIT 1"
    const rows = await db.query<KnowledgeDocument>(sql, params)
    return rows[0] ?? null
  },

  async updateStatus(
    id: string,
    status: KnowledgeDocumentStatus,
    errorMessage?: string | null,
    timestamps?: { started_at?: string | null; completed_at?: string | null }
  ): Promise<void> {
    const now = new Date().toISOString()
    let sql = "UPDATE knowledge_documents SET status = ?, error_message = ?, updated_at = ?"
    const params: unknown[] = [status, errorMessage ?? null, now]

    if (timestamps?.started_at !== undefined) {
      sql += ", started_at = ?"
      params.push(timestamps.started_at)
    }
    if (timestamps?.completed_at !== undefined) {
      sql += ", completed_at = ?"
      params.push(timestamps.completed_at)
    }
    sql += " WHERE id = ?"
    params.push(id)

    await db.execute(sql, params)
  },

  async atomicReplaceChunks(
    document: KnowledgeDocument,
    chunks: Omit<KnowledgeChunk, "created_at">[]
  ): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Transactionally upsert knowledge document with status = completed
      const now = new Date().toISOString()
      await tx.execute(
        `INSERT INTO knowledge_documents (
           id, user_id, source_type, source_id, content, checksum,
           status, error_message, attempt_count, source_version,
           embedding_model, embedding_version, started_at, completed_at,
           created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, source_type, source_id) DO UPDATE SET
           content = excluded.content,
           checksum = excluded.checksum,
           status = excluded.status,
           error_message = excluded.error_message,
           attempt_count = excluded.attempt_count,
           source_version = excluded.source_version,
           embedding_model = excluded.embedding_model,
           embedding_version = excluded.embedding_version,
           started_at = excluded.started_at,
           completed_at = excluded.completed_at,
           updated_at = excluded.updated_at`,
        [
          document.id,
          document.user_id,
          document.source_type,
          document.source_id,
          document.content,
          document.checksum,
          document.status,
          document.error_message ?? null,
          document.attempt_count,
          document.source_version ?? null,
          document.embedding_model,
          document.embedding_version,
          document.started_at ?? null,
          document.completed_at ?? null,
          now,
          now,
        ]
      )

      // 2. Fetch existing chunk IDs first to cleanly purge FTS5 index
      const existingChunks = await tx.query<{ id: string }>(
        "SELECT id FROM knowledge_chunks WHERE knowledge_document_id = ?",
        [document.id]
      )
      for (const chunk of existingChunks) {
        await tx.execute("DELETE FROM knowledge_chunks_fts WHERE chunk_id = ?", [chunk.id])
      }
      await tx.execute("DELETE FROM knowledge_chunks WHERE knowledge_document_id = ?", [document.id])

      // 3. Atomically insert new chunks and index in FTS5
      for (const c of chunks) {
        const embeddingStr = c.embedding ? JSON.stringify(c.embedding) : null
        const metadataStr = c.metadata ? JSON.stringify(c.metadata) : null

        await tx.execute(
          `INSERT INTO knowledge_chunks (id, knowledge_document_id, user_id, content, start_ms, end_ms, speaker_id, embedding, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.knowledge_document_id, c.user_id, c.content, c.start_ms ?? null, c.end_ms ?? null, c.speaker_id ?? null, embeddingStr, metadataStr, now]
        )

        await tx.execute(
          "INSERT INTO knowledge_chunks_fts (chunk_id, user_id, content) VALUES (?, ?, ?)",
          [c.id, c.user_id, c.content]
        )
      }
    })
  },

  async replaceChunks(documentId: string, chunks: Omit<KnowledgeChunk, "created_at">[]): Promise<void> {
    await db.transaction(async (tx) => {
      // 1. Fetch existing chunk IDs first to cleanly purge FTS index before deleting chunks
      const existingChunks = await tx.query<{ id: string }>(
        "SELECT id FROM knowledge_chunks WHERE knowledge_document_id = ?",
        [documentId]
      )
      for (const chunk of existingChunks) {
        await tx.execute("DELETE FROM knowledge_chunks_fts WHERE chunk_id = ?", [chunk.id])
      }
      await tx.execute("DELETE FROM knowledge_chunks WHERE knowledge_document_id = ?", [documentId])

      const now = new Date().toISOString()
      for (const c of chunks) {
        const embeddingStr = c.embedding ? JSON.stringify(c.embedding) : null
        const metadataStr = c.metadata ? JSON.stringify(c.metadata) : null

        await tx.execute(
          `INSERT INTO knowledge_chunks (id, knowledge_document_id, user_id, content, start_ms, end_ms, speaker_id, embedding, metadata, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [c.id, c.knowledge_document_id, c.user_id, c.content, c.start_ms ?? null, c.end_ms ?? null, c.speaker_id ?? null, embeddingStr, metadataStr, now]
        )

        // Index into FTS5 for fast full-text search
        await tx.execute(
          "INSERT INTO knowledge_chunks_fts (chunk_id, user_id, content) VALUES (?, ?, ?)",
          [c.id, c.user_id, c.content]
        )
      }
    })
  },

  async deleteBySource(sourceType: string, sourceId: string, userId?: string): Promise<void> {
    let sql = "SELECT * FROM knowledge_documents WHERE source_type = ? AND source_id = ?"
    const params: unknown[] = [sourceType, sourceId]
    if (userId) {
      sql += " AND user_id = ?"
      params.push(userId)
    }
    sql += " LIMIT 1"
    const rows = await db.query<KnowledgeDocument>(sql, params)
    const doc = rows[0]
    if (doc) {
      const existingChunks = await db.query<{ id: string }>(
        "SELECT id FROM knowledge_chunks WHERE knowledge_document_id = ?",
        [doc.id]
      )
      for (const chunk of existingChunks) {
        await db.execute("DELETE FROM knowledge_chunks_fts WHERE chunk_id = ?", [chunk.id])
      }
      await db.execute("DELETE FROM knowledge_chunks WHERE knowledge_document_id = ?", [doc.id])
      await db.execute("DELETE FROM knowledge_documents WHERE id = ?", [doc.id])
    }
  },

  async searchChunksKeyword(userId: string, queryText: string, limit = 20): Promise<KnowledgeChunk[]> {
    // Clean query text for FTS
    const sanitized = queryText.replace(/[^a-zA-Z0-9\s]/g, " ").trim()
    const words = sanitized.split(/\s+/).filter(Boolean)
    if (words.length === 0) return []

    const ftsQuery = words.map((w) => `"${w}"*`).join(" OR ")

    try {
      const rows = await db.query<any>(
        `SELECT kc.* FROM knowledge_chunks kc
         JOIN knowledge_chunks_fts fts ON fts.chunk_id = kc.id
         JOIN knowledge_documents kd ON kd.id = kc.knowledge_document_id
         LEFT JOIN notes n ON (kd.source_type = 'note' AND n.id = kd.source_id)
         WHERE fts.user_id = ?
           AND (n.deleted_at IS NULL)
           AND knowledge_chunks_fts MATCH ?
         LIMIT ?`,
        [userId, ftsQuery, limit]
      )
      return rows.map((r: any) => ({
        ...r,
        embedding: r.embedding ? JSON.parse(r.embedding) : null,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
      }))
    } catch {
      // Fallback to LIKE if FTS fails
      const likePattern = `%${sanitized}%`
      const rows = await db.query<any>(
        `SELECT kc.* FROM knowledge_chunks kc
         JOIN knowledge_documents kd ON kd.id = kc.knowledge_document_id
         LEFT JOIN notes n ON (kd.source_type = 'note' AND n.id = kd.source_id)
         WHERE kc.user_id = ?
           AND (n.deleted_at IS NULL)
           AND kc.content LIKE ?
         LIMIT ?`,
        [userId, likePattern, limit]
      )
      return rows.map((r: any) => ({
        ...r,
        embedding: r.embedding ? JSON.parse(r.embedding) : null,
        metadata: r.metadata ? JSON.parse(r.metadata) : null,
      }))
    }
  },

  async getAllChunksForUser(userId: string): Promise<KnowledgeChunk[]> {
    const rows = await db.query<any>(
      `SELECT kc.* FROM knowledge_chunks kc
       JOIN knowledge_documents kd ON kd.id = kc.knowledge_document_id
       LEFT JOIN notes n ON (kd.source_type = 'note' AND n.id = kd.source_id)
       WHERE kc.user_id = ?
         AND (n.deleted_at IS NULL)`,
      [userId]
    )
    return rows.map((r: any) => ({
      ...r,
      embedding: r.embedding ? JSON.parse(r.embedding) : null,
      metadata: r.metadata ? JSON.parse(r.metadata) : null,
    }))
  },
}
