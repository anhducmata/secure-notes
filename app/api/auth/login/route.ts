import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"
import crypto from "crypto"

const BCRYPT_SALT_ROUNDS = 12
const ENCRYPTION_SECRET = process.env.KV_REST_API_TOKEN || "fallback-secret-key"

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

// Legacy SHA-256 hash for migration
function legacyHashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

// Encrypt the user's password (encryption key) using server secret
function encryptForSession(plaintext: string): string {
  const iv = crypto.randomBytes(16)
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest()
  const cipher = crypto.createCipheriv("aes-256-cbc", key, iv)
  let encrypted = cipher.update(plaintext, "utf8", "base64")
  encrypted += cipher.final("base64")
  return iv.toString("base64") + ":" + encrypted
}

// Decrypt the stored encryption key
export function decryptFromSession(encrypted: string): string {
  const [ivBase64, ciphertext] = encrypted.split(":")
  const iv = Buffer.from(ivBase64, "base64")
  const key = crypto.createHash("sha256").update(ENCRYPTION_SECRET).digest()
  const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
  let decrypted = decipher.update(ciphertext, "base64", "utf8")
  decrypted += decipher.final("utf8")
  return decrypted
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required" },
        { status: 400 }
      )
    }

    // Get user data
    const rawUserData = await redis.hget("users", email.toLowerCase())
    if (!rawUserData) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // Upstash may return already parsed object or string
    const userData = typeof rawUserData === "string" ? JSON.parse(rawUserData) : rawUserData

    // Check password - try bcrypt first, then fallback to legacy SHA-256
    let isValidPassword = false
    const storedHash = userData.password
    
    // If stored hash looks like bcrypt ($2a$ or $2b$ prefix), use bcrypt compare
    if (storedHash.startsWith("$2a$") || storedHash.startsWith("$2b$")) {
      isValidPassword = await bcrypt.compare(password, storedHash)
    } else {
      // Legacy SHA-256 hash
      isValidPassword = storedHash === legacyHashPassword(password)
      
      // Migrate to bcrypt if password is correct
      if (isValidPassword) {
        const newHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)
        userData.password = newHash
        await redis.hset("users", { [email.toLowerCase()]: JSON.stringify(userData) })
      }
    }
    
    if (!isValidPassword) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    // Check if verified
    if (!userData.verified) {
      return NextResponse.json(
        { error: "Please verify your email before signing in" },
        { status: 403 }
      )
    }

    // Create session token
    const sessionToken = generateSessionToken()
    
    // Delete any existing session for this user (enforce single session)
    const existingSessionId = await redis.get(`user_session:${email.toLowerCase()}`)
    if (existingSessionId) {
      await redis.del(`session:${existingSessionId}`)
    }
    
    // Encrypt the password for session storage (used as encryption key)
    const encryptedKey = encryptForSession(password)
    
    const sessionData = {
      email: userData.email,
      name: userData.name,
      encryptedKey, // Store encrypted version of password for decryption across tabs
      createdAt: Date.now(),
    }

    // Store session (7 days expiry)
    await redis.set(`session:${sessionToken}`, JSON.stringify(sessionData), { ex: 604800 })
    
    // Track current session for this user (to delete on next login)
    await redis.set(`user_session:${email.toLowerCase()}`, sessionToken, { ex: 604800 })

    // Create response with cookie
    const response = NextResponse.json({
      success: true,
      user: {
        email: userData.email,
        name: userData.name,
      },
    })

    // Set HTTP-only cookie
    response.cookies.set("session", sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 604800, // 7 days
      path: "/",
    })

    return response
  } catch (error) {
    console.error("Login error:", error)
    return NextResponse.json(
      { error: "Failed to sign in" },
      { status: 500 }
    )
  }
}
