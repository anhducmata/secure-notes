import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { transcribeWithSoniox } from './sonioxService'
import { askDeepSeek, analyzeMeetingWithDeepSeek, polishTranscriptWithDeepSeek, analyzeGraphQueryWithDeepSeek, GraphAIQueryResult } from './deepseekService'
import { retrieveWorkspaceRagContext, RagSource } from './miniRagService'
import { createPortal } from 'react-dom'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Handle,
  Position,
  MarkerType,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { supabase } from './supabaseClient'
import { AuthModal } from './AuthModal'
import { signOutUser } from './authService'
import { fetchUserNotesFromDb, createNoteInDb, updateNoteInDb, deleteNoteFromDb, uploadAttachmentToCloud } from './dbService'
import {
  Search, Plus, Mic, MicOff, Bold, Italic, Underline,
  Heading2, List, ListOrdered, Quote, Trash2, Paperclip,
  ChevronUp, ChevronDown, Send, Sparkles, X, Image, FileText, Music,
  PictureInPicture2, Copy, Check, MessageSquare, Minus,
  UserCheck, RotateCcw, Edit2, Tag, HelpCircle, AlertTriangle,
  Volume2, Play, Settings, User, Globe, Users, ExternalLink, Network
} from 'lucide-react'

// ── Types ──────────────────────────────────────────────────────────────────
export type ConversationCategory = 'Standup' | 'Meeting' | 'Customer Interview' | 'Brainstorming' | '1-on-1'

export interface Note {
  id: string
  title: string
  body: string
  updatedAt: Date
  emoji: string
  category?: ConversationCategory
  tags?: string[]
  attachments?: Attachment[]
}

interface TranscriptLine {
  id: string
  text: string
  final: boolean
  source: 'mic' | 'system'
  timeRange?: string
}

function formatTimeRange(startSec: number, durationSec: number = 4): string {
  const formatSec = (s: number) => {
    const m = Math.floor(s / 60)
    const sec = Math.floor(s % 60)
    return `${m}:${sec < 10 ? '0' : ''}${sec}`
  }
  return `${formatSec(startSec)} - ${formatSec(startSec + durationSec)}`
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  sources?: RagSource[]
}

export interface Attachment {
  id: string
  name: string
  type: 'image' | 'document' | 'audio'
  size: string
  url?: string
}

// ── Sample data ────────────────────────────────────────────────────────────
const SAMPLE_ATTACHMENTS: Attachment[] = []

const SAMPLE_NOTES: Note[] = [
  {
    id: '1',
    title: 'Welcome to your Workspace',
    body: '<h2>Welcome to your Workspace</h2><p>This is your clean personal note space. Type <strong>#</strong> to tag topics, <strong>@</strong> to tag speakers, or drag & drop files to attach!</p><p>Use the <strong>Record</strong> button at the bottom left to record live meetings and voice transcription.</p>',
    updatedAt: new Date(),
    emoji: '✨',
    category: 'Meeting',
    tags: ['#welcome', '#workspace'],
    attachments: [],
  }
]



const TRANSCRIPT_SEGMENTS: { text: string; source: 'mic' | 'system'; defaultVoice: string }[] = [
  { text: "Live voice recording session active. Speech recognition is capturing audio in real time.", source: "mic", defaultVoice: "You" },
  { text: "Soniox AI and Web Speech API ready for real-time transcription.", source: "system", defaultVoice: "System Audio 🔊" },
]

const AGENT_REPLIES = [
  "I analyzed the RAG transcript tags: [🎙️ You] recommended front-loading value in onboarding, while [🔊 System Audio] confirmed PgBouncer connection pooler deployment.",
  "Based on your notes, the core theme is around user confidence and trust — not speed. I'd suggest framing the Q3 strategy around reducing friction in the first 30 days.",
  "Your meeting notes & system audio reference a Postgres connection pool issue. PgBouncer was deployed to stabilize connections under high concurrency.",
  "The Kahneman quote you noted aligns well with your product research — users overestimate their confidence. Worth incorporating into your onboarding messaging.",
]

// ── Utility ────────────────────────────────────────────────────────────────
function getDateGroup(date: Date): string {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const noteDay = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const diff = Math.floor((today.getTime() - noteDay.getTime()) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  const dow = today.getDay()
  const startOfWeek = new Date(today)
  startOfWeek.setDate(today.getDate() - (dow === 0 ? 6 : dow - 1))
  if (noteDay >= startOfWeek) return 'This Week'
  const startOfLastWeek = new Date(startOfWeek)
  startOfLastWeek.setDate(startOfWeek.getDate() - 7)
  if (noteDay >= startOfLastWeek) return 'Last Week'
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  if (noteDay >= startOfMonth) return 'This Month'
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function stripHtml(html: string) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function fmt(date: Date) {
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Simple semantic-adjacent words for demo
const SEMANTIC_MAP: Record<string, string[]> = {
  strategy: ['plan', 'approach', 'direction', 'roadmap'],
  design: ['ui', 'ux', 'interface', 'visual', 'aesthetic'],
  user: ['customer', 'person', 'people', 'audience'],
  search: ['find', 'query', 'lookup', 'filter'],
  meeting: ['sync', 'call', 'discussion', 'session'],
  notes: ['note', 'writing', 'document', 'memo'],
  product: ['app', 'feature', 'service', 'software'],
  research: ['study', 'analysis', 'interview', 'survey'],
}

function getSemanticTerms(query: string): string[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const extras: string[] = []
  for (const w of words) {
    for (const [key, vals] of Object.entries(SEMANTIC_MAP)) {
      if (key === w || vals.includes(w)) {
        extras.push(key, ...vals)
      }
    }
  }
  return [...new Set(extras)].filter(t => !words.includes(t))
}

function highlightText(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text
  const exact = query.trim()
  const semantic = getSemanticTerms(query)

  const allTerms = [
    { term: exact, type: 'exact' as const },
    ...semantic.map(s => ({ term: s, type: 'semantic' as const })),
  ].sort((a, b) => b.term.length - a.term.length)

  const regex = new RegExp(`(${allTerms.map(t => t.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  const parts = text.split(regex)

  return parts.map((part, i) => {
    const lower = part.toLowerCase()
    const match = allTerms.find(t => t.term.toLowerCase() === lower)
    if (!match) return part
    return (
      <mark
        key={i}
        style={{
          background: match.type === 'exact' ? '#FFE066' : '#FFF3C4',
          color: 'inherit',
          borderRadius: 2,
          padding: '0 1px',
        }}
      >
        {part}
      </mark>
    )
  })
}

// ── Floating / Picture-in-Picture Transcription Widget ───────────────────
function TranscriptionWidget({ lines, isRecording, onToggle, pipWindow, onMinimize, speakerNames }: {
  lines: TranscriptLine[]
  isRecording: boolean
  onToggle: () => void
  pipWindow?: Window | null
  onMinimize?: () => void
  speakerNames?: { mic: string; system: string }
}) {
  const [pos, setPos] = useState({ x: Math.max(0, window.innerWidth - 300), y: 40 })
  const [dragging, setDragging] = useState(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const streamBottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0
    }
  }, [lines])

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button') || (e.target as HTMLElement).closest('.scrollable-stream')) return
    if (pipWindow) return
    setDragging(true)
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y }
  }, [pos, pipWindow])

  useEffect(() => {
    if (!dragging) return
    const move = (e: MouseEvent) => setPos({
      x: Math.max(0, Math.min(window.innerWidth - 270, e.clientX - dragOffset.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y)),
    })
    const up = () => setDragging(false)
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
    return () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up) }
  }, [dragging])

  const containerStyle: React.CSSProperties = pipWindow ? {
    width: '100%',
    padding: '10px 2px 10px 2px',
    boxSizing: 'border-box',
    color: 'rgb(255, 255, 255)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    userSelect: 'none',
    height: '100vh',
  } : {
    position: 'fixed',
    left: pos.x,
    top: pos.y,
    zIndex: 9999,
    width: 270,
    cursor: dragging ? 'grabbing' : 'grab',
    userSelect: 'none',
  }

  return (
    <div onMouseDown={onMouseDown} style={containerStyle}>
      <div style={{
        background: 'rgba(24, 23, 20, 0.95)',
        backdropFilter: 'blur(20px) saturate(1.4)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.4)',
        borderRadius: 10,
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
        padding: '6px 8px',
        display: 'flex',
        alignItems: lines.length > 3 ? 'flex-start' : 'center',
        gap: 6,
        width: '100%',
        height: pipWindow ? '100%' : 'auto',
        maxHeight: pipWindow ? '100%' : 160,
        boxSizing: 'border-box',
      }}>
        {/* Mic Icon Button */}
        <button onClick={onToggle} title={isRecording ? 'Pause Recording' : 'Start Recording'} style={{
          width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
          background: isRecording ? '#E8443A' : 'rgba(255,255,255,0.15)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          transition: 'all 0.2s', position: 'relative', marginTop: lines.length > 3 ? 1 : 0,
        }}>
          {isRecording && <span style={{ position: 'absolute', inset: -2.5, borderRadius: '50%', border: '1.2px solid rgba(232,68,58,0.45)', animation: 'pulse-ring 1.4s ease-out infinite' }} />}
          {isRecording ? <Mic size={10} color="white" strokeWidth={2} /> : <MicOff size={10} color="white" strokeWidth={2} />}
        </button>

        {/* Minimize / Hide PiP Button */}
        {pipWindow && onMinimize && (
          <button onClick={onMinimize} title="Minimize PiP (Run in Background)" style={{
            width: 22, height: 22, borderRadius: '50%', border: 'none', cursor: 'pointer',
            background: 'rgba(255,255,255,0.14)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            transition: 'all 0.2s', color: 'rgba(255,255,255,0.85)', marginTop: lines.length > 3 ? 1 : 0,
          }}>
            <Minus size={11} color="white" strokeWidth={2.2} />
          </button>
        )}

        {/* Live Transcription Stream (Newest line at TOP) */}
        <div
          ref={scrollContainerRef}
          className="scrollable-stream"
          style={{
            flex: 1,
            minHeight: 18,
            maxHeight: pipWindow ? '100%' : 140,
            overflowY: 'auto',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            gap: 3,
          }}
        >
          {lines.length === 0 ? (
            <span style={{ fontFamily: 'monospace', fontSize: 10.5, color: 'rgba(255,255,255,0.35)' }}>
              {isRecording ? 'Listening…' : 'Paused'}
            </span>
          ) : (
            lines.slice(0, 30).map((line, i) => {
              const isYou = line.source === 'mic'
              const color = isYou ? '#60A5FA' : '#34D399' // Sapphire Blue for You, Emerald Green for Someone
              const label = isYou ? `${speakerNames?.mic || 'You'}:` : `${speakerNames?.system || 'Someone'}:`
              const timeTag = line.timeRange ? `[${line.timeRange}] ` : ''

              return (
                <p key={line.id} style={{
                  margin: 0,
                  fontFamily: 'monospace',
                  fontSize: 10.5,
                  lineHeight: 1.35,
                  color: i === 0 ? (line.final ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.75)') : 'rgba(255,255,255,0.42)',
                  animation: 'line-fade-in 0.25s ease-out',
                  transition: 'color 0.2s ease-out'
                }}>
                  <strong style={{ color, marginRight: 4, fontWeight: 600 }}>{label}</strong>
                  {timeTag && <span style={{ opacity: 0.55, fontSize: 9.5, marginRight: 4 }}>{timeTag}</span>}
                  {!line.final && i === 0 && <span style={{ display: 'inline-block', width: 2, height: '0.85em', background: color, marginLeft: 2, verticalAlign: 'text-bottom', animation: 'cursor-blink 0.9s step-end infinite' }} />}
                </p>
              )
            })
          )}
        </div>
      </div>

      <style>{`
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:1}100%{transform:scale(1.9);opacity:0} }
        @keyframes cursor-blink { 0%,100%{opacity:1}50%{opacity:0} }
        @keyframes line-fade-in { from{opacity:0;transform:translateY(3px)}to{opacity:1;transform:translateY(0)} }
      `}</style>
    </div>
  )
}

// ── Sidebar ────────────────────────────────────────────────────────────────
function Sidebar({ notes, activeId, onSelect, onNew, isRecording, onToggleRecording, search, onSearch, onOpenSettings, currentView, onViewChange, onOpenAuth }: {
  notes: Note[]
  activeId: string
  onSelect: (id: string) => void
  onNew: () => void
  isRecording: boolean
  onToggleRecording: () => void
  search: string
  onSearch: (v: string) => void
  onOpenSettings: () => void
  currentView: 'editor' | 'graph'
  onViewChange: (view: 'editor' | 'graph') => void
  onOpenAuth?: () => void
}) {
  const filtered = useMemo(() => {
    if (!search.trim()) return notes
    const q = search.toLowerCase()
    const semantic = getSemanticTerms(search)
    return notes.filter(n => {
      const text = (n.title + ' ' + stripHtml(n.body)).toLowerCase()
      return text.includes(q) || semantic.some(s => text.includes(s))
    })
  }, [notes, search])

  const grouped = useMemo(() => {
    const map = new Map<string, Note[]>()
    const order = ['Today', 'Yesterday', 'This Week', 'Last Week', 'This Month']
    for (const note of filtered) {
      const g = getDateGroup(note.updatedAt)
      if (!map.has(g)) map.set(g, [])
      map.get(g)!.push(note)
    }
    const result: { label: string; notes: Note[] }[] = []
    for (const label of order) {
      if (map.has(label)) result.push({ label, notes: map.get(label)! })
    }
    for (const [label, ns] of map) {
      if (!order.includes(label)) result.push({ label, notes: ns })
    }
    return result
  }, [filtered])

  return (
    <aside style={{ width: 232, minWidth: 232, background: 'var(--color-sidebar)', borderRight: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* Traffic lights */}
      <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 16px', gap: 6, flexShrink: 0 }}>
        {['#FF5F57', '#FFBD2E', '#27C840'].map((c, i) => (
          <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: c }} />
        ))}
      </div>

      {/* View Switcher Tabs (Notes vs 3D Graph) */}
      <div style={{ padding: '0 12px 10px', flexShrink: 0, display: 'flex', gap: 4 }}>
        <button
          onClick={() => onViewChange('editor')}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
            background: currentView === 'editor' ? 'var(--color-accent)' : 'rgba(0,0,0,0.05)',
            color: currentView === 'editor' ? '#ffffff' : 'var(--color-text-muted)',
            fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'all 0.15s ease',
          }}
        >
          <span>📝 Notes</span>
        </button>
        <button
          onClick={() => {
            onViewChange('graph')
            window.location.hash = '#/graph'
          }}
          style={{
            flex: 1, padding: '5px 8px', borderRadius: 6, border: 'none',
            background: currentView === 'graph' ? 'var(--color-accent)' : 'rgba(0,0,0,0.05)',
            color: currentView === 'graph' ? '#ffffff' : 'var(--color-text-muted)',
            fontSize: 11.5, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
            transition: 'all 0.15s ease',
          }}
        >
          <Network size={12} />
          <span>3D Graph</span>
          <span
            onClick={(e) => {
              e.stopPropagation()
              window.open(window.location.origin + window.location.pathname + '#/graph', '_blank')
            }}
            title="Open 3D Graph in New Standalone Window"
            style={{ marginLeft: 2, display: 'inline-flex', opacity: 0.8 }}
          >
            <ExternalLink size={10} />
          </span>
        </button>
      </div>

      {/* Title + new */}
      <div style={{ padding: '0 14px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', letterSpacing: '-0.01em' }}>All Notes</span>
        <button onClick={onNew} style={{ width: 24, height: 24, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', borderRadius: 6, transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.07)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Plus size={15} strokeWidth={1.8} />
        </button>
      </div>

      {/* Search */}
      <div style={{ padding: '0 12px 8px', flexShrink: 0 }}>
        <div style={{ position: 'relative' }}>
          <Search size={12} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-faint)', pointerEvents: 'none' }} />
          <input value={search} onChange={e => onSearch(e.target.value)} placeholder="Search"
            style={{ width: '100%', padding: '5.5px 10px 5.5px 24px', background: 'rgba(0,0,0,0.06)', border: '1px solid transparent', borderRadius: 7, fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-text)', outline: 'none', transition: 'border-color 0.15s' }}
            onFocus={e => (e.target.style.borderColor = 'rgba(74,71,163,0.28)')}
            onBlur={e => (e.target.style.borderColor = 'transparent')}
          />
          {search && (
            <button onClick={() => onSearch('')} style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', alignItems: 'center', padding: 0 }}>
              <X size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Note list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 6px 6px' }}>
        {grouped.length === 0 && (
          <p style={{ padding: '20px 10px', fontFamily: 'var(--font-body)', fontSize: 12.5, color: 'var(--color-text-faint)', textAlign: 'center', margin: 0 }}>No results</p>
        )}
        {grouped.map(({ label, notes: groupNotes }) => (
          <div key={label}>
            <div style={{ padding: '10px 8px 3px', fontFamily: 'var(--font-body)', fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-faint)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              {label}
            </div>
            {groupNotes.map(n => (
              <NoteRow key={n.id} note={n} active={n.id === activeId} onSelect={onSelect} search={search} />
            ))}
          </div>
        ))}
      </div>

      {/* Bottom mic & Settings */}
      <div style={{ padding: '8px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
        <button onClick={onToggleRecording} style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          padding: '6px 10px', borderRadius: 7, border: '1px solid var(--color-border)',
          background: isRecording ? 'rgba(232,68,58,0.08)' : 'rgba(0,0,0,0.04)',
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
          color: isRecording ? '#E8443A' : 'var(--color-text-muted)', cursor: 'pointer', transition: 'all 0.15s',
        }}>
          {isRecording ? <MicOff size={13} strokeWidth={1.8} /> : <Mic size={13} strokeWidth={1.8} />}
          {isRecording ? 'Stop' : 'Record'}
        </button>

        <button onClick={onOpenSettings} title="Settings (User Profile, Language, People & AI)" style={{
          width: 32, height: 32, borderRadius: 7, border: '1px solid var(--color-border)',
          background: 'rgba(0,0,0,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: 'var(--color-text-muted)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.04)')}
        >
          <Settings size={14} strokeWidth={1.8} />
        </button>

        {onOpenAuth && (
          <button onClick={onOpenAuth} title="User Auth & Account" style={{
            width: 32, height: 32, borderRadius: 7, border: '1px solid var(--color-border)',
            background: 'rgba(37,99,235,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#2563eb', cursor: 'pointer', flexShrink: 0, transition: 'background 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.08)')}
          >
            <User size={14} strokeWidth={1.8} />
          </button>
        )}
      </div>
    </aside>
  )
}

function NoteRow({ note, active, onSelect, search }: { note: Note; active: boolean; onSelect: (id: string) => void; search: string }) {
  const categoryTag = note.category ? `#${note.category.toLowerCase().replace(/\s+/g, '-')}` : '#note'
  const noteTags: string[] = Array.isArray(note.tags) && note.tags.length > 0 ? note.tags : [categoryTag]

  return (
    <button onClick={() => onSelect(note.id)} style={{
      textAlign: 'left', padding: '6px 10px',
      borderRadius: 7, border: 'none',
      background: active ? 'rgba(74,71,163,0.09)' : 'transparent',
      cursor: 'pointer', transition: 'background 0.1s', display: 'flex',
      flexDirection: 'column', gap: 4,
      marginLeft: 10, marginRight: 10,
      boxSizing: 'border-box',
      width: 'calc(100% - 20px)',
      marginBottom: 3,
    } as React.CSSProperties}
      onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'rgba(0,0,0,0.045)' }}
      onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 500, color: active ? 'var(--color-accent)' : 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%' }}>
        {search ? highlightText(note.title, search) : note.title}
      </span>
      
      {/* Multiple Tags at Bottom Right of Content */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, justifyContent: 'flex-end', width: '100%', marginTop: 2 }}>
        {noteTags.map((tagStr, idx) => (
          <span key={idx} style={{ fontSize: 9.5, fontFamily: 'monospace', color: active ? 'var(--color-accent)' : 'var(--color-text-faint)', fontWeight: 500, background: active ? 'rgba(74,71,163,0.12)' : 'rgba(0,0,0,0.04)', padding: '1px 5px', borderRadius: 4 }}>
            {tagStr.startsWith('#') ? tagStr : `#${tagStr}`}
          </span>
        ))}
      </div>
    </button>
  )
}

