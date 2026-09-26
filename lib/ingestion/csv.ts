/**
 * CSV Document Ingestion
 * Parses CSV files according to RFC 4180 (handling quoted fields, commas, escapes, multiline values)
 * and generates clean Markdown tables and structural summaries for AI processing.
 */

export interface ParsedCsv {
  headers: string[]
  rows: string[][]
  markdownTable: string
  rowCount: number
  columnCount: number
}

/**
 * Robust RFC 4180 CSV tokenizer and row parser
 */
export function parseCsvRows(csvContent: string): string[][] {
  const rows: string[][] = []
  let currentRow: string[] = []
  let currentField = ""
  let inQuotes = false
  let i = 0
  const len = csvContent.length

  while (i < len) {
    const char = csvContent[i]

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && csvContent[i + 1] === '"') {
          // Escaped double quote
          currentField += '"'
          i += 2
          continue
        } else {
          // Closing quote
          inQuotes = false
          i++
          continue
        }
      } else {
        currentField += char
        i++
        continue
      }
    } else {
      if (char === '"') {
        inQuotes = true
        i++
        continue
      } else if (char === ",") {
        currentRow.push(currentField.trim())
        currentField = ""
        i++
        continue
      } else if (char === "\r") {
        if (i + 1 < len && csvContent[i + 1] === "\n") {
          i++
        }
        currentRow.push(currentField.trim())
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ""
        i++
        continue
      } else if (char === "\n") {
        currentRow.push(currentField.trim())
        if (currentRow.some((f) => f.length > 0)) {
          rows.push(currentRow)
        }
        currentRow = []
        currentField = ""
        i++
        continue
      } else {
        currentField += char
        i++
        continue
      }
    }
  }

  // Push final field/row if any remaining
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField.trim())
    if (currentRow.some((f) => f.length > 0)) {
      rows.push(currentRow)
    }
  }

  return rows
}

/**
 * Formats parsed CSV rows into GitHub Flavored Markdown table
 */
export function parseCsv(csvContent: string, maxRows = 200): ParsedCsv {
  const allRows = parseCsvRows(csvContent)
  if (allRows.length === 0) {
    return {
      headers: [],
      rows: [],
      markdownTable: "",
      rowCount: 0,
      columnCount: 0,
    }
  }

  const headers = allRows[0].map((h) => h.replace(/\|/g, "\\|"))
  const bodyRows = allRows.slice(1, maxRows + 1).map((r) => {
    // Escape pipe characters in table cells
    return r.map((cell) => cell.replace(/\|/g, "\\|").replace(/\n/g, " "))
  })

  const colCount = headers.length
  const normalizedBody = bodyRows.map((r) => {
    while (r.length < colCount) r.push("")
    return r.slice(0, colCount)
  })

  const headerLine = `| ${headers.join(" | ")} |`
  const sepLine = `| ${headers.map(() => "---").join(" | ")} |`
  const bodyLines = normalizedBody.map((r) => `| ${r.join(" | ")} |`)

  let markdownTable = [headerLine, sepLine, ...bodyLines].join("\n")
  if (allRows.length - 1 > maxRows) {
    markdownTable += `\n\n*(Truncated: showing first ${maxRows} of ${allRows.length - 1} rows)*`
  }

  return {
    headers,
    rows: normalizedBody,
    markdownTable,
    rowCount: allRows.length - 1,
    columnCount: colCount,
  }
}
