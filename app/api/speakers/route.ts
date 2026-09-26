/**
 * Speakers API
 * Manages persistent speaker entities and voice profiles.
 */

import { NextRequest, NextResponse } from "next/server"
import { getAuthenticatedUser } from "@/lib/auth"
import { SpeakerRepository } from "@/lib/db/repositories"

export async function GET() {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const speakers = await SpeakerRepository.listByUser(user.id)
    return NextResponse.json({ speakers })
  } catch (err) {
    console.error("[/api/speakers GET]", err)
    return NextResponse.json({ error: "Failed to fetch speakers" }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }

    const { id, name, voiceProfileId } = await req.json()

    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Speaker name is required" }, { status: 400 })
    }

    if (id) {
      await SpeakerRepository.updateName(id, user.id, name.trim())
      const updated = await SpeakerRepository.getById(id, user.id)
      return NextResponse.json({ success: true, speaker: updated })
    }

    const created = await SpeakerRepository.create({
      id: `spk_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: user.id,
      name: name.trim(),
      is_custom_named: true,
      voice_profile_id: voiceProfileId || null,
    })

    return NextResponse.json({ success: true, speaker: created })
  } catch (err) {
    console.error("[/api/speakers POST]", err)
    return NextResponse.json({ error: "Failed to save speaker" }, { status: 500 })
  }
}
