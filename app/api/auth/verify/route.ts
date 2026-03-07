import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.redirect(new URL("/?error=invalid_token", request.url))
    }

    // Get email from token
    const email = await redis.get(`verify:${token}`)
    if (!email) {
      return NextResponse.redirect(new URL("/?error=token_expired", request.url))
    }

    // Get user data
    const rawUserData = await redis.hget("users", email as string)
    if (!rawUserData) {
      return NextResponse.redirect(new URL("/?error=user_not_found", request.url))
    }

    // Update user as verified - Upstash may return already parsed object or string
    const userData = typeof rawUserData === "string" ? JSON.parse(rawUserData) : rawUserData
    userData.verified = true
    await redis.hset("users", { [email as string]: JSON.stringify(userData) })

    // Delete the verification token
    await redis.del(`verify:${token}`)

    // Redirect to app with success message
    return NextResponse.redirect(new URL("/?verified=true", request.url))
  } catch (error) {
    console.error("Verification error:", error)
    return NextResponse.redirect(new URL("/?error=verification_failed", request.url))
  }
}
