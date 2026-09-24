import { NextResponse } from "next/server"

export async function POST(request: Request) {
  const { email } = await request.json().catch(() => ({}))
  const secretKey = process.env.STRIPE_SECRET_KEY
  const priceId = process.env.STRIPE_PRO_PRICE_ID
  if (!secretKey || !priceId) {
    return NextResponse.json({ error: "Stripe checkout is not configured yet." }, { status: 503 })
  }

  const body = new URLSearchParams({
    mode: "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    success_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?pro=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/?pro=cancelled`,
    ...(email ? { customer_email: email } : {}),
  })
  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { Authorization: `Bearer ${secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  })
  const session = await response.json()
  if (!response.ok || !session.url) return NextResponse.json({ error: "Unable to start checkout." }, { status: 502 })
  return NextResponse.json({ url: session.url })
}
