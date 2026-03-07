import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

export async function GET(request: Request) {
  // Use custom domain for redirects
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  
  try {
    const { searchParams } = new URL(request.url)
    const token = searchParams.get("token")

    console.log("[v0] Verification attempt with token:", token?.substring(0, 8) + "...")

    if (!token) {
      console.log("[v0] No token provided")
      return NextResponse.redirect(`${baseUrl}/?error=invalid_token`)
    }

    // Get email from token
    const email = await redis.get(`verify:${token}`)
    console.log("[v0] Email from token:", email)
    
    if (!email) {
      console.log("[v0] Token not found or expired")
      return NextResponse.redirect(`${baseUrl}/?error=token_expired`)
    }

    // Get user data
    const rawUserData = await redis.hget("users", email as string)
    console.log("[v0] Raw user data type:", typeof rawUserData)
    
    if (!rawUserData) {
      console.log("[v0] User not found:", email)
      return NextResponse.redirect(`${baseUrl}/?error=user_not_found`)
    }

    // Update user as verified - Upstash may return already parsed object or string
    const userData = typeof rawUserData === "string" ? JSON.parse(rawUserData) : rawUserData
    console.log("[v0] User verified status before:", userData.verified)
    
    userData.verified = true
    await redis.hset("users", { [email as string]: JSON.stringify(userData) })
    console.log("[v0] User marked as verified:", email)

    // Delete the verification token
    await redis.del(`verify:${token}`)
    console.log("[v0] Verification token deleted")

    // Redirect to app with success message
    return NextResponse.redirect(`${baseUrl}/?verified=true`)
  } catch (error) {
    console.error("[v0] Verification error:", error)
    const errorMessage = error instanceof Error ? error.message : "Unknown error"
    console.error("[v0] Error details:", errorMessage)
    return NextResponse.redirect(`${baseUrl}/?error=verification_failed&details=${encodeURIComponent(errorMessage)}`)
  }
}
