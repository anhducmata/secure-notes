import { NextRequest, NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { CONVS_KEY, CONV_KEY } from "@/lib/chat-keys"
import { getAuthenticatedUser } from "@/lib/auth"

// GET /api/chat/history          → list of conversations
// GET /api/chat/history?id=xxx   → messages for a conversation
export async function GET(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.email

  const convId = req.nextUrl.searchParams.get("id")

  if (convId) {
    const raw = await redis.get(CONV_KEY(userId, convId))
    const messages = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : []
    return NextResponse.json({ messages })
  }

  const raw = await redis.get(CONVS_KEY(userId))
  const conversations = raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : []
  return NextResponse.json({ conversations })
}

// DELETE /api/chat/history?id=xxx  → delete a specific conversation
export async function DELETE(req: NextRequest) {
  const user = await getAuthenticatedUser()
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const userId = user.email

  const convId = req.nextUrl.searchParams.get("id")
  if (!convId) return NextResponse.json({ error: "Missing id" }, { status: 400 })

  await redis.del(CONV_KEY(userId, convId))

  const raw = await redis.get(CONVS_KEY(userId))
  const conversations: { id: string; title: string; updatedAt: string }[] =
    raw ? (typeof raw === "string" ? JSON.parse(raw) : raw) : []
  const updated = conversations.filter((c) => c.id !== convId)
  await redis.set(CONVS_KEY(userId), JSON.stringify(updated))

  return NextResponse.json({ ok: true })
}
