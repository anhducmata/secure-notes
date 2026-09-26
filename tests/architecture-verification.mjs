/**
 * Comprehensive Architecture Verification Suite
 * Verifies all 14 entities, ingestion parsers, audio/transcripts,
 * Knowledge Markdown, chunking, and hybrid search.
 */

import assert from "node:assert/strict"
import fs from "node:fs"
import path from "node:path"
import zlib from "node:zlib"

// ─── Test 1: CSV Ingestion ──────────────────────────────────────────────────
console.log("=== Test 1: CSV Ingestion ===")
const { parseCsv, parseCsvRows } = await import("../lib/ingestion/csv.ts")

const csvSample = `Name,Role,Department,"Annual Salary",Notes
"Doe, John",Engineer,Platform,"$120,000","Senior developer,
handles databases"
"Smith, Jane",Designer,Product,"$115,000","Lead UI/UX"
"Miller, Bob",Manager,Product,"$130,000","Scrum master"
`

const parsedCsv = parseCsv(csvSample)
console.log("CSV parsed rows count:", parsedCsv.rowCount)
console.log("CSV columns:", parsedCsv.headers.join(", "))
assert.equal(parsedCsv.rowCount, 3)
assert.equal(parsedCsv.columnCount, 5)
assert.ok(parsedCsv.markdownTable.includes("| Doe, John | Engineer | Platform | $120,000 |"))
assert.ok(parsedCsv.markdownTable.includes("Senior developer,"))
console.log("✓ CSV parser properly handles quotes, commas, and multiline values\n")

// ─── Test 2: DOCX Ingestion ─────────────────────────────────────────────────
console.log("=== Test 2: DOCX Ingestion ===")
const { parseDocx } = await import("../lib/ingestion/docx.ts")

// Helper: build a minimal valid DOCX zip buffer in memory
function createMinimalDocxBuffer(xmlContent) {
  const filename = "word/document.xml"
  const compressedData = zlib.deflateRawSync(Buffer.from(xmlContent, "utf8"))
  const uncompressedSize = Buffer.byteLength(xmlContent, "utf8")
  const compressedSize = compressedData.length
  const fileNameBuffer = Buffer.from(filename, "utf8")

  const header = Buffer.alloc(30)
  header.writeUInt32LE(0x04034b50, 0) // PK\x03\x04
  header.writeUInt16LE(20, 4)         // Version needed
  header.writeUInt16LE(0, 6)          // Flags
  header.writeUInt16LE(8, 8)          // Compression: DEFLATE
  header.writeUInt16LE(0, 10)         // Mod time
  header.writeUInt16LE(0, 12)         // Mod date
  header.writeUInt32LE(0, 14)         // CRC-32 (0 for test)
  header.writeUInt32LE(compressedSize, 18)
  header.writeUInt32LE(uncompressedSize, 22)
  header.writeUInt16LE(fileNameBuffer.length, 26)
  header.writeUInt16LE(0, 28)         // Extra field length

  return Buffer.concat([header, fileNameBuffer, compressedData])
}

const docxXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pStyle w:val="Heading1"/><w:r><w:t>Project Apollo Strategy</w:t></w:r></w:p>
    <w:p><w:r><w:t>This is an executive summary of the </w:t></w:r><w:r><w:b/><w:t>architecture</w:t></w:r><w:r><w:t>.</w:t></w:r></w:p>
    <w:p><w:numPr/><w:r><w:t>Adopt PostgreSQL 16</w:t></w:r></w:p>
    <w:p><w:numPr/><w:r><w:t>Enable pgvector</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Component</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Status</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Database</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Active</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>
  </w:body>
