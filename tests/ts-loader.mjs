import fs from "node:fs"
import path from "node:path"
import { fileURLToPath, pathToFileURL } from "node:url"

export async function resolve(specifier, context, defaultResolve) {
  if (specifier.startsWith("@/")) {
    const abs = path.resolve(process.cwd(), specifier.slice(2))
    for (const ext of [".ts", ".tsx", ".js", "/index.ts", "/index.js"]) {
      if (fs.existsSync(abs + ext)) {
        return defaultResolve(pathToFileURL(abs + ext).href, context)
      }
    }
    if (fs.existsSync(abs)) {
      return defaultResolve(pathToFileURL(abs).href, context)
    }
  }

  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    const parentDir = context.parentURL ? path.dirname(fileURLToPath(context.parentURL)) : process.cwd()
    const abs = path.resolve(parentDir, specifier)
    for (const ext of [".ts", ".tsx", ".js", "/index.ts", "/index.js"]) {
      if (fs.existsSync(abs + ext)) {
        return defaultResolve(pathToFileURL(abs + ext).href, context)
      }
    }
  }

  return defaultResolve(specifier, context)
}