// ── File Preview Modal ────────────────────────────────────────────────────
function FilePreviewModal({ attachment, onClose }: { attachment: Attachment; onClose: () => void }) {
  const fileUrl = attachment.url || (attachment.type === 'image' ? 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80' : '')
  const isAudio = attachment.type === 'audio'
  const isImage = attachment.type === 'image'

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{
        width: isAudio ? 420 : 840,
        maxWidth: '94vw',
        maxHeight: '92vh',
        background: 'var(--color-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 14,
        boxShadow: '0 24px 60px rgba(0,0,0,0.4)',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s ease',
      }}>
        {/* Header */}
        <div style={{ height: 48, padding: '0 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.02)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden' }}>
            <Paperclip size={15} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--color-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{attachment.name}</span>
            <span style={{ fontSize: 11, color: 'var(--color-text-faint)', flexShrink: 0 }}>({attachment.size})</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', padding: 5, borderRadius: 6 }}>
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <div style={{ padding: isAudio ? 16 : 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, overflowY: 'auto', flex: 1 }}>
          {isImage ? (
            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
              <img
                src={fileUrl}
                alt={attachment.name}
                style={{ width: '100%', maxHeight: '68vh', objectFit: 'contain', borderRadius: 10, border: '1px solid var(--color-border)', background: '#0a0a0c', boxShadow: '0 8px 30px rgba(0,0,0,0.25)' }}
              />
              <a
                href={fileUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 18px', borderRadius: 8, background: 'var(--color-accent)', color: '#ffffff', fontSize: 12.5, fontWeight: 600, textDecoration: 'none', boxShadow: '0 2px 8px rgba(74,71,163,0.3)' }}
              >
                <ExternalLink size={14} /> Open Full Resolution Image
              </a>
            </div>
          ) : isAudio ? (
            <div style={{ width: '100%', padding: 16, borderRadius: 10, background: 'rgba(5,150,105,0.06)', border: '1px solid rgba(5,150,105,0.2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
              <Music size={28} style={{ color: '#059669' }} />
              <div style={{ fontSize: 12, fontWeight: 600, color: '#047857' }}>Audio Recording</div>
              <audio controls src={fileUrl} style={{ width: '100%', height: 38 }} />
            </div>
          ) : (
            <div style={{ width: '100%', minHeight: 400, borderRadius: 10, background: 'rgba(0,0,0,0.02)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 30 }}>
              <FileText size={56} style={{ color: 'var(--color-accent)' }} />
              {fileUrl ? (
                <iframe
                  src={fileUrl}
                  title={attachment.name}
                  style={{ width: '100%', height: 340, border: '1px solid var(--color-border)', borderRadius: 8, background: 'white' }}
                />
              ) : (
                <a
                  href={fileUrl || '#'}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 22px', borderRadius: 8, background: 'var(--color-accent)', color: '#ffffff', fontSize: 13, fontWeight: 600, textDecoration: 'none' }}
                >
                  <ExternalLink size={15} /> Open Document Viewer
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Custom React Flow Knowledge Node Component ─────────────────────────────
function KnowledgeNode({ data, selected }: { data: any; selected?: boolean }) {
  const typeBadgeColors: Record<string, { bg: string; text: string; border: string; label: string }> = {
    note: { bg: 'rgba(129,140,248,0.18)', text: '#818cf8', border: 'rgba(129,140,248,0.4)', label: 'Note 📋' },
    project: { bg: 'rgba(245,158,11,0.18)', text: '#f59e0b', border: 'rgba(245,158,11,0.4)', label: 'Project 🚀' },
    team: { bg: 'rgba(99,102,241,0.18)', text: '#818cf8', border: 'rgba(99,102,241,0.4)', label: 'Team 🏢' },
    person: { bg: 'rgba(16,185,129,0.18)', text: '#10b981', border: 'rgba(16,185,129,0.4)', label: 'Person 👤' },
    speaker: { bg: 'rgba(16,185,129,0.18)', text: '#10b981', border: 'rgba(16,185,129,0.4)', label: 'Person 👤' },
    topic: { bg: 'rgba(56,189,248,0.18)', text: '#38bdf8', border: 'rgba(56,189,248,0.4)', label: 'Topic #' },
    metric: { bg: 'rgba(244,63,94,0.18)', text: '#f43f5e', border: 'rgba(244,63,94,0.4)', label: 'Metric 📈' },
    custom: { bg: 'rgba(168,85,247,0.18)', text: '#a855f7', border: 'rgba(168,85,247,0.4)', label: 'Custom ✨' },
  }

  const badge = typeBadgeColors[data.type] || typeBadgeColors.custom
  const isDimmed = data.isDimmed
  const isSelected = data.isSelected || selected
  const nodeTags: string[] = Array.isArray(data.tags) && data.tags.length > 0 ? data.tags : [badge.label]

  return (
    <div style={{
      background: '#0f172a',
      border: `1.5px solid ${isSelected ? '#38bdf8' : badge.border}`,
      borderRadius: 12,
      padding: '10px 14px',
      minWidth: 175,
      boxShadow: isSelected ? '0 0 24px rgba(56,189,248,0.5)' : '0 8px 24px rgba(0,0,0,0.5)',
      color: '#f8fafc',
      fontFamily: 'var(--font-body)',
      opacity: isDimmed ? 0.22 : 1.0,
      filter: isDimmed ? 'grayscale(0.6)' : 'none',
      transform: isSelected ? 'scale(1.04)' : 'scale(1)',
      transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)',
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#38bdf8', width: 8, height: 8, border: 'none' }} />

      {/* Main Entity Title */}
      <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc', wordBreak: 'break-word', lineHeight: 1.4 }}>
        {data.label}
      </div>

      {/* Multiple Tag Badges at Bottom Right of Content */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, justifyContent: 'flex-end', marginTop: 8 }}>
        {nodeTags.map((tagStr, idx) => (
          <span
            key={idx}
            style={{
              fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '2px 7.5px', borderRadius: 12, background: badge.bg, color: badge.text, border: `1px solid ${badge.border}`
            }}
          >
            {tagStr}
          </span>
        ))}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: '#38bdf8', width: 8, height: 8, border: 'none' }} />
    </div>
  )
}

// ── Dedicated React Flow Knowledge Graph Page Component ────────────────────
function KnowledgeGraphPage({
  notes,
  activeId,
  onSelectNote,
  onBackToNotes
}: {
  notes: Note[]
  activeId: string
  onSelectNote: (id: string) => void
  onBackToNotes: () => void
}) {
  const nodeTypes = useMemo(() => ({ knowledgeNode: KnowledgeNode }), [])
  const [filterType, setFilterType] = useState<'all' | 'note' | 'project' | 'team' | 'person' | 'topic' | 'metric' | 'custom'>('all')
  const [showAddModal, setShowAddModal] = useState(false)

  // Compute initial React Flow Nodes for Notes, Projects, Teams, People, Topics, and Metrics
  const initialNodes = useMemo(() => {
    const list: any[] = []
    const topicSet = new Set<string>()

    // 1. Notes Entities
    notes.forEach((n, idx) => {
      list.push({
        id: n.id,
        type: 'knowledgeNode',
        position: { x: (idx % 3) * 280 + 50, y: Math.floor(idx / 3) * 160 + 60 },
        data: { label: `${n.emoji} ${n.title}`, type: 'note', color: n.id === activeId ? '#818cf8' : '#64748B' },
      })

      if (Array.isArray(n.tags)) {
        n.tags.forEach(t => topicSet.add(t))
      } else if (n.category) {
        topicSet.add(`#${n.category.toLowerCase().replace(/\s+/g, '-')}`)
      }
    })

    // 2. Teams Entities
    const teams = [
      { id: 'team-1', label: '🏢 Team: Core Product', type: 'team', x: 50, y: 320 },
      { id: 'team-2', label: '🏢 Team: Infrastructure Eng', type: 'team', x: 340, y: 320 },
      { id: 'team-3', label: '🏢 Team: Growth & Sales', type: 'team', x: 630, y: 320 },
    ]
    teams.forEach(t => list.push({ id: t.id, type: 'knowledgeNode', position: { x: t.x, y: t.y }, data: { label: t.label, type: 'team' } }))

    // 3. Project Entities
    const projects = [
      { id: 'proj-1', label: '🚀 Project: AI Audio Transcription', type: 'project', x: 50, y: 480 },
      { id: 'proj-2', label: '🚀 Project: Customer Retention Revamp', type: 'project', x: 340, y: 480 },
      { id: 'proj-3', label: '🚀 Project: Postgres Scale-out', type: 'project', x: 630, y: 480 },
    ]
    projects.forEach(p => list.push({ id: p.id, type: 'knowledgeNode', position: { x: p.x, y: p.y }, data: { label: p.label, type: 'project' } }))

    // 4. People / Team & Client Entities
    const peopleList = [
      { id: 'person-you', label: '👤 You (Owner)', type: 'person', x: 50, y: 640 },
    ]
    peopleList.forEach(p => list.push({ id: p.id, type: 'knowledgeNode', position: { x: p.x, y: p.y }, data: { label: p.label, type: 'person' } }))

    // 5. Topic & Technology Entities
    Array.from(topicSet).forEach((t, idx) => {
      list.push({
        id: t,
        type: 'knowledgeNode',
        position: { x: idx * 260 + 50, y: 800 },
        data: { label: t, type: 'topic' },
      })
    })

    // 6. Product Metrics Entities
    const metrics = [
      { id: 'metric-1', label: '📈 Metric: 30-Day Retention Rate', type: 'metric', x: 50, y: 940 },
      { id: 'metric-2', label: '📈 Metric: LTV / CAC Ratio', type: 'metric', x: 340, y: 940 },
      { id: 'metric-3', label: '📈 Metric: Transcription Latency', type: 'metric', x: 630, y: 940 },
    ]
    metrics.forEach(m => list.push({ id: m.id, type: 'knowledgeNode', position: { x: m.x, y: m.y }, data: { label: m.label, type: 'metric' } }))

    return list
  }, [notes, activeId])

  // Compute initial React Flow Edges establishing organizational & product relationships
  const initialEdges = useMemo(() => [
    // Organizational Management & Team Membership
    { id: 'e-tm-1', source: 'person-you', target: 'team-1', label: 'belongs_to_team', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },

    // Teams to Projects Ownership
    { id: 'e-tp-1', source: 'team-1', target: 'proj-2', label: 'owns_project', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },
    { id: 'e-tp-2', source: 'team-2', target: 'proj-3', label: 'owns_project', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },

    // Project Dependencies
    { id: 'e-p3-p2', source: 'proj-3', target: 'proj-2', label: 'blocks_project', animated: true, style: { stroke: '#ef4444', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#7f1d1d', rx: 4, ry: 4, stroke: '#ef4444', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ef4444' } },

    // People to Projects
    { id: 'e-pe1-p2', source: 'person-you', target: 'proj-2', label: 'leads_project', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },

    // Projects to Metrics
    { id: 'e-p2-m1', source: 'proj-2', target: 'metric-1', label: 'drives_metric', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },
    { id: 'e-p1-m3', source: 'proj-1', target: 'metric-3', label: 'optimizes_metric', animated: true, style: { stroke: '#ffffff', strokeWidth: 2 }, labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 }, labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 }, markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' } },
  ], [notes])

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges)

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null)
  const [editingLabel, setEditingLabel] = useState('')
  const [editingRelation, setEditingRelation] = useState('')
  const [connectTargetId, setConnectTargetId] = useState('')
  const [newRelationLabel, setNewRelationLabel] = useState('relates_to')
  const [newEntityName, setNewEntityName] = useState('')
  const [newCustomTagInput, setNewCustomTagInput] = useState('')

  const handleAddTagToNode = (tagToAdd?: string) => {
    const t = (tagToAdd || newCustomTagInput).trim()
    if (!selectedNodeId || !t) return
    setNodes(prev => prev.map(n => {
      if (n.id !== selectedNodeId) return n
      const typeDefaultLabel = n.data.type === 'note' ? 'Note 📋' : n.data.type === 'project' ? 'Project 🚀' : n.data.type === 'team' ? 'Team 🏢' : n.data.type === 'person' ? 'Person 👤' : n.data.type === 'topic' ? 'Topic #' : n.data.type === 'metric' ? 'Metric 📈' : 'Custom ✨'
      const currentTags = Array.isArray(n.data.tags) && n.data.tags.length > 0 ? n.data.tags : [typeDefaultLabel]
      if (currentTags.includes(t)) return n
      return {
        ...n,
        data: {
          ...n.data,
          tags: [...currentTags, t]
        }
      }
    }))
    setNewCustomTagInput('')
  }

  const handleRemoveTagFromNode = (tagToRemove: string) => {
    if (!selectedNodeId) return
    setNodes(prev => prev.map(n => {
      if (n.id !== selectedNodeId) return n
      const currentTags = Array.isArray(n.data.tags) ? n.data.tags : []
      return {
        ...n,
        data: {
          ...n.data,
          tags: currentTags.filter((t: string) => t !== tagToRemove)
        }
      }
    }))
  }

  const onConnect = useCallback(
    (params: any) => setEdges((eds) => addEdge({
      ...params,
      label: 'relates_to',
      animated: true,
      style: { stroke: '#ffffff', strokeWidth: 2 },
      labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 },
      labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
    }, eds)),
    [setEdges]
  )

  // AI Dynamic Subgraph Query state
  const [aiQueryInput, setAiQueryInput] = useState('')
  const [isAiAnalyzing, setIsAiAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState<GraphAIQueryResult | null>(null)

  const handleRunAiGraphQuery = async (queryToRun?: string) => {
    const q = (queryToRun || aiQueryInput).trim()
    if (!q) return
    setIsAiAnalyzing(true)
    try {
      const res = await analyzeGraphQueryWithDeepSeek(
        q,
        nodes.map(n => ({ id: n.id, label: n.data.label, type: n.data.type })),
        edges.map(e => ({ id: e.id, source: e.source, target: e.target, label: String(e.label || '') }))
      )
      setAiResult(res)
      setSelectedNodeId(null)
      setSelectedEdgeId(null)
    } finally {
      setIsAiAnalyzing(false)
    }
  }

  const handleClearAiQuery = () => {
    setAiResult(null)
    setAiQueryInput('')
  }

  // Focus Neighborhood & AI Query Highlighting Calculation
  const highlightedNodeIds = useMemo(() => {
    if (aiResult) {
      return new Set<string>(aiResult.relevantNodeIds)
    }
    if (!selectedNodeId) return null
    const set = new Set<string>([selectedNodeId])
    edges.forEach(e => {
      if (e.source === selectedNodeId) set.add(e.target)
      if (e.target === selectedNodeId) set.add(e.source)
    })
    return set
  }, [aiResult, selectedNodeId, edges])

  const highlightedEdgeIds = useMemo(() => {
    if (aiResult) {
      const relNodes = new Set<string>(aiResult.relevantNodeIds)
      const set = new Set<string>()
      edges.forEach(e => {
        if (relNodes.has(e.source) && relNodes.has(e.target)) {
          set.add(e.id)
        }
      })
      return set
    }
    if (!selectedNodeId && !selectedEdgeId) return null
    const set = new Set<string>()
    if (selectedEdgeId) {
      set.add(selectedEdgeId)
      return set
    }
    edges.forEach(e => {
      if (e.source === selectedNodeId || e.target === selectedNodeId) {
        set.add(e.id)
      }
    })
    return set
  }, [aiResult, selectedNodeId, selectedEdgeId, edges])

  const displayNodes = useMemo(() => {
    return nodes.map(n => {
      const isHighlighted = !highlightedNodeIds || highlightedNodeIds.has(n.id)
      const isSelected = n.id === selectedNodeId
      return {
        ...n,
        data: {
          ...n.data,
          isDimmed: !isHighlighted,
          isSelected,
        }
      }
    })
  }, [nodes, highlightedNodeIds, selectedNodeId])

  const displayEdges = useMemo(() => {
    return edges.map(e => {
      const isHighlighted = !highlightedEdgeIds || highlightedEdgeIds.has(e.id)
      const isSelectedEdge = e.id === selectedEdgeId
      return {
        ...e,
        animated: isHighlighted,
        style: {
          ...e.style,
          opacity: isHighlighted ? 1.0 : 0.12,
          stroke: isSelectedEdge ? '#38bdf8' : (isHighlighted ? e.style?.stroke || '#ffffff' : 'rgba(255,255,255,0.2)'),
          strokeWidth: isSelectedEdge ? 3.5 : (isHighlighted ? 2.5 : 1.0),
        },
        labelStyle: {
          ...e.labelStyle,
          opacity: isHighlighted ? 1.0 : 0.12,
        },
        labelBgStyle: {
          ...e.labelBgStyle,
          opacity: isHighlighted ? 1.0 : 0.12,
        }
      }
    })
  }, [edges, highlightedEdgeIds, selectedEdgeId])

  const selectedNode = useMemo(() => nodes.find(n => n.id === selectedNodeId), [nodes, selectedNodeId])
  const selectedEdge = useMemo(() => edges.find(e => e.id === selectedEdgeId), [edges, selectedEdgeId])

  useEffect(() => {
    if (selectedNode) setEditingLabel(selectedNode.data.label)
  }, [selectedNodeId])

  useEffect(() => {
    if (selectedEdge) setEditingRelation(String(selectedEdge.label || 'relates_to'))
  }, [selectedEdgeId])

  // 1. Rename Object / Node
  const handleRenameNode = () => {
    if (!selectedNodeId || !editingLabel.trim()) return
    setNodes(prev => prev.map(n => n.id === selectedNodeId ? { ...n, data: { ...n.data, label: editingLabel.trim() } } : n))
  }

  // 2. Delete Object / Node
  const handleDeleteNode = () => {
    if (!selectedNodeId) return
    setNodes(prev => prev.filter(n => n.id !== selectedNodeId))
    setEdges(prev => prev.filter(e => e.source !== selectedNodeId && e.target !== selectedNodeId))
    setSelectedNodeId(null)
  }

  // 3. Add Custom Entity Node
  const handleAddNode = () => {
    if (!newEntityName.trim()) return
    const id = `custom-${Date.now()}`
    const newNode = {
      id,
      type: 'knowledgeNode',
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: { label: newEntityName.trim(), type: 'custom', color: '#a855f7' },
    }
    setNodes(prev => [...prev, newNode])
    setNewEntityName('')
    setShowAddModal(false)
    setSelectedNodeId(id)
  }

  // 4. Create Connection / Link
  const handleAddEdge = () => {
    if (!selectedNodeId || !connectTargetId || !newRelationLabel.trim()) return
    const id = `edge-${Date.now()}`
    const newEdge = {
      id,
      source: selectedNodeId,
      target: connectTargetId,
      label: newRelationLabel.trim(),
      animated: true,
      style: { stroke: '#ffffff', strokeWidth: 2 },
      labelStyle: { fill: '#ffffff', fontWeight: 700, fontSize: 11 },
      labelBgStyle: { fill: '#0f172a', rx: 4, ry: 4, stroke: '#ffffff', strokeWidth: 1 },
      markerEnd: { type: MarkerType.ArrowClosed, color: '#ffffff' },
    }
    setEdges(prev => [...prev, newEdge])
    setConnectTargetId('')
    setNewRelationLabel('relates_to')
  }

  // 5. Update Connection Relation
  const handleUpdateEdgeRelation = () => {
    if (!selectedEdgeId || !editingRelation.trim()) return
    setEdges(prev => prev.map(e => e.id === selectedEdgeId ? { ...e, label: editingRelation.trim() } : e))
  }

  // 6. Delete Connection
  const handleDeleteEdge = () => {
    if (!selectedEdgeId) return
    setEdges(prev => prev.filter(e => e.id !== selectedEdgeId))
    setSelectedEdgeId(null)
  }

  return (
    <div className="w-screen h-screen bg-slate-950 flex flex-col overflow-hidden font-sans text-slate-100">
      {/* Shadcn Header Bar */}
      <div className="h-14 px-5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between z-50 ring-1 ring-white/5">
        {/* Left: Back button & Title */}
        <div className="flex items-center gap-3.5">
          <button
            onClick={onBackToNotes}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-medium border border-slate-700/60 transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
          >
            ← Back to Notes
          </button>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2">
            <Network className="w-4 h-4 text-sky-400" />
            <span className="text-sm font-semibold text-white tracking-tight">React Flow Knowledge Graph</span>
            <span className="text-[10px] font-semibold bg-sky-500/10 text-sky-400 border border-sky-500/20 px-2 py-0.5 rounded-full">
              {nodes.length} Entities • {edges.length} Links
            </span>
          </div>
        </div>

        {/* Right: Add Entity Button */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" /> Add Entity
          </button>
        </div>
      </div>

      {/* AI Natural Language Query Search Bar & Subgraph Filter */}
      <div className="px-5 py-2.5 bg-slate-900/95 border-b border-slate-800/80 flex items-center justify-between gap-3 z-40">
        <div className="flex items-center gap-2 flex-1 max-w-xl bg-slate-950/90 border border-sky-500/30 rounded-xl px-3 py-1.5 focus-within:ring-2 focus-within:ring-sky-500/40 transition-all shadow-inner">
          <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
          <input
            type="text"
            value={aiQueryInput}
            onChange={e => setAiQueryInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleRunAiGraphQuery() }}
            placeholder='Ask AI to analyze & filter graph (e.g. "Overview of Customer Retention")...'
            className="flex-1 border-none bg-transparent text-white text-xs placeholder:text-slate-500 focus:outline-none"
          />
          {aiResult && (
            <button onClick={handleClearAiQuery} className="text-slate-400 hover:text-white text-xs px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors">
              Reset
            </button>
          )}
          <button
            onClick={() => handleRunAiGraphQuery()}
            disabled={isAiAnalyzing || !aiQueryInput.trim()}
            className="px-3 py-1 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all disabled:opacity-50 flex items-center gap-1"
          >
            {isAiAnalyzing ? 'Analyzing…' : 'Analyze Subgraph →'}
          </button>
        </div>

        {/* Quick Suggestion Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto text-xs">
          <span className="text-slate-500 font-medium text-[11px] shrink-0">Prompts:</span>
          {[
            'Tổng quan dự án Customer Retention',
            'Cấu trúc quản lý phòng ban',
            'Điểm nghẽn Postgres Scale-out',
          ].map(promptStr => (
            <button
              key={promptStr}
              onClick={() => {
                setAiQueryInput(promptStr)
                handleRunAiGraphQuery(promptStr)
              }}
              className="px-2.5 py-1 rounded-full bg-slate-800/60 hover:bg-slate-800 border border-slate-700/60 text-slate-300 text-[11px] whitespace-nowrap transition-all"
            >
              ✨ {promptStr}
            </button>
          ))}
        </div>
      </div>

      {/* Main Full-Screen React Flow Container */}
      <div className="flex-1 relative overflow-hidden">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => {
            setSelectedNodeId(node.id)
            setSelectedEdgeId(null)
          }}
          onEdgeClick={(_, edge) => {
            setSelectedEdgeId(edge.id)
            setSelectedNodeId(null)
          }}
          onPaneClick={() => {
            setSelectedNodeId(null)
            setSelectedEdgeId(null)
          }}
          fitView
          colorMode="dark"
        >
          <Background color="#334155" gap={20} size={1} />
          <Controls className="!bg-slate-900/90 !border-slate-800 !text-white !rounded-xl !shadow-lg" />
          <MiniMap className="!bg-slate-900/90 !border-slate-800 !rounded-xl !shadow-lg" nodeColor={() => '#3b82f6'} />
        </ReactFlow>

        {/* Floating AI Executive Summary Result Banner */}
        {aiResult && (
          <div className="absolute top-4 left-4 w-96 z-50 bg-slate-900/95 backdrop-blur-xl border border-sky-500/40 rounded-2xl p-4 shadow-2xl text-slate-100 flex flex-col gap-2 ring-1 ring-sky-500/20">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-sky-400" />
                <span className="text-xs font-bold text-sky-400">{aiResult.summaryTitle}</span>
              </div>
              <button onClick={handleClearAiQuery} className="text-slate-400 hover:text-white p-0.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="text-xs text-slate-300 leading-relaxed">
              {aiResult.executiveSummary}
            </div>
            <div className="text-[11px] font-semibold text-sky-400 mt-1">
              🎯 Subgraph Filtered: {aiResult.relevantNodeIds.length} Relevant Entities Highlighted
            </div>
          </div>
        )}

        {/* Bottom Left Navigation Guide HUD */}
        <div className="absolute bottom-4 left-4 pointer-events-none z-40 flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-800 text-slate-400 text-xs font-medium shadow-lg">
          <span className="text-sky-400 font-semibold">React Flow Graph:</span>
          <span>Drag Cards to Move</span>
          <span className="opacity-40">•</span>
          <span>Scroll to Zoom</span>
          <span className="opacity-40">•</span>
          <span>Click Card to Inspect</span>
        </div>

        {/* Shadcn Glassmorphic Inspector Drawer Panel */}
        {(selectedNode || selectedEdge) && (
          <div className="absolute top-4 right-4 w-80 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-2xl p-4 shadow-2xl text-slate-100 flex flex-col gap-3 z-50 ring-1 ring-white/10">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
              <span className="text-xs font-bold text-sky-400 uppercase tracking-wider">
                {selectedNode ? `Edit Entity (${selectedNode.data.type})` : 'Edit Connection'}
              </span>
              <button onClick={() => { setSelectedNodeId(null); setSelectedEdgeId(null) }} className="text-slate-400 hover:text-white p-0.5">
                <X className="w-4 h-4" />
              </button>
            </div>

            {selectedNode ? (
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Object Label (Rename)</label>
                  <input
                    type="text"
                    value={editingLabel}
                    onChange={e => setEditingLabel(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameNode() }}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 focus:outline-none"
                  />
                </div>

                <div className="flex gap-2">
                  <button onClick={handleRenameNode} className="flex-1 py-1.5 rounded-xl border border-blue-500/30 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all">
                    Save Rename
                  </button>
                  <button onClick={handleDeleteNode} className="px-3 py-1.5 rounded-xl border border-red-500/30 bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-all">
                    Delete
                  </button>
                </div>

                {selectedNode.data.type === 'note' && (
                  <button
                    onClick={() => {
                      onSelectNote(selectedNode.id)
                      onBackToNotes()
                    }}
                    className="w-full py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-all"
                  >
                    Open Note in Editor →
                  </button>
                )}

                {/* Multi-Tag Manager */}
                <div className="mt-1 pt-2.5 border-t border-dashed border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                    <span>Manage Tags (Multiple):</span>
                    <span className="text-[10px] text-sky-400 font-bold">
                      {(selectedNode.data.tags || [selectedNode.data.type]).length} active
                    </span>
                  </div>

                  {/* Active Tags */}
                  <div className="flex flex-wrap gap-1">
                    {(Array.isArray(selectedNode.data.tags) && selectedNode.data.tags.length > 0
                      ? selectedNode.data.tags
                      : [selectedNode.data.type === 'note' ? 'Note 📋' : selectedNode.data.type === 'project' ? 'Project 🚀' : selectedNode.data.type === 'team' ? 'Team 🏢' : selectedNode.data.type === 'person' ? 'Person 👤' : selectedNode.data.type === 'topic' ? 'Topic #' : selectedNode.data.type === 'metric' ? 'Metric 📈' : 'Custom ✨']
                    ).map((tagStr: string, idx: number) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-800 text-sky-300 border border-slate-700 px-2 py-0.5 rounded-full">
                        {tagStr}
                        <button
                          type="button"
                          onClick={() => handleRemoveTagFromNode(tagStr)}
                          className="hover:text-red-400 p-0.5 rounded transition-colors"
                          title="Remove Tag"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add Custom Tag Input */}
                  <div className="flex gap-1.5 pt-1">
                    <input
                      type="text"
                      value={newCustomTagInput}
                      onChange={e => setNewCustomTagInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleAddTagToNode() }}
                      placeholder="Add tag (e.g. Priority P0 🔥)"
                      className="flex-1 px-2.5 py-1 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddTagToNode()}
                      disabled={!newCustomTagInput.trim()}
                      className="px-2.5 py-1 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white text-xs font-semibold rounded-xl"
                    >
                      + Tag
                    </button>
                  </div>

                </div>

                <div className="mt-1 pt-2.5 border-t border-dashed border-slate-800 space-y-2">
                  <div className="text-[11px] font-semibold text-slate-300">Connect Object to Another:</div>
                  <select
                    value={connectTargetId}
                    onChange={e => setConnectTargetId(e.target.value)}
                    className="w-full px-2 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none"
                  >
                    <option value="">Select Target Node…</option>
                    {nodes.filter(n => n.id !== selectedNode.id).map(n => (
                      <option key={n.id} value={n.id}>{n.data.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={newRelationLabel}
                    onChange={e => setNewRelationLabel(e.target.value)}
                    placeholder="Relation (e.g. depends_on)"
                    className="w-full px-2.5 py-1.5 rounded-xl bg-slate-950 border border-slate-800 text-white text-xs focus:outline-none"
                  />
                  <button onClick={handleAddEdge} disabled={!connectTargetId} className="w-full py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all">
                    + Add Connection
                  </button>
                </div>
              </div>
            ) : selectedEdge ? (
              <div className="flex flex-col gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-400">Relation Label</label>
                  <input
                    type="text"
                    value={editingRelation}
                    onChange={e => setEditingRelation(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-xl border border-slate-800 bg-slate-950 text-white text-xs focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500 focus:outline-none"
                  />
                </div>
                <div className="flex gap-2">
                  <button onClick={handleUpdateEdgeRelation} className="flex-1 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition-all">
                    Save Relation
                  </button>
                  <button onClick={handleDeleteEdge} className="px-3 py-1.5 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-400 text-xs font-semibold transition-all">
                    Delete
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Notion-Style Custom Entity Dialog Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-[#0f172a] border border-white/10 rounded-2xl p-5 shadow-2xl text-slate-100 flex flex-col gap-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-semibold text-white">Add Custom Entity</h3>
              <button onClick={() => setShowAddModal(false)} className="text-slate-400 hover:text-white p-0.5"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400">Entity Name / Topic</label>
              <input
                type="text"
                value={newEntityName}
                onChange={e => setNewEntityName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddNode() }}
                placeholder="Entity name (e.g. Postgres DB Cluster)"
                className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-white/10 text-white text-xs focus:border-blue-500 focus:outline-none"
                autoFocus
              />
              <div className="flex gap-2 justify-end mt-4">
                <button onClick={() => setShowAddModal(false)} className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-all">Cancel</button>
                <button onClick={handleAddNode} disabled={!newEntityName.trim()} className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold shadow-sm transition-all">Add Object</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── macOS Stack Attachment UI Button ───────────────────────────────────────
function AttachmentStackButton({ note, onAddAttachment }: { note: Note; onAddAttachment?: (att: Attachment) => void }) {
  const [open, setOpen] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<Attachment | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const attachments = note.attachments || SAMPLE_ATTACHMENTS

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0 && onAddAttachment) {
      Array.from(e.dataTransfer.files).forEach(file => {
        const type: Attachment['type'] = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'document'
        const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        const fileUrl = URL.createObjectURL(file)
        const att: Attachment = { id: String(Date.now() + Math.random()), name: file.name, type, size, url: fileUrl }
        onAddAttachment(att)
      })
    }
  }

  const icon = (type: Attachment['type']) => {
    if (type === 'image') return <Image size={14} strokeWidth={1.8} style={{ color: '#2563EB' }} />
    if (type === 'audio') return <Music size={14} strokeWidth={1.8} style={{ color: '#059669' }} />
    return <FileText size={14} strokeWidth={1.8} style={{ color: 'var(--color-text-muted)' }} />
  }

  return (
    <>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        style={{ position: 'relative', display: 'inline-block' }}
      >
        {/* Compact File List Popup (No Header Bar) */}
        {open && (
          <div style={{
            position: 'absolute', bottom: 28, left: 0, width: 230,
            background: 'var(--color-surface)', backdropFilter: 'blur(12px)',
            border: '1px solid var(--color-border)', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.14)',
            padding: 4, display: 'flex', flexDirection: 'column', gap: 2,
            maxHeight: 220, overflowY: 'auto', zIndex: 9000,
          }}>
            {attachments.map(a => (
              <div
                key={a.id}
                onClick={(e) => { e.stopPropagation(); setPreviewAttachment(a); setOpen(false) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '5px 8px',
                  borderRadius: 5, background: 'transparent', cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.04)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
              >
                {icon(a.type)}
                <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--color-text)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ fontSize: 9.5, color: 'var(--color-text-faint)', flexShrink: 0 }}>{a.size}</span>
              </div>
            ))}
          </div>
        )}

        {/* Transparent & Ultra-Compact Attachment Button */}
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          title="Click to view attachments"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 6px',
            borderRadius: 6, border: isDragging ? '1px dashed #2563EB' : 'none',
            background: isDragging ? 'rgba(239,246,255,0.98)' : 'transparent',
            cursor: 'pointer',
            fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 500, color: 'var(--color-text-muted)',
            transition: 'color 0.12s ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-muted)')}
        >
          <Paperclip size={12} style={{ color: 'var(--color-accent)' }} />
          <span>Attachments</span>
          <span style={{ fontSize: 10, color: 'var(--color-text-faint)' }}>({attachments.length})</span>
        </button>
      </div>

      {previewAttachment && (
        <FilePreviewModal attachment={previewAttachment} onClose={() => setPreviewAttachment(null)} />
      )}
    </>
  )
}

// ── Formatted Markdown Renderer ──────────────────────────────────────────────
function FormattedMarkdown({ content }: { content: string }) {
  if (!content) return null

  const parseInline = (text: string): React.ReactNode[] => {
    const parts = text.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g)
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} style={{ fontWeight: 700 }}>{part.slice(2, -2)}</strong>
      }
      if (part.startsWith('*') && part.endsWith('*')) {
        return <em key={i}>{part.slice(1, -1)}</em>
      }
      if (part.startsWith('`') && part.endsWith('`')) {
        return <code key={i} style={{ background: 'rgba(0,0,0,0.06)', padding: '1px 4px', borderRadius: 3, fontFamily: 'var(--font-mono)', fontSize: '0.9em' }}>{part.slice(1, -1)}</code>
      }
      return part
    })
  }

  const lines = content.split('\n')
  const elements: React.ReactNode[] = []
  let tableRows: string[][] = []
  let inTable = false

  const flushTable = (key: string) => {
    if (tableRows.length === 0) return
    const headers = tableRows[0]
    const bodyRows = tableRows.slice(1).filter(r => !r.every(cell => /^[-:]+$/.test(cell.trim())))

    elements.push(
      <div key={key} style={{ overflowX: 'auto', margin: '6px 0' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10, border: '1px solid var(--color-border)' }}>
          <thead>
            <tr style={{ background: 'rgba(0,0,0,0.05)' }}>
              {headers.map((h, cIdx) => (
                <th key={cIdx} style={{ padding: '4px 6px', textAlign: 'left', borderBottom: '1px solid var(--color-border)', fontWeight: 600, color: 'var(--color-text)' }}>
                  {parseInline(h.trim())}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {bodyRows.map((r, rIdx) => (
              <tr key={rIdx} style={{ borderBottom: '1px solid rgba(0,0,0,0.04)', background: rIdx % 2 === 1 ? 'rgba(0,0,0,0.015)' : 'transparent' }}>
                {r.map((cell, cIdx) => (
                  <td key={cIdx} style={{ padding: '3px 6px', color: 'var(--color-text)' }}>
                    {parseInline(cell.trim())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
    inTable = false
  }

  lines.forEach((line, idx) => {
    const trimmed = line.trim()

    if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      inTable = true
      const cells = trimmed.slice(1, -1).split('|')
      tableRows.push(cells)
      return
    } else if (inTable) {
      flushTable(`table-${idx}`)
    }

    if (!trimmed) {
      elements.push(<div key={idx} style={{ height: 3 }} />)
      return
    }

    if (trimmed === '---' || trimmed === '***') {
      elements.push(<hr key={idx} style={{ border: 'none', borderTop: '1px solid var(--color-border)', margin: '6px 0' }} />)
      return
    }

    if (trimmed.startsWith('### ')) {
      elements.push(
        <div key={idx} style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-accent)', margin: '6px 0 2px' }}>
          {parseInline(trimmed.slice(4))}
        </div>
      )
      return
    }
    if (trimmed.startsWith('## ')) {
      elements.push(
        <div key={idx} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--color-accent)', margin: '8px 0 3px' }}>
          {parseInline(trimmed.slice(3))}
        </div>
      )
      return
    }
    if (trimmed.startsWith('# ')) {
      elements.push(
        <div key={idx} style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)', margin: '8px 0 4px' }}>
          {parseInline(trimmed.slice(2))}
        </div>
      )
      return
    }

    if (trimmed.startsWith('> ')) {
      elements.push(
        <blockquote key={idx} style={{ margin: '4px 0', padding: '4px 8px', borderLeft: '3px solid var(--color-accent)', background: 'rgba(74,71,163,0.05)', borderRadius: '0 4px 4px 0', fontSize: 10.5, fontStyle: 'italic' }}>
          {parseInline(trimmed.slice(2))}
        </blockquote>
      )
      return
    }

    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      elements.push(
        <div key={idx} style={{ display: 'flex', gap: 5, paddingLeft: 6, fontSize: 10.5, lineHeight: 1.45, margin: '2px 0' }}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 700 }}>•</span>
          <span style={{ flex: 1 }}>{parseInline(trimmed.slice(2))}</span>
        </div>
      )
      return
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/)
    if (numMatch) {
      elements.push(
        <div key={idx} style={{ display: 'flex', gap: 5, paddingLeft: 6, fontSize: 10.5, lineHeight: 1.45, margin: '2px 0' }}>
          <span style={{ color: 'var(--color-accent)', fontWeight: 600 }}>{numMatch[1]}.</span>
          <span style={{ flex: 1 }}>{parseInline(numMatch[2])}</span>
        </div>
      )
      return
    }

    elements.push(
      <div key={idx} style={{ fontSize: 10.5, lineHeight: 1.45, color: 'inherit' }}>
        {parseInline(trimmed)}
      </div>
    )
  })

  if (inTable) {
    flushTable('table-end')
  }

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>{elements}</div>
}

// ── Chat Panel ─────────────────────────────────────────────────────────────
function ChatPanel({ notes, activeNote, onSelectNote, onClose, onAddAttachment, translationLanguage }: {
  notes: Note[]
  activeNote: Note
  onSelectNote: (id: string) => void
  onClose: () => void
  onAddAttachment: (att: Attachment) => void
  translationLanguage?: string
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '0', role: 'assistant', text: `Hi! Reading #${activeNote.title}. Type # to tag notes, @ to tag speakers, or drag & drop files to attach!` }
  ])
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const [mentionMenu, setMentionMenu] = useState<'none' | 'user' | 'note'>('none')
  const [isDragging, setIsDragging] = useState(false)
  const messagesContainerRef = useRef<HTMLDivElement>(null)

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      Array.from(e.dataTransfer.files).forEach(file => {
        const type: Attachment['type'] = file.type.startsWith('image/')
          ? 'image'
          : file.type.startsWith('audio/')
            ? 'audio'
            : 'document'
        const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB'
        const att: Attachment = { id: String(Date.now() + Math.random()), name: file.name, type, size }

        onAddAttachment(att)
        setMessages(prev => [
          ...prev,
          { id: String(Date.now() + Math.random()), role: 'assistant', text: `📎 File **"${file.name}"** (${size}) was dropped into chat and added to note attachments!` }
        ])
      })
    }
  }

  const scrollToBottom = useCallback(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({
        top: messagesContainerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages, typing, scrollToBottom])

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value
    setInput(val)
    const lastChar = val.slice(-1)
    if (lastChar === '#') setMentionMenu('note')
    else if (lastChar === '@') setMentionMenu('user')
    else if (!val.includes('#') && !val.includes('@')) setMentionMenu('none')
  }

  const insertTag = (tag: string) => {
    setInput(prev => {
      if (prev.endsWith('#') || prev.endsWith('@')) {
        return prev.slice(0, -1) + tag + ' '
      }
      return prev + ' ' + tag + ' '
    })
    setMentionMenu('none')
  }

  const send = useCallback(async () => {
    if (!input.trim()) return
    const text = input.trim()
    const userMsg: ChatMessage = { id: String(Date.now()), role: 'user', text }
    setMessages(prev => [...prev, userMsg])
    setInput(`#${activeNote.title} `)
    setTyping(true)
    setMentionMenu('none')

    try {
      const activeNoteText = `${activeNote.title}\n${stripHtml(activeNote.body)}`
      const ragRes = retrieveWorkspaceRagContext(text, notes, activeNote.id, 3)
      const deepSeekReply = await askDeepSeek(text, activeNoteText, translationLanguage, ragRes.contextText)
      setMessages(prev => [...prev, { id: String(Date.now()), role: 'assistant', text: deepSeekReply, sources: ragRes.sources }])
    } catch (err) {
      console.warn('DeepSeek AI Chat error:', err)
      setMessages(prev => [...prev, { id: String(Date.now()), role: 'assistant', text: `Analyzed #${activeNote.title}: Key insights focus on customer retention metrics and system stability.` }])
    } finally {
      setTyping(false)
    }
  }, [input, activeNote, notes, translationLanguage])

  useEffect(() => {
    const noteTag = `#${activeNote.title}`
    setInput(prev => {
      if (!prev || prev.startsWith('#')) {
        return `${noteTag} `
      }
      return prev
    })
  }, [activeNote.id, activeNote.title])

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        width: 320,
        minWidth: 320,
        background: 'var(--color-surface)',
        borderLeft: isDragging ? '2px solid #2563EB' : '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        position: 'relative',
        boxShadow: isDragging ? 'inset 0 0 30px rgba(37,99,235,0.2), 0 0 20px rgba(37,99,235,0.3)' : 'none',
        transition: 'all 0.2s ease',
      }}
    >
      {/* Full Chat Highlight Drag & Drop Overlay */}
      {isDragging && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1000,
          background: 'rgba(239, 246, 255, 0.96)', backdropFilter: 'blur(6px)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          color: '#1D4ED8', gap: 12, padding: 20, textAlign: 'center',
          border: '2.5px dashed #2563EB', borderRadius: 10, margin: 6,
          boxShadow: '0 12px 40px rgba(37, 99, 235, 0.35)',
          animation: 'pulse 1.2s infinite ease-in-out',
        }}>
          <Paperclip size={40} style={{ color: '#2563EB' }} />
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 2 }}>✨ Drop files anywhere in Chat to Upload</div>
            <div style={{ fontSize: 11, color: '#2563EB', opacity: 0.9 }}>Attach to note & index in RAG Knowledge Graph</div>
          </div>
        </div>
      )}
      {/* Simple Header */}
      <div style={{ height: 44, display: 'flex', alignItems: 'center', padding: '0 14px', borderBottom: '1px solid var(--color-border)', flexShrink: 0, gap: 8 }}>
        <Sparkles size={14} strokeWidth={1.8} style={{ color: 'var(--color-accent)' }} />
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>Ask AI</span>
        <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)', display: 'flex', padding: 4, borderRadius: 5, transition: 'background 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.06)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <X size={14} strokeWidth={1.8} />
        </button>
      </div>

      {/* Mention Dropdown Popup */}
      {mentionMenu !== 'none' && (
        <div style={{ position: 'absolute', bottom: 65, left: 12, right: 12, zIndex: 100, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.18)', padding: 5, maxHeight: 170, overflowY: 'auto' }}>
          <div style={{ padding: '3px 6px', fontSize: 10, fontFamily: 'var(--font-body)', color: 'var(--color-text-faint)', textTransform: 'uppercase', fontWeight: 600 }}>
            {mentionMenu === 'note' ? 'Tag Note (#)' : 'Tag Speaker (@)'}
          </div>
          {mentionMenu === 'note' ? (
            notes.map(n => {
              const slug = '#' + n.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
              return (
                <div
                  key={n.id}
                  onClick={() => insertTag(slug)}
                  style={{ padding: '5px 8px', borderRadius: 5, fontSize: 11.5, fontFamily: 'monospace', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, color: 'var(--color-accent)' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-light)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  <span>{n.emoji}</span>
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{slug}</span>
                </div>
              )
            })
          ) : (
            ['@You', '@Someone'].map(userTag => (
              <div
                key={userTag}
                onClick={() => insertTag(userTag)}
                style={{ padding: '5px 8px', borderRadius: 5, fontSize: 11.5, fontFamily: 'monospace', cursor: 'pointer', color: '#2563eb' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(37,99,235,0.08)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                {userTag}
              </div>
            ))
          )}
        </div>
      )}

      {/* Messages Stream with 30% Free Space at Bottom */}
      <div
        ref={messagesContainerRef}
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '14px 12px 30%',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          scrollBehavior: 'smooth',
        }}
      >
        {messages.map(m => (
          <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start', gap: 3 }}>
            <div style={{
              maxWidth: '88%', padding: '8px 11px',
              borderRadius: m.role === 'user' ? '12px 12px 3px 12px' : '12px 12px 12px 3px',
              background: m.role === 'user' ? 'var(--color-accent)' : 'rgba(0,0,0,0.05)',
              fontFamily: 'var(--font-body)', fontSize: 12, lineHeight: 1.55,
              color: m.role === 'user' ? 'white' : 'var(--color-text)',
            }}>
              <FormattedMarkdown content={m.text} />
            </div>
            {m.role === 'assistant' && m.sources && m.sources.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'wrap', maxWidth: '88%', paddingLeft: 4 }}>
                <span style={{ fontSize: 8.5, fontWeight: 600, color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
                  <Sparkles size={8} /> RAG Context:
                </span>
                {m.sources.map(src => (
                  <span key={src.id} style={{ fontSize: 8.5, fontFamily: 'monospace', background: 'rgba(74,71,163,0.08)', color: 'var(--color-accent)', padding: '1px 4px', borderRadius: 3, fontWeight: 500 }}>
                    #{src.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {typing && (
          <div style={{ display: 'flex' }}>
            <div style={{ padding: '8px 12px', borderRadius: '12px 12px 12px 3px', background: 'rgba(0,0,0,0.05)', display: 'flex', gap: 4, alignItems: 'center' }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--color-text-faint)', animationName: 'typing-dot', animationDuration: '1.2s', animationTimingFunction: 'ease-in-out', animationIterationCount: 'infinite', animationDelay: `${i * 0.2}s` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Input Form with @ and # Trigger Shortcuts */}
      <div style={{ padding: '10px 12px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          <button
            onClick={() => setMentionMenu(m => m === 'note' ? 'none' : 'note')}
            style={{ border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 4, padding: '2px 6px', fontSize: 10.5, fontFamily: 'monospace', color: 'var(--color-accent)', cursor: 'pointer' }}
          >
            # note
          </button>
          <button
            onClick={() => setMentionMenu(m => m === 'user' ? 'none' : 'user')}
            style={{ border: '1px solid var(--color-border)', background: 'transparent', borderRadius: 4, padding: '2px 6px', fontSize: 10.5, fontFamily: 'monospace', color: '#2563eb', cursor: 'pointer' }}
          >
            @ user
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', background: 'rgba(0,0,0,0.05)', borderRadius: 10, padding: '7px 8px 7px 12px', border: '1px solid transparent', transition: 'border-color 0.15s' }}
          onFocusCapture={e => (e.currentTarget.style.borderColor = 'rgba(74,71,163,0.28)')}
          onBlurCapture={e => (e.currentTarget.style.borderColor = 'transparent')}
        >
          <textarea
            value={input}
            onChange={handleInputChange}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Ask question... Use # for note, @ for speaker"
            rows={1}
            style={{ flex: 1, border: 'none', background: 'transparent', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--color-text)', outline: 'none', resize: 'none', lineHeight: 1.5, maxHeight: 80, overflowY: 'auto' }}
          />
          <button onClick={send} disabled={!input.trim()} style={{
            width: 26, height: 26, borderRadius: 7, border: 'none', flexShrink: 0,
            background: input.trim() ? 'var(--color-accent)' : 'rgba(0,0,0,0.08)',
            cursor: input.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}>
            <Send size={11} strokeWidth={2} color={input.trim() ? 'white' : 'var(--color-text-faint)'} />
          </button>
        </div>
      </div>
      <style>{`@keyframes typing-dot { 0%,80%,100%{opacity:0.3;transform:scale(0.8)}40%{opacity:1;transform:scale(1)} }`}</style>
    </div>
  )
}

// ── Editor ─────────────────────────────────────────────────────────────────
function Editor({ note, onChange, onDelete, showChat, onToggleChat, speakerNames, onUpdateSpeakerNames, onResetSpeakerNames, teamMembers, translationLanguage, allNotes, onOpenGraph }: {
  note: Note
  onChange: (id: string, updates: Partial<Note>) => void
  onDelete: (id: string) => void
  showChat: boolean
  onToggleChat: () => void
  speakerNames: { mic: string; system: string }
  onUpdateSpeakerNames: (updates: Partial<{ mic: string; system: string }>) => void
  onResetSpeakerNames: () => void
  teamMembers?: { name: string; role: string; emoji: string }[]
  translationLanguage?: string
  allNotes?: Note[]
  onOpenGraph?: () => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const [editingSpeaker, setEditingSpeaker] = useState(false)
  const [systemNameInput, setSystemNameInput] = useState(speakerNames.system)
  const [analyzing, setAnalyzing] = useState(false)
  const [deepSeekAnalysis, setDeepSeekAnalysis] = useState<any>(null)
  const [dashboardOpen, setDashboardOpen] = useState(true)
  const [col1Input, setCol1Input] = useState('')
  const [qaList, setQaList] = useState<{ question: string; answer?: string; sources?: RagSource[] }[]>([])
  const [askingCol1, setAskingCol1] = useState(false)
  const [showAddTagInput, setShowAddTagInput] = useState(false)
  const [newNoteTagInput, setNewNoteTagInput] = useState('')

  const handleAddCustomNoteTag = (overrideTag?: string) => {
    const t = (overrideTag || newNoteTagInput).trim()
    if (!t) return
    const formatted = t.startsWith('#') ? t : `#${t}`
    const currentTags = Array.isArray(note.tags) && note.tags.length > 0
      ? note.tags
      : [note.category ? `#${note.category.toLowerCase().replace(/\s+/g, '-')}` : '#note']

    if (!currentTags.includes(formatted)) {
      onChange(note.id, { tags: [...currentTags, formatted], updatedAt: new Date() })
    }
    setNewNoteTagInput('')
    setShowAddTagInput(false)
  }

  const handleRemoveCustomNoteTag = (tagToRemove: string) => {
    const currentTags = Array.isArray(note.tags) ? note.tags : []
    onChange(note.id, { tags: currentTags.filter((t: string) => t !== tagToRemove), updatedAt: new Date() })
  }

  const filteredTagSuggestions = useMemo(() => {
    const presets = [
      '#standup', '#meeting', '#customer-interview', '#brainstorming', '#1-on-1',
      '#p0-priority', '#infra-scale', '#product-strategy', '#design-system', '#risk-blocker', '#sprint-planning'
    ]
    const q = newNoteTagInput.trim().toLowerCase().replace(/^#/, '')
    if (!q) return presets.slice(0, 5)
    return presets.filter(t => t.toLowerCase().includes(q))
  }, [newNoteTagInput])

  const handleAskCol1WithText = async (questionText: string) => {
    if (!questionText.trim() || askingCol1) return
    const q = questionText.trim()
    setCol1Input('')
    setQaList(prev => [...prev, { question: q, answer: 'Analyzing live conversation…' }])
    setAskingCol1(true)

    try {
      const activeNoteText = `${note.title}\n${stripHtml(note.body)}`
      const ragRes = retrieveWorkspaceRagContext(q, allNotes && allNotes.length > 0 ? allNotes : [note], note.id, 3)
      const ans = await askDeepSeek(q, activeNoteText, translationLanguage, ragRes.contextText)
      setQaList(prev => prev.map(item => item.question === q ? { question: q, answer: ans, sources: ragRes.sources } : item))
    } catch (err) {
      setQaList(prev => prev.map(item => item.question === q ? { question: q, answer: 'They are discussing PgBouncer database pooler stress testing & customer retention LTV metrics.' } : item))
    } finally {
      setAskingCol1(false)
    }
  }

  const handleRenewSummary = async () => {
    if (analyzing) return
    setAnalyzing(true)
    try {
      const activeNoteText = stripHtml(note.body)
      const res = await analyzeMeetingWithDeepSeek(note.title, activeNoteText, note.category || 'Meeting', translationLanguage)
      setDeepSeekAnalysis(res)
    } catch (e) {
      console.warn('Failed to renew DeepSeek summary:', e)
    } finally {
      setAnalyzing(false)
    }
  }

  useEffect(() => {
    setSystemNameInput(speakerNames.system)
  }, [speakerNames.system])

  const enforceNonEditableSpeakerTags = () => {
    if (!editorRef.current) return
    const strongs = editorRef.current.querySelectorAll('strong')
    strongs.forEach(s => {
      const txt = s.textContent || ''
      if (txt.includes(':') || txt.includes('You') || txt.includes('Fog') || txt.includes('Bird') || txt.includes('Someone')) {
        if (s.getAttribute('contenteditable') !== 'false') {
          s.setAttribute('contenteditable', 'false')
          s.style.userSelect = 'none'
          s.style.webkitUserSelect = 'none'
          s.style.cursor = 'default'
        }
      }
    })
  }

  useEffect(() => {
    if (editorRef.current && editorRef.current.innerHTML !== note.body) {
      editorRef.current.innerHTML = note.body
      enforceNonEditableSpeakerTags()
    }
  }, [note.body, note.id])

  const handleInput = () => {
    if (editorRef.current) {
      const html = editorRef.current.innerHTML
      const firstH2 = editorRef.current.querySelector('h2')
      const title = firstH2?.textContent?.trim() || 'Untitled'
      onChange(note.id, { body: html, title, updatedAt: new Date() })
    }
  }

  const execCmd = (cmd: string, value?: string) => {
    document.execCommand(cmd, false, value)
    editorRef.current?.focus()
  }

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && editorRef.current) {
      editorRef.current.focus()
      const p = document.createElement('p')
      p.innerHTML = '<br>'
      editorRef.current.appendChild(p)
      const range = document.createRange()
      const sel = window.getSelection()
      range.selectNodeContents(p)
      range.collapse(true)
      sel?.removeAllRanges()
      sel?.addRange(range)
      handleInput()
    }
  }

  const currentCategory = note.category || 'Meeting'
  const categories: ConversationCategory[] = ['Standup', 'Meeting', 'Customer Interview', 'Brainstorming', '1-on-1']

  const handleToggleCategoryTag = (cat: ConversationCategory) => {
    const tagFormatted = `#${cat.toLowerCase().replace(/\s+/g, '-')}`
    const currentTags = Array.isArray(note.tags) && note.tags.length > 0
      ? note.tags
      : [note.category ? `#${note.category.toLowerCase().replace(/\s+/g, '-')}` : '#note']

    let updated: string[]
    if (currentTags.includes(tagFormatted)) {
      updated = currentTags.filter((t: string) => t !== tagFormatted)
      if (updated.length === 0) updated = ['#note']
    } else {
      updated = [...currentTags, tagFormatted]
    }
    onChange(note.id, { tags: updated, category: cat, updatedAt: new Date() })
  }

  const [playingSpeaker, setPlayingSpeaker] = useState<'mic' | 'system' | null>(null)

  const playAudioSample = (label: string, isMic: boolean) => {
    const target = isMic ? 'mic' : 'system'
    setPlayingSpeaker(target)

    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const text = `Voice audio sample for ${label}. Soniox AI diarization active.`
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.0
      utterance.pitch = isMic ? 1.25 : 0.85
      utterance.onend = () => setPlayingSpeaker(null)
      utterance.onerror = () => setPlayingSpeaker(null)
      window.speechSynthesis.speak(utterance)
    } else {
      setTimeout(() => setPlayingSpeaker(null), 2500)
    }
  }

  const handleUpdateSpeakerName = (target: 'mic' | 'system', newName: string) => {
    const oldName = target === 'mic' ? speakerNames.mic : speakerNames.system
    const trimmed = newName.trim()
    if (!trimmed || oldName === trimmed) return

    onUpdateSpeakerNames({ [target]: trimmed })

    // Auto-update all matching speaker tags (old name, Orange Fog, Blue Bird, Someone) in note content body HTML
    let updatedBody = note.body
    const namesToReplace = Array.from(new Set([oldName, 'Orange Fog 🍊', 'Blue Bird 🐦', 'Someone'])).filter(Boolean)

    namesToReplace.forEach(name => {
      const escaped = name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')
      const regex = new RegExp(`<strong[^>]*>\\s*${escaped}:?\\s*<\\/strong>`, 'gi')
      updatedBody = updatedBody.replace(regex, `<strong contenteditable="false" style="color: ${target === 'mic' ? '#2563eb' : '#059669'}; margin-right: 4px; user-select: none;">${trimmed}:</strong>`)
    })

    if (updatedBody !== note.body) {
      onChange(note.id, { body: updatedBody, updatedAt: new Date() })
    }
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--color-surface)', position: 'relative' }}>
      {/* Toolbar */}
      <div style={{ height: 44, borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 6, flexShrink: 0 }}>
        <ToolbarBtn title="Bold" onClick={() => execCmd('bold')}><Bold size={13} strokeWidth={2} /></ToolbarBtn>
        <ToolbarBtn title="Italic" onClick={() => execCmd('italic')}><Italic size={13} strokeWidth={2} /></ToolbarBtn>
        <ToolbarBtn title="Underline" onClick={() => execCmd('underline')}><Underline size={13} strokeWidth={2} /></ToolbarBtn>
        <div style={{ width: 1, height: 14, background: 'var(--color-border-strong)', margin: '0 3px' }} />
        <ToolbarBtn title="Heading" onClick={() => execCmd('formatBlock', 'h2')}><Heading2 size={14} strokeWidth={2} /></ToolbarBtn>
        <ToolbarBtn title="Bullet list" onClick={() => execCmd('insertUnorderedList')}><List size={14} strokeWidth={2} /></ToolbarBtn>
        <ToolbarBtn title="Numbered list" onClick={() => execCmd('insertOrderedList')}><ListOrdered size={14} strokeWidth={2} /></ToolbarBtn>
        <ToolbarBtn title="Blockquote" onClick={() => execCmd('formatBlock', 'blockquote')}><Quote size={13} strokeWidth={2} /></ToolbarBtn>

        <div style={{ flex: 1 }} />
        {onOpenGraph && (
          <button
            onClick={onOpenGraph}
            title="Open Workspace Knowledge Graph & RAG Explorer"
            style={{
              border: 'none',
              background: 'rgba(74,71,163,0.08)',
              color: 'var(--color-accent)',
              borderRadius: 6,
              padding: '4px 9px',
              fontSize: 11,
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              marginRight: 8,
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,71,163,0.15)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(74,71,163,0.08)')}
          >
            <Network size={13} strokeWidth={2} />
            <span>RAG Graph</span>
          </button>
        )}
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--color-text-faint)', marginRight: 10 }}>
          {fmt(note.updatedAt)}
        </span>
        {/* Delete */}
        <button onClick={() => onDelete(note.id)} style={{
          display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 6,
          border: 'none', background: 'transparent',
          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 500,
          color: '#E8443A', cursor: 'pointer', transition: 'background 0.1s',
        }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(232,68,58,0.07)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
        >
          <Trash2 size={12} strokeWidth={1.8} />
          Delete
        </button>
      </div>

      {/* Content Area */}
      <div
        onClick={handleContainerClick}
        style={{ flex: 1, overflowY: 'auto', padding: '20px 28px 16px 28px', boxSizing: 'border-box', cursor: 'text', display: 'flex', flexDirection: 'column', position: 'relative' }}
      >
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={handleInput}
          style={{ width: '100%', maxWidth: '100%', boxSizing: 'border-box', fontFamily: 'var(--font-body)', fontSize: 13.5, lineHeight: 1.7, color: 'var(--color-text)', minHeight: 200, outline: 'none', flex: 1 }}
        />

        {/* Bottom Bar in Content Area: Attachments on Left, Category Pills on Right */}
        <div style={{ marginTop: 'auto', paddingTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <AttachmentStackButton note={note} onAddAttachment={(att) => {
            onChange(note.id, {
              attachments: [...(note.attachments || SAMPLE_ATTACHMENTS), att]
            })
          }} />

          {/* Tags List & Add Tag Input at Bottom Right of Content */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
            <Tag size={12} style={{ color: 'var(--color-text-faint)', marginRight: 2 }} />

            {/* Active Attached Tags */}
            {(Array.isArray(note.tags) && note.tags.length > 0
              ? note.tags
              : [note.category ? `#${note.category.toLowerCase().replace(/\s+/g, '-')}` : '#meeting']
            ).map((tagStr, idx) => (
              <span
                key={idx}
                style={{
                  fontSize: 10, fontFamily: 'monospace', color: 'var(--color-accent)', fontWeight: 600,
                  background: 'var(--color-accent-light)', padding: '2px 6px', borderRadius: 4,
                  display: 'inline-flex', alignItems: 'center', gap: 3
                }}
              >
                {tagStr}
                <button
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRemoveCustomNoteTag(tagStr)
                  }}
                  style={{ border: 'none', background: 'transparent', color: 'var(--color-accent)', cursor: 'pointer', fontSize: 11, padding: 0 }}
                >
                  ×
                </button>
              </span>
            ))}

            {/* Type to Add New Custom Tag (Type & Press Enter with Autocomplete Dropdown) */}
            {showAddTagInput ? (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', marginLeft: 2 }} onClick={e => e.stopPropagation()}>
                <input
                  type="text"
                  value={newNoteTagInput}
                  onChange={e => setNewNoteTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleAddCustomNoteTag()
                    if (e.key === 'Escape') setShowAddTagInput(false)
                  }}
                  onBlur={() => {
                    setTimeout(() => {
                      if (newNoteTagInput.trim()) handleAddCustomNoteTag()
                      else setShowAddTagInput(false)
                    }, 150)
                  }}
                  placeholder="#tag (type & enter)..."
                  style={{
                    padding: '2px 6px', fontSize: 10.5, borderRadius: 4,
                    border: '1px solid var(--color-accent)', outline: 'none',
                    background: 'var(--color-background)', color: 'var(--color-text)', width: 135,
                  }}
                  autoFocus
                />

                {/* Autocomplete Dropdown List Popover */}
                {filteredTagSuggestions.length > 0 && (
                  <div style={{
                    position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, width: 160,
                    background: 'var(--color-surface)', border: '1px solid var(--color-border)',
                    borderRadius: 6, boxShadow: '0 8px 24px rgba(0,0,0,0.22)', padding: 4,
                    zIndex: 100, display: 'flex', flexDirection: 'column', gap: 2,
                  }}>
                    <div style={{ fontSize: 9, color: 'var(--color-text-faint)', padding: '2px 6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Suggested Tags
                    </div>
                    {filteredTagSuggestions.map((sug, i) => (
                      <div
                        key={i}
                        onMouseDown={(e) => {
                          e.preventDefault()
                          handleAddCustomNoteTag(sug)
                        }}
                        style={{
                          padding: '3.5px 7px', fontSize: 10.5, fontFamily: 'monospace',
                          borderRadius: 4, cursor: 'pointer', color: 'var(--color-accent)',
                          background: 'transparent', transition: 'background 0.1s',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--color-accent-light)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>{sug}</span>
                        <span style={{ fontSize: 9, opacity: 0.6 }}>↵</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  setShowAddTagInput(true)
                }}
                style={{
                  border: '1px dashed var(--color-border)', background: 'transparent',
                  color: 'var(--color-text-muted)', borderRadius: 4, padding: '2px 6px',
                  fontSize: 10.5, fontFamily: 'var(--font-body)', fontWeight: 500, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 3, marginLeft: 2
                }}
              >
                <Plus size={10} /> Tag
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 40% Screen Conversation Analysis & Insights Collapsible Drawer */}
      <div style={{
        height: dashboardOpen ? '40vh' : 38,
        minHeight: dashboardOpen ? 230 : 38,
        background: 'var(--color-surface)',
        borderTop: '1px solid var(--color-border)',
        display: 'flex',
        flexDirection: 'column',
        boxSizing: 'border-box',
        overflow: 'hidden',
        flexShrink: 0,
        transition: 'height 0.22s ease-in-out, min-height 0.22s ease-in-out',
      }}>
        {/* Dashboard Drawer Header */}
        <div
          onClick={() => setDashboardOpen(o => !o)}
          title={dashboardOpen ? 'Click to collapse Analysis Drawer' : 'Click to expand Analysis Drawer'}
          style={{
            height: 38, padding: '0 20px', display: 'flex', alignItems: 'center', gap: 8,
            borderBottom: dashboardOpen ? '1px solid var(--color-border)' : 'none',
            background: 'rgba(0,0,0,0.02)', flexShrink: 0, cursor: 'pointer',
            userSelect: 'none',
          }}
        >
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, color: 'var(--color-text)', flex: 1 }}>
            {currentCategory} Analysis & Insights
          </span>
          <button
            onClick={(e) => { e.stopPropagation(); setDashboardOpen(o => !o) }}
            style={{ border: 'none', background: 'transparent', padding: 0, color: 'var(--color-text-faint)', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
          >
            {dashboardOpen ? <ChevronDown size={14} strokeWidth={2} /> : <ChevronUp size={14} strokeWidth={2} />}
          </button>
        </div>

        {/* Dashboard Columns */}
        {dashboardOpen && (
          <div style={{ flex: 1, padding: '12px 20px', overflow: 'hidden', minHeight: 0, display: 'grid', gridTemplateColumns: '1.25fr 1fr', gap: 16 }}>
            {/* Column 1: Live Meeting Q&A */}
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, gap: 6 }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                Live Meeting Q&A
              </div>

              {/* Quick Prompt Suggestions */}
              <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap', flexShrink: 0 }}>
                {[
                  'What are they discussing?',
                  'Summarize current topic',
                  'Key action items?'
                ].map(chip => (
                  <button
                    key={chip}
                    onClick={() => handleAskCol1WithText(chip)}
                    style={{
                      border: 'none',
                      background: 'rgba(74,71,163,0.07)',
                      color: 'var(--color-accent)',
                      borderRadius: 4,
                      padding: '2px 6px',
                      fontSize: 9.5,
                      fontWeight: 500,
                      cursor: 'pointer',
                    }}
                  >
                    {chip}
                  </button>
                ))}
              </div>

              {/* Real-time Conversation Q&A Stream */}
              <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, paddingRight: 4, minHeight: 0 }}>
                {qaList.length === 0 ? (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--color-text-faint)', padding: 12, textAlign: 'center' }}>
                    <MessageSquare size={22} style={{ opacity: 0.6 }} />
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text)' }}>Ask AI in Real-Time</div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>Ask AI what speakers are talking about or click a suggestion above</div>
                  </div>
                ) : (
                  qaList.map((qa, i) => (
                    <div key={i} style={{ background: 'rgba(0,0,0,0.025)', borderRadius: 7, padding: '7px 9px', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-accent)' }}>Q: {qa.question}</div>
                      <div style={{ fontSize: 10.5, color: 'var(--color-text)', lineHeight: 1.45, paddingLeft: 6, borderLeft: '2px solid var(--color-accent-light)' }}>
                        <FormattedMarkdown content={qa.answer || ''} />
                      </div>
                      {qa.sources && qa.sources.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap', marginTop: 3, paddingTop: 3, borderTop: '1px dashed var(--color-border)' }}>
                          <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--color-accent)', display: 'flex', alignItems: 'center', gap: 2 }}>
                            <Sparkles size={8} /> RAG Context:
                          </span>
                          {qa.sources.map(src => (
                            <span key={src.id} style={{ fontSize: 8.5, fontFamily: 'monospace', background: 'rgba(74,71,163,0.08)', color: 'var(--color-accent)', padding: '1px 4px', borderRadius: 3, fontWeight: 500 }}>
                              #{src.title}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Prominent Always-Visible Real-Time Input Box */}
              <div style={{ flexShrink: 0, paddingTop: 4, borderTop: '1px solid var(--color-border)' }}>
                <div style={{ display: 'flex', gap: 5, alignItems: 'center', background: 'rgba(0,0,0,0.045)', borderRadius: 8, padding: '5px 6px 5px 10px' }}>
                  <input
                    type="text"
                    value={col1Input}
                    onChange={e => setCol1Input(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') handleAskCol1WithText(col1Input) }}
                    placeholder="Ask AI what they are saying right now..."
                    style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 11.5, fontFamily: 'var(--font-body)', outline: 'none', color: 'var(--color-text)' }}
                  />
                  <button
                    onClick={() => handleAskCol1WithText(col1Input)}
                    disabled={!col1Input.trim() || askingCol1}
                    style={{
                      border: 'none',
                      background: col1Input.trim() ? 'var(--color-accent)' : 'rgba(0,0,0,0.12)',
                      color: col1Input.trim() ? '#ffffff' : 'var(--color-text-faint)',
                      borderRadius: 6,
                      padding: '4px 10px',
                      fontSize: 11,
                      fontWeight: 600,
                      cursor: col1Input.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <Send size={11} />
                    <span>{askingCol1 ? '…' : 'Ask'}</span>
                  </button>
                </div>
              </div>
            </div>

            {/* Column 3: Speaker & Voice Mapping */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderLeft: '1px solid var(--color-border)', paddingLeft: 16, overflowY: 'auto', minHeight: 0, height: '100%' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <UserCheck size={11} style={{ color: '#059669' }} /> Speakers
                  </div>
                  <button
                    onClick={onResetSpeakerNames}
                    title="Reset speaker names to default"
                    style={{ border: 'none', background: 'transparent', color: 'var(--color-text-faint)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
                    onMouseEnter={e => (e.currentTarget.style.color = 'var(--color-text)')}
                    onMouseLeave={e => (e.currentTarget.style.color = 'var(--color-text-faint)')}
                  >
                    <RotateCcw size={10} /> Reset
                  </button>
                </div>

                {/* Voice Cards */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {/* Voice 1: You (Mic) */}
                  <div style={{
                    background: playingSpeaker === 'mic' ? 'rgba(37,99,235,0.09)' : 'rgba(37,99,235,0.04)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(37,99,235,0.18)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: '#2563eb' }}>You (Mata)</span>
                      <span style={{ fontSize: 9.5, color: 'var(--color-text-faint)' }}>(Microphone)</span>
                    </div>
                    <button
                      onClick={() => playAudioSample('You', true)}
                      title="Play Voice Audio Sample"
                      style={{
                        border: 'none',
                        background: playingSpeaker === 'mic' ? '#2563eb' : 'rgba(37,99,235,0.12)',
                        color: playingSpeaker === 'mic' ? '#ffffff' : '#2563eb',
                        borderRadius: 12,
                        padding: '2px 8px',
                        fontSize: 9.5,
                        fontWeight: 600,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      <Volume2 size={10} />
                      <span>{playingSpeaker === 'mic' ? 'Playing…' : 'Sample'}</span>
                    </button>
                  </div>

                  {/* Voice 2: Detected Voice -> Assigned Speaker */}
                  <div style={{
                    background: playingSpeaker === 'system' ? 'rgba(5,150,105,0.09)' : 'rgba(5,150,105,0.04)',
                    padding: '8px 10px',
                    borderRadius: 8,
                    border: '1px solid rgba(5,150,105,0.18)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: '#059669' }}>{speakerNames.system}</span>
                        {!editingSpeaker && (
                          <button
                            onClick={() => setEditingSpeaker(true)}
                            style={{ border: 'none', background: 'transparent', color: 'var(--color-text-faint)', cursor: 'pointer', padding: 0 }}
                            title="Type custom name"
                          >
                            <Edit2 size={10} />
                          </button>
                        )}
                      </div>

                      <button
                        onClick={() => playAudioSample(speakerNames.system, false)}
                        title="Play Voice Audio Sample"
                        style={{
                          border: 'none',
                          background: playingSpeaker === 'system' ? '#059669' : 'rgba(5,150,105,0.12)',
                          color: playingSpeaker === 'system' ? '#ffffff' : '#059669',
                          borderRadius: 12,
                          padding: '2px 8px',
                          fontSize: 9.5,
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        <Volume2 size={10} />
                        <span>{playingSpeaker === 'system' ? 'Playing…' : 'Sample'}</span>
                      </button>
                    </div>

                    {editingSpeaker ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <input
                          type="text"
                          value={systemNameInput}
                          onChange={e => setSystemNameInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              handleUpdateSpeakerName('system', systemNameInput)
                              setEditingSpeaker(false)
                            }
                          }}
                          placeholder="Type real speaker name"
                          style={{ flex: 1, fontSize: 10, padding: '2px 6px', borderRadius: 4, border: '1px solid var(--color-border)', outline: 'none' }}
                          autoFocus
                        />
                        <button
                          onClick={() => {
                            handleUpdateSpeakerName('system', systemNameInput)
                            setEditingSpeaker(false)
                          }}
                          style={{ border: 'none', background: 'var(--color-accent)', color: 'white', fontSize: 10, borderRadius: 4, padding: '2px 6px', cursor: 'pointer' }}
                        >
                          Save
                        </button>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                        {teamMembers && teamMembers.length > 0 ? (
                          teamMembers.map(sug => (
                            <button
                              key={sug.name}
                              onClick={() => handleUpdateSpeakerName('system', `${sug.name} ${sug.emoji || '👤'}`)}
                              style={{
                                border: 'none',
                                background: speakerNames.system === `${sug.name} ${sug.emoji || '👤'}` ? '#059669' : 'rgba(5,150,105,0.12)',
                                color: speakerNames.system === `${sug.name} ${sug.emoji || '👤'}` ? '#ffffff' : '#047857',
                                borderRadius: 4,
                                padding: '2px 6px',
                                fontSize: 9.5,
                                fontFamily: 'var(--font-body)',
                                fontWeight: 500,
                                cursor: 'pointer',
                                transition: 'all 0.12s ease',
                              }}
                            >
                              + {sug.name}
                            </button>
                          ))
                        ) : (
                          <span style={{ fontSize: 9.5, color: 'var(--color-text-faint)' }}>
                            No team members added. Add in Settings ⚙️
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 4 }}>Detected Topics</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {['#retention', '#pgbouncer', '#onboarding-value', '#ltv-metric'].map(tag => (
                    <span key={tag} style={{ fontSize: 10, fontFamily: 'monospace', background: 'var(--color-accent-light)', color: 'var(--color-accent)', padding: '2px 6px', borderRadius: 4, fontWeight: 500 }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function ToolbarBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) {
  return (
    <button onClick={onClick} title={title} style={{ width: 28, height: 28, border: 'none', background: 'transparent', borderRadius: 6, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-muted)', transition: 'background 0.1s, color 0.1s' }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.06)'; e.currentTarget.style.color = 'var(--color-text)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--color-text-muted)' }}
    >
      {children}
    </button>
  )
}

const EDITOR_STYLE = `
  [contenteditable] { outline: none; cursor: text; min-height: 100%; }
  [contenteditable] h2 { font-family:var(--font-body);font-weight:600;color:var(--color-text);letter-spacing:-0.02em;margin:0 0 0.4em;line-height:1.3;font-size:1.45em;min-height:1.3em;cursor:text; }
  [contenteditable] h2:first-child { margin-top:0; }
  [contenteditable] p { margin:0 0 0.65em;min-height:1.5em;cursor:text; }
  [contenteditable] p:empty::before, [contenteditable] div:empty::before { content: "\\u200B"; }
  [contenteditable] ul,[contenteditable] ol { padding-left:1.5em;margin:0 0 0.75em; }
  [contenteditable] li { margin-bottom:0.25em;cursor:text; }
  [contenteditable] blockquote { border-left:3px solid var(--color-accent);margin:1em 0;padding:0.4em 1em;color:var(--color-text-muted);font-style:italic;background:var(--color-accent-light);border-radius:0 6px 6px 0;cursor:text; }
  [contenteditable] strong { font-weight:600; }
  [contenteditable] em { font-style:italic; }
`

// ── Settings Modal ────────────────────────────────────────────────────────
interface SettingsData {
  username: string
  language: string
  translationLanguage: string
  teamMembers: { name: string; role: string; emoji: string }[]
}

function SettingsModal({
  settings,
  onSaveSettings,
  onClose
}: {
  settings: SettingsData
  onSaveSettings: (newSettings: SettingsData) => void
  onClose: () => void
}) {
  const [activeTab, setActiveTab] = useState<'profile' | 'language' | 'people' | 'ai'>('profile')
  const [username, setUsername] = useState(settings.username)
  const [language, setLanguage] = useState(settings.language)
  const [translationLanguage, setTranslationLanguage] = useState(settings.translationLanguage || 'vi-VN')
  const [team, setTeam] = useState(settings.teamMembers)
  const [newMemberName, setNewMemberName] = useState('')
  const [newMemberRole, setNewMemberRole] = useState('')

  const handleAddMember = () => {
    if (!newMemberName.trim()) return
    setTeam(prev => [...prev, { name: newMemberName.trim(), role: newMemberRole.trim() || 'Team Member', emoji: '👤' }])
    setNewMemberName('')
    setNewMemberRole('')
  }

  const handleRemoveMember = (idx: number) => {
    setTeam(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSave = () => {
    onSaveSettings({ username, language, translationLanguage, teamMembers: team })
    onClose()
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 540, background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.24)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '85vh' }}>
        {/* Header */}
        <div style={{ height: 48, padding: '0 20px', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(0,0,0,0.02)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Settings size={16} style={{ color: 'var(--color-accent)' }} />
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text)' }}>Settings</span>
          </div>
          <button onClick={onClose} style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--color-text-faint)' }}><X size={16} /></button>
        </div>

        {/* Content Tabs Body */}
        <div style={{ display: 'flex', flex: 1, minHeight: 340 }}>
          {/* Left Navigation */}
          <div style={{ width: 140, borderRight: '1px solid var(--color-border)', padding: '12px 8px', display: 'flex', flexDirection: 'column', gap: 3, background: 'rgba(0,0,0,0.015)' }}>
            <button onClick={() => setActiveTab('profile')} style={{ border: 'none', background: activeTab === 'profile' ? 'var(--color-accent-light)' : 'transparent', color: activeTab === 'profile' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <User size={13} /> Profile
            </button>
            <button onClick={() => setActiveTab('language')} style={{ border: 'none', background: activeTab === 'language' ? 'var(--color-accent-light)' : 'transparent', color: activeTab === 'language' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Globe size={13} /> Language
            </button>
            <button onClick={() => setActiveTab('people')} style={{ border: 'none', background: activeTab === 'people' ? 'var(--color-accent-light)' : 'transparent', color: activeTab === 'people' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={13} /> People & Team
            </button>
            <button onClick={() => setActiveTab('ai')} style={{ border: 'none', background: activeTab === 'ai' ? 'var(--color-accent-light)' : 'transparent', color: activeTab === 'ai' ? 'var(--color-accent)' : 'var(--color-text-muted)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontWeight: 500, textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Sparkles size={13} /> Soniox AI
            </button>
          </div>

          {/* Right Panel View */}
          <div style={{ flex: 1, padding: 20, overflowY: 'auto' }}>
            {activeTab === 'profile' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 5 }}>Your Name</label>
                  <input type="text" value={username} onChange={e => setUsername(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', outline: 'none', fontSize: 13 }} />
                  <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>Used as your default speaker label: You ({username || 'User'}).</p>
                </div>
              </div>
            )}

            {activeTab === 'language' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 5 }}>Speech Recognition Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', outline: 'none', fontSize: 13, background: 'var(--color-surface)' }}>
                    <option value="en-US">English (United States)</option>
                    <option value="vi-VN">Vietnamese (Tiếng Việt)</option>
                    <option value="ja-JP">Japanese (日本語)</option>
                    <option value="fr-FR">French (Français)</option>
                    <option value="es-ES">Spanish (Español)</option>
                  </select>
                  <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>Used by Soniox AI for live voice input recognition.</p>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)', display: 'block', marginBottom: 5 }}>Preference Translation Language</label>
                  <select value={translationLanguage} onChange={e => setTranslationLanguage(e.target.value)} style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', outline: 'none', fontSize: 13, background: 'var(--color-surface)' }}>
                    <option value="vi-VN">Vietnamese (Tiếng Việt)</option>
                    <option value="en-US">English (United States)</option>
                    <option value="ja-JP">Japanese (日本語)</option>
                    <option value="fr-FR">French (Français)</option>
                    <option value="es-ES">Spanish (Español)</option>
                    <option value="de-DE">German (Deutsch)</option>
                    <option value="ko-KR">Korean (한국어)</option>
                    <option value="zh-CN">Chinese (Simplified 简体中文)</option>
                  </select>
                  <p style={{ fontSize: 11, color: 'var(--color-text-faint)', marginTop: 4 }}>Target language for real-time AI translation, meeting summaries, and Q&A responses.</p>
                </div>
              </div>
            )}

            {activeTab === 'people' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text)' }}>Suggested Call Attendees</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 160, overflowY: 'auto' }}>
                  {team.map((m, idx) => (
                    <div key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'rgba(0,0,0,0.02)' }}>
                      <div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--color-text)' }}>{m.emoji} {m.name}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--color-text-faint)', marginLeft: 6 }}>({m.role})</span>
                      </div>
                      <button onClick={() => handleRemoveMember(idx)} style={{ border: 'none', background: 'transparent', color: '#E8443A', cursor: 'pointer', padding: 2 }}><Trash2 size={12} /></button>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input type="text" value={newMemberName} onChange={e => setNewMemberName(e.target.value)} placeholder="Member Name" style={{ flex: 1, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--color-border)', fontSize: 11.5 }} />
                  <input type="text" value={newMemberRole} onChange={e => setNewMemberRole(e.target.value)} placeholder="Role (e.g. PM)" style={{ width: 90, padding: '5px 8px', borderRadius: 5, border: '1px solid var(--color-border)', fontSize: 11.5 }} />
                  <button onClick={handleAddMember} style={{ border: 'none', background: 'var(--color-accent)', color: 'white', borderRadius: 5, padding: '0 10px', fontSize: 11, fontWeight: 500, cursor: 'pointer' }}>Add</button>
                </div>
              </div>
            )}

            {activeTab === 'ai' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ padding: 12, borderRadius: 8, background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.18)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: '#2563EB', marginBottom: 2 }}>Soniox AI Engine Active</div>
                  <p style={{ margin: 0, fontSize: 11, color: 'var(--color-text-muted)', lineHeight: 1.4 }}>Connected using SONIOX_API_KEY with speaker diarization enabled.</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{ height: 48, padding: '0 20px', borderTop: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, background: 'rgba(0,0,0,0.02)' }}>
          <button onClick={onClose} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'transparent', fontSize: 12, cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleSave} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: 'var(--color-accent)', color: 'white', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>Save Settings</button>
        </div>
      </div>
    </div>
  )
}

// ── App ────────────────────────────────────────────────────────────────────
export default function App() {
  const [notes, setNotes] = useState<Note[]>(SAMPLE_NOTES)
  const [activeId, setActiveId] = useState(SAMPLE_NOTES[0].id)
  const [search, setSearch] = useState('')
  const [showChat, setShowChat] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const isGraphUrl = () => {
    if (typeof window === 'undefined') return false
    const p = window.location.pathname.toLowerCase()
    const h = window.location.hash.toLowerCase()
    return p.includes('graph') || h.includes('graph')
  }

  const [currentView, setCurrentView] = useState<'editor' | 'graph'>(() => {
    return isGraphUrl() ? 'graph' : 'editor'
  })

  // Route listener for standalone external page navigation (/graph or #/graph)
  useEffect(() => {
    const handleUrlChange = () => {
      if (isGraphUrl()) {
        setCurrentView('graph')
      } else {
        setCurrentView('editor')
      }
    }
    window.addEventListener('hashchange', handleUrlChange)
    window.addEventListener('popstate', handleUrlChange)
    return () => {
      window.removeEventListener('hashchange', handleUrlChange)
      window.removeEventListener('popstate', handleUrlChange)
    }
  }, [])
  const [session, setSession] = useState<any>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [userSettings, setUserSettings] = useState<SettingsData>({
    username: 'User',
    language: 'en-US',
    translationLanguage: 'vi-VN',
    teamMembers: []
  })
  const [isRecording, setIsRecording] = useState(false)
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([])
  const [pipWindow, setPipWindow] = useState<Window | null>(null)
  const [speakerNames, setSpeakerNames] = useState<{ mic: string; system: string }>({ mic: 'You (Mata)', system: 'Orange Fog 🍊' })

  // Track Supabase Auth session
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      if (session?.user) {
        setShowAuthModal(false)
        const username = session.user.user_metadata?.username || session.user.email?.split('@')[0] || 'User'
        setUserSettings(prev => ({ ...prev, username }))
        setSpeakerNames(prev => ({ ...prev, mic: `You (${username})` }))
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Load real notes from Database when user logs in
  useEffect(() => {
    if (!session?.user?.id) return
    const userId = session.user.id
    fetchUserNotesFromDb(userId).then(dbNotes => {
      if (dbNotes.length > 0) {
        setNotes(dbNotes)
        setActiveId(dbNotes[0].id)
      } else {
        createNoteInDb(userId, {
          title: 'Welcome to your Workspace',
          body: '<h2>Welcome to your Workspace</h2><p>This is your personal note. Type # to tag topics, @ to tag speakers, or drag & drop files to attach!</p>',
          emoji: '✨',
          category: 'Meeting',
        }).then(newNote => {
          if (newNote) {
            setNotes([newNote])
            setActiveId(newNote.id)
          }
        })
      }
    })
  }, [session?.user?.id])

  const handleSaveSettings = (newSettings: SettingsData) => {
    setUserSettings(newSettings)
    setSpeakerNames(prev => ({
      ...prev,
      mic: `You (${newSettings.username || 'User'})`
    }))
  }

  const updateSpeakerNames = useCallback((updates: Partial<{ mic: string; system: string }>) => {
    setSpeakerNames(prev => ({ ...prev, ...updates }))
  }, [])

  const resetSpeakerNames = useCallback(() => {
    setSpeakerNames({ mic: 'You (Mata)', system: 'Orange Fog 🍊' })
  }, [])

  const transcriptSegIdx = useRef(0)
  const transcriptTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const speechRecRef = useRef<any>(null)

  const isPiPSupported = useMemo(() => typeof window !== 'undefined' && 'documentPictureInPicture' in window, [])

  const activeNote = notes.find(n => n.id === activeId) ?? notes[0]

  const updateNote = useCallback((id: string, updates: Partial<Note>) => {
    setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n))
    updateNoteInDb(id, updates).catch(err => console.warn('DB note update fallback:', err))
  }, [])

  const newNote = useCallback(() => {
    if (session?.user?.id) {
      createNoteInDb(session.user.id, {
        title: 'Untitled Note',
        body: '<h2>Untitled Note</h2><p></p>',
        emoji: '📝',
        category: 'Meeting',
      }).then(n => {
        if (n) {
          setNotes(prev => [n, ...prev])
          setActiveId(n.id)
        }
      })
    } else {
      const id = String(Date.now())
      setNotes(prev => [{ id, title: 'Untitled', body: '<h2>Untitled</h2><p></p>', updatedAt: new Date(), emoji: '📝', category: 'Meeting' }, ...prev])
      setActiveId(id)
    }
  }, [session?.user?.id])

  const deleteNote = useCallback((id: string) => {
    setNotes(prev => {
      const remaining = prev.filter(n => n.id !== id)
      if (remaining.length > 0) setActiveId(remaining[0].id)
      return remaining
    })
    deleteNoteFromDb(id).catch(err => console.warn('DB note delete fallback:', err))
  }, [])

  const insertedLineIds = useRef<Set<string>>(new Set())
  const recordingStartRef = useRef<number>(0)

  // Automatically insert finalized transcript lines into the currently active note
  useEffect(() => {
    if (!isRecording) {
      insertedLineIds.current.clear()
      return
    }

    const newFinalLines = transcriptLines.filter(l => l.final && !insertedLineIds.current.has(l.id))
    if (newFinalLines.length > 0) {
      newFinalLines.forEach(l => insertedLineIds.current.add(l.id))
      const formattedHtml = newFinalLines.map(l => {
        const label = l.source === 'mic' ? speakerNames.mic : speakerNames.system
        const labelColor = l.source === 'mic' ? '#2563eb' : '#059669'
        const timeTag = l.timeRange ? `<span style="font-size: 12px; color: #888; margin-right: 6px;">[${l.timeRange}]</span>` : ''
        return `<p><strong style="color: ${labelColor}; margin-right: 4px;">${label}:</strong> ${timeTag}${l.text}</p>`
      }).join('')

      updateNote(activeNote.id, {
        body: activeNote.body.includes('</h2>')
          ? activeNote.body.replace('</h2>', '</h2>' + formattedHtml)
          : formattedHtml + activeNote.body,
        updatedAt: new Date()
      })
    }
  }, [transcriptLines, isRecording, activeNote, updateNote, speakerNames])

  const togglePiP = useCallback(async () => {
    if (pipWindow) {
      pipWindow.close()
      setPipWindow(null)
      return
    }

    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window) {
      try {
        const pipWin = await (window as any).documentPictureInPicture.requestWindow({
          width: 270,
          height: 85,
        })

        Array.from(document.styleSheets).forEach(styleSheet => {
          try {
            if (styleSheet.cssRules) {
              const newStyleEl = document.createElement('style')
              Array.from(styleSheet.cssRules).forEach(rule => {
                newStyleEl.appendChild(document.createTextNode(rule.cssText))
              })
              pipWin.document.head.appendChild(newStyleEl)
            } else if (styleSheet.href) {
              const newLinkEl = document.createElement('link')
              newLinkEl.rel = 'stylesheet'
              newLinkEl.href = styleSheet.href
              pipWin.document.head.appendChild(newLinkEl)
            }
          } catch (e) {
            if (styleSheet.href) {
              const newLinkEl = document.createElement('link')
              newLinkEl.rel = 'stylesheet'
              newLinkEl.href = styleSheet.href
              pipWin.document.head.appendChild(newLinkEl)
            }
          }
        })

        const container = pipWin.document.createElement('div')
        container.id = 'pip-transcription-root'
        pipWin.document.body.appendChild(container)
        pipWin.document.body.style.margin = '0'
        pipWin.document.body.style.padding = '6px'
        pipWin.document.body.style.background = '#141311'
        pipWin.document.body.style.display = 'flex'
        pipWin.document.body.style.alignItems = 'center'
        pipWin.document.body.style.justifyContent = 'center'
        pipWin.document.body.style.height = '100vh'
        pipWin.document.body.style.boxSizing = 'border-box'

        pipWin.addEventListener('pagehide', () => {
          setPipWindow(null)
        })

        setPipWindow(pipWin)
      } catch (err) {
        console.error('Failed to open Document Picture-in-Picture window:', err)
      }
    }
  }, [pipWindow])

  const isRecordingRef = useRef(isRecording)
  useEffect(() => {
    isRecordingRef.current = isRecording
  }, [isRecording])

  const insertedIdsRef = useRef<Set<string>>(new Set())

  const addNextLine = useCallback(() => {
    if (!isRecordingRef.current) return
    const item = TRANSCRIPT_SEGMENTS[transcriptSegIdx.current % TRANSCRIPT_SEGMENTS.length]
    transcriptSegIdx.current++
    const id = String(Date.now())
    const source: 'mic' | 'system' = item.source || 'mic'
    const text = item.text.replace(/^System\s+Audio:\s*/i, '')
    const elapsedSec = Math.floor((Date.now() - (recordingStartRef.current || Date.now())) / 1000)
    const timeRange = formatTimeRange(elapsedSec, 6)
    // Prepend newest line to TOP of array with progressive typing for longer sentence
    setTranscriptLines(prev => [{ id, text: text.slice(0, Math.ceil(text.length * 0.35)), final: false, source, timeRange }, ...prev.slice(0, 12)])
    setTimeout(() => setTranscriptLines(prev => prev.map(l => l.id === id ? { ...l, text, final: true } : l)), 1400)
    // Wait longer (5.5s to 8.5s) to accumulate longer complete sentences before emitting next transcript
    if (isRecordingRef.current) {
      transcriptTimer.current = setTimeout(addNextLine, 5500 + Math.random() * 3000)
    }
  }, [])

  // Auto-insert completed transcript line into active note at the TOP (after title)
  useEffect(() => {
    if (!isRecording) return
    const completed = transcriptLines.find(l => l.final && !insertedIdsRef.current.has(l.id))
    if (!completed) return

    insertedIdsRef.current.add(completed.id)
    const isYou = completed.source === 'mic'
    const label = isYou ? speakerNames.mic : speakerNames.system
    const color = isYou ? '#2563eb' : '#059669'
    const timeTag = completed.timeRange ? `<span style="font-size: 12px; color: #888; margin-right: 6px;">[${completed.timeRange}]</span>` : ''

    const p = `<p><strong style="color: ${color}; margin-right: 4px;">${label}:</strong> ${timeTag}${completed.text}</p>`

    updateNote(activeNote.id, {
      body: activeNote.body.includes('</h2>')
        ? activeNote.body.replace('</h2>', '</h2>' + p)
        : p + activeNote.body,
      updatedAt: new Date()
    })
  }, [transcriptLines, isRecording, activeNote, updateNote, speakerNames])

  // Web Speech API + Continuous Recording Loop across PiP/Minimize
  useEffect(() => {
    if (isRecording) {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      if (SpeechRec) {
        try {
          const rec = new SpeechRec()
          rec.continuous = true
          rec.interimResults = true
          rec.lang = 'en-US'

          rec.onresult = (e: any) => {
            for (let i = e.resultIndex; i < e.results.length; i++) {
              const text = e.results[i][0].transcript
              const isFinal = e.results[i].isFinal
              const id = 'speech-' + i
              setTranscriptLines(prev => {
                const idx = prev.findIndex(l => l.id === id)
                if (idx !== -1) {
                  const updated = [...prev]
                  updated[idx] = { id, text, final: isFinal, source: 'mic' }
                  return updated
                }
                return [{ id, text: text, final: isFinal, source: 'mic' }, ...prev.slice(0, 12)]
              })
            }
          }

          rec.onend = () => {
            if (isRecordingRef.current) {
              try { rec.start() } catch (e) { }
            }
          }

          rec.start()
          speechRecRef.current = rec
        } catch (e) {
          console.warn('Speech recognition fallback:', e)
        }
      }
      transcriptTimer.current = setTimeout(addNextLine, 800)
    } else {
      if (transcriptTimer.current) clearTimeout(transcriptTimer.current)
      if (speechRecRef.current) {
        try { speechRecRef.current.stop() } catch (e) { }
        speechRecRef.current = null
      }
    }
    return () => {
      if (transcriptTimer.current) clearTimeout(transcriptTimer.current)
      if (speechRecRef.current) {
        try { speechRecRef.current.stop() } catch (e) { }
        speechRecRef.current = null
      }
    }
  }, [isRecording, addNextLine])

  // Activate PiP ONLY when leaving the page/tab, close when returning
  useEffect(() => {
    if (!isRecording) return

    const handleVisibilityChange = async () => {
      if (document.hidden) {
        if (!pipWindow && isPiPSupported) {
          togglePiP()
        }
      } else {
        if (pipWindow) {
          pipWindow.close()
          setPipWindow(null)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [isRecording, pipWindow, isPiPSupported, togglePiP])

  const toggleRecording = useCallback(() => {
    setIsRecording(r => {
      const next = !r
      if (next) {
        recordingStartRef.current = Date.now()
        setTranscriptLines([])
      } else {
        if (pipWindow) {
          pipWindow.close()
          setPipWindow(null)
        }
      }
      return next
    })
  }, [pipWindow])

  const handleMinimizePiP = useCallback(() => {
    if (pipWindow) {
      pipWindow.close()
      setPipWindow(null)
    }
  }, [pipWindow])

  const widgetContent = (
    <TranscriptionWidget
      lines={transcriptLines}
      isRecording={isRecording}
      onToggle={toggleRecording}
      pipWindow={pipWindow}
      onMinimize={handleMinimizePiP}
    />
  )

  if (currentView === 'graph') {
    return (
      <KnowledgeGraphPage
        notes={notes}
        activeId={activeId}
        onSelectNote={(id) => {
          setActiveId(id)
          setCurrentView('editor')
          if (window.location.hash) window.location.hash = ''
        }}
        onBackToNotes={() => {
          setCurrentView('editor')
          if (window.location.hash) window.location.hash = ''
        }}
      />
    )
  }

  return (
    <>
      <style>{EDITOR_STYLE}</style>
      <div style={{ width: '100vw', height: '100vh', display: 'flex', overflow: 'hidden', background: 'var(--color-background)' }}>
        <Sidebar
          notes={notes}
          activeId={activeId}
          onSelect={setActiveId}
          onNew={newNote}
          isRecording={isRecording}
          onToggleRecording={toggleRecording}
          search={search}
          onSearch={setSearch}
          onOpenSettings={() => setShowSettings(true)}
          currentView={currentView}
          onViewChange={setCurrentView}
          onOpenAuth={() => setShowAuthModal(true)}
        />
        <Editor
          note={activeNote}
          onChange={updateNote}
          onDelete={deleteNote}
          showChat={showChat}
          onToggleChat={() => setShowChat(v => !v)}
          speakerNames={speakerNames}
          onUpdateSpeakerNames={updateSpeakerNames}
          onResetSpeakerNames={resetSpeakerNames}
          teamMembers={userSettings.teamMembers}
          translationLanguage={userSettings.translationLanguage}
          allNotes={notes}
          onOpenGraph={() => setCurrentView('graph')}
        />
        {showChat && (
          <ChatPanel
            notes={notes}
            activeNote={activeNote}
            onSelectNote={setActiveId}
            onClose={() => setShowChat(false)}
            onAddAttachment={(att) => {
              updateNote(activeNote.id, {
                attachments: [...(activeNote.attachments || SAMPLE_ATTACHMENTS), att]
              })
            }}
            translationLanguage={userSettings.translationLanguage}
          />
        )}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={userSettings}
          onSaveSettings={handleSaveSettings}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Login & Registration Auth Modal */}
      {showAuthModal && (
        <AuthModal
          onSuccess={(usr) => {
            setSession({ user: usr })
            setShowAuthModal(false)
          }}
          onClose={() => setShowAuthModal(false)}
        />
      )}

      {/* Floating Ask AI Pill Button */}
      <button
        onClick={() => setShowChat(v => !v)}
        title={showChat ? "Close AI Chat" : "Ask AI Assistant"}
        style={{
          position: 'fixed',
          bottom: 22,
          right: showChat ? 340 : 22,
          zIndex: 9000,
          width: 44,
          height: 44,
          borderRadius: '50%',
          border: 'none',
          background: showChat ? '#2563EB' : 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
          boxShadow: '0 6px 20px rgba(37, 99, 235, 0.38)',
          color: '#ffffff',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'all 0.25s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {showChat ? <MessageSquare size={19} strokeWidth={2} /> : <Sparkles size={19} strokeWidth={2} />}
      </button>

      {/* Render Picture-in-Picture window portal ONLY when PiP is active */}
      {pipWindow && pipWindow.document.getElementById('pip-transcription-root') && (
        createPortal(widgetContent, pipWindow.document.getElementById('pip-transcription-root')!)
      )}
    </>
  )
}
