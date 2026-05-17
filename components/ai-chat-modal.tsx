"use client"

import { useState, useRef, useEffect } from "react"
import { X, Send, Brain, Bot, User, Loader2 } from "lucide-react"

export interface Message {
  id: string
  role: "user" | "ai"
  content: string
}

interface AiChatModalProps {
  isOpen: boolean
  onClose: () => void
  notes: { title: string; content: string }[]
}

export function AiChatModal({ isOpen, onClose, notes }: AiChatModalProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "ai",
      content: "Hello! I am your AI assistant. I have access to your secure notes. Ask me anything about your knowledge base.",
    },
  ])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    if (isOpen) {
      scrollToBottom()
    }
  }, [messages, isOpen])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMsg: Message = { id: Date.now().toString(), role: "user", content: input.trim() }
    setMessages((prev) => [...prev, userMsg])
    setInput("")
    setIsLoading(true)

    // Simulate AI processing or call an API
    setTimeout(() => {
      const aiMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "ai",
        content: `You asked about: "${userMsg.content}". Since I'm a demo interface right now, I can see you have ${notes.length} notes in your knowledge base, but I'm not fully hooked up to an LLM backend yet.`,
      }
      setMessages((prev) => [...prev, aiMsg])
      setIsLoading(false)
    }, 1000)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex flex-col w-full max-w-2xl h-[80vh] sm:h-[85vh] rounded-3xl bg-zinc-950 border border-zinc-800 shadow-[0_0_40px_rgba(234,179,8,0.1)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 sm:p-6 border-b border-zinc-800/50 bg-zinc-900/50">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-yellow-500/10 border border-yellow-500/20">
              <Brain className="h-5 w-5 text-yellow-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white tracking-tight">AI Assistant</h2>
              <p className="text-xs text-gray-400">Query your secure knowledge base</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full bg-zinc-800/50 hover:bg-zinc-800 text-gray-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6 momentum-scroll">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex items-start gap-4 ${
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              }`}
            >
              <div
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  msg.role === "user"
                    ? "bg-zinc-800 text-white"
                    : "bg-yellow-500 text-black"
                }`}
              >
                {msg.role === "user" ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
              </div>
              <div
                className={`flex max-w-[80%] flex-col gap-2 rounded-2xl px-5 py-3.5 text-sm ${
                  msg.role === "user"
                    ? "bg-zinc-800 text-white rounded-tr-sm"
                    : "bg-zinc-900/80 border border-zinc-800/50 text-gray-200 rounded-tl-sm shadow-sm"
                }`}
              >
                <p className="leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex items-start gap-4 flex-row">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-yellow-500 text-black">
                <Bot className="h-4 w-4" />
              </div>
              <div className="flex max-w-[80%] flex-col gap-2 rounded-2xl rounded-tl-sm px-5 py-3.5 bg-zinc-900/80 border border-zinc-800/50">
                <Loader2 className="h-4 w-4 animate-spin text-yellow-500" />
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 sm:p-5 border-t border-zinc-800/50 bg-zinc-900/30 backdrop-blur-sm">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend()
            }}
            className="relative flex items-center"
          >
            <input
              type="text"
              placeholder="Ask about your notes..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              className="w-full rounded-2xl bg-zinc-800/50 border border-zinc-700/50 py-4 pl-5 pr-14 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 transition-all shadow-inner"
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="absolute right-2 p-2.5 rounded-xl bg-yellow-500 text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-yellow-400 transition-colors"
            >
              <Send className="h-4 w-4" />
            </button>
          </form>
          <div className="text-center mt-3">
            <p className="text-[10px] text-gray-600 font-medium">
              AI can make mistakes. Consider verifying important information.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
