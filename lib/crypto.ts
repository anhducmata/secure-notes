/**
 * Client-Side Encryption Utilities
 * 
 * This module provides zero-knowledge style encryption for notes:
 * - Notes are encrypted in the browser BEFORE being sent to the server
 * - The server only ever sees ciphertext, never plaintext
 * - Only the user with the correct password can decrypt their notes
 * 
 * IMPORTANT DISTINCTION:
 * - Password hashing (for authentication) uses SHA-256 → sent to server for login verification
 * - Key derivation (for encryption) uses PBKDF2 → never leaves the client, used to encrypt/decrypt notes
 * 
 * PRODUCTION NOTES:
 * - In production, use a proper key management system
 * - Consider using WebAuthn/Passkeys for passwordless auth
 * - Store the encryption salt separately from the encrypted data
 * - Implement key rotation mechanisms
 */

// ─── Constants ────────────────────────────────────────────────────────────────

const PBKDF2_ITERATIONS = 100_000 // Higher = more secure but slower
const SALT_LENGTH = 16 // 128 bits
const IV_LENGTH = 12 // 96 bits for AES-GCM
const KEY_LENGTH = 256 // bits

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EncryptedPayload {
  ciphertext: string // Base64 encoded
  iv: string // Base64 encoded
  salt: string // Base64 encoded
  version: number // For future migration support
}

export interface DecryptedNote {
  title: string
  content: string
}

// ─── Helper Functions ─────────────────────────────────────────────────────────

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function generateRandomBytes(length: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(length))
}

// ─── Key Derivation ───────────────────────────────────────────────────────────

/**
 * Derives an AES-GCM encryption key from a password using PBKDF2.
 * This key NEVER leaves the client - it's only used for local encryption/decryption.
 * 
 * @param password - User's encryption password
 * @param salt - Random salt (generate new for encryption, reuse for decryption)
 * @returns CryptoKey suitable for AES-GCM operations
 */
export async function deriveKeyFromPassword(
  password: string,
  salt: Uint8Array
): Promise<CryptoKey> {
  // Import password as key material
  const passwordBuffer = new TextEncoder().encode(password)
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    passwordBuffer,
    "PBKDF2",
    false,
    ["deriveKey"]
  )

  // Derive AES-GCM key using PBKDF2
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    { name: "AES-GCM", length: KEY_LENGTH },
    false, // Not extractable
    ["encrypt", "decrypt"]
  )
}

// ─── Password Hashing (for Authentication) ────────────────────────────────────

/**
 * Hashes a password for authentication purposes.
 * This is SEPARATE from encryption - it's used to verify identity with the server.
 * 
 * NOTE: In production, use bcrypt or Argon2 on the server side.
 * This client-side hash is just to avoid sending plaintext passwords.
 * 
 * @param password - User's password
 * @returns Hex-encoded SHA-256 hash
 */
export async function hashPasswordForAuth(password: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(password)
  const hashBuffer = await crypto.subtle.digest("SHA-256", data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")
}

// ─── Note Encryption ──────────────────────────────────────────────────────────

/**
 * Encrypts note content using AES-GCM.
 * The note is encrypted client-side before being sent to the server.
 * 
 * @param note - Object containing title and content
 * @param password - User's encryption password (or derived from it)
 * @returns EncryptedPayload with ciphertext, IV, salt, and version
 */
export async function encryptNote(
  note: DecryptedNote,
  password: string
): Promise<EncryptedPayload> {
  // Generate random salt and IV for each encryption
  const salt = generateRandomBytes(SALT_LENGTH)
  const iv = generateRandomBytes(IV_LENGTH)

  // Derive encryption key from password
  const key = await deriveKeyFromPassword(password, salt)

  // Serialize note to JSON
  const plaintext = JSON.stringify(note)
  const plaintextBuffer = new TextEncoder().encode(plaintext)

  // Encrypt with AES-GCM
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    plaintextBuffer
  )

  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
    version: 1,
  }
}

/**
 * Decrypts an encrypted note payload.
 * 
 * @param payload - EncryptedPayload from the server
 * @param password - User's encryption password
 * @returns Decrypted note object
 * @throws Error if decryption fails (wrong password or corrupted data)
 */
