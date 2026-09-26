/**
 * Core Relational Schema and Entity Definitions
 * Models all 14 target entities for Phase 1 Notes & Memory architecture.
 */

// ─── 1. Users ─────────────────────────────────────────────────────────────────
export interface User {
  id: string
  email: string
  password_hash: string
  name: string
  verified: boolean
  created_at: string
  updated_at: string
}

// ─── 2. Folders ───────────────────────────────────────────────────────────────
export interface Folder {
  id: string
  user_id: string
  parent_id?: string | null
  name: string
  icon?: string
  is_system?: boolean
  is_archived?: boolean
  created_at: string
  updated_at: string
}

// ─── 3. Assets (Original Source of Truth for Files & Audio) ──────────────────
export type AssetType = "audio" | "image" | "docx" | "csv" | "text" | "other"

export interface Asset {
  id: string
  user_id: string
  type: AssetType
  storage_key: string
  mime_type: string
  filename: string
  size_bytes: number
  width?: number | null
  height?: number | null
  duration_ms?: number | null
  checksum: string // SHA-256
  created_at: string
}

// ─── 4. Notes ─────────────────────────────────────────────────────────────────
export interface Note {
  id: string
  user_id: string
  folder_id?: string | null
  title: string
  content: string // User note body
  is_archived?: boolean
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

export interface NoteAsset {
  note_id: string
  asset_id: string
  created_at: string
}

// ─── 5. Tags ──────────────────────────────────────────────────────────────────
export interface Tag {
  id: string
  user_id: string
  name: string
  color: string
  created_at: string
}

export interface NoteTag {
  note_id: string
  tag_id: string
}

// ─── 6. Speakers & Voice Profiles ─────────────────────────────────────────────
export interface Speaker {
  id: string
  user_id: string
  name: string
  is_custom_named: boolean
  voice_profile_id?: string | null
  created_at: string
  updated_at: string
}

export interface SpeakerVoiceSample {
  id: string
  speaker_id: string
  asset_id: string
  spectral_features?: number[] | null
  created_at: string
}

// ─── 7. Recordings & Transcripts ──────────────────────────────────────────────
export type RecordingStatus = "recording" | "processing" | "ready" | "failed"

export interface Recording {
  id: string
  user_id: string
  note_id?: string | null
  title: string
  started_at: string
  ended_at?: string | null
  duration_ms: number
  audio_asset_id: string
  status: RecordingStatus
  created_at: string
}

export type TranscriptStatus = "in_progress" | "completed" | "failed"

export interface Transcript {
  id: string
  recording_id: string
  language: string
  status: TranscriptStatus
  created_at: string
}

export interface TranscriptSegment {
  id: string
  transcript_id: string
  speaker_id?: string | null
  start_ms: number
  end_ms: number
  text: string
  sequence: number
}

// ─── 8. Derived Knowledge Documents & Chunks ──────────────────────────────────
export type KnowledgeSourceType = "note" | "recording" | "asset"

export type KnowledgeDocumentStatus = "pending" | "processing" | "completed" | "failed"

export interface KnowledgeDocument {
  id: string
  user_id: string
  source_type: KnowledgeSourceType
  source_id: string
  content: string // Normalized Markdown
  checksum: string // SHA-256 of source content + metadata
  status: KnowledgeDocumentStatus
  error_message?: string | null
  attempt_count: number
  source_version?: string | null
  embedding_model: string
  embedding_version: string
  started_at?: string | null
  completed_at?: string | null
  created_at: string
  updated_at: string
}

export interface KnowledgeChunk {
  id: string
  knowledge_document_id: string
  user_id: string
  content: string
  start_ms?: number | null
  end_ms?: number | null
  speaker_id?: string | null
  embedding?: number[] | null // 1536 float dimensions
  metadata?: Record<string, unknown>
  created_at: string
}

// ─── Database DDL for PostgreSQL & SQLite ─────────────────────────────────────

export const POSTGRES_SCHEMA_SQL = `
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'custom',
    is_system BOOLEAN DEFAULT false,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    width INT,
    height INT,
    duration_ms INT,
    checksum TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_archived BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS note_assets (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (note_id, asset_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS speakers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_custom_named BOOLEAN DEFAULT false,
    voice_profile_id TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS speaker_voice_samples (
    id TEXT PRIMARY KEY,
    speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    spectral_features JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    duration_ms INT NOT NULL,
    audio_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    recording_id TEXT UNIQUE NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    language TEXT DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
    start_ms INT NOT NULL,
    end_ms INT NOT NULL,
    text TEXT NOT NULL,
    sequence INT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    attempt_count INT NOT NULL DEFAULT 0,
    source_version TEXT,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_version TEXT NOT NULL DEFAULT 'v1',
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_ms INT,
    end_ms INT,
    speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}',
    tsv_content tsvector GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_transcript_seq ON transcript_segments(transcript_id, sequence);
CREATE INDEX IF NOT EXISTS idx_segments_transcript_start ON transcript_segments(transcript_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_chunks_user_doc ON knowledge_chunks(user_id, knowledge_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_speakers_user_name ON speakers(user_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kdocs_source ON knowledge_documents(user_id, source_type, source_id);
`;

export const SQLITE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name TEXT NOT NULL,
    verified INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS folders (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES folders(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT 'custom',
    is_system INTEGER DEFAULT 0,
    is_archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    storage_key TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    filename TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_ms INTEGER,
    checksum TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notes (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id TEXT REFERENCES folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_archived INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS note_assets (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    created_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (note_id, asset_id)
);

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS note_tags (
    note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (note_id, tag_id)
);

CREATE TABLE IF NOT EXISTS speakers (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_custom_named INTEGER DEFAULT 0,
    voice_profile_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, name)
);

CREATE TABLE IF NOT EXISTS speaker_voice_samples (
    id TEXT PRIMARY KEY,
    speaker_id TEXT NOT NULL REFERENCES speakers(id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
    spectral_features TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recordings (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    note_id TEXT REFERENCES notes(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_ms INTEGER NOT NULL,
    audio_asset_id TEXT NOT NULL REFERENCES assets(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'ready',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcripts (
    id TEXT PRIMARY KEY,
    recording_id TEXT UNIQUE NOT NULL REFERENCES recordings(id) ON DELETE CASCADE,
    language TEXT DEFAULT 'en',
    status TEXT NOT NULL DEFAULT 'completed',
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS transcript_segments (
    id TEXT PRIMARY KEY,
    transcript_id TEXT NOT NULL REFERENCES transcripts(id) ON DELETE CASCADE,
    speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
    start_ms INTEGER NOT NULL,
    end_ms INTEGER NOT NULL,
    text TEXT NOT NULL,
    sequence INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_documents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    content TEXT NOT NULL,
    checksum TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'completed',
    error_message TEXT,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    source_version TEXT,
    embedding_model TEXT NOT NULL DEFAULT 'text-embedding-3-small',
    embedding_version TEXT NOT NULL DEFAULT 'v1',
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE (user_id, source_type, source_id)
);

CREATE TABLE IF NOT EXISTS knowledge_chunks (
    id TEXT PRIMARY KEY,
    knowledge_document_id TEXT NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    start_ms INTEGER,
    end_ms INTEGER,
    speaker_id TEXT REFERENCES speakers(id) ON DELETE SET NULL,
    embedding TEXT, -- JSON string of float array
    metadata TEXT,  -- JSON string of metadata
    created_at TEXT DEFAULT (datetime('now'))
);

-- Full-Text Search Virtual Table (FTS5) for fast keyword search
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks_fts USING fts5(
    chunk_id UNINDEXED,
    user_id UNINDEXED,
    content,
    tokenize = 'porter unicode61'
);

CREATE INDEX IF NOT EXISTS idx_notes_user_updated ON notes(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_segments_transcript_seq ON transcript_segments(transcript_id, sequence);
CREATE INDEX IF NOT EXISTS idx_segments_transcript_start ON transcript_segments(transcript_id, start_ms);
CREATE INDEX IF NOT EXISTS idx_chunks_user_doc ON knowledge_chunks(user_id, knowledge_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_speakers_user_name ON speakers(user_id, name);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kdocs_source ON knowledge_documents(user_id, source_type, source_id);
`;