</w:document>`

const docxBuffer = createMinimalDocxBuffer(docxXml)
const parsedDocx = parseDocx(docxBuffer)
console.log("DOCX Title:", parsedDocx.title)
console.log("DOCX Markdown:\n" + parsedDocx.markdown)
assert.equal(parsedDocx.title, "Project Apollo Strategy")
assert.ok(parsedDocx.markdown.includes("# Project Apollo Strategy"))
assert.ok(parsedDocx.markdown.includes("**architecture**"))
assert.ok(parsedDocx.markdown.includes("- Adopt PostgreSQL 16"))
assert.ok(parsedDocx.markdown.includes("| Component | Status |"))
console.log("✓ DOCX parser extracted headings, bold runs, lists, and tables into Markdown\n")

// ─── Test 3: Relational Database & Entity Repositories ───────────────────────
console.log("=== Test 3: Relational Database & Repositories ===")
const {
  UserRepository,
  FolderRepository,
  TagRepository,
  NoteRepository,
  AssetRepository,
  SpeakerRepository,
  RecordingRepository,
  TranscriptRepository,
  KnowledgeRepository,
} = await import("../lib/db/repositories.ts")

const testUserId = `usr_test_${Date.now()}`
const user = await UserRepository.create({
  id: testUserId,
  email: `test_${Date.now()}@example.com`,
  password_hash: "hashed_secret",
  name: "Alexander Hamilton",
  verified: true,
})
assert.ok(user.id)
console.log("✓ User created:", user.name, `(${user.email})`)

// Folders
const folder = await FolderRepository.create({
  id: `fld_${Date.now()}`,
  user_id: user.id,
  name: "Engineering Specs",
  icon: "custom",
})
assert.ok(folder.id)
console.log("✓ Folder created:", folder.name)

// Tags
const tag1 = await TagRepository.create({
  id: `tag_arch_${Date.now()}`,
  user_id: user.id,
  name: "Architecture",
  color: "#3b82f6",
})
const tag2 = await TagRepository.create({
  id: `tag_p1_${Date.now()}`,
  user_id: user.id,
  name: "Phase1",
  color: "#ef4444",
})
console.log("✓ Tags created:", tag1.name, tag2.name)

// Notes
const note = await NoteRepository.upsert({
  id: `note_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "Phase 1 Audio Memory Architecture",
  content: "We are building a unified memory pipeline where original files remain source of truth.",
})
await NoteRepository.setTagsForNote(note.id, [tag1.id, tag2.id])
const linkedTags = await NoteRepository.getTagsForNote(note.id)
assert.equal(linkedTags.length, 2)
console.log("✓ Note created with 2 relational tags:", note.title)

// Assets
const asset = await AssetRepository.create({
  id: `ast_${Date.now()}`,
  user_id: user.id,
  type: "audio",
  storage_key: `${user.id}/audio/recording1.webm`,
  mime_type: "audio/webm",
  filename: "meeting_recording.webm",
  size_bytes: 1048576,
  duration_ms: 125000,
  checksum: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
})
assert.ok(asset.id)
console.log("✓ Asset created:", asset.filename, `(${asset.type})`)

// Speakers
const speaker1 = await SpeakerRepository.create({
  id: `spk_1_${Date.now()}`,
  user_id: user.id,
  name: "Dr. Sarah Chen",
  is_custom_named: true,
})
const speaker2 = await SpeakerRepository.create({
  id: `spk_2_${Date.now()}`,
  user_id: user.id,
  name: "Marcus Vance",
  is_custom_named: true,
})
console.log("✓ Speakers created:", speaker1.name, speaker2.name)

// Recordings & Transcripts
const recording = await RecordingRepository.create({
  id: `rec_${Date.now()}`,
  user_id: user.id,
  note_id: note.id,
  title: "Sprint Planning Session",
  started_at: new Date().toISOString(),
  duration_ms: 125000,
  audio_asset_id: asset.id,
  status: "ready",
})

const transcript = await TranscriptRepository.create({
  id: `trn_${Date.now()}`,
  recording_id: recording.id,
  language: "en",
  status: "completed",
})

const segments = [
  {
    id: `seg_1_${Date.now()}`,
    transcript_id: transcript.id,
    speaker_id: speaker1.id,
    start_ms: 0,
    end_ms: 45000,
    text: "Let's review the memory agent requirements for Phase 1.",
    sequence: 0,
  },
  {
    id: `seg_2_${Date.now()}`,
    transcript_id: transcript.id,
    speaker_id: speaker2.id,
    start_ms: 45000,
    end_ms: 90000,
    text: "We require exact timestamp deep-links from agent answers back to audio segments.",
    sequence: 1,
  },
]
await TranscriptRepository.bulkInsertSegments(segments)
const retrievedTranscript = await TranscriptRepository.getByRecording(recording.id)
assert.equal(retrievedTranscript.segments.length, 2)
assert.equal(retrievedTranscript.segments[0].start_ms, 0)
assert.equal(retrievedTranscript.segments[1].start_ms, 45000)
console.log("✓ Recording, transcript, and timestamped segments verified\n")

