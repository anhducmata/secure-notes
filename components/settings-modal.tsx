"use client"

import React, { useState, useRef, useEffect } from "react"
import {
  X,
  Users,
  Tag,
  Settings as SettingsIcon,
  Mic,
  Trash2,
  Play,
  Pause,
  Plus,
  Edit2,
  Check,
  Shield,
  ChevronLeft,
  ChevronRight,
  Upload,
} from "lucide-react"
import {
  SpeakerProfile,
  VoiceSample,
  saveStoredSpeakers,
} from "@/lib/speakers"
import {
  getStoredTags,
  saveStoredTags,
  addStoredTag,
  removeStoredTag,
  APPLE_TAG_COLORS,
  getStoredTagColors,
  saveStoredTagColor,
  getTagColor,
} from "@/lib/tags"
import { extractVoiceFeaturesFromBlob } from "@/lib/voice-matcher"
import {
  getSilenceTimeout,
  setSilenceTimeout,
  getTranscriptionLang,
  setTranscriptionLang,
} from "@/lib/user-settings"

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  userEmail?: string
  speakers: SpeakerProfile[]
  onUpdateSpeakers: (updated: SpeakerProfile[]) => void
}

type TabType = "general" | "speakers" | "tags" | "account"

export function SettingsModal({
  isOpen,
  onClose,
  userEmail,
  speakers,
  onUpdateSpeakers,
}: SettingsModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("speakers")
  const [localSpeakers, setLocalSpeakers] = useState<SpeakerProfile[]>(speakers)
  const [selectedSpeakerId, setSelectedSpeakerId] = useState<string | null>(null)
  const [tags, setTags] = useState<string[]>([])
  const [newTagInput, setNewTagInput] = useState("")

  // General settings state
  const [silenceTimeout, setSilenceTimeoutState] = useState<number>(() => getSilenceTimeout())
  const [transcriptionLang, setTranscriptionLangState] = useState<string>(() => getTranscriptionLang())

  // Voice sample player state
  const [playingSampleId, setPlayingSampleId] = useState<string | null>(null)
  const audioSampleRef = useRef<HTMLAudioElement | null>(null)

  // Speaker rename state
  const [editingName, setEditingName] = useState(false)
  const [speakerNameInput, setSpeakerNameInput] = useState("")

  // Add speaker state
  const [addingSpeaker, setAddingSpeaker] = useState(false)
  const [newSpeakerName, setNewSpeakerName] = useState("")

  // Record new voice sample
  const [recordingSample, setRecordingSample] = useState(false)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    setLocalSpeakers(speakers)
  }, [speakers])

  // Tag color state
  const [tagColors, setTagColors] = useState<Record<string, string>>({})
  const [selectedNewTagColor, setSelectedNewTagColor] = useState<string>(APPLE_TAG_COLORS[4].color)

  useEffect(() => {
    if (isOpen) {
      setTags(getStoredTags())
      setTagColors(getStoredTagColors())
    }
  }, [isOpen])

  // Stop sample playback on unmount or close
  useEffect(() => {
    return () => {
      if (audioSampleRef.current) {
        audioSampleRef.current.pause()
        audioSampleRef.current = null
      }
    }
  }, [])

  if (!isOpen) return null

  const selectedSpeaker = localSpeakers.find((s) => s.id === selectedSpeakerId)

  const handleOpenSpeakerProfile = (speaker: SpeakerProfile) => {
    setSelectedSpeakerId(speaker.id)
    setSpeakerNameInput(speaker.name)
    setEditingName(false)
  }

  const handleSaveSpeakerName = (speakerId: string) => {
    if (!speakerNameInput.trim()) return
    const updated = localSpeakers.map((s) =>
      s.id === speakerId
        ? { ...s, name: speakerNameInput.trim(), isCustomNamed: true, updatedAt: new Date().toISOString() }
        : s
    )
    setLocalSpeakers(updated)
    onUpdateSpeakers(updated)
    saveStoredSpeakers(updated)
    setEditingName(false)
  }

  const handleAddSpeaker = () => {
    if (!newSpeakerName.trim()) return
    const id = `speaker_${Date.now()}`
    const newProfile: SpeakerProfile = {
      id,
      name: newSpeakerName.trim(),
      isCustomNamed: true,
      voiceSamples: [],
      usedNoteCount: 0,
      updatedAt: new Date().toISOString(),
    }
    const updated = [...localSpeakers, newProfile]
    setLocalSpeakers(updated)
    onUpdateSpeakers(updated)
    saveStoredSpeakers(updated)
    setNewSpeakerName("")
    setAddingSpeaker(false)
    handleOpenSpeakerProfile(newProfile)
  }

  const handleDeleteSpeaker = (speakerId: string) => {
    const updated = localSpeakers.filter((s) => s.id !== speakerId)
    setLocalSpeakers(updated)
    onUpdateSpeakers(updated)
    saveStoredSpeakers(updated)
    setSelectedSpeakerId(null)
  }

  const handlePlaySample = (sample: VoiceSample) => {
    if (playingSampleId === sample.id && audioSampleRef.current) {
      audioSampleRef.current.pause()
      setPlayingSampleId(null)
      return
    }

    if (audioSampleRef.current) {
      audioSampleRef.current.pause()
    }

    if (!sample.audioDataUrl) {
      // Demo sample with simulated playback
      setPlayingSampleId(sample.id)
      setTimeout(() => {
        setPlayingSampleId(null)
      }, (sample.duration || 3) * 1000)
      return
    }

    const audio = new Audio(sample.audioDataUrl)
    audioSampleRef.current = audio
    audio.onended = () => setPlayingSampleId(null)
    audio.play().catch(() => {})
    setPlayingSampleId(sample.id)
  }

  const handleRemoveSample = (speakerId: string, sampleId: string) => {
    const updated = localSpeakers.map((s) => {
      if (s.id !== speakerId) return s
      return {
        ...s,
        voiceSamples: s.voiceSamples.filter((samp) => samp.id !== sampleId),
        updatedAt: new Date().toISOString(),
      }
    })
    setLocalSpeakers(updated)
    onUpdateSpeakers(updated)
    saveStoredSpeakers(updated)
  }

  // Record a quick sample for the active speaker profile
  const startRecordingSample = async (speakerId: string) => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      audioChunksRef.current = []
      const recorder = new MediaRecorder(stream)

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop())
        if (audioChunksRef.current.length > 0) {
          const blob = new Blob(audioChunksRef.current, { type: "audio/webm" })
          const features = await extractVoiceFeaturesFromBlob(blob)
          const reader = new FileReader()
          reader.onloadend = () => {
            const dataUrl = reader.result as string
            const newSample: VoiceSample = {
              id: `samp_${Date.now()}`,
              audioDataUrl: dataUrl,
              duration: 8,
              createdAt: new Date().toISOString(),
              spectralFeature: features || undefined,
            }
            const updated = localSpeakers.map((s) => {
              if (s.id !== speakerId) return s
              return {
                ...s,
                voiceSamples: [...(s.voiceSamples || []), newSample],
                updatedAt: new Date().toISOString(),
              }
            })
            setLocalSpeakers(updated)
            onUpdateSpeakers(updated)
            saveStoredSpeakers(updated)
          }
          reader.readAsDataURL(blob)
        }
        setRecordingSample(false)
      }

      recorder.start()
      mediaRecorderRef.current = recorder
      setRecordingSample(true)

      // Stop automatically after 5 seconds
      setTimeout(() => {
        if (recorder.state === "recording") {
          recorder.stop()
        }
      }, 5000)
    } catch (err) {
      console.warn("Microphone access failed or denied:", err)
      setRecordingSample(false)
    }
  }

  // Tags management
  const handleAddTag = () => {
    if (!newTagInput.trim()) return
    const updated = addStoredTag(newTagInput.trim(), selectedNewTagColor)
    setTags(updated)
    setTagColors(getStoredTagColors())
    setNewTagInput("")
  }

  const handleRemoveTag = (tag: string) => {
    const updated = removeStoredTag(tag)
    setTags(updated)
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="w-full max-w-2xl bg-white dark:bg-[#121214] border border-zinc-200/90 dark:border-zinc-800 rounded-2xl shadow-2xl flex flex-col h-[560px] overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4 text-zinc-500 dark:text-zinc-400" />
            <h2 id="settings-title" className="text-sm font-semibold text-zinc-900 dark:text-white">
              Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-zinc-400 hover:text-zinc-600 dark:hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content Body: Left Tab Nav & Right Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Navigation Sidebar */}
          <nav
            aria-label="Settings navigation"
            className="w-44 border-r border-zinc-100 dark:border-zinc-800 p-3 space-y-1 bg-[#fafafb] dark:bg-black/30 shrink-0"
          >
            <button
              onClick={() => {
                setActiveTab("general")
                setSelectedSpeakerId(null)
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                activeTab === "general"
                  ? "bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-yellow-400 font-semibold"
                  : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <SettingsIcon className="h-3.5 w-3.5" />
              General
            </button>
            <button
              onClick={() => {
                setActiveTab("speakers")
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                activeTab === "speakers"
                  ? "bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-yellow-400 font-semibold"
                  : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              Speakers
            </button>
            <button
              onClick={() => {
                setActiveTab("tags")
                setSelectedSpeakerId(null)
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                activeTab === "tags"
                  ? "bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-yellow-400 font-semibold"
                  : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Tag className="h-3.5 w-3.5" />
              Tags
            </button>
            <button
              onClick={() => {
                setActiveTab("account")
                setSelectedSpeakerId(null)
              }}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium transition-colors text-left ${
                activeTab === "account"
                  ? "bg-amber-100/70 text-amber-900 dark:bg-amber-950/40 dark:text-yellow-400 font-semibold"
                  : "text-zinc-600 hover:bg-zinc-200/50 dark:text-zinc-400 dark:hover:bg-zinc-800/50"
              }`}
            >
              <Shield className="h-3.5 w-3.5" />
              Account
            </button>
          </nav>

          {/* Right Panel View */}
          <div className="flex-1 overflow-y-auto p-6 bg-white dark:bg-black/20">
            {/* ── Speakers Tab ──────────────────────────────────────────────── */}
            {activeTab === "speakers" && (
              selectedSpeaker ? (
                /* Speaker Profile Drilldown */
                <div className="space-y-5">
                  <div className="flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer" onClick={() => setSelectedSpeakerId(null)}>
                    <ChevronLeft className="h-3.5 w-3.5" />
                    <span>Back to Speakers</span>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-zinc-400 dark:text-zinc-500 uppercase tracking-wider">Speaker profile</span>
                    {editingName ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input
                          type="text"
                          value={speakerNameInput}
                          onChange={(e) => setSpeakerNameInput(e.target.value)}
                          className="text-xl font-bold bg-transparent border-b border-amber-500 text-zinc-900 dark:text-white focus:outline-none"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveSpeakerName(selectedSpeaker.id)
                            if (e.key === "Escape") setEditingName(false)
                          }}
                        />
                        <button
                          onClick={() => handleSaveSpeakerName(selectedSpeaker.id)}
                          className="p-1 rounded bg-zinc-900 text-white dark:bg-yellow-500 dark:text-black"
                        >
                          <Check className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mt-1">
                        <h3 className="text-xl font-bold text-zinc-900 dark:text-white">
                          {selectedSpeaker.name}
                        </h3>
                        <button
                          onClick={() => {
                            setEditingName(true)
                            setSpeakerNameInput(selectedSpeaker.name)
                          }}
                          className="p-1 text-zinc-400 hover:text-zinc-700 dark:hover:text-white"
                          title="Rename speaker"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                      {selectedSpeaker.voiceSamples?.length || 0} voice samples · Used in {selectedSpeaker.usedNoteCount || 0} notes
                    </p>
                  </div>

                  {/* Voice samples section */}
                  <div className="pt-2">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-xs font-semibold text-zinc-800 dark:text-zinc-200 uppercase tracking-wider">
                        Voice samples
                      </h4>
                      <button
                        onClick={() => startRecordingSample(selectedSpeaker.id)}
                        disabled={recordingSample}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                          recordingSample
                            ? "bg-red-500/20 text-red-600 animate-pulse"
                            : "bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200"
                        }`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span>{recordingSample ? "Recording..." : "Add samples"}</span>
                      </button>
                    </div>

                    <div className="space-y-2">
                      {(!selectedSpeaker.voiceSamples || selectedSpeaker.voiceSamples.length === 0) ? (
                        <p className="text-xs text-zinc-400 py-4 italic">No voice samples yet. Click + Add samples to record voice profile.</p>
                      ) : (
                        selectedSpeaker.voiceSamples.map((sample, idx) => {
                          const isPlaying = playingSampleId === sample.id
                          return (
                            <div
                              key={sample.id}
                              className="flex items-center justify-between p-2.5 rounded-xl border border-zinc-100 dark:border-zinc-800/80 bg-zinc-50/50 dark:bg-zinc-900/30"
                            >
                              <div className="flex items-center gap-3">
                                <button
                                  onClick={() => handlePlaySample(sample)}
                                  className="w-7 h-7 rounded-full bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-center justify-center text-zinc-700 dark:text-zinc-200 hover:border-amber-500 transition-colors"
                                >
                                  {isPlaying ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                                </button>
                                <span className="text-xs font-medium text-zinc-800 dark:text-zinc-200 font-mono">
                                  sample_{String(idx + 1).padStart(3, "0")}.wav
                                </span>
                              </div>

                              <div className="flex items-center gap-3">
                                <span className="text-xs text-zinc-400 font-mono">
                                  {sample.duration || 10} sec
                                </span>
                                <button
                                  onClick={() => handleRemoveSample(selectedSpeaker.id, sample.id)}
                                  className="p-1 text-zinc-400 hover:text-red-500 transition-colors"
                                  title="Delete sample"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800 flex justify-between items-center">
                    <p className="text-[11px] text-zinc-400 max-w-[320px]">
                      These samples will later be used to automatically recognize the speaker in future recordings.
                    </p>
                    <button
                      onClick={() => handleDeleteSpeaker(selectedSpeaker.id)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      Delete speaker
                    </button>
                  </div>
                </div>
              ) : (
                /* Speakers List View */
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                      Speakers
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Manage speaker names and voice profiles. These profiles can be used to automatically recognize speakers in future recordings.
                    </p>
                  </div>

                  {addingSpeaker && (
                    <div className="flex items-center gap-2 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900">
                      <input
                        type="text"
                        placeholder="Speaker name..."
                        value={newSpeakerName}
                        onChange={(e) => setNewSpeakerName(e.target.value)}
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleAddSpeaker()
                          if (e.key === "Escape") setAddingSpeaker(false)
                        }}
                        className="flex-1 bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2.5 py-1 text-xs text-zinc-900 dark:text-white focus:outline-none"
                      />
                      <button
                        onClick={handleAddSpeaker}
                        className="px-3 py-1 rounded-lg bg-zinc-900 text-white dark:bg-yellow-500 dark:text-black text-xs font-semibold"
                      >
                        Save
                      </button>
                      <button
                        onClick={() => setAddingSpeaker(false)}
                        className="p-1 text-zinc-400 hover:text-zinc-600 dark:hover:text-white"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  )}

                  <div className="space-y-2">
                    {localSpeakers.map((speaker) => (
                      <div
                        key={speaker.id}
                        onClick={() => handleOpenSpeakerProfile(speaker)}
                        className="flex items-center justify-between p-3.5 rounded-xl border border-zinc-100 hover:border-zinc-200 bg-white hover:bg-zinc-50/70 dark:bg-zinc-900/30 dark:border-zinc-800/80 dark:hover:bg-zinc-900/60 transition-all cursor-pointer group"
                      >
                        <div>
                          <h4 className="text-sm font-semibold text-zinc-900 dark:text-white">
                            {speaker.name}
                          </h4>
                          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                            {speaker.voiceSamples?.length || 0} voice samples · Used in {speaker.usedNoteCount || 0} notes
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-zinc-400 group-hover:text-zinc-700 dark:group-hover:text-white transition-colors" />
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setAddingSpeaker(true)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 hover:border-zinc-400 text-xs font-medium text-zinc-700 dark:text-zinc-300 w-full justify-center transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    <span>Add speaker</span>
                  </button>
                </div>
              )
            )}

            {/* ── General Tab ───────────────────────────────────────────────── */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">General Preferences</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Recording and transcription settings</p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                      Silence Detection Timeout
                    </label>
                    <select
                      value={silenceTimeout}
                      onChange={(e) => {
                        const val = parseInt(e.target.value)
                        setSilenceTimeoutState(val)
                        setSilenceTimeout(val)
                      }}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value={10}>10 seconds</option>
                      <option value={20}>20 seconds</option>
                      <option value={30}>30 seconds (Default)</option>
                      <option value={60}>60 seconds</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300 block mb-1">
                      Transcription Language
                    </label>
                    <select
                      value={transcriptionLang}
                      onChange={(e) => {
                        const val = e.target.value
                        setTranscriptionLangState(val)
                        setTranscriptionLang(val)
                      }}
                      className="w-full rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-2 text-xs text-zinc-900 dark:text-white"
                    >
                      <option value="en">English (Default)</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="id">Indonesian</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* ── Tags Tab ──────────────────────────────────────────────────── */}
            {activeTab === "tags" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Tags</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">Manage reusable tags for your notes</p>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="New tag..."
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleAddTag()}
                    className="flex-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-3 py-1.5 text-xs text-zinc-900 dark:text-white focus:outline-none"
                  />
                  <button
                    onClick={handleAddTag}
                    className="px-3 py-1.5 rounded-lg bg-zinc-900 text-white dark:bg-yellow-500 dark:text-black text-xs font-medium"
                  >
                    Add tag
                  </button>
                </div>

                {/* Apple Color Picker Row */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-zinc-400 font-medium">Color:</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {APPLE_TAG_COLORS.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => setSelectedNewTagColor(c.color)}
                        className={`w-5 h-5 rounded-full transition-transform cursor-pointer flex items-center justify-center ${
                          selectedNewTagColor === c.color
                            ? "scale-110 ring-2 ring-offset-2 ring-zinc-500 dark:ring-zinc-400"
                            : "hover:scale-105 opacity-80 hover:opacity-100"
                        }`}
                        style={{ backgroundColor: c.color }}
                        title={c.name}
                      >
                        {selectedNewTagColor === c.color && (
                          <div className="w-1.5 h-1.5 rounded-full bg-white shadow-xs" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 pt-2">
                  {tags.map((t) => {
                    const dotColor = getTagColor(t, tagColors)
                    return (
                      <span
                        key={t}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                      >
                        <span
                          className="w-2 h-2 rounded-full shrink-0 shadow-xs"
                          style={{ backgroundColor: dotColor }}
                        />
                        <span>{t}</span>
                        <button
                          onClick={() => handleRemoveTag(t)}
                          className="text-zinc-400 hover:text-red-500 ml-0.5"
                          title="Remove tag"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    )
                  })}
                </div>
              </div>
            )}

            {/* ── Account Tab ───────────────────────────────────────────────── */}
            {activeTab === "account" && (
              <div className="space-y-4">
                <div>
                  <h3 className="text-sm font-semibold text-zinc-900 dark:text-white">Account & Security</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">End-to-end encryption status</p>
                </div>

                <div className="p-4 rounded-xl border border-zinc-100 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-900/30 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Email:</span>
                    <span className="font-medium text-zinc-900 dark:text-white">{userEmail || "Signed in"}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-zinc-500">Encryption:</span>
                    <span className="font-medium text-emerald-600 dark:text-emerald-400">AES-256 GCM (Active)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
