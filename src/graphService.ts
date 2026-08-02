// ── Graph Service: Entity & Relationship Knowledge Graph ────────────────────

export interface GraphNode {
  id: string
  label: string
  type: 'note' | 'topic' | 'speaker' | 'attachment' | 'chat'
  color: string
}

export interface GraphEdge {
  source: string
  target: string
  relation: string
}

export interface KnowledgeGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export function buildWorkspaceGraph(
  notes: any[],
  chatMessages: any[] = [],
  _transcriptLines: any[] = []
): KnowledgeGraph {
  const nodesMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const topicSet = new Set<string>()
  const speakerSet = new Set<string>()

  // 1. Index Note & Extract Dynamic Topics & Speakers
  notes.forEach(n => {
    const noteNodeId = `note-${n.id}`
    nodesMap.set(noteNodeId, {
      id: noteNodeId,
      label: `${n.emoji || '📋'} ${n.title}`,
      type: 'note',
      color: '#4A47A3',
    })

    // Extract dynamic tags attached to note
    if (Array.isArray(n.tags)) {
      n.tags.forEach((tag: string) => {
        if (typeof tag === 'string' && tag.trim()) {
          const cleanTag = tag.startsWith('#') ? tag : `#${tag}`
          topicSet.add(cleanTag)
          edges.push({ source: noteNodeId, target: `topic-${cleanTag}`, relation: 'mentions_topic' })
        }
      })
    }

    const bodyText = n.body || ''
    // Extract dynamic hashtags from note body content
    const hashtagRegex = /#([a-zA-Z0-9_-]+)/g
    let hashMatch
    while ((hashMatch = hashtagRegex.exec(bodyText)) !== null) {
      const tag = `#${hashMatch[1]}`
      topicSet.add(tag)
      edges.push({ source: noteNodeId, target: `topic-${tag}`, relation: 'mentions_topic' })
    }

    // Extract dynamic speakers from note body content (<strong ...>Speaker Name:</strong>)
    const speakerRegex = /<strong[^>]*>\s*([^:<]+):\s*<\/strong>/gi
    let spkMatch
    while ((spkMatch = speakerRegex.exec(bodyText)) !== null) {
      const spkName = spkMatch[1].trim()
      if (spkName && !spkName.includes('Ask AI') && !spkName.includes('RAG Context')) {
        speakerSet.add(spkName)
        edges.push({ source: noteNodeId, target: `speaker-${spkName}`, relation: 'spoken_by' })
      }
    }

    // Index Attachments
    if (n.attachments) {
      n.attachments.forEach((att: any) => {
        const attNodeId = `att-${att.id}`
        nodesMap.set(attNodeId, {
          id: attNodeId,
          label: `📎 ${att.name}`,
          type: 'attachment',
          color: '#D97706',
        })
        edges.push({ source: noteNodeId, target: attNodeId, relation: 'has_attachment' })
      })
    }
  })

  // 2. Add Dynamic Topic Nodes
  topicSet.forEach(topic => {
    const topicNodeId = `topic-${topic}`
    if (!nodesMap.has(topicNodeId)) {
      nodesMap.set(topicNodeId, {
        id: topicNodeId,
        label: topic,
        type: 'topic',
        color: '#2563EB',
      })
    }
  })

  // 3. Add Dynamic Speaker Nodes
  speakerSet.forEach(spk => {
    const spkNodeId = `speaker-${spk}`
    if (!nodesMap.has(spkNodeId)) {
      nodesMap.set(spkNodeId, {
        id: spkNodeId,
        label: spk,
        type: 'speaker',
        color: '#059669',
      })
    }
  })

  // 4. Index Chat Data Source Nodes & Edges
  if (chatMessages.length > 0) {
    chatMessages.forEach(msg => {
      if (msg.role === 'user' && msg.text.trim()) {
        const chatNodeId = `chat-${msg.id}`
        nodesMap.set(chatNodeId, {
          id: chatNodeId,
          label: `💬 Chat: ${msg.text.slice(0, 18)}…`,
          type: 'chat',
          color: '#8B5CF6',
        })

        // Edge between Chat & mentioned notes
        notes.forEach(n => {
          if (n.title && msg.text.toLowerCase().includes(n.title.toLowerCase())) {
            edges.push({ source: chatNodeId, target: `note-${n.id}`, relation: 'queries_note' })
          }
        })
      }
    })
  }

  // Deduplicate edges and verify valid nodes
  const edgeSet = new Set<string>()
  const uniqueEdges: GraphEdge[] = []
  edges.forEach(e => {
    const key = `${e.source}->${e.target}:${e.relation}`
    if (!edgeSet.has(key) && nodesMap.has(e.source) && nodesMap.has(e.target)) {
      edgeSet.add(key)
      uniqueEdges.push(e)
    }
  })

  return {
    nodes: Array.from(nodesMap.values()),
    edges: uniqueEdges,
  }
}

/**
 * Traverse Graph to find connected entities up to max hops
 */
export function findGraphEntities(
  query: string,
  graph: KnowledgeGraph,
  maxHops: number = 2
): string[] {
  const cleanQuery = query.toLowerCase()
  const matchingNodeIds = new Set<string>()

  graph.nodes.forEach(node => {
    if (cleanQuery.includes(node.label.toLowerCase().replace(/[^a-z0-9]/gi, ''))) {
      matchingNodeIds.add(node.id)
    }
  })

  let currentFrontier = Array.from(matchingNodeIds)
  const visited = new Set<string>(currentFrontier)

  for (let hop = 0; hop < maxHops && currentFrontier.length > 0; hop++) {
    const nextFrontier: string[] = []
    graph.edges.forEach(edge => {
      if (currentFrontier.includes(edge.source) && !visited.has(edge.target)) {
        visited.add(edge.target)
        nextFrontier.push(edge.target)
      }
      if (currentFrontier.includes(edge.target) && !visited.has(edge.source)) {
        visited.add(edge.source)
        nextFrontier.push(edge.source)
      }
    })
    currentFrontier = nextFrontier
  }

  return Array.from(visited)
    .map(id => graph.nodes.find(n => n.id === id)?.label || '')
    .filter(Boolean)
}
