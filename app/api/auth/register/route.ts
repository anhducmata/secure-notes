import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"
import { Resend } from "resend"
import crypto from "crypto"

const resend = new Resend(process.env.RESEND_API_KEY)

// Simple password hashing using crypto (for demo - use bcrypt in production)
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password).digest("hex")
}

function generateToken(): string {
  return crypto.randomBytes(32).toString("hex")
}

export async function POST(request: Request) {
  try {
    const { email, password, name } = await request.json()

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "Email, password, and name are required" },
        { status: 400 }
      )
    }

    // Check if user already exists
    const existingUser = await redis.hget("users", email.toLowerCase())
    if (existingUser) {
      return NextResponse.json(
        { error: "An account with this email already exists" },
        { status: 409 }
      )
    }

    // Generate verification token
    const verificationToken = generateToken()
    const tokenExpiry = Date.now() + 24 * 60 * 60 * 1000 // 24 hours

    // Store pending user (not verified yet)
    const userData = {
      email: email.toLowerCase(),
      name,
      password: hashPassword(password),
      verified: false,
      createdAt: Date.now(),
    }

    // Store user data
    await redis.hset("users", { [email.toLowerCase()]: JSON.stringify(userData) })

    // Store verification token
    await redis.set(`verify:${verificationToken}`, email.toLowerCase(), { ex: 86400 }) // 24h expiry

    // Send verification email
    const verifyUrl = `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000"}/api/auth/verify?token=${verificationToken}`

    try {
      await resend.emails.send({
        from: "Notes App <onboarding@resend.dev>",
        to: email,
        subject: "Verify your email address",
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
          </head>
          <body style="margin: 0; padding: 0; background-color: #000000; font-family: -apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #000000; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" max-width="480" cellpadding="0" cellspacing="0" style="background: linear-gradient(145deg, rgba(40,40,40,0.9), rgba(20,20,20,0.95)); border-radius: 20px; border: 1px solid rgba(255,255,255,0.1); padding: 40px;">
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #D4A574, #C4956A); border-radius: 14px; display: flex; align-items: center; justify-content: center;">
                          <span style="font-size: 28px; color: #000;">📝</span>
                        </div>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 20px;">
                        <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600; letter-spacing: -0.5px;">
                          Verify your email
                        </h1>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <p style="margin: 0; color: rgba(255,255,255,0.6); font-size: 16px; line-height: 1.6;">
                          Hi ${name},<br><br>
                          Thanks for signing up for Notes. Click the button below to verify your email address.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td align="center" style="padding-bottom: 30px;">
                        <a href="${verifyUrl}" style="display: inline-block; background: linear-gradient(135deg, #D4A574, #C4956A); color: #000000; text-decoration: none; font-weight: 600; font-size: 16px; padding: 14px 32px; border-radius: 12px;">
                          Verify Email
                        </a>
                      </td>
                    </tr>
                    <tr>
                      <td align="center">
                        <p style="margin: 0; color: rgba(255,255,255,0.4); font-size: 13px;">
                          This link expires in 24 hours.<br>
                          If you didn't create an account, you can ignore this email.
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
      console.error("Failed to send verification email:", emailError)
      // Still return success - user can request new verification email
    }

    return NextResponse.json({
      success: true,
      message: "Please check your email to verify your account",
    })
  } catch (error) {
    console.error("Registration error:", error)
    return NextResponse.json(
      { error: "Failed to create account" },
      { status: 500 }
    )
  }
}
