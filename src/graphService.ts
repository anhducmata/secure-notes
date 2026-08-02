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
  transcriptLines: any[] = []
): KnowledgeGraph {
  const nodesMap = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const topicSet = new Set<string>()

  // 1. Index Note & Speaker & Topic Nodes
  notes.forEach(n => {
    const noteNodeId = `note-${n.id}`
    nodesMap.set(noteNodeId, {
      id: noteNodeId,
      label: `${n.emoji || '📋'} ${n.title}`,
      type: 'note',
      color: '#4A47A3',
    })

    const bodyText = (n.body || '').toLowerCase()

    // Extract key topics
    if (bodyText.includes('pgbouncer')) topicSet.add('#pgbouncer')
    if (bodyText.includes('retention') || bodyText.includes('ltv')) topicSet.add('#retention')
    if (bodyText.includes('onboarding') || bodyText.includes('positioning')) topicSet.add('#onboarding-value')
    if (bodyText.includes('design') || bodyText.includes('button')) topicSet.add('#design-system')

    // Attachments
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

  // 2. Add Topic Nodes & Edges
  topicSet.forEach(topic => {
    const topicNodeId = `topic-${topic}`
    nodesMap.set(topicNodeId, {
      id: topicNodeId,
      label: topic,
      type: 'topic',
      color: '#2563EB',
    })

    notes.forEach(n => {
      const bodyText = (n.body || '').toLowerCase()
      if (bodyText.includes(topic.replace('#', ''))) {
        edges.push({ source: `note-${n.id}`, target: topicNodeId, relation: 'mentions_topic' })
      }
    })
  })

  // 3. Add Speaker Nodes & Edges
  const speakers = ['You (Mata)', 'Orange Fog 🍊']
  speakers.forEach(spk => {
    const spkNodeId = `speaker-${spk}`
    nodesMap.set(spkNodeId, {
      id: spkNodeId,
      label: spk,
      type: 'speaker',
      color: '#059669',
    })

    notes.forEach(n => {
      if ((n.body || '').includes(spk)) {
        edges.push({ source: `note-${n.id}`, target: spkNodeId, relation: 'spoken_by' })
      }
    })
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
          if (msg.text.toLowerCase().includes(n.title.toLowerCase())) {
            edges.push({ source: chatNodeId, target: `note-${n.id}`, relation: 'queries_note' })
          }
        })
      }
    })
  }

  return {
    nodes: Array.from(nodesMap.values()),
    edges,
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
