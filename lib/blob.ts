import { del, list, put } from "@vercel/blob"

export function getNoteKey(userId: string, noteId: string): string {
  return `notes/${userId}/${noteId}.json`
}

export function getUserNotesPrefix(userId: string): string {
  return `notes/${userId}/`
}

export async function uploadNote(userId: string, noteId: string, encryptedData: object): Promise<void> {
  await put(getNoteKey(userId, noteId), JSON.stringify(encryptedData), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  })
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const { blobs } = await list({ prefix: getNoteKey(userId, noteId), limit: 1 })
  if (blobs[0]) await del(blobs[0].url)
}

export async function listUserNotes(userId: string): Promise<string[]> {
  const { blobs } = await list({ prefix: getUserNotesPrefix(userId) })
  return blobs
    .map((blob) => blob.pathname.split("/").pop())
    .filter((name): name is string => Boolean(name))
    .filter((name) => name.endsWith(".json"))
    .map((name) => name.slice(0, -5))
}

// Kept for callers that may need to identify a stored note without exposing its URL.
export async function getNote(userId: string, noteId: string): Promise<object | null> {
  const { blobs } = await list({ prefix: getNoteKey(userId, noteId), limit: 1 })
  if (!blobs[0]) return null
  return null
}
