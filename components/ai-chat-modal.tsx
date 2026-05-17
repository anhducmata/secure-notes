"use client"

import { useState, useRef, useEffect, useCallback } from "react"
import { X, Send, Brain, Bot, User, Loader2, FileText, Trash2, Plus, MessageSquare, PanelLeftClose, PanelLeftOpen, Paperclip, Image, Music, XCircle } from "lucide-react"
import { getAIModel } from "@/components/settings-modal"

export interface Citation {
  index: number
  noteId: string
  title: string
}

export interface Attachment {
  file: File
  previewUrl?: string
  kind: "audio" | "image" | "text"
}

export interface Message {
  id: string
  role: "user" | "ai"
  content: string
  citations?: Citation[]
  attachmentNames?: string[]
}

interface Conversation {
  id: string
  title: string
  updatedAt: string
}

interface AiChatModalProps {
  isOpen: boolean
  onClose: () => void
  notes: { id: string; title: string; content: string }[]
  onJumpToNote?: (noteId: string) => void
}

function formatRelativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function renderWithCitations(
  content: string,
  citations: Citation[],
  onJump: (noteId: string) => void,
) {
  if (!citations.length) return <span className="leading-relaxed whitespace-pre-wrap">{content}</span>

  const parts = content.split(/(\[\d+\])/g)
  return (
    <span className="leading-relaxed whitespace-pre-wrap">
      {parts.map((part, i) => {
        const match = part.match(/^\[(\d+)\]$/)
        if (match) {
          const idx = parseInt(match[1])
          const citation = citations.find((c) => c.index === idx)
          if (citation) {
            return (
              <button
                key={i}
                onClick={() => onJump(citation.noteId)}
                className="inline-flex items-center justify-center w-4 h-4 rounded text-[10px] font-bold bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/40 hover:text-yellow-300 transition-colors align-super mx-0.5 cursor-pointer"
                title={`Jump to: ${citation.title}`}
              >
                {idx}
              </button>
            )
          }
        }
        return <span key={i}>{part}</span>
      })}
    </span>
  )
}

const WELCOME: Message = {
  id: "welcome",
  role: "ai",
  content: "Hey! I'm your AI assistant — got access to all your notes. What do you want to look up?",
}

function newConvId() {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
}

