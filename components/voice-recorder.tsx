"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, AudioLines, Volume2 } from "lucide-react"

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket"
const SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096

interface VoiceRecorderProps {
  apiKey: string
  silenceTimeoutSec?: number
  onTranscriptUpdate: (fullTranscript: string) => void
  onRecordingStart: () => void
  onRecordingStop: () => void
}

export function VoiceRecorder({ apiKey, silenceTimeoutSec = 30, onTranscriptUpdate, onRecordingStart, onRecordingStop }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasSystemAudio, setHasSystemAudio] = useState(false)
  const [nonFinalPreview, setNonFinalPreview] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [systemAudioDenied, setSystemAudioDenied] = useState(false)
  const [useMic, setUseMic] = useState(false)
  const [useSystem, setUseSystem] = useState(true)

  const wsRef = useRef<WebSocket | null>(null)
  const micStreamRef = useRef<MediaStream | null>(null)
  const systemStreamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const processorRef = useRef<ScriptProcessorNode | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => void>(() => {})
  const SILENCE_THRESHOLD = 0.005

  // Transcript accumulation
  const finalLinesRef = useRef<string[]>([])
  const currentSpeakerRef = useRef<number | null>(null)
  const currentLineTextRef = useRef<string>("")
  const recordingModeRef = useRef<"mic" | "system">("mic")

  const speakerLabel = (spk: number | null) => {
    // mic-only: everything is the user, ignore diarization speaker id
    if (recordingModeRef.current === "mic") return "[You]"
    return spk === 0 ? "[You]" : "[Other]"
  }

  const buildTranscript = () => {
    const lines = [...finalLinesRef.current]
    if (currentLineTextRef.current.trim()) {
      lines.push(`${speakerLabel(currentSpeakerRef.current)}: ${currentLineTextRef.current.trim()}`)
    }
    return lines.join("\n")
  }

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    processorRef.current?.disconnect()
    processorRef.current = null
    audioContextRef.current?.close().catch(() => {})
    audioContextRef.current = null
    micStreamRef.current?.getTracks().forEach((t) => t.stop())
    micStreamRef.current = null
    systemStreamRef.current?.getTracks().forEach((t) => t.stop())
    systemStreamRef.current = null
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.close()
    }
    wsRef.current = null
    setIsRecording(false)
    setIsExpanded(false)
    setHasSystemAudio(false)
    setNonFinalPreview("")
    setSystemAudioDenied(false)
    finalLinesRef.current = []
    currentSpeakerRef.current = null
    currentLineTextRef.current = ""
    onRecordingStop()
  }, [onRecordingStop])

  const stopRecording = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send("") // signal end-of-audio
    }
    // Flush any in-progress line
    if (currentLineTextRef.current.trim()) {
      finalLinesRef.current.push(`${speakerLabel(currentSpeakerRef.current)}: ${currentLineTextRef.current.trim()}`)
      currentLineTextRef.current = ""
    }
    onTranscriptUpdate(buildTranscript())
    setTimeout(cleanup, 600)
  }, [cleanup, onTranscriptUpdate])

  // Keep ref in sync so onaudioprocess can call it without stale closure
  stopRecordingRef.current = stopRecording

  const startRecording = useCallback(async () => {
    if (!apiKey) {
      setError("Set Soniox API key in Settings first")
      setTimeout(() => setError(null), 3500)
      return
    }
    if (!useMic && !useSystem) {
      setError("Enable mic or system audio first")
      setTimeout(() => setError(null), 3500)
      return
    }

    setError(null)
    finalLinesRef.current = []
    currentSpeakerRef.current = null
    currentLineTextRef.current = ""
    recordingModeRef.current = useMic && !useSystem ? "mic" : "system"

    try {
      let micStream: MediaStream | null = null

      if (useMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          micStreamRef.current = micStream
          console.log("[VoiceRecorder] mic stream acquired")
        } catch (err: any) {
          console.error("[VoiceRecorder] mic access failed:", err?.name, err?.message)
          if (!useSystem) throw err
        }
      }

      let systemStream: MediaStream | null = null
      if (useSystem) {
        try {
          console.log("[VoiceRecorder] requesting getDisplayMedia for system audio...")
          const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
            audio: { echoCancellation: false, noiseSuppression: false },
            video: true,
          })
          const videoTracks = displayStream.getVideoTracks()
          const audioTracks = displayStream.getAudioTracks()
          console.log("[VoiceRecorder] getDisplayMedia success:", {
            videoTracks: videoTracks.map((t: MediaStreamTrack) => ({ label: t.label, kind: t.kind, readyState: t.readyState })),
            audioTracks: audioTracks.map((t: MediaStreamTrack) => ({ label: t.label, kind: t.kind, readyState: t.readyState })),
          })
          videoTracks.forEach((t: MediaStreamTrack) => t.stop())
          const liveAudioTracks = audioTracks.filter((t: MediaStreamTrack) => t.readyState === "live")
          if (liveAudioTracks.length > 0) {
            systemStream = new MediaStream(liveAudioTracks)
            systemStreamRef.current = systemStream
            setHasSystemAudio(true)
            console.log("[VoiceRecorder] system audio captured OK")
          } else if (audioTracks.length > 0) {
            if (!micStream) { setSystemAudioDenied(true); throw new Error("system_audio_denied") }
          } else {
            if (!micStream) { setSystemAudioDenied(true); throw new Error("system_audio_denied") }
          }
        } catch (err: any) {
          if (err?.message === "system_audio_denied") throw err
          if (!micStream) { setSystemAudioDenied(true); throw new Error("system_audio_denied") }
          // mic is available as fallback; system audio failure is non-fatal
        }
      }

      if (!micStream && !systemStream) throw new Error("No audio source available")

      const audioContext = new AudioContext({ sampleRate: SAMPLE_RATE })
      audioContextRef.current = audioContext

      const processor = audioContext.createScriptProcessor(BUFFER_SIZE, 1, 1)
      processorRef.current = processor

      if (micStream) {
        const micSource = audioContext.createMediaStreamSource(micStream)
        micSource.connect(processor)
      }

      if (systemStream && systemStream.getAudioTracks().length > 0) {
        const sysSource = audioContext.createMediaStreamSource(systemStream)
        sysSource.connect(processor)
      }

      processor.connect(audioContext.destination)

      // Open WebSocket
      const ws = new WebSocket(SONIOX_WS_URL)
      wsRef.current = ws

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            api_key: apiKey,
            model: "stt-rt-v4",
            audio_format: "pcm_s16le",
            sample_rate: SAMPLE_RATE,
            num_channels: 1,
            enable_endpoint_detection: true,
            enable_speaker_diarization: true,
          })
        )
        setIsRecording(true)
        onRecordingStart()
      }

      ws.onmessage = (event) => {
        let data: any
        try {
          data = JSON.parse(event.data as string)
        } catch {
          return
        }

        if (data.error_message) {
          setError(data.error_message)
          cleanup()
          return
        }

        const tokens: Array<{ text: string; is_final: boolean; speaker?: number }> = data.tokens || []

        let nonFinalText = ""

        for (const token of tokens) {
          const text = token.text.replace(/<[^>]+>/g, "")
          if (token.is_final) {
            const spk = token.speaker ?? currentSpeakerRef.current ?? 0
            if (currentSpeakerRef.current !== null && spk !== currentSpeakerRef.current && currentLineTextRef.current.trim()) {
              finalLinesRef.current.push(`${speakerLabel(currentSpeakerRef.current)}: ${currentLineTextRef.current.trim()}`)
              currentLineTextRef.current = ""
            }
            currentSpeakerRef.current = spk
            currentLineTextRef.current += text
          } else {
            nonFinalText += text
          }
        }

        setNonFinalPreview(nonFinalText)
        onTranscriptUpdate(buildTranscript() + (nonFinalText ? nonFinalText : ""))

        if (data.finished) {
          cleanup()
        }
      }

      ws.onerror = () => {
        setError("WebSocket error — check API key")
        cleanup()
      }

      ws.onclose = (e) => {
        if (e.code !== 1000 && e.code !== 1001 && isRecording) {
          setError(`Connection closed (${e.code})`)
        }
        if (isRecording) cleanup()
      }

      // Convert Float32 → Int16 PCM and stream to Soniox
      processor.onaudioprocess = (e) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return
        const f32 = e.inputBuffer.getChannelData(0)

        // Silence detection
        let maxAmp = 0
        for (let i = 0; i < f32.length; i++) {
          const abs = Math.abs(f32[i])
          if (abs > maxAmp) maxAmp = abs
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

        const i16 = new Int16Array(f32.length)
        for (let i = 0; i < f32.length; i++) {
          i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)))
        }
        wsRef.current.send(i16.buffer)
      }
    } catch (err: any) {
      if (err?.message !== "system_audio_denied") {
        setError(err?.message || "Failed to access microphone")
      }
      cleanup()
    }
  }, [apiKey, useMic, useSystem, onTranscriptUpdate, onRecordingStart, cleanup])

  return (
    <div className="flex items-center gap-1">
      {systemAudioDenied && (
        <span className="text-xs text-yellow-400 flex items-center gap-1">
          No system audio.{" "}
          <button
            className="underline hover:text-yellow-200"
            onClick={() => { setSystemAudioDenied(false); setUseMic(true); setUseSystem(false) }}
          >
            Use mic
          </button>
        </span>
      )}
      {error && !systemAudioDenied && (
        <span className="text-xs text-red-400 max-w-[140px] truncate" title={error}>
          {error}
        </span>
      )}
      {isRecording && nonFinalPreview && (
        <span className="text-xs text-gray-400 italic max-w-[120px] truncate opacity-70">
          {nonFinalPreview}
        </span>
      )}

      {/* Toggles — only visible when expanded or recording */}
      <div className={`flex items-center gap-1 overflow-hidden transition-all duration-200 ${
        isExpanded || isRecording ? "w-[72px] opacity-100" : "w-0 opacity-0"
      }`}>
        <button
          disabled={isRecording}
          onClick={() => setUseMic((v) => !v)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            useMic ? "text-yellow-400 bg-zinc-800" : "text-gray-500 hover:text-gray-300 hover:bg-zinc-800"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={useMic ? "Mic on" : "Mic off"}
        >
          <Mic className="h-4 w-4" />
        </button>

        <button
          disabled={isRecording}
          onClick={() => setUseSystem((v) => !v)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            useSystem ? "text-green-400 bg-zinc-800" : "text-gray-500 hover:text-gray-300 hover:bg-zinc-800"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={useSystem ? "System audio on" : "System audio off"}
        >
          <Volume2 className="h-4 w-4" />
        </button>
      </div>

      {/* Main button: idle → expand; expanded → start recording; recording → stop */}
      <button
        onClick={() => {
          if (isRecording) {
            stopRecording()
          } else if (isExpanded) {
            startRecording()
          } else {
            setIsExpanded(true)
          }
        }}
        className={`p-2 rounded-lg transition-colors ${
          isRecording
            ? "text-red-400 hover:bg-zinc-800"
            : isExpanded
              ? "text-blue-400 bg-zinc-800 hover:bg-zinc-700"
              : "text-gray-400 hover:text-blue-400 hover:bg-zinc-800"
        }`}
        title={isRecording ? "Stop recording" : isExpanded ? "Start recording" : "Recording options"}
      >
        <AudioLines className={`h-4 w-4 ${isRecording ? "animate-pulse" : ""}`} />
      </button>
    </div>
  )
}
