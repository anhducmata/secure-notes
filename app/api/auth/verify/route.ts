import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

export async function GET(request: Request) {
  // Use custom domain for redirects
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    if (!token) {
      return NextResponse.redirect(`${baseUrl}/?error=invalid_token`)
    }

    // Get email from token
    const email = await redis.get(`verify:${token}`)
    if (!email) {
      return NextResponse.redirect(`${baseUrl}/?error=token_expired`)
    }

    // Get user data
    const rawUserData = await redis.hget("users", email as string)
    if (!rawUserData) {
      return NextResponse.redirect(`${baseUrl}/?error=user_not_found`)
    }

    // Update user as verified - Upstash may return already parsed object or string
    const userData = typeof rawUserData === "string" ? JSON.parse(rawUserData) : rawUserData
    userData.verified = true
    await redis.hset("users", { [email as string]: JSON.stringify(userData) })

    // Delete the verification token
    await redis.del(`verify:${token}`)

    // Redirect to app with success message
    return NextResponse.redirect(`${baseUrl}/?verified=true`)
  } catch (error) {
    console.error("Verification error:", error)
    return NextResponse.redirect(`${baseUrl}/?error=verification_failed`)
  }
}
