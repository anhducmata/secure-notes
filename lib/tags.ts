/**
 * Reusable tags store, Apple color dots and helper utilities
 */

const TAGS_STORAGE_KEY = "secure_notes_saved_tags_v2"
const TAG_COLORS_STORAGE_KEY = "secure_notes_tag_colors_v2"

export interface AppleTagColor {
  id: string
  name: string
  color: string // hex
}

export const APPLE_TAG_COLORS: AppleTagColor[] = [
  { id: "red", name: "Red", color: "#ef4444" },
  { id: "orange", name: "Orange", color: "#f97316" },
  { id: "yellow", name: "Yellow", color: "#eab308" },
  { id: "green", name: "Green", color: "#22c55e" },
  { id: "blue", name: "Blue", color: "#3b82f6" },
  { id: "purple", name: "Purple", color: "#a855f7" },
  { id: "pink", name: "Pink", color: "#ec4899" },
  { id: "gray", name: "Gray", color: "#71717a" },
]

export const DEFAULT_SUGGESTED_TAGS: string[] = [
  "Secret",
  "Work",
  "Personal",
  "Idea",
  "Project",
  "Meeting",
]

export const DEFAULT_TAG_COLORS: Record<string, string> = {
  secret: "#ef4444",
  work: "#f97316",
  personal: "#eab308",
  idea: "#22c55e",
  project: "#3b82f6",
  meeting: "#a855f7",
}

export function getStoredTags(): string[] {
  if (typeof window === "undefined") return DEFAULT_SUGGESTED_TAGS
  try {
    const raw = localStorage.getItem(TAGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SUGGESTED_TAGS
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : DEFAULT_SUGGESTED_TAGS
  } catch {
    return DEFAULT_SUGGESTED_TAGS
  }
}

export function saveStoredTags(tags: string[]): void {
  if (typeof window === "undefined") return
  try {
    const unique = Array.from(new Set(tags.map((t) => t.trim()).filter(Boolean)))
    localStorage.setItem(TAGS_STORAGE_KEY, JSON.stringify(unique))
  } catch (err) {
    console.error("Failed to save tags:", err)
  }
}

export function getStoredTagColors(): Record<string, string> {
  if (typeof window === "undefined") return {}
  try {
    const raw = localStorage.getItem(TAG_COLORS_STORAGE_KEY)
    if (!raw) return {}
    return JSON.parse(raw) || {}
  } catch {
    return {}
  }
}

export function saveStoredTagColor(tagName: string, colorHex: string): void {
  if (typeof window === "undefined") return
  try {
    const map = getStoredTagColors()
    map[tagName.trim().toLowerCase()] = colorHex
    localStorage.setItem(TAG_COLORS_STORAGE_KEY, JSON.stringify(map))
  } catch (err) {
    console.error("Failed to save tag color:", err)
  }
}

/**
 * Returns the hex color for a tag, matching Apple colors.
 * If user hasn't explicitly picked a color, deterministically assigns one.
 */
export function getTagColor(tagName: string, customMap?: Record<string, string>): string {
  if (!tagName) return APPLE_TAG_COLORS[0].color
  const key = tagName.trim().toLowerCase()
  const map = customMap || getStoredTagColors()
  if (map[key]) return map[key]
  if (DEFAULT_TAG_COLORS[key]) return DEFAULT_TAG_COLORS[key]

  // Deterministic fallback based on tag string hash
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = key.charCodeAt(i) + ((hash << 5) - hash)
  }
  const index = Math.abs(hash) % APPLE_TAG_COLORS.length
  return APPLE_TAG_COLORS[index].color
}

function syncTagToBackend(tagName: string, colorHex?: string, action: "save" | "delete" = "save") {
  if (typeof window === "undefined") return
  if (action === "delete") {
    fetch(`/api/tags?id=${encodeURIComponent(tagName)}`, { method: "DELETE", credentials: "include" }).catch(() => {})
  } else {
    fetch("/api/tags", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ name: tagName, color: colorHex }),
    }).catch(() => {})
  }
}

export function addStoredTag(newTag: string, colorHex?: string): string[] {
  const trimmed = newTag.trim()
  if (!trimmed) return getStoredTags()
  const existing = getStoredTags()
  if (!existing.some((t) => t.toLowerCase() === trimmed.toLowerCase())) {
    const updated = [...existing, trimmed]
    saveStoredTags(updated)
    if (colorHex) {
      saveStoredTagColor(trimmed, colorHex)
    }
    syncTagToBackend(trimmed, colorHex, "save")
    return updated
  } else if (colorHex) {
    saveStoredTagColor(trimmed, colorHex)
    syncTagToBackend(trimmed, colorHex, "save")
  }
  return existing
}

export function removeStoredTag(tagToRemove: string): string[] {
  const existing = getStoredTags()
  const updated = existing.filter((t) => t.toLowerCase() !== tagToRemove.trim().toLowerCase())
  saveStoredTags(updated)
  syncTagToBackend(tagToRemove, undefined, "delete")
  return updated
}