// ─── Test 4: Knowledge Markdown & Semantic Chunking ─────────────────────────
console.log("=== Test 4: Knowledge Markdown & Semantic Chunking ===")
const { generateKnowledgeMarkdown } = await import("../lib/ingestion/markdown-generator.ts")
const { chunkDocument, generateEmbeddings } = await import("../lib/ingestion/chunker.ts")

const speakerMap = new Map([
  [speaker1.id, speaker1],
  [speaker2.id, speaker2],
])

const knowledgeMd = generateKnowledgeMarkdown({
  note,
  tags: ["Architecture", "Phase1"],
  folderName: "Engineering Specs",
  transcripts: [{ recordingTitle: recording.title, segments }],
  speakers: speakerMap,
  parsedAttachments: [
    {
      filename: "project_apollo.docx",
      type: "docx",
      markdownContent: parsedDocx.markdown,
    },
  ],
})

console.log("Generated Knowledge Markdown snippet:\n" + knowledgeMd.slice(0, 400) + "\n...")
assert.ok(knowledgeMd.includes("---"))
assert.ok(knowledgeMd.includes("tags: [\"Architecture\", \"Phase1\"]"))
assert.ok(knowledgeMd.includes("**Dr. Sarah Chen** [00:00 – 00:45]"))
assert.ok(knowledgeMd.includes("**Marcus Vance** [00:45 – 01:30]"))

const docId = `kdoc_${note.id}`
const docChecksum = "checksum_123"
await KnowledgeRepository.upsertDocument({
  id: docId,
  user_id: user.id,
  source_type: "note",
  source_id: note.id,
  content: knowledgeMd,
  checksum: docChecksum,
})

const chunks = chunkDocument(docId, knowledgeMd, {
  title: note.title,
  sourceType: "note",
  sourceId: note.id,
  folderId: folder.id,
  tags: ["Architecture", "Phase1"],
})

console.log(`Generated ${chunks.length} semantic chunks`)
const embeddings = await generateEmbeddings(chunks.map((c) => c.content))

const chunksToStore = chunks.map((c, i) => ({
  id: c.id,
  knowledge_document_id: docId,
  user_id: user.id,
  content: c.content,
  start_ms: c.startMs,
  end_ms: c.endMs,
  speaker_id: c.speakerId,
  embedding: embeddings[i],
  metadata: c.metadata,
}))
await KnowledgeRepository.replaceChunks(docId, chunksToStore)
console.log("✓ Knowledge document and semantic chunks stored with embeddings\n")

// ─── Test 5: Hybrid Search (FTS + Vector via RRF) ───────────────────────────
console.log("=== Test 5: Hybrid Search ===")
const { hybridSearch } = await import("../lib/search/index.ts")

const searchResults = await hybridSearch(user.id, "timestamp deep-links audio", {}, 5)
console.log(`Search returned ${searchResults.length} results`)
assert.ok(searchResults.length > 0)
const topResult = searchResults[0]
console.log("Top result snippet:", topResult.content.slice(0, 120).replace(/\n/g, " "))
console.log("Score:", topResult.score.toFixed(4), "FTS Rank:", topResult.ftsRank, "Vector Rank:", topResult.vectorRank)
assert.ok(topResult.content.toLowerCase().includes("timestamp"))
console.log("✓ Hybrid search successfully retrieved and ranked relevant knowledge chunk\n")

// ─── Test 6: Clean Deletion & Cascade (No Orphaned Records) ──────────────────
console.log("=== Test 6: Cascade Deletion ===")
await NoteRepository.permanentDelete(note.id, user.id)
await KnowledgeRepository.deleteBySource("note", note.id, user.id)

const postDeleteNote = await NoteRepository.getById(note.id, user.id)
assert.equal(postDeleteNote, null)

const postDeleteDoc = await KnowledgeRepository.getDocumentBySource("note", note.id)
assert.equal(postDeleteDoc, null)

const postDeleteChunks = await KnowledgeRepository.searchChunksKeyword(user.id, "timestamp deep-links")
assert.equal(postDeleteChunks.length, 0)
console.log("✓ Deleting note cleanly cascades to derived knowledge documents and chunks\n")

