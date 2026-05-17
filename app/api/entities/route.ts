import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"
import { ENTITY_KEY } from "@/lib/entities"

async function getAuthenticatedUserId(): Promise<string | null> {
  const cookieStore = await cookies()
  const sessionToken = cookieStore.get("session")?.value
  if (!sessionToken) return null
  const rawSessionData = await redis.get(`session:${sessionToken}`)
  if (!rawSessionData) return null
  const sessionData = typeof rawSessionData === "string" ? JSON.parse(rawSessionData) : rawSessionData
  return sessionData.email
}

export async function GET() {
  try {
    const userId = await getAuthenticatedUserId()
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const raw = await redis.get(ENTITY_KEY(userId))
    if (!raw) return NextResponse.json({ people: {}, projects: {}, conversations: [], lastUpdated: null })

    const store = typeof raw === "string" ? JSON.parse(raw) : raw
    return NextResponse.json(store)
  } catch (err) {
    console.error("[/api/entities]", err)
    return NextResponse.json({ error: "Failed to fetch entities" }, { status: 500 })
  }
}
