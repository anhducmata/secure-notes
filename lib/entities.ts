export interface PersonEntity {
  name: string
  aliases: string[]
  role: string
  organization: string
  mentions: { noteId: string; noteTitle: string; snippet: string }[]
  updatedAt: string
}

export interface ProjectEntity {
  name: string
  description: string
  status: string
  team: string[]
  mentions: { noteId: string; noteTitle: string; snippet: string }[]
  updatedAt: string
}

export interface ConversationEntity {
  id: string
  participants: string[]
  topic: string
  summary: string
  noteId: string
  noteTitle: string
  date: string
}

export interface EntityStore {
  people: Record<string, PersonEntity>
  projects: Record<string, ProjectEntity>
  conversations: ConversationEntity[]
  lastUpdated: string
}

export const ENTITY_KEY = (userId: string) => `entities:${userId}`

export function emptyEntityStore(): EntityStore {
  return { people: {}, projects: {}, conversations: [], lastUpdated: new Date().toISOString() }
}

export function mergeEntities(store: EntityStore, extracted: Partial<EntityStore>, noteId: string, noteTitle: string): EntityStore {
  const next = { ...store, lastUpdated: new Date().toISOString() }

  // Merge people
  for (const [key, person] of Object.entries(extracted.people ?? {})) {
    const existing = next.people[key]
    if (!existing) {
      next.people[key] = { ...person, mentions: person.mentions ?? [] }
    } else {
      // Update role/org if we got new info
      if (person.role && person.role !== "unknown") existing.role = person.role
      if (person.organization && person.organization !== "unknown") existing.organization = person.organization
      // Merge aliases
      const allAliases = new Set([...existing.aliases, ...(person.aliases ?? [])])
      existing.aliases = Array.from(allAliases)
      // Add new mention if not already present
      if (!existing.mentions.some((m) => m.noteId === noteId)) {
        existing.mentions.push(...(person.mentions ?? []))
      }
      existing.updatedAt = new Date().toISOString()
      next.people[key] = existing
    }
  }

  // Merge projects
  for (const [key, project] of Object.entries(extracted.projects ?? {})) {
    const existing = next.projects[key]
    if (!existing) {
      next.projects[key] = { ...project, mentions: project.mentions ?? [] }
    } else {
      if (project.description) existing.description = project.description
      if (project.status && project.status !== "unknown") existing.status = project.status
      const allTeam = new Set([...existing.team, ...(project.team ?? [])])
      existing.team = Array.from(allTeam)
      if (!existing.mentions.some((m) => m.noteId === noteId)) {
        existing.mentions.push(...(project.mentions ?? []))
      }
      existing.updatedAt = new Date().toISOString()
      next.projects[key] = existing
    }
  }

  // Merge conversations — dedupe by noteId
  const newConvs = (extracted.conversations ?? []).filter(
    (c) => !next.conversations.some((ec) => ec.noteId === c.noteId && ec.topic === c.topic)
  )
  next.conversations = [...next.conversations, ...newConvs].slice(-200)

  return next
}
