"use client"

import { useState } from "react"
import {
  Shield,
  Lock,
  Eye,
  EyeOff,
  CheckCircle,
  Info,
  X,
  ChevronDown,
  ChevronUp,
  FileKey,
  Server,
  Laptop,
  ArrowRight,
} from "lucide-react"
import type { EncryptedPayload } from "@/lib/crypto"
import { getEncryptionMetadata } from "@/lib/crypto"

// ─── Security Badge (shows in header or sidebar) ──────────────────────────────

export function SecurityBadge({ onClick }: { onClick?: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium transition-all hover:scale-105"
      style={{
        background: "rgba(34, 197, 94, 0.12)",
        border: "1px solid rgba(34, 197, 94, 0.2)",
        color: "rgb(74, 222, 128)",
      }}
    >
      <Shield className="h-3 w-3" />
      <span>End-to-End Encrypted</span>
    </button>
  )
}

// ─── Trust Panel (compact security checklist) ─────────────────────────────────

export function TrustPanel() {
  const [isExpanded, setIsExpanded] = useState(false)

  const features = [
    { label: "Client-side encryption", checked: true, icon: Laptop },
    { label: "AES-256-GCM encryption", checked: true, icon: Lock },
    { label: "TLS in transit", checked: true, icon: ArrowRight },
    { label: "Ciphertext-only storage", checked: true, icon: Server },
    { label: "Zero-knowledge design", checked: true, icon: Eye },
  ]

  return (
    <div
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-4 py-3 text-left transition-colors hover:bg-white/5"
      >
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-green-500" />
          <span className="text-sm font-medium text-white">Security Status</span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-400" />
        )}
      </button>

      {isExpanded && (
        <div className="border-t border-white/5 px-4 py-3">
          <ul className="space-y-2">
            {features.map((f) => (
              <li key={f.label} className="flex items-center gap-2.5 text-xs">
                <f.icon className="h-3.5 w-3.5 text-gray-500" />
                <span style={{ color: "rgba(255,255,255,0.6)" }}>{f.label}</span>
                <CheckCircle
                  className="ml-auto h-3.5 w-3.5"
                  style={{ color: f.checked ? "rgb(74, 222, 128)" : "rgba(255,255,255,0.2)" }}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

// ─── How Security Works Modal ─────────────────────────────────────────────────

interface SecurityModalProps {
  isOpen: boolean
  onClose: () => void
}

export function SecurityInfoModal({ isOpen, onClose }: SecurityModalProps) {
  if (!isOpen) return null

  const sections = [
    {
      title: "Why we encrypt (not hash) notes",
      content:
        "Hashing is one-way — you can't get the original data back. Since you need to read your notes, we use encryption, which is reversible with the correct key. Your password generates a unique encryption key that only you possess.",
    },
    {
      title: "Zero-knowledge architecture",
      content:
        "Our servers never see your plaintext notes. Your content is encrypted in your browser before it leaves your device. We only store ciphertext — meaningless data without your encryption key. Even we can't read your notes.",
    },
    {
      title: "Password vs. Encryption Key",
      content:
        "Your password serves two separate purposes: (1) Authentication — a hash is sent to verify your identity, and (2) Encryption — a different key is derived locally to encrypt/decrypt notes. These are kept strictly separate for security.",
    },
    {
      title: "Protection layers",
      content:
        "TLS encrypts data in transit between your browser and our servers. AES-256-GCM encryption protects your stored notes. Even if our database were compromised, attackers would only find encrypted gibberish.",
    },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{
        backdropFilter: "blur(20px)",
        backgroundColor: "rgba(0,0,0,0.6)",
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl overflow-hidden max-h-[85vh] flex flex-col"
        style={{
          background: "rgba(28,28,30,0.95)",
          border: "1px solid rgba(255,255,255,0.1)",
          boxShadow: "0 32px 64px rgba(0,0,0,0.5)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 px-6 py-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: "rgba(34, 197, 94, 0.15)" }}
            >
              <Shield className="h-5 w-5 text-green-500" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">How Security Works</h2>
              <p className="text-xs text-gray-400">Understanding your data protection</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-white/10"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-5">
            {sections.map((section, i) => (
              <div key={i}>
                <h3 className="mb-2 text-sm font-semibold text-white">{section.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
                  {section.content}
                </p>
              </div>
            ))}
          </div>

          {/* Visual diagram */}
          <div
            className="mt-6 rounded-xl p-4"
            style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)" }}
          >
            <p className="mb-3 text-xs font-medium text-gray-400">Encryption Flow</p>
            <div className="flex items-center justify-between text-xs">
              <div className="text-center">
                <div
                  className="mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: "rgba(234,179,8,0.15)" }}
                >
                  <Laptop className="h-5 w-5 text-yellow-500" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Your device</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-gray-500">
                <Lock className="h-3 w-3" />
                <span className="text-[10px]">Encrypted</span>
                <ArrowRight className="h-3 w-3" />
              </div>
              <div className="text-center">
                <div
                  className="mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: "rgba(59,130,246,0.15)" }}
                >
                  <Server className="h-5 w-5 text-blue-500" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Our servers</span>
              </div>
              <div className="flex flex-col items-center gap-0.5 text-gray-500">
                <FileKey className="h-3 w-3" />
                <span className="text-[10px]">Ciphertext</span>
              </div>
              <div className="text-center">
                <div
                  className="mx-auto mb-1.5 flex h-10 w-10 items-center justify-center rounded-lg"
                  style={{ background: "rgba(34,197,94,0.15)" }}
                >
                  <Shield className="h-5 w-5 text-green-500" />
                </div>
                <span style={{ color: "rgba(255,255,255,0.5)" }}>Protected</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-white/5 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full rounded-xl py-2.5 text-sm font-medium transition-colors"
            style={{ background: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.8)" }}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Debug/Developer Panel ────────────────────────────────────────────────────

interface DebugPanelProps {
  isOpen: boolean
  onClose: () => void
  encryptedPayload?: EncryptedPayload | null
  isEncrypted: boolean
  plaintextLength?: number
}

export function SecurityDebugPanel({
  isOpen,
  onClose,
  encryptedPayload,
  isEncrypted,
  plaintextLength,
}: DebugPanelProps) {
  const [showCiphertext, setShowCiphertext] = useState(false)

  if (!isOpen) return null

  const metadata = encryptedPayload ? getEncryptionMetadata(encryptedPayload) : null

  return (
    <div
      className="fixed bottom-4 right-4 z-40 w-80 rounded-xl overflow-hidden"
      style={{
        background: "rgba(28,28,30,0.95)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 16px 32px rgba(0,0,0,0.4)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
        <div className="flex items-center gap-2">
          <FileKey className="h-4 w-4 text-yellow-500" />
          <span className="text-sm font-semibold text-white">Security Debug</span>
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "rgba(234,179,8,0.2)", color: "rgb(234,179,8)" }}
          >
            DEV
          </span>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Content */}
      <div className="p-4 space-y-4">
        {/* Encryption status */}
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-400">Encryption Status</span>
          <span
            className="flex items-center gap-1 text-xs font-medium"
            style={{ color: isEncrypted ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)" }}
          >
            {isEncrypted ? (
              <>
                <Lock className="h-3 w-3" />
                Encrypted
              </>
            ) : (
              <>
                <Eye className="h-3 w-3" />
                Not encrypted
              </>
            )}
          </span>
        </div>

        {plaintextLength !== undefined && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-400">Plaintext Length</span>
            <span className="text-xs text-white">{plaintextLength} chars</span>
          </div>
        )}

        {metadata && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Ciphertext Size</span>
              <span className="text-xs text-white">{metadata.ciphertextLength} chars</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">IV Length</span>
              <span className="text-xs text-white">{metadata.ivLength} chars</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Salt Length</span>
              <span className="text-xs text-white">{metadata.saltLength} chars</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">Version</span>
              <span className="text-xs text-white">v{metadata.version}</span>
            </div>

            {/* Ciphertext preview */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-400">Ciphertext Preview</span>
                <button
                  onClick={() => setShowCiphertext(!showCiphertext)}
                  className="text-xs text-yellow-500"
                >
                  {showCiphertext ? (
                    <EyeOff className="h-3 w-3" />
                  ) : (
                    <Eye className="h-3 w-3" />
                  )}
                </button>
              </div>
              <div
                className="rounded-lg p-2 font-mono text-[10px] break-all"
                style={{ background: "rgba(0,0,0,0.3)", color: "rgba(255,255,255,0.5)" }}
              >
                {showCiphertext
                  ? encryptedPayload?.ciphertext.substring(0, 120) + "..."
                  : "••••••••••••••••••••••••••••••••"}
              </div>
            </div>
          </>
        )}

        {!encryptedPayload && (
          <div className="text-center py-4">
            <Info className="mx-auto mb-2 h-6 w-6 text-gray-500" />
            <p className="text-xs text-gray-400">Select a note to view encryption details</p>
          </div>
        )}
      </div>

      {/* Warning */}
      <div
        className="px-4 py-2 text-[10px] text-center"
        style={{ background: "rgba(234,179,8,0.1)", color: "rgba(234,179,8,0.7)" }}
      >
        Debug panel — for demonstration only
      </div>
    </div>
  )
}

// ─── Inline Security Indicator (for note editor) ──────────────────────────────

export function EncryptionIndicator({ isEncrypted }: { isEncrypted: boolean }) {
  return (
    <div
      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[10px] font-medium"
      style={{
        background: isEncrypted ? "rgba(34, 197, 94, 0.1)" : "rgba(239, 68, 68, 0.1)",
        color: isEncrypted ? "rgb(74, 222, 128)" : "rgb(248, 113, 113)",
      }}
    >
      {isEncrypted ? (
        <>
          <Lock className="h-2.5 w-2.5" />
          <span>Encrypted before upload</span>
        </>
      ) : (
        <>
          <Eye className="h-2.5 w-2.5" />
          <span>Not encrypted</span>
        </>
      )}
    </div>
  )
}
