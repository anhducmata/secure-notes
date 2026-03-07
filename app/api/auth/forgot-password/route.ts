import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { Resend } from "resend"
import crypto from "crypto"

const resend = new Resend(process.env.RESEND_API_KEY)

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function POST(request: Request) {
  try {
    const { email } = await request.json()

    if (!email) {
      return NextResponse.json(
        { error: "Email is required" },
        { status: 400 }
      )
    }

    const normalizedEmail = email.toLowerCase()

    // Check if user exists
    const existingUser = await redis.hget("users", normalizedEmail)
    if (!existingUser) {
      // Don't reveal if user exists or not for security
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, you will receive a password reset link",
      })
    }

    // Generate reset token
    const resetToken = generateToken()
    
    // Store reset token (1 hour expiry)
    await redis.set(`reset:${resetToken}`, normalizedEmail, { ex: 3600 })

    // Send reset email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ||
      (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
    const resetUrl = `${baseUrl}/reset-password?token=${resetToken}`

    const userData = typeof existingUser === "string" ? JSON.parse(existingUser) : existingUser
    const userName = userData.name || "there"

    try {
      await resend.emails.send({
        from: "Notes App <onboarding@freenotes.space>",
        to: email,
        subject: "Reset your password",
        replyTo: ["anhducmata@gmail.com"],
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" max-width="480" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, rgba(40,40,40,0.9), rgba(20,20,20,0.95)); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 40px;">
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #D4A574, #C4956A); border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 28px; color: #000;">🔐</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 20px;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">
                          Reset your password
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 16px; line-height: 1.6;">
                          Hi ${userName},<br><br>
                          We received a request to reset your password. Click the button below to create a new password.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <a href="${resetUrl}" style="display: inline-block; background: linear-gradient(135deg, #D4A574, #C4956A); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; padding: 14px 32px; border-radius: 12px;">
                          Reset Password
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 13px;">
                          This link expires in 1 hour.<br>
                          If you didn't request a password reset, you can ignore this email.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      })
    } catch (emailError) {
      console.error("Failed to send reset email:", emailError)
    }

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, you will receive a password reset link",
    })
  } catch (error) {
    console.error("Forgot password error:", error)
    return NextResponse.json(
      { error: "Failed to process request" },
      { status: 500 }
    )
  }
}
