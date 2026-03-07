import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"
import crypto from "crypto"

function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex")
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
    const userDataStr = await redis.hget("users", email.toLowerCase())
    if (!userDataStr) {
      return NextResponse.json(
        { error: "Invalid email or password" },
        { status: 401 }
      )
    }

    const userData = JSON.parse(userDataStr as string)

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, userData.password)
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
    const sessionData = {
      email: userData.email,
      name: userData.name,
      createdAt: Date.now(),
    }

    // Store session (7 days expiry)
    await redis.set(`session:${sessionToken}`, JSON.stringify(sessionData), { ex: 604800 })

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
