"use client"

import { useState, useEffect } from "react"
import { X, Shield, Key, Check, AlertCircle, Lock, Server, Eye, EyeOff, Github, Mic, Bot } from "lucide-react"

const SONIOX_API_KEY_STORAGE = "soniox_api_key"
const OPENAI_API_KEY_STORAGE = "openai_api_key"
const DEEPSEEK_API_KEY_STORAGE = "deepseek_api_key"
const SILENCE_TIMEOUT_STORAGE = "voice_silence_timeout"
const TRANSCRIPTION_LANG_STORAGE = "voice_transcription_lang"
const DEFAULT_SILENCE_TIMEOUT = 30
const DEFAULT_LANG = "en"
const AI_MODEL_STORAGE = "ai_model"
const DEFAULT_AI_MODEL = "gpt-5.5"

export const AI_MODELS = [
  { id: "gpt-5.5", label: "GPT-5.5", provider: "openai" },
  { id: "chat-latest", label: "Chat Latest", provider: "openai" },
  { id: "deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "deepseek" },
  { id: "deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "deepseek" },
] as const

export type AIModelId = typeof AI_MODELS[number]["id"]

export function getAIModel(): AIModelId {
  if (typeof window === "undefined") return DEFAULT_AI_MODEL as AIModelId
  return (localStorage.getItem(AI_MODEL_STORAGE) as AIModelId) || (DEFAULT_AI_MODEL as AIModelId)
}

export function getSonioxApiKey(): string {
  if (typeof window === "undefined") return ""
  return (
    localStorage.getItem(SONIOX_API_KEY_STORAGE) ||
    process.env.NEXT_PUBLIC_SONIOX_API_KEY ||
    ""
  )
}

export function getOpenAiApiKey(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(OPENAI_API_KEY_STORAGE) || ""
}

export function getDeepseekApiKey(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem(DEEPSEEK_API_KEY_STORAGE) || ""
}

export function getSilenceTimeout(): number {
  if (typeof window === "undefined") return DEFAULT_SILENCE_TIMEOUT
  const v = parseInt(localStorage.getItem(SILENCE_TIMEOUT_STORAGE) || "", 10)
  return isNaN(v) || v < 5 ? DEFAULT_SILENCE_TIMEOUT : v
}

export function getTranscriptionLang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG
  return localStorage.getItem(TRANSCRIPTION_LANG_STORAGE) || DEFAULT_LANG
}



const GITHUB_URL = process.env.NEXT_PUBLIC_GITHUB_URL ?? "https://github.com/anhducmata/secure-notes"
const COMMIT_SHA = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "unknown"

const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "vi", label: "Vietnamese" },
  { code: "zh", label: "Chinese" },
  { code: "ja", label: "Japanese" },
  { code: "ko", label: "Korean" },
  { code: "th", label: "Thai" },
  { code: "fr", label: "French" },
  { code: "de", label: "German" },
  { code: "es", label: "Spanish" },
  { code: "hi", label: "Hindi" },
]

type Tab = "general" | "api_keys" | "security" | "about"

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "api_keys", label: "API Keys" },
  { id: "security", label: "Security" },
  { id: "about", label: "About" },
]

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
  user: { name: string; email: string } | null
  onPinSet: (pin: string) => void
  hasPin: boolean
  onPinRemove: () => void
}

