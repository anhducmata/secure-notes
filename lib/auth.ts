/**
 * Centralized Authentication & Session Helper
 */

import { cookies, headers } from "next/headers"
import { redis } from "@/lib/redis"
import { UserRepository } from "@/lib/db/repositories"
import type { User } from "@/lib/db/schema"

export interface AuthenticatedUser {
  id: string
  email: string
  name: string
}

export async function getAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  try {
    const cookieStore = await cookies()
    let sessionToken = cookieStore.get("session")?.value

    if (!sessionToken) {
      const headerStore = await headers()
      const authHeader = headerStore.get("authorization")
      if (authHeader && authHeader.startsWith("Bearer ")) {
        sessionToken = authHeader.slice(7).trim()
      }
    }

    if (!sessionToken) return null

    // Check Redis session
    const rawSessionData = await redis.get(`session:${sessionToken}`)
    if (!rawSessionData) return null

    const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
    const email = (sessionData.email || "").toLowerCase()
    if (!email) return null

    // Check if user exists in database
    const dbUser = await UserRepository.findByEmail(email)
    if (dbUser) {
      return {
        id: dbUser.id,
        email: dbUser.email,
        name: dbUser.name,
      }
    }

    // Auto-sync user to database if found in Redis session
    const newUser: Omit<User, "created_at" | "updated_at"> = {
      id: `usr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      email,
      password_hash: "session_synced",
      name: sessionData.name || email.split("@")[0],
      verified: true,
    }
    const created = await UserRepository.create(newUser)
    return {
      id: created.id,
      email: created.email,
      name: created.name,
    }
  } catch (err) {
    console.error("[getAuthenticatedUser] error:", err)
    return null
  }
}
