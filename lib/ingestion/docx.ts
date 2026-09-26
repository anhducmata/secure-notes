/**
 * DOCX Document Ingestion (Docling / MarkItDown strategy)
 * Extracts structured headings, paragraphs, lists, and tables from DOCX
 * and converts them directly into GitHub Flavored Markdown.
 */

import zlib from "node:zlib"

export interface ParsedDocument {
  title: string
  markdown: string
  metadata: {
    wordCount: number
    paragraphCount: number
    tableCount: number
  }
}

/**
 * Extracts a file from a ZIP archive buffer using standard PKZIP specification
 */
function extractZipEntry(zipBuffer: Buffer, targetFilename: string): Buffer | null {
  let offset = 0
  const len = zipBuffer.length

  while (offset + 30 <= len) {
    // Check local file header signature: PK\x03\x04 (0x04034b50)
    const sig = zipBuffer.readUInt32LE(offset)
    if (sig !== 0x04034b50) {
      // If we hit Central Directory (0x02014b50) or End of Central Directory, stop
      break
    }

    const compressionMethod = zipBuffer.readUInt16LE(offset + 8)
    const compressedSize = zipBuffer.readUInt32LE(offset + 18)
    const fileNameLength = zipBuffer.readUInt16LE(offset + 26)
    const extraFieldLength = zipBuffer.readUInt16LE(offset + 28)

    const fileNameStart = offset + 30
    const fileNameEnd = fileNameStart + fileNameLength
    if (fileNameEnd > len) break

    const fileName = zipBuffer.toString("utf8", fileNameStart, fileNameEnd)
    const dataStart = fileNameEnd + extraFieldLength

    if (fileName === targetFilename) {
      const compressedData = zipBuffer.subarray(dataStart, dataStart + compressedSize)
      if (compressionMethod === 0) {
        return Buffer.from(compressedData)
      } else if (compressionMethod === 8) {
        return zlib.inflateRawSync(compressedData)
      }
      return null
    }

    // Skip to next file entry
    offset = dataStart + compressedSize
  }

  return null
}

/**
 * Parses word/document.xml into GitHub Flavored Markdown
 */
function parseWordXmlToMarkdown(xml: string): { markdown: string; title: string; tableCount: number; paragraphCount: number } {
  const lines: string[] = []
  let title = ""
  let tableCount = 0
  let paragraphCount = 0

  // Strip XML comments and namespaces for cleaner regex matching
  const cleaned = xml.replace(/<!--[\s\S]*?-->/g, "")

  // Extract paragraphs and tables in sequence
  const blockRegex = /<(w:p|w:tbl)(?:[\s>][\s\S]*?<\/\1>|\/>)/g
  let match: RegExpExecArray | null

  while ((match = blockRegex.exec(cleaned)) !== null) {
    const block = match[0]
    const tag = match[1]

    if (tag === "w:tbl") {
      tableCount++
      const tableMd = parseTable(block)
      if (tableMd.trim()) {
        lines.push(tableMd)
        lines.push("")
      }
    } else if (tag === "w:p") {
      paragraphCount++
      const paraMd = parseParagraph(block)
      if (paraMd.trim()) {
        if (!title && paraMd.startsWith("# ")) {
          title = paraMd.replace(/^#+\s*/, "").trim()
        }
        lines.push(paraMd)
        lines.push("")
      }
    }
  }

  return {
    markdown: lines.join("\n").trim(),
    title: title || "Untitled Document",
    tableCount,
    paragraphCount,
  }
}

function parseParagraph(pXml: string): string {
  // Check heading style
  const styleMatch = pXml.match(/<w:pStyle\s+[^>]*w:val="([^"]+)"/i)
  const style = styleMatch ? styleMatch[1].toLowerCase() : ""

  // Check bullet/numbered list
  const isList = /<w:numPr(?:[\s\/>]|$)/i.test(pXml)

  // Extract runs of text
  const runs: string[] = []
  const runRegex = /<w:r(?:[\s>][\s\S]*?<\/w:r>|\/>)/g
  let rMatch: RegExpExecArray | null

  while ((rMatch = runRegex.exec(pXml)) !== null) {
    const rXml = rMatch[0]
    const isBold = /<w:b(?:[\s\/>]|$)/i.test(rXml) && !/<w:b\s+[^>]*w:val="(?:0|false|none)"/i.test(rXml)
    const isItalic = /<w:i(?:[\s\/>]|$)/i.test(rXml) && !/<w:i\s+[^>]*w:val="(?:0|false|none)"/i.test(rXml)

    // Extract text content inside <w:t> tags
    const textPieces: string[] = []
    const tRegex = /<w:t(?:[\s>][\s\S]*?<\/w:t>|\/>)/g
    let tMatch: RegExpExecArray | null
    while ((tMatch = tRegex.exec(rXml)) !== null) {
      const content = tMatch[0].replace(/<[^>]+>/g, "")
      textPieces.push(content)
    }

    let text = textPieces.join("")
    if (!text) continue

    if (isBold && isItalic) {
      text = `***${text}***`
    } else if (isBold) {
      text = `**${text}**`
    } else if (isItalic) {
      text = `*${text}*`
    }

    runs.push(text)
  }

  let text = runs.join("").trim()
  if (!text) return ""

  // Decode standard XML entities
  text = text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")

  if (style.includes("heading1") || style.includes("title")) {
    return `# ${text}`
  } else if (style.includes("heading2")) {
    return `## ${text}`
  } else if (style.includes("heading3")) {
    return `### ${text}`
  } else if (style.includes("heading4")) {
    return `#### ${text}`
  }

  if (isList) {
    return `- ${text}`
  }

  return text
}

function parseTable(tblXml: string): string {
  const rows: string[][] = []
  const rowRegex = /<w:tr(?:[\s>][\s\S]*?<\/w:tr>|\/>)/g
  let rowMatch: RegExpExecArray | null

  while ((rowMatch = rowRegex.exec(tblXml)) !== null) {
    const rXml = rowMatch[0]
    const cells: string[] = []
    const cellRegex = /<w:tc(?:[\s>][\s\S]*?<\/w:tc>|\/>)/g
    let cellMatch: RegExpExecArray | null

    while ((cellMatch = cellRegex.exec(rXml)) !== null) {
      const cXml = cellMatch[0]
      // Extract text from cell
      const cellText = cXml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      cells.push(cellText || "")
    }

    if (cells.length > 0) {
      rows.push(cells)
    }
  }

  if (rows.length === 0) return ""

  const colCount = Math.max(...rows.map((r) => r.length))
  const normalizedRows = rows.map((r) => {
    while (r.length < colCount) r.push("")
    return r
  })

  const header = normalizedRows[0]
  const separator = header.map(() => "---")
  const body = normalizedRows.slice(1)

  const mdLines = [
    `| ${header.join(" | ")} |`,
    `| ${separator.join(" | ")} |`,
    ...body.map((r) => `| ${r.join(" | ")} |`),
  ]

  return mdLines.join("\n")
}

export function parseDocx(buffer: Buffer): ParsedDocument {
  const docXmlBuffer = extractZipEntry(buffer, "word/document.xml")
  if (!docXmlBuffer) {
    throw new Error("Invalid DOCX file: word/document.xml not found")
  }

  const xml = docXmlBuffer.toString("utf8")
  const parsed = parseWordXmlToMarkdown(xml)
  const wordCount = parsed.markdown.split(/\s+/).filter(Boolean).length

  return {
    title: parsed.title,
    markdown: parsed.markdown,
    metadata: {
      wordCount,
      paragraphCount: parsed.paragraphCount,
      tableCount: parsed.tableCount,
    },
  }
}
