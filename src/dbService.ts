import { supabase } from './supabaseClient'
import type { Note, Attachment } from './App'

// ── Database Note Operations ───────────────────────────────────────────────

export async function fetchUserNotesFromDb(userId: string): Promise<Note[]> {
  const { data, error } = await supabase
    .from('notes')
    .select('*, attachments(*)')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })

  if (error || !data) return []

  return data.map((n: any) => ({
    id: n.id,
    title: n.title || 'Untitled',
    body: n.body || '',
    emoji: n.emoji || '📝',
    category: n.category || 'Meeting',
    updatedAt: new Date(n.updated_at),
    attachments: (n.attachments || []).map((a: any) => ({
      id: a.id,
      name: a.name,
      type: a.type,
      size: a.size,
      url: a.public_url,
    })),
  }))
}

export async function createNoteInDb(userId: string, note: Partial<Note>): Promise<Note | null> {
  const { data, error } = await supabase
    .from('notes')
    .insert({
      user_id: userId,
      title: note.title || 'Untitled',
      body: note.body || '<h2>Untitled</h2><p></p>',
      emoji: note.emoji || '📝',
      category: note.category || 'Meeting',
    })
    .select()
    .single()

  if (error || !data) return null

  return {
    id: data.id,
    title: data.title,
    body: data.body,
    emoji: data.emoji,
    category: data.category,
    updatedAt: new Date(data.updated_at),
    attachments: [],
  }
}

export async function updateNoteInDb(noteId: string, updates: Partial<Note>): Promise<boolean> {
  const payload: any = { updated_at: new Date().toISOString() }
  if (updates.title !== undefined) payload.title = updates.title
  if (updates.body !== undefined) payload.body = updates.body
  if (updates.emoji !== undefined) payload.emoji = updates.emoji
  if (updates.category !== undefined) payload.category = updates.category

  const { error } = await supabase
    .from('notes')
    .update(payload)
    .eq('id', noteId)

  return !error
}

export async function deleteNoteFromDb(noteId: string): Promise<boolean> {
  const { error } = await supabase
    .from('notes')
    .delete()
    .eq('id', noteId)

  return !error
}

// ── Cloud Storage Upload Attachment ───────────────────────────────────────

export async function uploadAttachmentToCloud(file: File, noteId: string, userId: string): Promise<Attachment | null> {
  const path = `${userId}/${noteId}/${Date.now()}_${file.name}`
  const bucketName = import.meta.env.VITE_STORAGE_BUCKET || 'attachments'

  // Upload file to Supabase / Cloudflare Storage
  const { error: uploadError } = await supabase.storage
    .from(bucketName)
    .upload(path, file, { upsert: true })

  let publicUrl = ''
  if (!uploadError) {
    const { data } = supabase.storage.from(bucketName).getPublicUrl(path)
    publicUrl = data.publicUrl
  } else {
    // Fallback object URL if storage bucket is not configured
    publicUrl = URL.createObjectURL(file)
  }

  const type: Attachment['type'] = file.type.startsWith('image/')
    ? 'image'
    : file.type.startsWith('audio/')
      ? 'audio'
      : 'document'
  const size = (file.size / (1024 * 1024)).toFixed(1) + ' MB'

  // Insert into attachments table
  const { data, error } = await supabase
    .from('attachments')
    .insert({
      note_id: noteId,
      user_id: userId,
      name: file.name,
      type,
      size,
      storage_path: path,
      public_url: publicUrl,
    })
    .select()
    .single()

  if (error || !data) {
    return {
      id: String(Date.now()),
      name: file.name,
      type,
      size,
      url: publicUrl,
    }
  }

  return {
    id: data.id,
    name: data.name,
    type: data.type,
    size: data.size,
    url: data.public_url,
  }
}

// ── 3D Knowledge Graph DB Operations ────────────────────────────────────────

export async function fetchGraphDataFromDb(userId: string) {
  const [{ data: dbNodes }, { data: dbEdges }] = await Promise.all([
    supabase.from('graph_nodes').select('*').eq('user_id', userId),
    supabase.from('graph_edges').select('*').eq('user_id', userId),
  ])

  return {
    nodes: (dbNodes || []).map((n: any) => ({
      id: n.id,
      label: n.label,
      type: n.type,
      color: n.color,
      val: n.val || 10,
    })),
    links: (dbEdges || []).map((e: any) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      relation: e.relation,
    })),
  }
}

export async function saveGraphNodeInDb(userId: string, node: { id: string; label: string; type: string; color: string; val?: number }) {
  await supabase.from('graph_nodes').upsert({
    id: node.id,
    user_id: userId,
    label: node.label,
    type: node.type,
    color: node.color,
    val: node.val || 10,
  })
}

export async function saveGraphEdgeInDb(userId: string, edge: { id: string; source: string; target: string; relation: string }) {
  await supabase.from('graph_edges').upsert({
    id: edge.id,
    user_id: userId,
    source: edge.source,
    target: edge.target,
    relation: edge.relation,
  })
}

export async function deleteGraphNodeInDb(userId: string, nodeId: string) {
  await supabase.from('graph_nodes').delete().match({ id: nodeId, user_id: userId })
}

export async function deleteGraphEdgeInDb(userId: string, edgeId: string) {
  await supabase.from('graph_edges').delete().match({ id: edgeId, user_id: userId })
}
