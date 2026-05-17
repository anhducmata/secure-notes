"use client"

import { useState, useRef, useCallback } from "react"
import { Mic, MicOff, AudioLines, Volume2, VolumeX, Pause, Play } from "lucide-react"

const SONIOX_WS_URL = "wss://stt-rt.soniox.com/transcribe-websocket"
const SAMPLE_RATE = 16000
const BUFFER_SIZE = 4096
const SILENCE_THRESHOLD = 0.005

interface VoiceRecorderProps {
  apiKey: string
  lang?: string
  silenceTimeoutSec?: number
  onTranscriptUpdate: (fullTranscript: string) => void
  onRecordingStart: () => void
  onRecordingStop: () => void
}

interface Line {
  text: string
  ts: number // Date.now() when line started — used only for ordering
}



// Sentence-boundary characters that justify splitting a line
const SENTENCE_END_RE = /[.!?。！？]+\s*/g
const MAX_SEGMENT_CHARS = 180 // flush early if a segment grows beyond this

interface Pipeline {
  stream: MediaStream
  ctx: AudioContext
  processor: ScriptProcessorNode
  ws: WebSocket
  finalLines: Line[]
  currentText: string
  unfinalizedText: string
  currentTs: number // when current segment started
}


export function VoiceRecorder({ apiKey, lang = "en", silenceTimeoutSec = 30, onTranscriptUpdate, onRecordingStart, onRecordingStop }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [isExpanded, setIsExpanded] = useState(false)
  const [hasSystemAudio, setHasSystemAudio] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [systemAudioDenied, setSystemAudioDenied] = useState(false)
  const [useMic, setUseMic] = useState(false)
  const [useSystem, setUseSystem] = useState(true)
  const [micMuted, setMicMuted] = useState(false)
  const [sysMuted, setSysMuted] = useState(false)


  const micPipelineRef = useRef<Pipeline | null>(null)
  const sysPipelineRef = useRef<Pipeline | null>(null)
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stopRecordingRef = useRef<() => void>(() => {})

  const buildTranscript = () => {
    const mic = micPipelineRef.current
    const sys = sysPipelineRef.current

    const taggedMic = (mic?.finalLines ?? []).map(l => ({ ...l, text: `You: ${l.text}` }))
    const taggedSys = (sys?.finalLines ?? []).map(l => ({ ...l, text: `Other: ${l.text}` }))

    // Collect all finalized lines from both pipelines, sorted by time
    const allFinal: Line[] = [
      ...taggedMic,
      ...taggedSys,
    ].sort((a, b) => a.ts - b.ts)

    // Plain text — just the spoken words, one sentence per line
    let transcript = allFinal.map((l) => l.text).join("\n")

    const appendCurrent = (p: Pipeline | null, tag: string) => {
      if (!p) return
      const current = (p.currentText + p.unfinalizedText).trim()
      if (current) {
        if (transcript) transcript += "\n"
        transcript += `${tag}: ${current}`
      }
    }

    appendCurrent(mic, "You")
    appendCurrent(sys, "Other")

    return transcript
  }

  // Flush `currentText` in a pipeline whenever a sentence ends or the segment is too long.
  // Returns the number of new lines flushed (0 if nothing happened).
  const maybeFlushSegment = (pipeline: Pipeline): number => {
    const text = pipeline.currentText
    if (!text.trim()) return 0

    const splitPoints: number[] = []
    let match: RegExpExecArray | null
    SENTENCE_END_RE.lastIndex = 0
    while ((match = SENTENCE_END_RE.exec(text)) !== null) {
      splitPoints.push(match.index + match[0].length)
    }

    let flushed = 0

    if (splitPoints.length > 0) {
      let prev = 0
      for (const sp of splitPoints) {
        const chunk = text.slice(prev, sp).trim()
        if (chunk) {
          pipeline.finalLines.push({ text: chunk, ts: pipeline.currentTs })
          flushed++
        }
        prev = sp
        pipeline.currentTs = Date.now()
      }
      pipeline.currentText = text.slice(splitPoints[splitPoints.length - 1])
    } else if (text.length > MAX_SEGMENT_CHARS) {
      pipeline.finalLines.push({ text: text.trim(), ts: pipeline.currentTs })
      pipeline.currentText = ""
      pipeline.currentTs = Date.now()
      flushed++
    }

    return flushed
  }

  const destroyPipeline = (p: Pipeline | null) => {
    if (!p) return
    p.processor.disconnect()
    p.ctx.close().catch(() => {})
    p.stream.getTracks().forEach((t) => t.stop())
    if (p.ws.readyState === WebSocket.OPEN) p.ws.close()
  }

  const cleanup = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    destroyPipeline(micPipelineRef.current)
    destroyPipeline(sysPipelineRef.current)
    micPipelineRef.current = null
    sysPipelineRef.current = null
    setIsRecording(false)
    setIsPaused(false)
    setIsExpanded(false)
    setHasSystemAudio(false)
    setSystemAudioDenied(false)
    setMicMuted(false)
    setSysMuted(false)
    onRecordingStop()
  }, [onRecordingStop])

  const stopRecording = useCallback(() => {
    const mic = micPipelineRef.current
    const sys = sysPipelineRef.current
    if (mic?.ws.readyState === WebSocket.OPEN) mic.ws.send("")
    if (sys?.ws.readyState === WebSocket.OPEN) sys.ws.send("")
    
    if (mic) {
      const remaining = (mic.currentText + mic.unfinalizedText).trim()
      if (remaining) { mic.finalLines.push({ text: remaining, ts: mic.currentTs }); mic.currentText = ""; mic.unfinalizedText = "" }
    }
    if (sys) {
      const remaining = (sys.currentText + sys.unfinalizedText).trim()
      if (remaining) { sys.finalLines.push({ text: remaining, ts: sys.currentTs }); sys.currentText = ""; sys.unfinalizedText = "" }
    }

    onTranscriptUpdate(buildTranscript())
    setTimeout(cleanup, 600)
  }, [cleanup, onTranscriptUpdate])

  stopRecordingRef.current = stopRecording

  const pauseRecording = useCallback(() => {
    if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
    micPipelineRef.current?.ctx.suspend()
    sysPipelineRef.current?.ctx.suspend()
    setIsPaused(true)
  }, [])

  const resumeRecording = useCallback(() => {
    micPipelineRef.current?.ctx.resume()
    sysPipelineRef.current?.ctx.resume()
    setIsPaused(false)
  }, [])

  const makePipeline = useCallback((stream: MediaStream): Pipeline => {
    const ctx = new AudioContext({ sampleRate: SAMPLE_RATE })
    const processor = ctx.createScriptProcessor(BUFFER_SIZE, 1, 1)
    ctx.createMediaStreamSource(stream).connect(processor)
    processor.connect(ctx.destination)

    const ws = new WebSocket(SONIOX_WS_URL)
    const pipeline: Pipeline = { stream, ctx, processor, ws, finalLines: [], currentText: "", unfinalizedText: "", currentTs: Date.now() }

    ws.onopen = () => {
      ws.send(JSON.stringify({
        api_key: apiKey,
        model: "stt-rt-v4",
        audio_format: "pcm_s16le",
        sample_rate: SAMPLE_RATE,
        num_channels: 1,
        language: lang,
        enable_endpoint_detection: true,
        enable_speaker_diarization: false,
      }))
    }

    ws.onmessage = (event) => {
      let data: any
      try { data = JSON.parse(event.data as string) } catch { return }
      if (data.error_message) {
        const msg: string = data.error_message
        if (/timeout/i.test(msg)) { cleanup(); return }
        setError(msg); cleanup(); return
      }

      const tokens: Array<{ text: string; is_final: boolean }> = data.tokens || []
      if (tokens.length > 0) {
        pipeline.unfinalizedText = ""
      }
      for (const token of tokens) {
        const text = token.text.replace(/<[^>]+>/g, "")
        if (token.is_final) {
          if (!pipeline.currentText) pipeline.currentTs = Date.now()
          pipeline.currentText += text
        } else {
          pipeline.unfinalizedText += text
        }
      }

      // Flush on explicit endpoint (Soniox speech boundary)
      if (data.endpoint && pipeline.currentText.trim()) {
        pipeline.finalLines.push({ text: pipeline.currentText.trim(), ts: pipeline.currentTs })
        pipeline.currentText = ""
        pipeline.unfinalizedText = ""
        pipeline.currentTs = Date.now()
      } else {
        // Also auto-flush on sentence boundaries / long segments
        maybeFlushSegment(pipeline)
      }

      onTranscriptUpdate(buildTranscript())
      if (data.finished) cleanup()
    }

    ws.onerror = () => { setError("WebSocket error — check API key"); cleanup() }
    ws.onclose = (e) => { if (e.code !== 1000 && e.code !== 1001) cleanup() }

    processor.onaudioprocess = (e) => {
      if (ws.readyState !== WebSocket.OPEN) return
      const f32 = e.inputBuffer.getChannelData(0)
      let maxAmp = 0
      for (let i = 0; i < f32.length; i++) { const a = Math.abs(f32[i]); if (a > maxAmp) maxAmp = a }
      if (maxAmp > SILENCE_THRESHOLD) {
        if (silenceTimerRef.current) { clearTimeout(silenceTimerRef.current); silenceTimerRef.current = null }
      } else if (!silenceTimerRef.current) {
        silenceTimerRef.current = setTimeout(() => { silenceTimerRef.current = null; stopRecordingRef.current() }, silenceTimeoutSec * 1000)
      }
      const i16 = new Int16Array(f32.length)
      for (let i = 0; i < f32.length; i++) i16[i] = Math.max(-32768, Math.min(32767, Math.round(f32[i] * 32767)))
      ws.send(i16.buffer)
    }

    return pipeline
  }, [apiKey, silenceTimeoutSec, cleanup])

  const toggleMicDuringRecording = useCallback(async () => {
    const p = micPipelineRef.current
    if (p) {
      const muting = !micMuted
      p.stream.getAudioTracks().forEach((t) => { t.enabled = !muting })
      setMicMuted(muting)
    } else {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        micPipelineRef.current = makePipeline(stream)
        setMicMuted(false)
        setUseMic(true)
      } catch {
        setError("Mic access denied")
        setTimeout(() => setError(null), 3000)
      }
    }
  }, [micMuted, makePipeline])

  const toggleSysDuringRecording = useCallback(() => {
    const p = sysPipelineRef.current
    if (!p) return
    const muting = !sysMuted
    p.stream.getAudioTracks().forEach((t) => { t.enabled = !muting })
    setSysMuted(muting)
  }, [sysMuted])

  const startRecording = useCallback(async () => {
    if (!apiKey) { setError("Set Soniox API key in Settings first"); setTimeout(() => setError(null), 3500); return }
    if (!useMic && !useSystem) { setError("Enable mic or system audio first"); setTimeout(() => setError(null), 3500); return }
    setError(null)

    try {
      let micStarted = false
      let sysStarted = false

      if (useMic) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
          micPipelineRef.current = makePipeline(stream)
          micStarted = true
        } catch (err: any) {
          if (!useSystem) throw err
        }
      }

      if (useSystem) {
        try {
          const displayStream = await (navigator.mediaDevices as any).getDisplayMedia({
            audio: { echoCancellation: false, noiseSuppression: false },
            video: true,
          })
          displayStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop())
          const audioTracks = displayStream.getAudioTracks().filter((t: MediaStreamTrack) => t.readyState === "live")
          if (audioTracks.length > 0) {
            sysPipelineRef.current = makePipeline(new MediaStream(audioTracks))
            setHasSystemAudio(true)
            sysStarted = true
          } else if (!micStarted) {
            setSystemAudioDenied(true); throw new Error("system_audio_denied")
          }
        } catch (err: any) {
          if (err?.message === "system_audio_denied") throw err
          if (!micStarted) { setSystemAudioDenied(true); throw new Error("system_audio_denied") }
        }
      }

      if (!micStarted && !sysStarted) throw new Error("No audio source available")
      setIsRecording(true)
      onRecordingStart()
    } catch (err: any) {
      if (err?.message !== "system_audio_denied") setError(err?.message || "Failed to access audio")
      cleanup()
    }
  }, [apiKey, useMic, useSystem, onRecordingStart, cleanup, makePipeline])

  return (
    <div className="flex items-center gap-1">
      {systemAudioDenied && (
        <span className="text-xs text-yellow-400 flex items-center gap-1">
          No system audio.{" "}
          <button className="underline hover:text-yellow-200" onClick={() => { setSystemAudioDenied(false); setUseMic(true); setUseSystem(false) }}>
            Use mic
          </button>
        </span>
      )}
      {error && !systemAudioDenied && (
        <span className="text-xs text-red-400 max-w-[140px] truncate" title={error}>{error}</span>
      )}

      {/* Toggles + language — only visible when expanded or recording */}
      <div className={`flex items-center gap-1 overflow-hidden transition-all duration-200 ${
        isExpanded || isRecording ? "opacity-100 max-w-xs" : "w-0 opacity-0 pointer-events-none"
      }`}>
        <button
          onClick={() => isRecording ? toggleMicDuringRecording() : setUseMic((v) => !v)}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            isRecording
              ? micMuted ? "text-gray-500 bg-zinc-800 hover:text-yellow-400" : "text-yellow-400 bg-zinc-800 hover:text-gray-400"
              : useMic ? "text-yellow-400 bg-zinc-800" : "text-gray-500 hover:text-gray-300 hover:bg-zinc-800"
          }`}
          title={isRecording ? (micMuted ? "Unmute mic" : "Mute mic") : (useMic ? "Mic on" : "Mic off")}
        >
          {isRecording ? (micMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />) : (useMic ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />)}
        </button>

        <button
          onClick={() => isRecording ? toggleSysDuringRecording() : setUseSystem((v) => !v)}
          disabled={isRecording && !sysPipelineRef.current}
          className={`p-2 rounded-lg transition-colors shrink-0 ${
            isRecording
              ? !sysPipelineRef.current ? "text-gray-600 cursor-not-allowed"
                : sysMuted ? "text-gray-500 bg-zinc-800 hover:text-green-400" : "text-green-400 bg-zinc-800 hover:text-gray-400"
              : useSystem ? "text-green-400 bg-zinc-800" : "text-gray-500 hover:text-gray-300 hover:bg-zinc-800"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
          title={isRecording ? (!sysPipelineRef.current ? "System audio not available" : sysMuted ? "Unmute system" : "Mute system") : (useSystem ? "System audio on" : "System audio off")}
        >
          {isRecording && sysMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </button>

      </div>

      {/* Pause / Resume button — only during recording */}
      {isRecording && (
        <button
          onClick={() => isPaused ? resumeRecording() : pauseRecording()}
          className={`p-2 rounded-lg transition-colors ${
            isPaused ? "text-blue-400 bg-zinc-800 hover:bg-zinc-700" : "text-orange-400 hover:bg-zinc-800"
          }`}
          title={isPaused ? "Resume recording" : "Pause recording"}
        >
          {isPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
        </button>
      )}

      {/* Main button: idle → expand; expanded → start; recording → stop */}
      <button
        onClick={() => {
          if (isRecording) stopRecording()
          else if (isExpanded) startRecording()
          else setIsExpanded(true)
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
        <AudioLines className={`h-4 w-4 ${isRecording && !isPaused ? "animate-pulse" : ""}`} />
      </button>
    </div>
  )
}
