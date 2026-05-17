import { Index } from "@upstash/vector"

export const vectorIndex = new Index({
  url: process.env.UPSTASH_VECTOR_REST_URL || "https://dummy.upstash.io",
  token: process.env.UPSTASH_VECTOR_REST_TOKEN || "dummy-token",
})
