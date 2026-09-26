import React from "react"

export function HighlightText({
  text,
  query,
  className = "",
}: {
  text: string
  query: string
  className?: string
}) {
  if (!query || !query.trim() || !text) {
    return <span className={className}>{text}</span>
  }

  const trimmed = query.trim()
  const escaped = trimmed.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")
  const regex = new RegExp(`(${escaped})`, "gi")
  const parts = text.split(regex)

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.toLowerCase() === trimmed.toLowerCase() ? (
          <mark
            key={i}
            className="text-zinc-950 dark:text-zinc-950 font-medium px-0.5 rounded-xs"
            style={{ backgroundColor: "#ffdda0" }}
          >
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </span>
  )
}