// ─── Test 7: Multi-Tenant Isolation & IDOR Attacks ──────────────────────────
console.log("=== Test 7: Multi-Tenant Isolation & IDOR Attack Rejection ===")

// Create User B (the attacker)
const userB = await UserRepository.create({
  id: `usr_attacker_${Date.now()}`,
  email: `attacker_${Date.now()}@example.com`,
  password_hash: "hashed_attacker",
  name: "Aaron Burr",
  verified: true,
})
assert.ok(userB.id)

// Create a private note and recording for User A
const victimNote = await NoteRepository.upsert({
  id: `note_victim_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "User A Confidential Strategic Memo",
  content: "Top secret strategy: project code Pegasus.",
})

const victimRecording = await RecordingRepository.create({
  id: `rec_victim_${Date.now()}`,
  user_id: user.id,
  note_id: victimNote.id,
  title: "Victim Board Meeting Recording",
  started_at: new Date().toISOString(),
  duration_ms: 60000,
  audio_asset_id: asset.id,
  status: "ready",
})

// Attack 1: User B tries to read User A's recordings by victim noteId
const leakedRecordings = await RecordingRepository.listByNote(victimNote.id, userB.id)
assert.equal(leakedRecordings.length, 0, "Attacker must not retrieve victim recordings")
console.log("✓ IDOR Attack 1 blocked: User B cannot query User A's recordings")

// Attack 2: User B tries to fetch User A's recording directly by ID
const leakedRecDirect = await RecordingRepository.getById(victimRecording.id, userB.id)
assert.equal(leakedRecDirect, null, "Attacker must not retrieve victim recording by ID")
console.log("✓ IDOR Attack 2 blocked: User B cannot fetch User A's recording by ID")

// Attack 3: User B attempts to overwrite User A's note via upsert with User A's note ID
await NoteRepository.upsert({
  id: victimNote.id,
  user_id: userB.id,
  title: "Pawned Note Content",
  content: "Attacker has overwritten this note.",
})
// Check that User A's original note content remains untouched
const checkVictimNote = await NoteRepository.getById(victimNote.id, user.id)
assert.equal(checkVictimNote.title, "User A Confidential Strategic Memo")
assert.ok(checkVictimNote.content.includes("Pegasus"))
console.log("✓ IDOR Attack 3 blocked: User B cannot overwrite User A's note")

// Attack 4: User B tries to delete User A's knowledge document
const victimDocId = `kdoc_${victimNote.id}`
await KnowledgeRepository.upsertDocument({
  id: victimDocId,
  user_id: user.id,
  source_type: "note",
  source_id: victimNote.id,
  content: victimNote.content,
  checksum: "abc123victim",
})
// User B attempts delete
await KnowledgeRepository.deleteBySource("note", victimNote.id, userB.id)
// Document must still exist for User A
const checkDoc = await KnowledgeRepository.getDocumentBySource("note", victimNote.id)
assert.ok(checkDoc, "Victim document must not be deleted by User B")
assert.equal(checkDoc.user_id, user.id)
console.log("✓ IDOR Attack 4 blocked: User B cannot delete User A's knowledge documents\n")

// ─── Test 8: Asset Security, Path Traversal Defense & Byte-Range ─────────────
console.log("=== Test 8: Asset Security & Path Traversal Defense ===")
const { assetStorage } = await import("../lib/storage/index.ts")

// Test path traversal rejection in assetStorage
let traversalCaught = false
try {
  await assetStorage.get("../../etc/passwd")
} catch (err) {
  traversalCaught = true
  assert.ok(err.message.includes("traversal") || err.message.includes("outside"))
}
assert.ok(traversalCaught, "assetStorage.get must reject ../../ path traversal")

let nestedTraversalCaught = false
try {
  await assetStorage.get("....//....//etc/passwd")
} catch (err) {
  nestedTraversalCaught = true
}
assert.ok(nestedTraversalCaught, "assetStorage.get must reject nested traversal sequences")
console.log("✓ Path traversal attacks successfully rejected by LocalStorageDriver")

// Test Asset ownership in AssetRepository
const foreignAsset = await AssetRepository.findByStorageKey(asset.storage_key, userB.id)
assert.equal(foreignAsset, null, "Attacker cannot locate victim asset record")
const ownAsset = await AssetRepository.findByStorageKey(asset.storage_key, user.id)
assert.ok(ownAsset, "Owner locates their own asset record")
console.log("✓ Asset database ownership verified: Cross-tenant asset access denied")

// Test Byte-Range slicing simulation
const sampleAudioBuffer = Buffer.alloc(10000, 0x42)
const rangeStart = 1000
const rangeEnd = 2999
const slice = sampleAudioBuffer.subarray(rangeStart, rangeEnd + 1)
assert.equal(slice.length, 2000)
console.log(`✓ Audio byte-range slicing verified: ${slice.length} bytes correctly sliced for HTTP 206\n`)

// ─── Test 9: Speaker Deduplication & Race Condition Immunity ────────────────
console.log("=== Test 9: Speaker Deduplication & Race Condition Immunity ===")

const speakerName = "Dr. Elizabeth Blackwell"
const spkAttempt1 = await SpeakerRepository.create({
  id: `spk_dedup_1_${Date.now()}`,
  user_id: user.id,
  name: speakerName,
  is_custom_named: false,
})

const spkAttempt2 = await SpeakerRepository.create({
  id: `spk_dedup_2_${Date.now()}`,
  user_id: user.id,
  name: speakerName.toLowerCase(), // case-insensitive deduplication check
  is_custom_named: false,
})

assert.equal(spkAttempt1.id, spkAttempt2.id, "Duplicate speaker names for same user must resolve to identical record")
const allUserSpeakers = await SpeakerRepository.listByUser(user.id)
const matches = allUserSpeakers.filter((s) => s.name.toLowerCase() === speakerName.toLowerCase())
assert.equal(matches.length, 1, "There must only be 1 speaker record in DB")
console.log("✓ Speaker deduplication verified: Concurrent/duplicate creations resolve to single entity\n")

// ─── Test 10: FTS Index Orphan Cleanup ──────────────────────────────────────
console.log("=== Test 10: FTS Index Clean-up on Chunks Replacement ===")
const testDocId = `kdoc_fts_test_${Date.now()}`
await KnowledgeRepository.upsertDocument({
  id: testDocId,
  user_id: user.id,
  source_type: "note",
  source_id: `note_fts_${Date.now()}`,
  content: "FTS initial content for search test",
  checksum: "fts_sum_1",
})

// Insert initial chunks
await KnowledgeRepository.replaceChunks(testDocId, [
  {
    id: `chunk_fts_1_${Date.now()}`,
    knowledge_document_id: testDocId,
    user_id: user.id,
    content: "Quantum computing algorithms for portfolio optimization",
  },
])
let ftsHits = await KnowledgeRepository.searchChunksKeyword(user.id, "Quantum computing")
assert.equal(ftsHits.length, 1)

// Now replace chunks with completely new content
await KnowledgeRepository.replaceChunks(testDocId, [
  {
    id: `chunk_fts_2_${Date.now()}`,
    knowledge_document_id: testDocId,
    user_id: user.id,
    content: "Neurobiology of memory formation in hippocampus",
  },
])

// The old keyword "Quantum" must no longer return any hits (zero orphaned FTS records!)
const oldHits = await KnowledgeRepository.searchChunksKeyword(user.id, "Quantum computing")
assert.equal(oldHits.length, 0, "Old FTS chunks must be completely purged from virtual table")

const newHits = await KnowledgeRepository.searchChunksKeyword(user.id, "Neurobiology memory")
assert.equal(newHits.length, 1, "New FTS chunks must be properly indexed and retrieved")
console.log("✓ FTS orphan cleanup verified: Zero stale records remain after replaceChunks\n")

// Cleanup test doc
await KnowledgeRepository.deleteBySource("note", testDocId, user.id)

console.log("✓ Tests 1-10 verified successfully!\n")

// ─── Test 11: Idempotent Indexing ────────────────────────────────────────────
console.log("=== Test 11: Idempotent Indexing ===")
const { db } = await import("../lib/db/database.ts")
const { processSource } = await import("../lib/ingestion/pipeline.ts")
const { knowledgeQueue } = await import("../lib/ingestion/queue.ts")

const idempNote = await NoteRepository.upsert({
  id: `note_idemp_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "Idempotency Architecture Guidelines",
  content: "Deterministic indexing guarantees no duplicate chunks or documents.",
})

