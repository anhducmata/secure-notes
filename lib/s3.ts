import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"
import fs from "fs"
import path from "path"

// ─── S3 client (used when credentials are present) ───────────────────────────

export const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_KEY_ID || "local",
    secretAccessKey: process.env.S3_KEY_SECRET || "local",
  },
})

export const S3_BUCKET = process.env.S3_BUCKET_NAME || ""

const IS_LOCAL = !process.env.S3_KEY_ID || !process.env.S3_BUCKET_NAME

// Local notes stored under .local-notes/<userId>/<noteId>.json
const LOCAL_NOTES_DIR = path.join(process.cwd(), ".local-notes")

function localNotePath(userId: string, noteId: string): string {
  return path.join(LOCAL_NOTES_DIR, userId, `${noteId}.json`)
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getNoteKey(userId: string, noteId: string): string {
  return `notes/${userId}/${noteId}.json`
}

export function getUserNotesPrefix(userId: string): string {
  return `notes/${userId}/`
}

export async function uploadNote(userId: string, noteId: string, encryptedData: object): Promise<void> {
  if (IS_LOCAL) {
    const dir = path.join(LOCAL_NOTES_DIR, userId)
    ensureDir(dir)
    fs.writeFileSync(localNotePath(userId, noteId), JSON.stringify(encryptedData))
    return
  }
  await s3Client.send(
    new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: getNoteKey(userId, noteId),
      Body: JSON.stringify(encryptedData),
      ContentType: "application/json",
    })
  )
}

export async function getNote(userId: string, noteId: string): Promise<object | null> {
  if (IS_LOCAL) {
    const p = localNotePath(userId, noteId)
    if (!fs.existsSync(p)) return null
    return JSON.parse(fs.readFileSync(p, "utf-8"))
  }
  try {
    const response = await s3Client.send(
      new GetObjectCommand({ Bucket: S3_BUCKET, Key: getNoteKey(userId, noteId) })
    )
    const body = await response.Body?.transformToString()
    if (!body) return null
    return JSON.parse(body)
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "NoSuchKey") return null
    throw error
  }
}

export async function deleteNote(userId: string, noteId: string): Promise<void> {
  if (IS_LOCAL) {
    const p = localNotePath(userId, noteId)
    if (fs.existsSync(p)) fs.unlinkSync(p)
    return
  }
  await s3Client.send(
    new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: getNoteKey(userId, noteId) })
  )
}

export async function listUserNotes(userId: string): Promise<string[]> {
  if (IS_LOCAL) {
    const dir = path.join(LOCAL_NOTES_DIR, userId)
    if (!fs.existsSync(dir)) return []
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(".json", ""))
  }
  const response = await s3Client.send(
    new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: getUserNotesPrefix(userId) })
  )
  if (!response.Contents) return []
  return response.Contents
    .map((obj) => obj.Key!)
    .filter((key) => key.endsWith(".json"))
    .map((key) => {
      const parts = key.split("/")
      return parts[parts.length - 1].replace(".json", "")
    })
}
