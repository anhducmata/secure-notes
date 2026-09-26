/**
 * Folder Management Utilities & Storage
 */

export interface SharedCollaborator {
  id: string
  email: string
  name: string
  avatar?: string
  permission: "read" | "write"
  sharedAt: string
}

export interface FolderItem {
  id: string
  name: string
  icon?: "all" | "archive" | "trash" | "custom"
  isSystem?: boolean
  parentId?: string // undefined or null means Root (All Notes)
  isArchived?: boolean
  sharedWith?: SharedCollaborator[]
}

export const DEFAULT_FOLDERS: FolderItem[] = [
  { id: "all", name: "All Notes", icon: "all", isSystem: true },
  { id: "archive", name: "Archived", icon: "archive", isSystem: true },
  { id: "trash", name: "Trash", icon: "trash", isSystem: true },
]

const FOLDERS_STORAGE_KEY = "secure_notes_folders_v4"

export function getStoredFolders(): FolderItem[] {
  if (typeof window === "undefined") return DEFAULT_FOLDERS
  try {
    const raw = localStorage.getItem(FOLDERS_STORAGE_KEY)
    if (!raw) return DEFAULT_FOLDERS
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length > 0) {
      // Purge inbox and legacy mock folders
      const cleaned = parsed.filter(
        (f: FolderItem) => f.id !== "inbox" && !["work", "personal", "ideas", "meetings"].includes(f.id)
      )
      // Ensure system folders always exist
      const existingIds = new Set(cleaned.map((f: FolderItem) => f.id))
      const missingSystem = DEFAULT_FOLDERS.filter((df) => !existingIds.has(df.id))
      return [...cleaned, ...missingSystem]
    }
    return DEFAULT_FOLDERS
  } catch {
    return DEFAULT_FOLDERS
  }
}

export function saveStoredFolders(folders: FolderItem[]): void {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, JSON.stringify(folders))
  } catch (err) {
    console.error("Failed to save folders:", err)
  }
}

function syncFolderToBackend(folder: FolderItem, action: "save" | "delete" = "save") {
  if (typeof window === "undefined" || folder.isSystem) return
  if (action === "delete") {
    fetch(`/api/folders?id=${encodeURIComponent(folder.id)}`, { method: "DELETE", credentials: "include" }).catch(() => {})
  } else {
    fetch("/api/folders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({
        id: folder.id,
        name: folder.name,
        parentId: folder.parentId,
        icon: folder.icon,
        isArchived: folder.isArchived,
      }),
    }).catch(() => {})
  }
}

export function addStoredFolder(name: string, parentId?: string): FolderItem[] {
  const trimmed = name.trim()
  if (!trimmed) return getStoredFolders()
  const folders = getStoredFolders()
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "-") + `_${Date.now().toString().slice(-4)}`

  const newFolder: FolderItem = {
    id,
    name: trimmed,
    icon: "custom",
    isSystem: false,
    parentId: parentId && parentId !== "all" ? parentId : undefined,
  }

  // Insert before archive and trash if present
  const archiveIndex = folders.findIndex((f) => f.id === "archive")
  const updated = [...folders]
  if (archiveIndex !== -1) {
    updated.splice(archiveIndex, 0, newFolder)
  } else {
    updated.push(newFolder)
  }

  saveStoredFolders(updated)
  syncFolderToBackend(newFolder, "save")
  return updated
}

export function renameStoredFolder(folderId: string, newName: string): FolderItem[] {
  const trimmed = newName.trim()
  if (!trimmed) return getStoredFolders()
  const folders = getStoredFolders()
  const updated = folders.map((f) => (f.id === folderId ? { ...f, name: trimmed } : f))
  saveStoredFolders(updated)
  return updated
}

export function deleteStoredFolder(folderId: string): FolderItem[] {
  const folders = getStoredFolders()
  const target = folders.find((f) => f.id === folderId)
  if (target?.isSystem) return folders // Don't delete system folders

  // Find all descendant IDs recursively
  const getDescendantIds = (parentId: string): string[] => {
    const children = folders.filter((f) => f.parentId === parentId)
    return [
      ...children.map((c) => c.id),
      ...children.flatMap((c) => getDescendantIds(c.id)),
    ]
  }

  const idsToRemove = new Set([folderId, ...getDescendantIds(folderId)])
  const updated = folders.filter((f) => !idsToRemove.has(f.id))
  saveStoredFolders(updated)
  if (target) syncFolderToBackend(target, "delete")
  return updated
}

export function archiveStoredFolder(folderId: string, isArchived: boolean = true): FolderItem[] {
  const folders = getStoredFolders()
  const target = folders.find((f) => f.id === folderId)
  if (target?.isSystem) return folders
  const updated = folders.map((f) => (f.id === folderId ? { ...f, isArchived } : f))
  saveStoredFolders(updated)
  return updated
}

/**
 * Move a folder to a new parent or to root (parentId = null or "all").
 * Prevents moving a folder into itself or into one of its descendants.
 */
export function moveFolderToParent(folderId: string, newParentId: string | null): FolderItem[] {
  const folders = getStoredFolders()
  const target = folders.find((f) => f.id === folderId)
  if (!target || target.isSystem) return folders

  const normalizedParentId = !newParentId || newParentId === "all" ? undefined : newParentId

  // Cannot be parent of itself
  if (normalizedParentId === folderId) return folders

  // Cannot move into a descendant
  if (normalizedParentId) {
    let curr = folders.find((f) => f.id === normalizedParentId)
    while (curr) {
      if (curr.id === folderId) {
        // Cycle detected
        return folders
      }
      curr = curr.parentId ? folders.find((f) => f.id === curr?.parentId) : undefined
    }
  }

  const updated = folders.map((f) =>
    f.id === folderId ? { ...f, parentId: normalizedParentId } : f
  )
  saveStoredFolders(updated)
  return updated
}

export interface FlattenedFolder {
  folder: FolderItem
  depth: number
}

/**
 * Flattens non-system (and non-bottom) folders in tree order with depth information
 */
export function getFlattenedFolderTree(
  folders: FolderItem[],
  showArchived: boolean = false,
  collapsedIds?: Set<string>
): FlattenedFolder[] {
  const customFolders = folders.filter(
    (f) => !f.isSystem && (showArchived ? true : !f.isArchived)
  )

  const result: FlattenedFolder[] = []

  function traverse(parentId: string | undefined, depth: number) {
    const children = customFolders.filter((f) =>
      parentId === undefined ? !f.parentId || f.parentId === "all" : f.parentId === parentId
    )
    for (const child of children) {
      result.push({ folder: child, depth })
      if (!collapsedIds?.has(child.id)) {
        traverse(child.id, depth + 1)
      }
    }
  }

  traverse(undefined, 0)
  return result
}

export function updateFolderCollaborators(folderId: string, collaborators: SharedCollaborator[]): FolderItem[] {
  const folders = getStoredFolders()
  const updated = folders.map((f) =>
    f.id === folderId ? { ...f, sharedWith: collaborators } : f
  )
  saveStoredFolders(updated)
  return updated
}
