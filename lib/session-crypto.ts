import crypto from "crypto"

const ENCRYPTION_SECRET = process.env.KV_REST_API_TOKEN || "fallback-secret-key"

export function encryptForSession(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest()
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")
  return iv.toString("base64") + ":" + encrypted
}

export function decryptFromSession(encrypted: string): string {
  const [ivBase64, ciphertext] = encrypted.split(":")
  const iv = Buffer.from(ivBase64, "base64")
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest()
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  let decrypted = decipher.update(ciphertext, "base64", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}
