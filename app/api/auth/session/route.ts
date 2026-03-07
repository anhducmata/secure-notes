import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { decryptFromSession } from "@/app/api/auth/login/route"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session")?.value

    if (!sessionToken) {
      return NextResponse.json({ user: null })
    }

    const rawSessionData = await redis.get(`session:${sessionToken}`)
    if (!rawSessionData) {
      return NextResponse.json({ user: null })
    }

    // Upstash may return already parsed object or string
    const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
    
    // Decrypt the encryption key if it exists
    let encryptionKey: string | undefined
    if (sessionData.encryptedKey) {
      try {
        encryptionKey = decryptFromSession(sessionData.encryptedKey)
      } catch {
        // Key decryption failed, user will need to re-login
      }
    }
    
    return NextResponse.json({
      user: {
        email: sessionData.email,
        name: sessionData.name,
        encryptionKey, // Return decrypted key for client-side note decryption
      },
    })
  } catch (error) {
    console.error("Session error:", error)
    return NextResponse.json({ user: null })
  }
}

export async function DELETE() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session")?.value

    if (sessionToken) {
      await redis.del(`session:${sessionToken}`)
    }

    const response = NextResponse.json({ success: true })
    response.cookies.delete("session")
    return response
  } catch (error) {
    console.error("Logout error:", error)
    return NextResponse.json({ error: "Failed to sign out" }, { status: 500 })
  }
}
