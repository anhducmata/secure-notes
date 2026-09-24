const SILENCE_TIMEOUT_STORAGE = "voice_silence_timeout"
const TRANSCRIPTION_LANG_STORAGE = "voice_transcription_lang"
const DEFAULT_SILENCE_TIMEOUT = 30
const DEFAULT_LANG = "en"
const DEFAULT_AI_MODEL = "gpt-5.5"

export function getAIModel(): string {
  if (typeof window === "undefined") return DEFAULT_AI_MODEL
  return localStorage.getItem("ai_model") || DEFAULT_AI_MODEL
}

export function getOpenAiApiKey(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("openai_api_key") || ""
}

export function getDeepseekApiKey(): string {
  if (typeof window === "undefined") return ""
  return localStorage.getItem("deepseek_api_key") || ""
}

export function getSilenceTimeout(): number {
  if (typeof window === "undefined") return DEFAULT_SILENCE_TIMEOUT
  const value = Number.parseInt(localStorage.getItem(SILENCE_TIMEOUT_STORAGE) || "", 10)
  return Number.isNaN(value) || value < 5 ? DEFAULT_SILENCE_TIMEOUT : value
}

export function getTranscriptionLang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG
  return localStorage.getItem(TRANSCRIPTION_LANG_STORAGE) || DEFAULT_LANG
}
