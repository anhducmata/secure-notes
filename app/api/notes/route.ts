import { NextResponse } from "next/server"

export interface S3Note {
  id: string
  title: string
  content: string
  date: string
  folder: string
}

/**
 * GET /api/notes
 *
 * Fetches notes from an S3 bucket.
 * Requires the following env vars:
 *   S3_BUCKET_NAME   – the S3 bucket name
 *   S3_REGION        – e.g. "us-east-1"
 *   AWS_ACCESS_KEY_ID
 *   AWS_SECRET_ACCESS_KEY
 *
 * Each note is stored as a JSON file at the key:  notes/<id>.json
 *
 * Falls back to demo data when env vars are not configured so the
 * UI still renders in development / preview environments.
 */
export async function GET() {
  const bucket = process.env.S3_BUCKET_NAME
  const region = process.env.S3_REGION ?? "us-east-1"
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY

  // ── Demo fallback (no S3 configured) ──────────────────────────────────────
  if (!bucket || !accessKeyId || !secretAccessKey) {
    const demoNotes: S3Note[] = [
      {
        id: "1",
        title: "Shopping List",
        content: "Milk\nEggs\nBread\nCheese\nApples",
        date: new Date(2025, 3, 14).toISOString(),
        folder: "notes",
      },
      {
        id: "2",
        title: "Meeting Notes",
        content: "Discuss project timeline\nReview quarterly goals\nAssign new tasks",
        date: new Date(2025, 3, 13).toISOString(),
        folder: "notes",
      },
      {
        id: "3",
        title: "Ideas",
        content: "App concept for productivity\nNew workout routine\nWeekend trip planning",
        date: new Date(2025, 3, 12).toISOString(),
        folder: "notes",
      },
      {
        id: "4",
        title: "Books to Read",
        content:
          "1. Atomic Habits\n2. Deep Work\n3. The Psychology of Money\n4. Project Hail Mary",
        date: new Date(2025, 3, 10).toISOString(),
        folder: "notes",
      },
      {
        id: "5",
        title: "Travel Plans",
        content:
          "Flight on May 15th\nHotel reservation\nPlaces to visit:\n- Museum\n- Beach\n- Downtown",
        date: new Date(2025, 3, 8).toISOString(),
        folder: "notes",
      },
    ]
    return NextResponse.json({ notes: demoNotes, source: "demo" })
  }

  // ── S3 fetch via AWS Signature V4 ─────────────────────────────────────────
  try {
    // List all objects under the "notes/" prefix
    const listUrl = `https://${bucket}.s3.${region}.amazonaws.com/?list-type=2&prefix=notes%2F&delimiter=%2F`
    const listRes = await signedFetch(listUrl, "GET", bucket, region, accessKeyId, secretAccessKey)

    if (!listRes.ok) {
      throw new Error(`S3 list failed: ${listRes.status}`)
    }

    const xml = await listRes.text()
    // Parse <Key> elements from S3 XML response
    const keys = [...xml.matchAll(/<Key>([^<]+\.json)<\/Key>/g)].map((m) => m[1])

    // Fetch each note file in parallel
    const noteResults = await Promise.allSettled(
      keys.map(async (key) => {
        const url = `https://${bucket}.s3.${region}.amazonaws.com/${key}`
        const res = await signedFetch(url, "GET", bucket, region, accessKeyId, secretAccessKey)
        if (!res.ok) throw new Error(`Failed to fetch ${key}`)
        return (await res.json()) as S3Note
      })
    )

    const notes: S3Note[] = noteResults
      .filter((r): r is PromiseFulfilledResult<S3Note> => r.status === "fulfilled")
      .map((r) => r.value)

    return NextResponse.json({ notes, source: "s3" })
  } catch (err) {
    console.error("[v0] S3 notes fetch error:", err)
    return NextResponse.json({ error: "Failed to fetch notes from S3" }, { status: 500 })
  }
}

// ─── AWS Signature V4 helper ──────────────────────────────────────────────────

async function signedFetch(
  url: string,
  method: string,
  bucket: string,
  region: string,
  accessKeyId: string,
  secretAccessKey: string
): Promise<Response> {
  const parsedUrl = new URL(url)
  const host = parsedUrl.host
  const now = new Date()
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z"
  const dateStamp = amzDate.slice(0, 8)

  const canonicalUri = parsedUrl.pathname
  const canonicalQueryString = parsedUrl.searchParams.toString()
  const canonicalHeaders = `host:${host}\nx-amz-date:${amzDate}\n`
  const signedHeaders = "host;x-amz-date"
  const payloadHash = await sha256hex("")

  const canonicalRequest = [
    method,
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n")

  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256hex(canonicalRequest),
  ].join("\n")

  const signingKey = await getSigningKey(secretAccessKey, dateStamp, region, "s3")
  const signature = await hmacHex(signingKey, stringToSign)

  const authorizationHeader =
    `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, ` +
    `SignedHeaders=${signedHeaders}, Signature=${signature}`

  return fetch(url, {
    method,
    headers: {
      "x-amz-date": amzDate,
      Authorization: authorizationHeader,
    },
  })
}

async function sha256hex(data: string): Promise<string> {
  const encoded = new TextEncoder().encode(data)
  const digest = await crypto.subtle.digest("SHA-256", encoded)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function hmacBytes(key: ArrayBuffer | Uint8Array, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data))
}

async function hmacHex(key: ArrayBuffer | Uint8Array, data: string): Promise<string> {
  const buf = await hmacBytes(key, data)
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
}

async function getSigningKey(
  secretKey: string,
  dateStamp: string,
  region: string,
  service: string
): Promise<ArrayBuffer> {
  const kDate = await hmacBytes(new TextEncoder().encode(`AWS4${secretKey}`), dateStamp)
  const kRegion = await hmacBytes(kDate, region)
  const kService = await hmacBytes(kRegion, service)
  return hmacBytes(kService, "aws4_request")
}
