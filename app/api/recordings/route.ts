/**
 * Recordings & Transcripts API
 * Manages original audio assets, persistent recordings, and timestamped transcript segments.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { assetStorage } from "@/lib/storage"
import {
  NoteRepository,
  AssetRepository,
  RecordingRepository,
  TranscriptRepository,
  SpeakerRepository,
  KnowledgeRepository,
} from "@/lib/db/repositories"
import crypto from "crypto"

export async function GET(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const noteId = searchParams.get("noteId")
    const recordingId = searchParams.get("recordingId")

    if (recordingId) {
      const recording = await RecordingRepository.getById(recordingId, user.id)
      if (!recording) {
        return NextResponse.json({ error: "Recording not found" }, { status: 404 })
      }
      const data = await TranscriptRepository.getByRecording(recording.id)
      return NextResponse.json({
        recording,
        transcript: data?.transcript ?? null,
        segments: data?.segments ?? [],
      })
    }

    if (noteId) {
      // Enforce tenant ownership of parent note to prevent IDOR
      const note = await NoteRepository.getById(noteId, user.id)
      if (!note) {
        return NextResponse.json({ error: "Note not found or access denied" }, { status: 404 })
      }

      const recordings = await RecordingRepository.listByNote(noteId, user.id)
      const results = await Promise.all(
        recordings.map(async (rec) => {
          const transData = await TranscriptRepository.getByRecording(rec.id)
          return {
            recording: rec,
            transcript: transData?.transcript ?? null,
            segments: transData?.segments ?? [],
          }
        })
      )
      return NextResponse.json({ recordings: results })
    }

    return NextResponse.json({ error: "noteId or recordingId required" }, { status: 400 })
  } catch (err) {
    console.error("[/api/recordings GET]", err)
    return NextResponse.json({ error: "Failed to fetch recordings" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const body = await req.json()
    const {
      noteId,
      title = "New Recording",
      startedAt = new Date().toISOString(),
      endedAt,
      durationMs = 0,
      audioDataUrl, // Base64 data URL from MediaRecorder
      segments = [],
      language = "en",
    } = body

    // Enforce tenant ownership if linking to a note
    if (noteId) {
      const note = await NoteRepository.getById(noteId, user.id)
      if (!note) {
        return NextResponse.json(
          { error: "Target note not found or access denied" },
          { status: 404 }
        )
      }
    }

    let audioAssetId = ""

    // 1. Persist Audio Asset if audioDataUrl provided
    if (audioDataUrl && typeof audioDataUrl === "string") {
      const [header, b64] = audioDataUrl.split(",")
      const mimeMatch = header?.match(/data:([^;]+)/)
      const mimeType = mimeMatch ? mimeMatch[1] : "audio/webm"
      const buffer = Buffer.from(b64 || "", "base64")
      const checksum = crypto.createHash("sha256").update(buffer).digest("hex")

      const filename = `recording_${Date.now()}.${mimeType.includes("mp4") ? "mp4" : "webm"}`
      const storageKey = assetStorage.generateKey(user.id, filename)
      await assetStorage.put(storageKey, buffer, mimeType)

      const asset = await AssetRepository.create({
        id: `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
        user_id: user.id,
        type: "audio",
        storage_key: storageKey,
        mime_type: mimeType,
        filename,
        size_bytes: buffer.length,
        duration_ms: Math.max(0, Math.round(Number(durationMs) || 0)),
        checksum,
      })
      audioAssetId = asset.id
    }

    // 2. Create Recording entity
    const recordingId = `rec_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const recording = await RecordingRepository.create({
      id: recordingId,
      user_id: user.id,
      note_id: noteId || null,
      title: String(title).trim() || "New Recording",
      started_at: startedAt,
      ended_at: endedAt || null,
      duration_ms: Math.max(0, Math.round(Number(durationMs) || 0)),
      audio_asset_id: audioAssetId,
      status: "ready",
    })

    // 3. Create Transcript entity
    const transcriptId = `trn_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
    const transcript = await TranscriptRepository.create({
      id: transcriptId,
      recording_id: recording.id,
      language: String(language || "en").trim(),
      status: "completed",
    })

    // 4. Resolve / Create Speakers without race condition
    const userSpeakers = await SpeakerRepository.listByUser(user.id)
    const speakerMap = new Map(userSpeakers.map((s) => [s.name.toLowerCase(), s.id]))

    const uniqueSpeakerNames = Array.from(
      new Set(segments.map((s: any) => String(s.speaker || "").trim()).filter(Boolean))
    ) as string[]

    for (const rawName of uniqueSpeakerNames) {
      const key = rawName.toLowerCase()
      if (!speakerMap.has(key)) {
        let spk = await SpeakerRepository.findByName(user.id, rawName)
        if (!spk) {
          spk = await SpeakerRepository.create({
            id: `spk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
            user_id: user.id,
            name: rawName,
            is_custom_named: false,
          })
        }
        speakerMap.set(key, spk.id)
      }
    }

    // 5. Format and validate segments
    const formattedSegments = segments.map((seg: any, idx: number) => {
      let speakerId: string | null = null
      if (seg.speaker) {
        const key = String(seg.speaker).trim().toLowerCase()
        speakerId = speakerMap.get(key) || null
      }

      const startMs = Math.max(0, Math.round(Number(seg.start_ms ?? seg.start ?? 0) || 0))
      const rawEndMs = Math.round(Number(seg.end_ms ?? seg.end ?? startMs) || startMs)
      const endMs = Math.max(startMs, rawEndMs)

      return {
        id: `seg_${transcriptId}_${idx}`,
        transcript_id: transcriptId,
        speaker_id: speakerId,
        start_ms: startMs,
        end_ms: endMs,
        text: String(seg.text || "").trim(),
        sequence: idx,
      }
    })

    if (formattedSegments.length > 0) {
      await TranscriptRepository.bulkInsertSegments(formattedSegments)
    }

    return NextResponse.json({
      success: true,
      recording,
      transcript,
      segments: formattedSegments,
    })
  } catch (err) {
    console.error("[/api/recordings POST]", err)
    return NextResponse.json({ error: "Failed to save recording" }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const recordingId = searchParams.get("id") || searchParams.get("recordingId")
    if (!recordingId) {
      return NextResponse.json({ error: "recordingId is required" }, { status: 400 })
    }

    const recording = await RecordingRepository.getById(recordingId, user.id)
    if (!recording) {
      return NextResponse.json({ error: "Recording not found or access denied" }, { status: 404 })
    }

    // 1. Delete derived Knowledge Documents and Chunks for this recording
    await KnowledgeRepository.deleteBySource("recording", recording.id, user.id)

    // 2. Clean up associated audio asset from DB and storage if present
    if (recording.audio_asset_id) {
      const asset = await AssetRepository.getById(recording.audio_asset_id, user.id)
      if (asset) {
        await AssetRepository.delete(asset.id, user.id)
        await assetStorage.delete(asset.storage_key).catch(() => {})
      }
    }

    // 3. Delete recording (cascades to transcripts and segments)
    await RecordingRepository.delete(recording.id, user.id)

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error("[/api/recordings DELETE]", err)
    return NextResponse.json({ error: "Failed to delete recording" }, { status: 500 })
  }
}