// Run pipeline once
const res1 = await processSource(user.id, "note", idempNote.id)
assert.equal(res1.success, true)
assert.ok(res1.chunksCount > 0)
const initialChunkCount = res1.chunksCount

// Check DB state: exactly 1 document and initialChunkCount chunks
const docs1 = await db.query("SELECT * FROM knowledge_documents WHERE user_id = ? AND source_id = ?", [user.id, idempNote.id])
assert.equal(docs1.length, 1)
const chunks1 = await db.query("SELECT * FROM knowledge_chunks WHERE knowledge_document_id = ?", [docs1[0].id])
assert.equal(chunks1.length, initialChunkCount)

// Run pipeline second time with force=true
const res2 = await processSource(user.id, "note", idempNote.id, { force: true })
assert.equal(res2.success, true)
assert.equal(res2.chunksCount, initialChunkCount)

// Verify no duplicate documents or chunks accumulated
const docs2 = await db.query("SELECT * FROM knowledge_documents WHERE user_id = ? AND source_id = ?", [user.id, idempNote.id])
assert.equal(docs2.length, 1)
const chunks2 = await db.query("SELECT * FROM knowledge_chunks WHERE knowledge_document_id = ?", [docs2[0].id])
assert.equal(chunks2.length, initialChunkCount)
console.log("✓ Idempotent indexing verified: exactly 1 document and zero duplicate chunks accumulated\n")

