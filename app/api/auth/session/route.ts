import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { redis } from "@/lib/redis"

export async function GET() {
  try {
    const cookieStore = await cookies()
    const sessionToken = cookieStore.get("session")?.value

    if (!sessionToken) {
      return NextResponse.json({ user: null })
    }

    const sessionDataStr = await redis.get(`session:${sessionToken}`)
    if (!sessionDataStr) {
      return NextResponse.json({ user: null })
    }

    const sessionData = JSON.parse(sessionDataStr as string)
    return NextResponse.json({
      user: {
        email: sessionData.email,
        name: sessionData.name,
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
