import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from "@aws-sdk/client-s3"

export const s3Client = new S3Client({
  region: process.env.S3_REGION || "us-east-1",
  credentials: {
    accessKeyId: process.env.S3_KEY_ID!,
    secretAccessKey: process.env.S3_KEY_SECRET!,
  },
})

export const S3_BUCKET = process.env.S3_BUCKET_NAME!

/**
 * Get the S3 key for a user's note
 */
export function getNoteKey(userId: string, noteId: string): string {
  return `notes/${userId}/${noteId}.json`
}

/**
 * Get the S3 prefix for a user's notes folder
 */
export function getUserNotesPrefix(userId: string): string {
  return `notes/${userId}/`
}

/**
 * Upload an encrypted note to S3
 */
export async function uploadNote(
  userId: string,
  noteId: string,
  encryptedData: object
): Promise<void> {
  const key = getNoteKey(userId, noteId)
  
  console.log("[v0] S3 Upload - Bucket:", S3_BUCKET, "Key:", key)
  
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
        Body: JSON.stringify(encryptedData),
        ContentType: "application/json",
      })
    )
    console.log("[v0] S3 Upload successful:", key)
  } catch (error) {
    console.error("[v0] S3 Upload error:", error)
    throw error
  }
}

/**
 * Get an encrypted note from S3
 */
export async function getNote(
  userId: string,
  noteId: string
): Promise<object | null> {
  const key = getNoteKey(userId, noteId)
  
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: S3_BUCKET,
        Key: key,
      })
    )
    
    const body = await response.Body?.transformToString()
    if (!body) return null
    
    return JSON.parse(body)
  } catch (error: unknown) {
    if ((error as { name?: string }).name === "NoSuchKey") {
      return null
    }
    throw error
  }
}

/**
 * Delete a note from S3
 */
export async function deleteNote(userId: string, noteId: string): Promise<void> {
  const key = getNoteKey(userId, noteId)
  
  await s3Client.send(
    new DeleteObjectCommand({
      Bucket: S3_BUCKET,
      Key: key,
    })
  )
}

/**
 * List all note IDs for a user
 */
export async function listUserNotes(userId: string): Promise<string[]> {
  const prefix = getUserNotesPrefix(userId)
  
  console.log("[v0] S3 List - Bucket:", S3_BUCKET, "Prefix:", prefix)
  
  try {
    const response = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
      })
    )
    
    console.log("[v0] S3 List response - Contents count:", response.Contents?.length || 0)
    
    if (!response.Contents) return []
    
    const noteIds = response.Contents
      .map((obj) => obj.Key!)
      .filter((key) => key.endsWith(".json"))
      .map((key) => {
        // Extract note ID from path: notes/userId/noteId.json
        const parts = key.split("/")
        const filename = parts[parts.length - 1]
        return filename.replace(".json", "")
      })
    
    console.log("[v0] S3 List - Note IDs:", noteIds)
    return noteIds
  } catch (error) {
    console.error("[v0] S3 List error:", error)
    throw error
  }
}
