import { execSync } from "child_process"

let commitSha = "unknown"
try {
  commitSha = execSync("git rev-parse --short HEAD").toString().trim()
} catch {
  // ignore errors in environments without git
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
    NEXT_PUBLIC_GITHUB_URL: "https://github.com/anhducmata/secure-notes",
  },
}

export default nextConfig
