import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import bcrypt from "bcryptjs"

const BCRYPT_SALT_ROUNDS = 12

export async function POST(request: Request) {
  try {
    const { token, password } = await request.json()

    if (!token || !password) {
      return NextResponse.json(
        { error: "Token and password are required" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    // Get email from token
    const email = await redis.get(`reset:${token}`)
    if (!email) {
      return NextResponse.json(
        { error: "Invalid or expired reset link" },
        { status: 400 }
      )
    }

    // Get user data
    const existingUser = await redis.hget("users", email as string)
    if (!existingUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      )
    }

    const userData = typeof existingUser === "string" ? JSON.parse(existingUser) : existingUser

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS)

    // Update user with new password
    const updatedUser = {
      ...userData,
      password: hashedPassword,
    }

    await redis.hset("users", { [email as string]: JSON.stringify(updatedUser) })

    // Delete the reset token (one-time use)
    await redis.del(`reset:${token}`)

    // Invalidate any existing sessions for this user
    const existingSessionId = await redis.get(`user_session:${email}`)
    if (existingSessionId) {
      await redis.del(`session:${existingSessionId}`)
      await redis.del(`user_session:${email}`)
    }

    return NextResponse.json({
      success: true,
      message: "Password has been reset successfully",
    })
  } catch (error) {
    console.error("Reset password error:", error)
    return NextResponse.json(
      { error: "Failed to reset password" },
      { status: 500 }
    )
  }
}
