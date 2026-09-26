import { NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"

export async function POST() {
  const user = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  }

  const apiKey = process.env.SONIOX_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: "Soniox transcription is not configured" }, { status: 503 })
  }

  const response = await fetch("https://api.soniox.com/v1/auth/temporary-api-key", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      usage_type: "transcribe_websocket",
      expires_in_seconds: 60,
    }),
    cache: "no-store",
  })

  if (!response.ok) {
    return NextResponse.json({ error: "Unable to start transcription" }, { status: 502 })
  }

  const data = await response.json()
  return NextResponse.json({ apiKey: data.api_key })
}

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET() {
  return NextResponse.json({ error: "Method not allowed" }, { status: 405 })
}
