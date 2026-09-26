"use client"

import { useState, useRef, useCallback } from "react"
import { AudioLines, Pause, Play } from "lucide-react"
import {
  TranscriptSegment,
  SpeakerProfile,
  formatSegmentsToNoteText,
  normalizeSpeakerId,
} from "@/lib/speakers"
import { extractFeaturesFromFloat32, identifySpeakerFromFeatures } from "@/lib/voice-matcher"

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket"
const SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096
const SILENCE_THRESHOLD = 0.005

export interface AudioRecordingData {
  dataUrl: string
  duration: number
  mimeType: string
}

interface VoiceRecorderProps {
  lang?: string
  silenceTimeoutSec?: number
  speakerProfiles?: SpeakerProfile[]
  onTranscriptUpdate: (
    plainText: string,
    segments: TranscriptSegment[],
    recording?: AudioRecordingData
  ) => void
  onRecordingStart: () => void
  onRecordingStop: () => void
}

interface RawSegment {
  id: string
  speaker_id: string
  start: number
  end: number
  text: string
  pcmSamples?: Float32Array
}

interface Pipeline {
  stream: MediaStream
  ctx: AudioContext
  processor: ScriptProcessorNode
  ws: WebSocket
  segments: RawSegment[]
  currentText: string
  unfinalizedText: string
  currentSpeakerId: string
  currentStartSec: number
  pipelineSpeakerDefault: string
}