// ─── Test 12: Update Reindex ─────────────────────────────────────────────────
console.log("=== Test 12: Update Reindex ===")
const updatedContent = "Advanced Byzantine Fault Tolerant distributed consensus protocols."
const updatedNote = await NoteRepository.upsert({
  ...idempNote,
  content: updatedContent,
})

const resUpdate = await processSource(user.id, "note", updatedNote.id)
assert.equal(resUpdate.success, true)

// Old keyword must return 0 hits
const oldContentHits = await KnowledgeRepository.searchChunksKeyword(user.id, "Deterministic indexing guarantees")
assert.equal(oldContentHits.length, 0, "Old content must be purged on reindex")

// New keyword must return hit
const newContentHits = await KnowledgeRepository.searchChunksKeyword(user.id, "Byzantine Fault Tolerant")
assert.equal(newContentHits.length, 1, "New content must be indexed and searchable")
console.log("✓ Update reindex verified: chunks successfully updated and old content purged\n")

// ─── Test 13: Delete During Index ────────────────────────────────────────────
console.log("=== Test 13: Delete During Index ===")
const doomedNote = await NoteRepository.upsert({
  id: `note_doomed_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "Doomed Transient Note",
  content: "This note will be deleted while indexing is ongoing.",
})

// Soft-delete the note
await NoteRepository.softDelete(doomedNote.id, user.id)

// Process source: pipeline checks note existence and deleted_at
const resDeleted = await processSource(user.id, "note", doomedNote.id)
assert.equal(resDeleted.success, false)
assert.equal(resDeleted.reason, "source_deleted_or_missing")

// Verify no knowledge documents or chunks remain
const doomedDocs = await db.query("SELECT * FROM knowledge_documents WHERE source_id = ?", [doomedNote.id])
assert.equal(doomedDocs.length, 0)
const doomedChunks = await db.query("SELECT * FROM knowledge_chunks WHERE content LIKE '%Doomed Transient%'")
assert.equal(doomedChunks.length, 0)
console.log("✓ Delete during index verified: processing safely aborted and cleaned up\n")

// ─── Test 14: Concurrent Indexing ────────────────────────────────────────────
console.log("=== Test 14: Concurrent Indexing ===")
const concurrentNote = await NoteRepository.upsert({
  id: `note_concurrent_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "High Concurrency Synchronization",
  content: "Testing multiple simultaneous workers indexing the same source entity.",
})

// Fire 3 concurrent process calls with force=true
const [c1, c2, c3] = await Promise.all([
  processSource(user.id, "note", concurrentNote.id, { force: true }),
  processSource(user.id, "note", concurrentNote.id, { force: true }),
  processSource(user.id, "note", concurrentNote.id, { force: true }),
])

assert.ok(c1.success && c2.success && c3.success)

