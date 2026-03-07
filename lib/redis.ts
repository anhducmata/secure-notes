import { Redis } from "@upstash/redis"

export const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
})

// Key patterns
export const NOTES_KEY = (userId: string) => `notes:${userId}`
export const NOTE_KEY = (userId: string, noteId: string) => `note:${userId}:${noteId}`

// One-time share link key pattern
// Stores: { noteTitle, noteContent, createdAt, creatorEmail }
// TTL: 24 hours (auto-expires if not viewed)
export const SHARE_LINK_KEY = (shareId: string) => `share:${shareId}`