export function AiChatModal({ isOpen, onClose, notes, onJumpToNote }: AiChatModalProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string>(() => newConvId())
  const [messages, setMessages] = useState<Message[]>([WELCOME])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [historyLoading, setHistoryLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })

  useEffect(() => {
    if (isOpen) scrollToBottom()
  }, [messages, isOpen])

  // Load conversation list on open
  useEffect(() => {
    if (!isOpen) return
    setHistoryLoading(true)
    fetch("/api/chat/history", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (data.conversations?.length) {
          setConversations(data.conversations)
          // Default to new chat — don't auto-load old conversations
        }
      })
      .catch(() => {})
      .finally(() => setHistoryLoading(false))
  }, [isOpen])

  // Re-index notes when modal opens
  useEffect(() => {
    if (!isOpen || notes.length === 0) return
    fetch("/api/notes/index", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ notes }),
    }).catch(() => {})
  }, [isOpen])

  const loadConversation = useCallback(async (convId: string) => {
    setActiveConvId(convId)
    setMessages([WELCOME])
    try {
      const res = await fetch(`/api/chat/history?id=${convId}`, { credentials: "include" })
      const data = await res.json()
      if (data.messages?.length) {
        const restored: Message[] = data.messages.map(
          (m: { role: string; content: string; citations?: Citation[] }, i: number) => ({
            id: `hist-${convId}-${i}`,
            role: m.role === "user" ? "user" : "ai",
            content: m.content,
            citations: m.citations ?? [],
          })
        )
        setMessages([WELCOME, ...restored])
      }
    } catch {/* silent */}
  }, [])

  const handleNewChat = () => {
    const id = newConvId()
    setActiveConvId(id)
    setMessages([WELCOME])
    setInput("")
  }

  const handleDeleteConv = async (e: React.MouseEvent, convId: string) => {
    e.stopPropagation()
    await fetch(`/api/chat/history?id=${convId}`, { method: "DELETE", credentials: "include" }).catch(() => {})
    const updated = conversations.filter((c) => c.id !== convId)
    setConversations(updated)
    if (convId === activeConvId) {
      if (updated.length > 0) {
        loadConversation(updated[0].id)
      } else {
        handleNewChat()
      }
    }
  }

  const handleJump = (noteId: string) => {
    onJumpToNote?.(noteId)
    onClose()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? [])
    const newAttachments: Attachment[] = files.map((file) => {
      const kind = file.type.startsWith("audio/") ? "audio"
        : file.type.startsWith("image/") ? "image"
        : "text"
      const previewUrl = kind === "image" ? URL.createObjectURL(file) : undefined
      return { file, previewUrl, kind }
    })
    setAttachments((prev) => [...prev, ...newAttachments])
    e.target.value = ""
  }

  const removeAttachment = (idx: number) => {
    setAttachments((prev) => {
      const next = [...prev]
      if (next[idx].previewUrl) URL.revokeObjectURL(next[idx].previewUrl!)
      next.splice(idx, 1)
      return next
    })
  }

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return

    const attachmentNames = attachments.map((a) => a.file.name)
    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim(), attachmentNames }
    const aiMsgId = (Date.now() + 1).toString()
    setMessages((prev) => [...prev, userMsg, { id: aiMsgId, role: "ai", content: "" }])
    setInput("")
    const sentAttachments = attachments
    setAttachments([])
    setIsLoading(true)

    try {
      const conversationHistory = messages
        .filter((m) => m.id !== "welcome")
        .map((m) => ({
          role: m.role === "user" ? "user" as const : "assistant" as const,
          content: m.content,
          ...(m.citations?.length ? { citations: m.citations } : {}),
        }))

      const formData = new FormData()
      formData.append("question", userMsg.content)
      formData.append("conversationHistory", JSON.stringify(conversationHistory))
      formData.append("conversationId", activeConvId)
      formData.append("model", getAIModel())
      for (const att of sentAttachments) {
        formData.append("files", att.file, att.file.name)
      }

      const res = await fetch("/api/chat", {
        method: "POST",
        credentials: "include",
        body: formData,
      })

      if (!res.ok || !res.body) throw new Error("Failed")

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let citations: Citation[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const text = decoder.decode(value)
        for (const line of text.split("\n")) {
          if (!line.startsWith("data: ")) continue
          try {
            const json = JSON.parse(line.slice(6))
            if (json.delta) {
              setMessages((prev) =>
                prev.map((m) => m.id === aiMsgId ? { ...m, content: m.content + json.delta } : m)
              )
            }
            if (json.done) {
              citations = json.citations ?? []
            }
          } catch { /* partial chunk */ }
        }
      }

      setMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, citations } : m)
      )
      setIsLoading(false)

      setConversations((prev) => {
        const existing = prev.find((c) => c.id === activeConvId)
        const title = existing?.title ?? userMsg.content.slice(0, 60)
        return [
          { id: activeConvId, title, updatedAt: new Date().toISOString() },
          ...prev.filter((c) => c.id !== activeConvId),
        ]
      })
    } catch {
      setIsLoading(false)
      setMessages((prev) =>
        prev.map((m) => m.id === aiMsgId ? { ...m, content: "Something went wrong. Please try again." } : m)
      )
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      <div className="relative flex w-full max-w-4xl h-[80vh] sm:h-[85vh] rounded-3xl bg-zinc-950 border border-zinc-800 shadow-[0_0_40px_rgba(234,179,8,0.1)] overflow-hidden">

        {/* Left Sidebar */}
        <div
          className={`flex flex-col border-r border-zinc-800/60 bg-zinc-900/40 transition-all duration-200 shrink-0 ${
            sidebarOpen ? "w-60" : "w-0 overflow-hidden"
          }`}
        >
          {/* Sidebar header */}
          <div className="flex items-center justify-between px-4 py-4 border-b border-zinc-800/60">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">History</span>
            <button
              onClick={handleNewChat}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-xs font-medium transition-colors"
              title="New chat"
            >
              <Plus className="h-3 w-3" />
              New
            </button>
          </div>

          {/* Conversation list */}
          <div className="flex-1 overflow-y-auto py-2">
            {historyLoading ? (
              <div className="flex flex-col gap-2 px-3 py-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-8 rounded-lg bg-zinc-800/60 animate-pulse" />
                ))}
              </div>
            ) : conversations.length === 0 ? (
              <p className="px-4 py-6 text-xs text-gray-600 text-center">No conversations yet</p>
            ) : (
              conversations.map((conv) => (
                <div
                  key={conv.id}
                  onClick={() => loadConversation(conv.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && loadConversation(conv.id)}
                  className={`w-full flex items-start gap-2 px-3 py-2.5 text-left group transition-colors rounded-lg mx-1 cursor-pointer ${
                    conv.id === activeConvId
                      ? "bg-yellow-500/10 text-yellow-300"
                      : "hover:bg-zinc-800/50 text-gray-400 hover:text-gray-200"
                  }`}
                  style={{ width: "calc(100% - 8px)" }}
                >
                  <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 opacity-60" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate leading-tight">{conv.title}</p>
                    <p className="text-[10px] opacity-50 mt-0.5">{formatRelativeTime(conv.updatedAt)}</p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteConv(e, conv.id)}
                    className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:text-red-400 transition-all shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Main Chat Area */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/50 bg-zinc-900/50 shrink-0">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen((v) => !v)}
                className="p-1.5 rounded-lg hover:bg-zinc-800/60 text-gray-400 hover:text-white transition-colors"
                title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
              >
                {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
              </button>
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/20">
                <Brain className="h-4 w-4 text-yellow-500" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white tracking-tight">AI Assistant</h2>
                <p className="text-[10px] text-gray-500">Query your secure knowledge base</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleNewChat}
                className="p-2 rounded-full bg-zinc-800/50 hover:bg-zinc-800 text-gray-400 hover:text-white transition-colors"
                title="New chat"
              >
                <Plus className="h-4 w-4" />
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-zinc-800/50 hover:bg-zinc-800 text-gray-400 hover:text-white transition-colors"
                aria-label="Close modal"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 momentum-scroll">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    msg.role === "user" ? "bg-zinc-800 text-white" : "bg-yellow-500 text-black"
                  }`}
                >
                  {msg.role === "user" ? <User className="h-3.5 w-3.5" /> : <Bot className="h-3.5 w-3.5" />}
                </div>
                <div
                  className={`flex max-w-[78%] flex-col gap-2 rounded-2xl px-4 py-3 text-sm ${
                    msg.role === "user"
                      ? "bg-zinc-800 text-white rounded-tr-sm"
                      : "bg-zinc-900/80 border border-zinc-800/50 text-gray-200 rounded-tl-sm shadow-sm"
                  }`}
                >
                  {msg.attachmentNames && msg.attachmentNames.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-1">
                      {msg.attachmentNames.map((name, i) => (
                        <span key={i} className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-zinc-700/60 text-[10px] text-gray-300">
                          <Paperclip className="h-2.5 w-2.5 opacity-60" />
                          {name}
                        </span>
                      ))}
                    </div>
                  )}
                  {msg.role === "ai" && isLoading && msg.content === ""
                    ? <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
                    : msg.role === "ai" && msg.citations?.length
                    ? renderWithCitations(msg.content, msg.citations, handleJump)
                    : <span className="leading-relaxed whitespace-pre-wrap">{msg.content}</span>
                  }

                  {msg.citations && msg.citations.length > 0 && (() => {
                    const usedIndices = new Set(
                      [...msg.content.matchAll(/\[(\d+)\]/g)].map((m) => parseInt(m[1]))
                    )
                    const usedCitations = msg.citations.filter((c) => usedIndices.has(c.index))
                    if (!usedCitations.length) return null
                    return (
                      <div className="mt-1.5 pt-2 border-t border-zinc-700/50 flex flex-col gap-1">
                        {usedCitations.map((c) => (
                          <button
                            key={c.noteId}
                            onClick={() => handleJump(c.noteId)}
                            className="flex items-center gap-2 text-xs text-gray-400 hover:text-yellow-400 transition-colors text-left group"
                          >
                            <span className="flex items-center justify-center w-4 h-4 rounded bg-yellow-500/10 text-yellow-500 font-bold text-[10px] shrink-0 group-hover:bg-yellow-500/20">
                              {c.index}
                            </span>
                            <FileText className="h-3 w-3 shrink-0 opacity-50" />
                            <span className="truncate">{c.title}</span>
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 py-4 border-t border-zinc-800/50 bg-zinc-900/30 shrink-0">
            {/* Attachment previews */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {attachments.map((att, i) => (
                  <div key={i} className="relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-800 border border-zinc-700/50 text-xs text-gray-300 max-w-[180px]">
                    {att.kind === "image" && att.previewUrl
                      ? <img src={att.previewUrl} alt="" className="h-6 w-6 rounded object-cover shrink-0" />
                      : att.kind === "audio"
                      ? <Music className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                      : <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                    }
                    <span className="truncate">{att.file.name}</span>
                    <button onClick={() => removeAttachment(i)} className="ml-1 text-gray-500 hover:text-red-400 shrink-0">
                      <XCircle className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <form
              onSubmit={(e) => { e.preventDefault(); handleSend() }}
              className="relative flex items-center gap-2"
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                multiple
                accept="audio/*,image/*,text/*,.txt,.md,.pdf,.csv"
                onChange={handleFileChange}
                disabled={isLoading}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isLoading}
                className="p-2.5 rounded-xl bg-zinc-800/50 border border-zinc-700/50 text-gray-400 hover:text-white hover:bg-zinc-700/60 transition-colors disabled:opacity-40 shrink-0"
                title="Attach file"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                type="text"
                placeholder="Ask about your notes..."
                value={input}
                onChange={(e) => setInput(e.target.value)}
                className="flex-1 rounded-2xl bg-zinc-800/50 border border-zinc-700/50 py-3.5 pl-4 pr-12 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={(!input.trim() && attachments.length === 0) || isLoading}
                className="absolute right-2 p-2 rounded-xl bg-yellow-500 text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
              >
                <Send className="h-3.5 w-3.5" />
              </button>
            </form>
            <p className="text-center text-[10px] text-gray-600 mt-2">
              AI can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