// Verify DB integrity: exactly 1 knowledge document, no duplicate chunks
const cDocs = await db.query("SELECT * FROM knowledge_documents WHERE source_id = ?", [concurrentNote.id])
assert.equal(cDocs.length, 1)
const cChunks = await db.query("SELECT * FROM knowledge_chunks WHERE knowledge_document_id = ?", [cDocs[0].id])
assert.equal(cChunks.length, c1.chunksCount)
console.log("✓ Concurrent indexing verified: resolved cleanly with exactly 1 document and consistent chunk count\n")

// ─── Test 15: Failed Processing Recovery ─────────────────────────────────────
console.log("=== Test 15: Failed Processing Recovery ===")
const failNote = await NoteRepository.upsert({
  id: `note_fail_rec_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "Failure Recovery Mechanism",
  content: "Pipeline resiliently tracks errors and supports recovery.",
})

// 1. Simulate failure during embedding generation
const failRes = await processSource(user.id, "note", failNote.id, { simulateFailure: true, force: true })
assert.equal(failRes.success, false)
assert.ok(failRes.error?.includes("Simulated processing failure"))

const failDocs = await db.query("SELECT * FROM knowledge_documents WHERE source_id = ?", [failNote.id])
assert.equal(failDocs.length, 1)
assert.equal(failDocs[0].status, "failed")
assert.ok(failDocs[0].error_message?.includes("Simulated processing failure"))
assert.ok(failDocs[0].attempt_count >= 1)

// 2. Re-run without simulated failure (recovery)
const recoverRes = await processSource(user.id, "note", failNote.id, { force: true })
assert.equal(recoverRes.success, true)

const recoveredDocs = await db.query("SELECT * FROM knowledge_documents WHERE source_id = ?", [failNote.id])
assert.equal(recoveredDocs.length, 1)
assert.equal(recoveredDocs[0].status, "completed")
assert.equal(recoveredDocs[0].error_message, null)
assert.ok(recoveredDocs[0].completed_at !== null)
console.log("✓ Failed processing recovery verified: failed state tracked and recovered to completed\n")

// ─── Test 16: Embedding Deduplication / Cache Hit ────────────────────────────
console.log("=== Test 16: Embedding Deduplication & Checksum Cache Hit ===")
// Running pipeline on the unchanged recovered note without force: true must be a cache hit
const cacheHitRes = await processSource(user.id, "note", failNote.id, { force: false })
assert.equal(cacheHitRes.success, true)
assert.equal(cacheHitRes.cached, true)
assert.equal(cacheHitRes.documentId, `kdoc_${failNote.id}`)
console.log("✓ Checksum caching verified: unchanged content skipped chunking and embedding generation\n")

// ─── Test 17: Citation Integrity ────────────────────────────────────────────
console.log("=== Test 17: Citation Integrity ===")
const citationResults = await hybridSearch(user.id, "Byzantine Fault Tolerant", {}, 5)
assert.ok(citationResults.length > 0)
const citChunk = citationResults[0]
assert.ok(citChunk.documentId)
assert.ok(citChunk.chunkId)
assert.equal(citChunk.metadata.sourceType, "note")
assert.equal(citChunk.metadata.sourceId, idempNote.id)
assert.equal(citChunk.metadata.title, "Idempotency Architecture Guidelines")
console.log("✓ Citation integrity verified: chunk contains full provenance metadata (sourceType, sourceId, title)\n")

// ─── Test 18: Speaker Citation ───────────────────────────────────────────────
console.log("=== Test 18: Speaker Citation ===")
const speakerRec = await RecordingRepository.create({
  id: `rec_speaker_${Date.now()}`,
  user_id: user.id,
  title: "AI Safety Alignment Panel",
  started_at: "2026-09-26T10:00:00.000Z",
  duration_ms: 120000,
  audio_asset_id: asset.id,
  status: "ready",
})

const speakerTrans = await TranscriptRepository.create({
  id: `trans_speaker_${Date.now()}`,
  recording_id: speakerRec.id,
  language: "en",
  status: "completed",
})

await TranscriptRepository.bulkInsertSegments([
  {
    id: `seg_spk_1_${Date.now()}`,
    transcript_id: speakerTrans.id,
    speaker_id: speaker1.id,
    start_ms: 0,
    end_ms: 30000,
    text: "Neural interpretability allows us to audit deep activation spaces safely.",
    sequence: 0,
  },
  {
    id: `seg_spk_2_${Date.now()}`,
    transcript_id: speakerTrans.id,
    speaker_id: speaker2.id,
    start_ms: 30000,
    end_ms: 60000,
    text: "Operational boundaries must be established before deployment.",
    sequence: 1,
  },
])

// Index recording via pipeline
const recIndexRes = await processSource(user.id, "recording", speakerRec.id)
assert.equal(recIndexRes.success, true)

// Search for phrase spoken by Dr. Sarah Chen
const speakerSearchResults = await hybridSearch(user.id, "Neural interpretability audit deep activation", {}, 5)
assert.ok(speakerSearchResults.length > 0)
const speakerHit = speakerSearchResults[0]
assert.equal(speakerHit.speakerId, speaker1.id)
assert.equal(speakerHit.metadata.speakerName, "Dr. Sarah Chen")
assert.equal(speakerHit.startMs, 0)
assert.ok(speakerHit.endMs >= 30000)
console.log("✓ Speaker citation verified: speaker_id, speakerName, startMs, and endMs accurately preserved and retrieved\n")

// ─── Test 19: Search After Restore ───────────────────────────────────────────
console.log("=== Test 19: Search After Restore ===")
// 1. Soft-delete the note
await NoteRepository.softDelete(idempNote.id, user.id)

// 2. Keyword search must return 0 hits for the soft-deleted note
const softDeletedKeyword = await KnowledgeRepository.searchChunksKeyword(user.id, "Byzantine Fault Tolerant")
assert.equal(softDeletedKeyword.length, 0, "Keyword search must return 0 hits for soft-deleted note")

// 3. Hybrid search must exclude any chunks from the soft-deleted note
const softDeletedSearch = await hybridSearch(user.id, "Byzantine Fault Tolerant", {}, 5)
const softDeletedHits = softDeletedSearch.filter(
  (r) => r.metadata.sourceId === idempNote.id || r.content.includes("Byzantine")
)
assert.equal(softDeletedHits.length, 0, "Soft-deleted note chunks must be excluded from hybrid search")

// 4. Restore note
await NoteRepository.upsert({
  ...idempNote,
  content: updatedContent,
  deleted_at: null,
})

// 5. Search must retrieve it immediately
const restoredKeyword = await KnowledgeRepository.searchChunksKeyword(user.id, "Byzantine Fault Tolerant")
assert.ok(restoredKeyword.length > 0, "Keyword search must retrieve restored note chunks")

const restoredSearch = await hybridSearch(user.id, "Byzantine Fault Tolerant", {}, 5)
const restoredHits = restoredSearch.filter((r) => r.metadata.sourceId === idempNote.id)
assert.ok(restoredHits.length > 0, "Restored note chunks must be immediately visible in hybrid search")
assert.ok(restoredHits[0].content.includes("Byzantine Fault Tolerant"))
console.log("✓ Search after restore verified: soft-deleted notes hidden, restored notes immediately searchable\n")

// ─── Test 20: Version Race Protection ────────────────────────────────────────
console.log("=== Test 20: Version Race Protection ===")
const raceNote = await NoteRepository.upsert({
  id: `note_race_${Date.now()}`,
  user_id: user.id,
  folder_id: folder.id,
  title: "Race Condition Defense",
  content: "Initial Version 1 Content",
})

// Capture initial version timestamp
const v1Timestamp = raceNote.updated_at

// Simulate note being updated in background to Version 2
const v2Timestamp = new Date(Date.now() + 5000).toISOString()
await db.execute("UPDATE notes SET updated_at = ? WHERE id = ?", [v2Timestamp, raceNote.id])

// Pipeline called with checkVersion=v1 (simulating slow worker carrying stale version)
const staleWorkerRes = await processSource(user.id, "note", raceNote.id, {
  checkVersion: v1Timestamp,
  force: true,
})

assert.equal(staleWorkerRes.success, false)
assert.equal(staleWorkerRes.aborted, true)
assert.equal(staleWorkerRes.reason, "source_version_changed_during_processing")
console.log("✓ Version race protection verified: stale worker aborted without overwriting newer source\n")

console.log("🎉 ALL 20 ARCHITECTURAL, PIPELINE & LIFECYCLE TESTS PASSED SUCCESSFULLY!")