export function VoiceRecorder({
  lang = "en",
  silenceTimeoutSec = 30,
  speakerProfiles = [],
  onTranscriptUpdate,
  onRecordingStart,
  onRecordingStop,
}: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [, setHasSystemAudio] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const micPipelineRef = useRef<Pipeline | null>(null)
  const sysPipelineRef = useRef<Pipeline | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => void>(() => {})

  const recordingStartTimeRef = useRef<number>(0)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const recordedAudioDataRef = useRef<AudioRecordingData | undefined>(undefined)

  // Mapping from raw detected speaker_id -> resolved speaker_id (if matched with voice profile)
  const speakerRemapRef = useRef<Map<string, string>>(new Map())

  const getElapsedSeconds = useCallback(() => {
    if (!recordingStartTimeRef.current) return 0
    return Math.max(0, (Date.now() - recordingStartTimeRef.current) / 1000)
  }, [])

  // Build combined transcript text and structured segments
  const buildTranscriptAndSegments = useCallback(() => {
    const mic = micPipelineRef.current
    const sys = sysPipelineRef.current

    const allRaw: RawSegment[] = [
      ...(mic?.segments ?? []),
      ...(sys?.segments ?? []),
    ]

    // Append currently pending text
    const appendPending = (p: Pipeline | null) => {
      if (!p) return
      const text = (p.currentText + p.unfinalizedText).trim()
      if (text) {
        const endSec = getElapsedSeconds()
        allRaw.push({
          id: `pending_${p.currentStartSec}_${Math.random().toString(36).slice(2, 6)}`,
          speaker_id: p.currentSpeakerId || p.pipelineSpeakerDefault,
          start: p.currentStartSec,
          end: Math.max(endSec, p.currentStartSec + 0.5),
          text,
        })
      }
    }

    appendPending(mic)
    appendPending(sys)

    // Sort by start timestamp
    allRaw.sort((a, b) => a.start - b.start)

    // Map through speaker recognition remappings
    const segments: TranscriptSegment[] = allRaw.map((s) => {
      const remapped = speakerRemapRef.current.get(s.speaker_id) || s.speaker_id
      return {
        id: s.id,
        speaker_id: remapped,
        start: s.start,
        end: s.end,
        text: s.text,
      }
    })

    const plainText = formatSegmentsToNoteText(segments, speakerProfiles)
    return { plainText, segments }
  }, [getElapsedSeconds, speakerProfiles])

  const destroyPipeline = (p: Pipeline | null) => {
    if (!p) return
    p.processor.disconnect()
    p.ctx.close().catch(() => {})
    p.stream.getTracks().forEach((t) => t.stop())
    if (p.ws.readyState === WebSocket.OPEN) p.ws.close()
  }

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    destroyPipeline(micPipelineRef.current)
    destroyPipeline(sysPipelineRef.current)
    micPipelineRef.current = null
    sysPipelineRef.current = null

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      try {
        mediaRecorderRef.current.stop()
      } catch {}
    }

    setIsRecording(false)
    setIsPaused(false)
    setHasSystemAudio(false)
    onRecordingStop()
  }, [onRecordingStop])

  const stopRecording = useCallback(() => {
    const mic = micPipelineRef.current
    const sys = sysPipelineRef.current
    if (mic?.ws.readyState === WebSocket.OPEN) mic.ws.send("")
    if (sys?.ws.readyState === WebSocket.OPEN) sys.ws.send("")

    const finalize = (p: Pipeline | null) => {
      if (!p) return
      const remaining = (p.currentText + p.unfinalizedText).trim()
      if (remaining) {
        const endSec = getElapsedSeconds()
        p.segments.push({
          id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          speaker_id: p.currentSpeakerId || p.pipelineSpeakerDefault,
          start: p.currentStartSec,
          end: Math.max(endSec, p.currentStartSec + 0.5),
          text: remaining,
        })
        p.currentText = ""
        p.unfinalizedText = ""
      }
    }

    finalize(mic)
    finalize(sys)

    const { plainText, segments } = buildTranscriptAndSegments()
    onTranscriptUpdate(plainText, segments, recordedAudioDataRef.current)

    setTimeout(cleanup, 500)
  }, [buildTranscriptAndSegments, cleanup, getElapsedSeconds, onTranscriptUpdate])

  stopRecordingRef.current = stopRecording

  const pauseRecording = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    micPipelineRef.current?.ctx.suspend()
    sysPipelineRef.current?.ctx.suspend()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      mediaRecorderRef.current.pause()
    }
    setIsPaused(true)
  }, [])

  const resumeRecording = useCallback(() => {
    micPipelineRef.current?.ctx.resume()
    sysPipelineRef.current?.ctx.resume()
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "paused") {
      mediaRecorderRef.current.resume()
    }
    setIsPaused(false)
  }, [])

  const makePipeline = useCallback(
    (
      stream: MediaStream,
      temporaryApiKey: string,
      defaultSpeakerId: string
    ): Pipeline => {
      const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
      const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)
      ctx.createMediaStreamSource(stream).connect(processor)

      const monitor = ctx.createGain()
      monitor.gain.value = 0
      processor.connect(monitor)
      monitor.connect(ctx.destination)

      const ws = new WebSocket(SONIOX_WS_URL)
      const pipeline: Pipeline = {
        stream,
        ctx,
        processor,
        ws,
        segments: [],
        currentText: "",
        unfinalizedText: "",
        currentSpeakerId: defaultSpeakerId,
        currentStartSec: 0,
        pipelineSpeakerDefault: defaultSpeakerId,
      }

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            api_key: temporaryApiKey,
            model: "stt-rt-v4",
            audio_format: "pcm_s16le",
            sample_rate: SAMPLE_RATE,
            num_channels: 1,
            language: lang,
            enable_endpoint_detection: true,
            enable_speaker_diarization: true, // Speaker diarization enabled
          })
        )
      }

      const audioBufferQueue: Float32Array[] = []

      ws.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data as string)
        } catch {
          return
        }
        if (data.error_message) {
          const msg: string = data.error_message
          if (/timeout/i.test(msg)) {
            cleanup()
            return
          }
          setError(msg)
          cleanup()
          return
        }

        const tokens: Array<{ text: string; is_final: boolean; speaker?: string | number }> =
          data.tokens || []

        if (tokens.length > 0) {
          pipeline.unfinalizedText = ""
        }

        for (const token of tokens) {
          const text = token.text.replace(/<[^>]+>/g, "")
          const rawSpeaker = token.speaker !== undefined ? token.speaker : defaultSpeakerId
          const speakerId = normalizeSpeakerId(rawSpeaker)

          // If speaker changed while we have accumulated text, flush previous segment
          if (pipeline.currentText.trim() && speakerId !== pipeline.currentSpeakerId) {
            const endSec = getElapsedSeconds()
            pipeline.segments.push({
              id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              speaker_id: pipeline.currentSpeakerId,
              start: pipeline.currentStartSec,
              end: Math.max(endSec, pipeline.currentStartSec + 0.5),
              text: pipeline.currentText.trim(),
            })
            pipeline.currentText = ""
            pipeline.unfinalizedText = ""
            pipeline.currentSpeakerId = speakerId
            pipeline.currentStartSec = endSec
          }

          if (token.is_final) {
            if (!pipeline.currentText) {
              pipeline.currentStartSec = getElapsedSeconds()
              pipeline.currentSpeakerId = speakerId
            }
            pipeline.currentText += text
          } else {
            pipeline.unfinalizedText += text
          }
        }

        // Flush on Soniox endpoint
        if (data.endpoint && pipeline.currentText.trim()) {
          const endSec = getElapsedSeconds()
          const segSpeaker = pipeline.currentSpeakerId || defaultSpeakerId

          // Check voice recognition if speaker not yet mapped
          if (!speakerRemapRef.current.has(segSpeaker) && audioBufferQueue.length > 0) {
            // Concatenate recent PCM frames to extract acoustic features
            const totalSamples = audioBufferQueue.reduce((acc, b) => acc + b.length, 0)
            const combined = new Float32Array(totalSamples)
            let offset = 0
            for (const b of audioBufferQueue) {
              combined.set(b, offset)
              offset += b.length
            }
            audioBufferQueue.length = 0 // clear
            const features = extractFeaturesFromFloat32(combined, SAMPLE_RATE)
            const match = identifySpeakerFromFeatures(features, speakerProfiles)
            if (match) {
              speakerRemapRef.current.set(segSpeaker, match.profile.id)
            }
          }

          pipeline.segments.push({
            id: `seg_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            speaker_id: segSpeaker,
            start: pipeline.currentStartSec,
            end: Math.max(endSec, pipeline.currentStartSec + 0.5),
            text: pipeline.currentText.trim(),
          })
          pipeline.currentText = ""
          pipeline.unfinalizedText = ""
          pipeline.currentStartSec = endSec
        }

        const { plainText, segments } = buildTranscriptAndSegments()
        onTranscriptUpdate(plainText, segments, recordedAudioDataRef.current)

        if (data.finished) cleanup()
      }

      ws.onerror = () => {
        setError("WebSocket error — check API key")
        cleanup()
      }
      ws.onclose = (e) => {
        if (e.code !== 1000 && e.code !== 1001) cleanup()
      }

      processor.onaudioprocess = (e) => {
        if (ws.readyState !== WebSocket.OPEN) return
        const f32 = e.inputBuffer.getChannelData(0)
        let maxAmp = 0
        for (let i = 0; i < f32.length; i++) {
          const a = Math.abs(f32[i])
          if (a > maxAmp) maxAmp = a
        }

        if (maxAmp > SILENCE_THRESHOLD) {
          if (silenceTimerRef.current) {
            clearTimeout(silenceTimerRef.current)
            silenceTimerRef.current = null
          }
        } else if (!silenceTimerRef.current) {
          silenceTimerRef.current = setTimeout(() => {
            silenceTimerRef.current = null
            stopRecordingRef.current()
          }, silenceTimeoutSec * 1000)
        }

        // Keep last 15 buffers (~3.8 seconds) for voice feature comparison
        audioBufferQueue.push(new Float32Array(f32))
        if (audioBufferQueue.length > 20) audioBufferQueue.shift()

        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) {
          i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)))
        }
        ws.send(i16.buffer)
      }

      return pipeline
    },
    [
      lang,
      silenceTimeoutSec,
      cleanup,
      getElapsedSeconds,
      speakerProfiles,
      buildTranscriptAndSegments,
      onTranscriptUpdate,
    ]
  )

  const startRecording = useCallback(async () => {
    setError(null)
    speakerRemapRef.current.clear()
    recordingStartTimeRef.current = Date.now()
    audioChunksRef.current = []
    recordedAudioDataRef.current = undefined

    try {
      const tokenResponse = await fetch("/api/soniox/token", { method: "POST" })
      const tokenData = await tokenResponse.json()
      if (!tokenResponse.ok || !tokenData.apiKey) {
        throw new Error(tokenData.error || "Soniox transcription is not configured")
      }
      const temporaryApiKey = tokenData.apiKey
      let micStarted = false
      let sysStarted = false

      let combinedStream: MediaStream | null = null

      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micPipelineRef.current = makePipeline(stream, temporaryApiKey, "speaker_1")
        micStarted = true
        combinedStream = stream
      } catch {
        // Continue with system audio if mic unavailable
      }

      try {
        const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
          audio: { echoCancellation: false, noiseSuppression: false },
          video: true,
        })
        displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop())
        const audioTracks = displayStream
          .getAudioTracks()
          .filter((t: MediaStreamTrack) => t.readyState === "live")
        if (audioTracks.length > 0) {
          const sysStream = new MediaStream(audioTracks)
          sysPipelineRef.current = makePipeline(sysStream, temporaryApiKey, "speaker_2")
          setHasSystemAudio(true)
          sysStarted = true
          if (!combinedStream) combinedStream = sysStream
        }
      } catch {
        // Continue with mic if system audio unavailable
      }

      if (!micStarted && !sysStarted) throw new Error("No audio source available")

      // Setup MediaRecorder for audio playback in transcription sidebar
      if (combinedStream && typeof MediaRecorder !== "undefined") {
        try {
          const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
            ? "audio/webm;codecs=opus"
            : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "audio/webm"
          const mediaRecorder = new MediaRecorder(combinedStream, { mimeType })
          mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
              audioChunksRef.current.push(event.data)
            }
          }
          mediaRecorder.onstop = () => {
            if (audioChunksRef.current.length > 0) {
              const fullBlob = new Blob(audioChunksRef.current, { type: mimeType })
              const reader = new FileReader()
              reader.onloadend = () => {
                const base64 = reader.result as string
                const duration = getElapsedSeconds()
                recordedAudioDataRef.current = {
                  dataUrl: base64,
                  duration,
                  mimeType,
                }
                const { plainText, segments } = buildTranscriptAndSegments()
                onTranscriptUpdate(plainText, segments, recordedAudioDataRef.current)
              }
              reader.readAsDataURL(fullBlob)
            }
          }
          mediaRecorder.start(1000)
          mediaRecorderRef.current = mediaRecorder
        } catch (e) {
          console.warn("Could not start MediaRecorder for playback:", e)
        }
      }

      setIsRecording(true)
      onRecordingStart()
    } catch (err: any) {
      setError(err?.message || "Failed to access audio")
      cleanup()
    }
  }, [
    makePipeline,
    onRecordingStart,
    cleanup,
    getElapsedSeconds,
    buildTranscriptAndSegments,
    onTranscriptUpdate,
  ])

  return (
    <div className="flex items-center gap-1">
      {error && (
        <span className="text-xs text-red-400 max-w-[140px] truncate" title={error}>
          {error}
        </span>
      )}

      {/* Pause / Resume button */}
      {isRecording && (
        <button
          onClick={() => (isPaused ? resumeRecording() : pauseRecording())}
          className={`p-2 rounded-lg transition-colors ${
            isPaused
              ? "text-blue-600 bg-zinc-100 hover:bg-zinc-200 dark:text-blue-400 dark:bg-zinc-800 dark:hover:bg-zinc-700"
              : "text-amber-600 hover:bg-zinc-100 dark:text-yellow-500 dark:hover:bg-zinc-800"
          }`}
          title={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      )}

      {/* Record button */}
      <button
        onClick={() => (isRecording ? stopRecording() : startRecording())}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          isRecording
            ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 dark:text-red-400"
            : "text-zinc-600 hover:bg-zinc-100 hover:text-amber-600 dark:text-gray-300 dark:hover:bg-zinc-800 dark:hover:text-yellow-400"
        }`}
        title={isRecording ? "Stop recording" : "Start recording"}
        aria-label={isRecording ? "Stop recording" : "Start recording"}
      >
        <AudioLines className={`h-4 w-4 ${isRecording && !isPaused ? "animate-pulse" : ""}`} />
        <span>{isRecording ? "Stop" : "Record"}</span>
      </button>
    </div>
  )
}