export function SettingsModal({ isOpen, onClose, user, onPinSet, hasPin, onPinRemove }: SettingsModalProps) {
  const [tab, setTab] = useState<Tab>("general")
  const [pin, setPin] = useState(["", "", "", "", "", ""])
  const [confirmPin, setConfirmPin] = useState(["", "", "", "", "", ""])
  const [pinStep, setPinStep] = useState<"create" | "confirm">("create")
  const [pinError, setPinError] = useState<string | null>(null)
  const [pinSuccess, setPinSuccess] = useState(false)
  const [sonioxKey, setSonioxKey] = useState("")
  const [showSonioxKey, setShowSonioxKey] = useState(false)
  const [sonioxSaved, setSonioxSaved] = useState(false)
  const [silenceTimeout, setSilenceTimeout] = useState(DEFAULT_SILENCE_TIMEOUT)
  const [lang, setLangState] = useState(DEFAULT_LANG)
  const [aiModel, setAiModel] = useState<AIModelId>(DEFAULT_AI_MODEL as AIModelId)

  useEffect(() => {
    if (isOpen) {
      setSonioxKey(getSonioxApiKey())
      setSonioxSaved(false)
      setShowSonioxKey(false)
      setSilenceTimeout(getSilenceTimeout())
      setLangState(getTranscriptionLang())
      setAiModel(getAIModel())
    } else {
      setTab("general")
      setPin(["", "", "", "", "", ""])
      setConfirmPin(["", "", "", "", "", ""])
      setPinStep("create")
      setPinError(null)
      setPinSuccess(false)
    }
  }, [isOpen])

  const handleSonioxSave = () => {
    setSonioxApiKey(sonioxKey)
    localStorage.setItem(SILENCE_TIMEOUT_STORAGE, String(silenceTimeout))
    localStorage.setItem(TRANSCRIPTION_LANG_STORAGE, lang)
    localStorage.setItem(AI_MODEL_STORAGE, aiModel)
    setSonioxSaved(true)
    setTimeout(() => setSonioxSaved(false), 2000)
  }

  const handleModelChange = (model: AIModelId) => {
    setAiModel(model)
    localStorage.setItem(AI_MODEL_STORAGE, model)
  }

  if (!isOpen) return null

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose()
  }

  const handlePinInput = (index: number, value: string, isConfirm: boolean = false) => {
    if (!/^\d*$/.test(value)) return

    const arr = isConfirm ? [...confirmPin] : [...pin]
    arr[index] = value.slice(-1)

    if (isConfirm) {
      setConfirmPin(arr)
    } else {
      setPin(arr)
    }

    if (value && index < 5) {
      const nextInput = document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index + 1}`)
      nextInput?.focus()
    }

    if (arr.every((d) => d !== "")) {
      if (!isConfirm && pinStep === "create") {
        setTimeout(() => {
          setPinStep("confirm")
          setPinError(null)
        }, 200)
      } else if (isConfirm && pinStep === "confirm") {
        const pinStr = pin.join("")
        const confirmStr = arr.join("")
        if (pinStr === confirmStr) {
          onPinSet(pinStr)
          setPinSuccess(true)
          setTimeout(() => {
            setPinSuccess(false)
            setPin(["", "", "", "", "", ""])
            setConfirmPin(["", "", "", "", "", ""])
            setPinStep("create")
          }, 1500)
        } else {
          setPinError("PINs do not match. Try again.")
          setConfirmPin(["", "", "", "", "", ""])
          setTimeout(() => {
            document.getElementById("confirm-pin-0")?.focus()
          }, 100)
        }
      }
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent, index: number, isConfirm: boolean = false) => {
    if (e.key === "Backspace") {
      const arr = isConfirm ? [...confirmPin] : [...pin]
      if (arr[index] === "" && index > 0) {
        const prevInput = document.getElementById(`${isConfirm ? "confirm-" : ""}pin-${index - 1}`)
        prevInput?.focus()
      }
    }
  }

  const renderPinInputs = (values: string[], isConfirm: boolean = false) => (
    <div className="flex justify-center gap-2">
      {values.map((digit, i) => (
        <input
          key={i}
          id={`${isConfirm ? "confirm-" : ""}pin-${i}`}
          type="password"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handlePinInput(i, e.target.value, isConfirm)}
          onKeyDown={(e) => handleKeyDown(e, i, isConfirm)}
          className="h-12 w-10 rounded-xl text-center text-xl font-semibold text-white focus:outline-none focus:ring-2 focus:ring-yellow-500"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
          autoFocus={i === 0}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-form-type="other"
          data-lpignore="true"
          data-1p-ignore="true"
        />
      ))}
    </div>
  )

  const renderGeneral = () => (
    <div className="space-y-3">
      {/* Voice Transcription */}
      <div
        className="rounded-xl px-4 py-3.5 space-y-3"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "rgba(234,179,8,0.12)" }}
          >
            <Mic className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-white">Voice Transcription</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Soniox API key for real-time transcription
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type={showSonioxKey ? "text" : "password"}
              value={sonioxKey}
              onChange={(e) => setSonioxKey(e.target.value)}
              placeholder="Paste API key…"
              className="w-full rounded-lg px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
              autoComplete="off"
              spellCheck={false}
              data-1p-ignore="true"
            />
            <button
              type="button"
              onClick={() => setShowSonioxKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.35)" }}
              aria-label={showSonioxKey ? "Hide key" : "Show key"}
            >
              {showSonioxKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
          <button
            onClick={handleSonioxSave}
            className="shrink-0 rounded-lg px-3 py-2 text-xs font-medium transition-colors"
            style={{
              background: sonioxSaved ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
              color: sonioxSaved ? "rgb(74,222,128)" : "rgb(234,179,8)",
            }}
          >
            {sonioxSaved ? <Check className="h-3.5 w-3.5" /> : "Save"}
          </button>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs shrink-0" style={{ color: "rgba(255,255,255,0.4)" }}>
            Auto-stop
          </span>
          <input
            type="number"
            min={5}
            max={300}
            value={silenceTimeout}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10)
              if (!isNaN(v)) setSilenceTimeout(v)
            }}
            className="w-14 rounded-lg px-2 py-1 text-xs text-white text-center focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
          />
          <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>sec</span>
          <span className="text-xs shrink-0 ml-2" style={{ color: "rgba(255,255,255,0.4)" }}>Lang</span>
          <select
            value={lang}
            onChange={(e) => setLangState(e.target.value)}
            className="rounded-lg px-2 py-1 text-xs text-gray-300 focus:outline-none focus:ring-1 focus:ring-yellow-500"
            style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* AI Model */}
      <div
        className="rounded-xl px-4 py-3.5 space-y-3"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "rgba(234,179,8,0.12)" }}
          >
            <Bot className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">AI Model</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Model used by the AI assistant
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {AI_MODELS.map((m) => (
            <button
              key={m.id}
              onClick={() => handleModelChange(m.id)}
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-all text-left"
              style={{
                background: aiModel === m.id ? "rgba(234,179,8,0.18)" : "rgba(255,255,255,0.05)",
                border: `1px solid ${aiModel === m.id ? "rgba(234,179,8,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: aiModel === m.id ? "rgb(234,179,8)" : "rgba(255,255,255,0.55)",
              }}
            >
              {aiModel === m.id && <Check className="h-3 w-3 shrink-0" />}
              <span className="truncate">{m.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )

  
  const renderApiKeys = () => (
    <div className="space-y-3">
      <div
        className="rounded-xl px-4 py-3.5 space-y-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3 mb-2">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "rgba(234,179,8,0.12)" }}
          >
            <Key className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-medium text-white">API Keys</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Provide your own API keys for services
            </p>
          </div>
        </div>

        {/* Soniox Key */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>Soniox API Key (Voice)</label>
          <div className="relative">
            <input
              type={showSonioxKey ? "text" : "password"}
              value={sonioxKey}
              onChange={(e) => setSonioxKey(e.target.value)}
              placeholder="Paste API key…"
              className="w-full rounded-lg px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              type="button"
              onClick={() => setShowSonioxKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {showSonioxKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* OpenAI Key */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>OpenAI API Key</label>
          <div className="relative">
            <input
              type={showOpenaiKey ? "text" : "password"}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full rounded-lg px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              type="button"
              onClick={() => setShowOpenaiKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {showOpenaiKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        {/* DeepSeek Key */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: "rgba(255,255,255,0.6)" }}>DeepSeek API Key</label>
          <div className="relative">
            <input
              type={showDeepseekKey ? "text" : "password"}
              value={deepseekKey}
              onChange={(e) => setDeepseekKey(e.target.value)}
              placeholder="Paste API key…"
              className="w-full rounded-lg px-3 py-2 pr-9 text-xs text-white focus:outline-none focus:ring-1 focus:ring-yellow-500 font-mono"
              style={{ background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.1)" }}
            />
            <button
              type="button"
              onClick={() => setShowDeepseekKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2"
              style={{ color: "rgba(255,255,255,0.35)" }}
            >
              {showDeepseekKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            </button>
          </div>
        </div>

        <div className="flex justify-end pt-2">
          <button
            onClick={handleApiKeysSave}
            className="shrink-0 rounded-lg px-4 py-2 text-xs font-medium transition-colors"
            style={{
              background: apiKeysSaved ? "rgba(34,197,94,0.15)" : "rgba(234,179,8,0.15)",
              color: apiKeysSaved ? "rgb(74,222,128)" : "rgb(234,179,8)",
            }}
          >
            {apiKeysSaved ? <Check className="h-3.5 w-3.5" /> : "Save Keys"}
          </button>
        </div>
      </div>
    </div>
  )

  const renderSecurity = () => (
    <div className="space-y-3">
      {/* PIN Setup */}
      <div
        className="rounded-xl px-4 py-3.5 space-y-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ background: "rgba(234,179,8,0.15)" }}
          >
            <Key className="h-4 w-4 text-yellow-500" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Quick Access PIN</p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {hasPin ? "PIN is set — 12h access on this device" : "Set a 6-digit PIN for quick login"}
            </p>
          </div>
        </div>

        {pinSuccess ? (
          <div className="flex flex-col items-center gap-2 py-2">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-full"
              style={{ background: "rgba(34,197,94,0.15)" }}
            >
              <Check className="h-5 w-5 text-green-500" />
            </div>
            <p className="text-xs text-green-500">PIN set successfully!</p>
          </div>
        ) : (
          <>
            <p className="text-xs text-center font-medium" style={{ color: "rgba(255,255,255,0.5)" }}>
              {pinStep === "create" ? "Enter a 6-digit PIN" : "Confirm your PIN"}
            </p>

            {pinError && (
              <div
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-xs"
                style={{
                  background: "rgba(239,68,68,0.15)",
                  border: "1px solid rgba(239,68,68,0.25)",
                  color: "rgb(252,165,165)",
                }}
              >
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{pinError}</span>
              </div>
            )}

            {pinStep === "create" ? renderPinInputs(pin) : renderPinInputs(confirmPin, true)}

            <p className="text-center text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
              PIN allows quick access for 12 hours.
            </p>

            {hasPin && (
              <button
                onClick={() => {
                  onPinRemove()
                  setPin(["", "", "", "", "", ""])
                  setConfirmPin(["", "", "", "", "", ""])
                  setPinStep("create")
                  setPinError(null)
                }}
                className="w-full text-center text-xs text-red-400 py-1"
              >
                Remove PIN
              </button>
            )}
          </>
        )}
      </div>

      {/* Security info cards */}
      {[
        {
          icon: <Lock className="h-4 w-4 text-yellow-500" />,
          bg: "rgba(234,179,8,0.15)",
          title: "End-to-End Encryption",
          body: "Your notes are encrypted on your device before being stored. We use AES-256-GCM encryption with keys derived from your password using PBKDF2.",
        },
        {
          icon: <Eye className="h-4 w-4 text-purple-400" />,
          bg: "rgba(147,51,234,0.15)",
          title: "Zero-Knowledge Architecture",
          body: "We never see your notes in plain text. Your password never leaves your device — only you can decrypt your notes.",
        },
        {
          icon: <Server className="h-4 w-4 text-blue-400" />,
          bg: "rgba(59,130,246,0.15)",
          title: "Secure Cloud Storage",
          body: "Encrypted notes are stored securely in the cloud with redundant backups. Your password is hashed using bcrypt before storage.",
        },
        {
          icon: <Lock className="h-4 w-4 text-red-400" />,
          bg: "rgba(239,68,68,0.15)",
          title: "Auto-Lock",
          body: "Your notes automatically lock after inactivity. If you have a PIN set, you can quickly unlock with it for up to 12 hours.",
        },
      ].map(({ icon, bg, title, body }) => (
        <div
          key={title}
          className="rounded-xl p-4"
          style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }}
        >
          <div className="flex items-start gap-3">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
              style={{ background: bg }}
            >
              {icon}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{title}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.5)" }}>
                {body}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  const renderAbout = () => (
    <div className="space-y-3">
      <div
        className="rounded-xl px-4 py-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div className="flex items-center gap-3">
          <div
            className="flex h-9 w-9 items-center justify-center rounded-lg"
            style={{ background: "rgba(255,255,255,0.08)" }}
          >
            <Github className="h-4.5 w-4.5" style={{ color: "rgba(255,255,255,0.7)" }} />
          </div>
          <div className="flex-1">
            <p className="text-sm font-medium text-white">Source Code</p>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs hover:underline mt-0.5 block"
              style={{ color: "rgba(255,255,255,0.5)" }}
            >
              {GITHUB_URL.replace("https://", "")}
            </a>
          </div>
        </div>
      </div>

      <div
        className="rounded-xl px-4 py-4"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <p className="text-xs font-medium text-white mb-2">Build Info</p>
        <p className="text-xs font-mono" style={{ color: "rgba(255,255,255,0.4)" }}>
          {COMMIT_SHA}
        </p>
      </div>

      <p className="text-center text-xs py-2" style={{ color: "rgba(255,255,255,0.25)" }}>
        Your privacy is our priority.
      </p>
    </div>
  )

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        backgroundColor: "rgba(0,0,0,0.55)",
      }}
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
    >
      <div
        className="relative w-full max-w-sm rounded-2xl overflow-hidden flex flex-col max-h-[90vh]"
        style={{
          background: "rgba(28,28,30,0.82)",
          backdropFilter: "blur(40px)",
          WebkitBackdropFilter: "blur(40px)",
          border: "1px solid rgba(255,255,255,0.10)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.06) inset",
        }}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 shrink-0">
          <div className="flex items-center justify-between mb-1">
            <h2 className="text-base font-semibold text-white tracking-tight">Settings</h2>
            <button
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded-full transition-colors"
              style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.5)" }}
              aria-label="Close modal"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {user?.email && (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>
              {user.email}
            </p>
          )}
        </div>

        {/* Tab Bar */}
        <div
          className="mx-4 mb-4 flex rounded-xl p-1 shrink-0"
          style={{ background: "rgba(255,255,255,0.06)" }}
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="flex-1 rounded-lg py-1.5 text-xs font-medium transition-all"
              style={
                tab === t.id
                  ? {
                    background: "rgba(255,255,255,0.12)",
                    color: "rgba(255,255,255,0.9)",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                  }
                  : { color: "rgba(255,255,255,0.4)" }
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="px-4 pb-5 overflow-y-auto">
          {tab === "general" && renderGeneral()}
          {tab === "api_keys" && renderApiKeys()}
          {tab === "security" && renderSecurity()}
          {tab === "about" && renderAbout()}
        </div>
      </div>
    </div>
  )
}
