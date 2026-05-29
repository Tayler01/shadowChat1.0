import type { ChatMessageType } from './supabase'

export interface LocalMessageOutboxEntry {
  id: string
  clientMessageId: string
  senderId: string
  content: string
  messageType: ChatMessageType
  fileUrl?: string
  thumbnailUrl?: string | null
  replyTo?: string | null
  createdAt: string
  failedAt: string
}

const OUTBOX_STORAGE_PREFIX = 'shadowchat:outbox:'

export const getLocalOutboxStorageKey = (scope: string) => `${OUTBOX_STORAGE_PREFIX}${scope}`

const normalizeEntry = (entry: LocalMessageOutboxEntry): LocalMessageOutboxEntry => ({
  ...entry,
  id: entry.id || entry.clientMessageId,
  clientMessageId: entry.clientMessageId || entry.id,
  content: entry.content ?? '',
  failedAt: entry.failedAt || new Date().toISOString(),
})

export const loadLocalOutboxEntries = (scope: string) => {
  if (typeof localStorage === 'undefined') return [] as LocalMessageOutboxEntry[]

  try {
    const raw = localStorage.getItem(getLocalOutboxStorageKey(scope))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter(entry => entry && typeof entry === 'object')
      .map(entry => normalizeEntry(entry as LocalMessageOutboxEntry))
      .filter(entry => entry.clientMessageId && entry.senderId && entry.messageType && entry.createdAt)
  } catch {
    return []
  }
}

const saveLocalOutboxEntries = (scope: string, entries: LocalMessageOutboxEntry[]) => {
  if (typeof localStorage === 'undefined') return

  try {
    const normalized = entries.map(normalizeEntry)
    if (normalized.length === 0) {
      localStorage.removeItem(getLocalOutboxStorageKey(scope))
      return
    }
    localStorage.setItem(getLocalOutboxStorageKey(scope), JSON.stringify(normalized))
  } catch {
    // Storage pressure should not block visible send failure handling.
  }
}

export const upsertLocalOutboxEntry = (scope: string, entry: LocalMessageOutboxEntry) => {
  const normalized = normalizeEntry(entry)
  const entries = loadLocalOutboxEntries(scope)
  const nextEntries = entries.filter(item => item.clientMessageId !== normalized.clientMessageId)
  nextEntries.push(normalized)
  saveLocalOutboxEntries(scope, nextEntries)
  return normalized
}

export const removeLocalOutboxEntry = (scope: string, clientMessageId: string) => {
  const entries = loadLocalOutboxEntries(scope)
  saveLocalOutboxEntries(
    scope,
    entries.filter(entry => entry.clientMessageId !== clientMessageId && entry.id !== clientMessageId)
  )
}

export const clearLocalOutboxScopes = () => {
  if (typeof localStorage === 'undefined') return

  try {
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith(OUTBOX_STORAGE_PREFIX)) {
        localStorage.removeItem(key)
      }
    })
  } catch {
    // ignore storage errors
  }
}