export async function decryptNote(
  payload: EncryptedPayload,
  password: string
): Promise<DecryptedNote> {
  // Decode base64 values
  const salt = new Uint8Array(base64ToArrayBuffer(payload.salt))
  const iv = new Uint8Array(base64ToArrayBuffer(payload.iv))
  const ciphertext = base64ToArrayBuffer(payload.ciphertext)

  // Derive the same key using the stored salt
  const key = await deriveKeyFromPassword(password, salt)

  // Decrypt with AES-GCM
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  )

  // Parse JSON
  const plaintext = new TextDecoder().decode(plaintextBuffer)
  return JSON.parse(plaintext) as DecryptedNote
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Checks if a payload appears to be properly encrypted.
 * Used for validation before storing/transmitting.
 */
export function isValidEncryptedPayload(payload: unknown): payload is EncryptedPayload {
  if (!payload || typeof payload !== "object") return false
  const p = payload as Record<string, unknown>
  return (
    typeof p.ciphertext === "string" &&
    typeof p.iv === "string" &&
    typeof p.salt === "string" &&
    typeof p.version === "number" &&
    p.ciphertext.length > 0 &&
    p.iv.length > 0 &&
    p.salt.length > 0
  )
}

/**
 * Gets metadata about an encrypted payload for debugging.
 * Does NOT expose any sensitive information.
 */
export function getEncryptionMetadata(payload: EncryptedPayload) {
  return {
    ciphertextLength: payload.ciphertext.length,
    ciphertextPreview: payload.ciphertext.substring(0, 32) + "...",
    ivLength: payload.iv.length,
    saltLength: payload.salt.length,
    version: payload.version,
    estimatedPlaintextSize: Math.round(payload.ciphertext.length * 0.75), // Base64 overhead
  }
}

/**
 * Generates a secure encryption key from user password + stored salt.
 * Call this once after login to derive the user's encryption key.
 */
export async function initializeEncryptionKey(
  password: string,
  existingSalt?: string
): Promise<{ key: CryptoKey; salt: string }> {
  const salt = existingSalt
    ? new Uint8Array(base64ToArrayBuffer(existingSalt))
    : generateRandomBytes(SALT_LENGTH)

  const key = await deriveKeyFromPassword(password, salt)

  return {
    key,
    salt: arrayBufferToBase64(salt),
  }
}

// ─── Share Link Encryption ────────────────────────────────────────────────────

/**
 * Generates a random AES-GCM key for one-time share link encryption.
 * The key is exported as base64 to be embedded in the share URL fragment
 * so it is never transmitted to or stored by the server.
 */
export async function generateShareKey(): Promise<{ key: CryptoKey; keyBase64: string }> {
  const key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: KEY_LENGTH },
    true, // Exportable so we can embed it in the URL fragment
    ["encrypt", "decrypt"]
  )
  const exported = await crypto.subtle.exportKey("raw", key)
  return { key, keyBase64: arrayBufferToBase64(exported) }
}

/**
 * Imports a share key from a base64 string extracted from the URL fragment.
 */
export async function importShareKey(keyBase64: string): Promise<CryptoKey> {
  const keyData = base64ToArrayBuffer(keyBase64)
  return crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "AES-GCM", length: KEY_LENGTH },
    false,
    ["decrypt"]
  )
}

/**
 * Encrypts plaintext for a share link using AES-GCM with the provided share key.
 * @param plaintext - Content to encrypt
 * @param key - Share key (from generateShareKey)
 * @returns { ciphertext, iv } - both base64 encoded
 */
export async function encryptForShare(
  plaintext: string,
  key: CryptoKey
): Promise<{ ciphertext: string; iv: string }> {
  const iv = generateRandomBytes(IV_LENGTH)
  const plaintextBuffer = new TextEncoder().encode(plaintext)
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintextBuffer
  )
  return {
    ciphertext: arrayBufferToBase64(ciphertextBuffer),
    iv: arrayBufferToBase64(iv),
  }
}

/**
 * Decrypts share link content using AES-GCM.
 * @param ciphertext - Base64 encoded ciphertext
 * @param iv - Base64 encoded IV
 * @param key - Share key (from importShareKey)
 * @returns Decrypted plaintext string
 */
export async function decryptFromShare(
  ciphertext: string,
  iv: string,
  key: CryptoKey
): Promise<string> {
  const ciphertextBuffer = base64ToArrayBuffer(ciphertext)
  const ivBuffer = base64ToArrayBuffer(iv)
  const plaintextBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    key,
    ciphertextBuffer
  )
  return new TextDecoder().decode(plaintextBuffer)
}
