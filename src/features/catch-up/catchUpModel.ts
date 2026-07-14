export const CATCH_UP_SECTION_ORDER = ['needs_you', 'direct_messages', 'general_chat', 'shadow_pin'] as const

export type CatchUpSectionId = typeof CATCH_UP_SECTION_ORDER[number]

export type CatchUpActor = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  avatar_thumbnail_url: string | null
  color: string | null
}

export type CatchUpTarget =
  | { kind: 'connections' }
  | { kind: 'chat_message'; message_id: string }
  | { kind: 'dm_message'; conversation_id: string; message_id: string }
  | { kind: 'pin'; pin_id: string }
  | { kind: 'pin_comment'; pin_id: string; comment_id: string }

export type CatchUpItem = {
  id: string
  kind: string
  occurredAt: string
  actor: CatchUpActor | null
  title: string
  preview: string
  unreadCount: number
  manuallyUnread: boolean
  target: CatchUpTarget
  activityEventIds: string[]
}

export type CatchUpSection = {
  id: CatchUpSectionId
  title: string
  shownCount: number
  totalCount: number
  hasMore: boolean
  olderUnreadExists: boolean
  items: CatchUpItem[]
}

export type CatchUpSnapshot = {
  schemaVersion: 1
  generatedAt: string
  effectiveSince: string
  lookbackHours: number
  sourceLinked: true
  aiGenerated: false
  sections: Record<CatchUpSectionId, CatchUpSection>
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
)
const asString = (value: unknown, max = 240) => typeof value === 'string' && value.length <= max ? value : null
const asCount = (value: unknown) => typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null

const normalizeActor = (value: unknown): CatchUpActor | null => {
  const record = asRecord(value)
  const id = asString(record?.id, 160)
  if (!record || !id) return null
  return {
    id,
    display_name: asString(record.display_name, 160),
    username: asString(record.username, 160),
    avatar_url: asString(record.avatar_url, 2048),
    avatar_thumbnail_url: asString(record.avatar_thumbnail_url, 2048),
    color: asString(record.color, 32),
  }
}

export const normalizeCatchUpTarget = (value: unknown): CatchUpTarget | null => {
  const record = asRecord(value)
  const kind = asString(record?.kind, 32)
  if (!record || !kind) return null
  if (kind === 'connections') return { kind }
  if (kind === 'chat_message') {
    const messageId = asString(record.message_id, 160)
    return messageId ? { kind, message_id: messageId } : null
  }
  if (kind === 'dm_message') {
    const conversationId = asString(record.conversation_id, 160)
    const messageId = asString(record.message_id, 160)
    return conversationId && messageId ? { kind, conversation_id: conversationId, message_id: messageId } : null
  }
  if (kind === 'pin') {
    const pinId = asString(record.pin_id, 160)
    return pinId ? { kind, pin_id: pinId } : null
  }
  if (kind === 'pin_comment') {
    const pinId = asString(record.pin_id, 160)
    const commentId = asString(record.comment_id, 160)
    return pinId && commentId ? { kind, pin_id: pinId, comment_id: commentId } : null
  }
  return null
}

const normalizeItem = (value: unknown): CatchUpItem | null => {
  const record = asRecord(value)
  if (!record) return null
  const id = asString(record.id, 240)
  const kind = asString(record.kind, 64)
  const occurredAt = asString(record.occurred_at, 64)
  const title = asString(record.title, 200)
  const preview = asString(record.preview, 240)
  const unreadCount = asCount(record.unread_count)
  const target = normalizeCatchUpTarget(record.target)
  if (!id || !kind || !occurredAt || !title || preview === null || unreadCount === null || !target) return null
  if (Number.isNaN(new Date(occurredAt).getTime())) return null
  const eventIds = Array.isArray(record.activity_event_ids)
    ? record.activity_event_ids.map(value => asString(value, 160)).filter((value): value is string => Boolean(value)).slice(0, 50)
    : []
  return {
    id,
    kind,
    occurredAt,
    actor: normalizeActor(record.actor),
    title,
    preview,
    unreadCount,
    manuallyUnread: record.manually_unread === true,
    target,
    activityEventIds: eventIds,
  }
}

const normalizeSection = (id: CatchUpSectionId, value: unknown): CatchUpSection | null => {
  const record = asRecord(value)
  const title = asString(record?.title, 80)
  const shownCount = asCount(record?.shown_count)
  const totalCount = asCount(record?.total_count)
  if (!record || !title || shownCount === null || totalCount === null || !Array.isArray(record.items)) return null
  const items = record.items.map(normalizeItem).filter((item): item is CatchUpItem => Boolean(item))
  if (items.length !== record.items.length || shownCount !== items.length || totalCount < shownCount) return null
  return {
    id,
    title,
    shownCount,
    totalCount,
    hasMore: record.has_more === true,
    olderUnreadExists: record.older_unread_exists === true,
    items,
  }
}

export const normalizeCatchUpSnapshot = (value: unknown): CatchUpSnapshot | null => {
  const record = asRecord(Array.isArray(value) ? value[0] : value)
  const sectionsRecord = asRecord(record?.sections)
  const generatedAt = asString(record?.generated_at, 64)
  const effectiveSince = asString(record?.effective_since, 64)
  const lookbackHours = asCount(record?.lookback_hours)
  if (!record || !sectionsRecord || record.schema_version !== 1 || record.source_linked !== true || record.ai_generated !== false || !generatedAt || !effectiveSince || lookbackHours === null) return null
  if (Number.isNaN(new Date(generatedAt).getTime()) || Number.isNaN(new Date(effectiveSince).getTime())) return null

  const normalizedSections = Object.fromEntries(CATCH_UP_SECTION_ORDER.map(id => [id, normalizeSection(id, sectionsRecord[id])]))
  if (Object.values(normalizedSections).some(section => !section)) return null

  return {
    schemaVersion: 1,
    generatedAt,
    effectiveSince,
    lookbackHours,
    sourceLinked: true,
    aiGenerated: false,
    sections: normalizedSections as Record<CatchUpSectionId, CatchUpSection>,
  }
}

export const buildCatchUpTargetUrl = (target: CatchUpTarget, baseUrl: string) => {
  const url = new URL(baseUrl)
  url.search = ''
  if (target.kind === 'connections') {
    url.searchParams.set('view', 'dms')
    url.searchParams.set('panel', 'connections')
  } else if (target.kind === 'chat_message') {
    url.searchParams.set('view', 'chat')
    url.searchParams.set('message', target.message_id)
  } else if (target.kind === 'dm_message') {
    url.searchParams.set('view', 'dms')
    url.searchParams.set('conversation', target.conversation_id)
    url.searchParams.set('message', target.message_id)
  } else if (target.kind === 'pin') {
    url.searchParams.set('view', 'pins')
    url.searchParams.set('pin', target.pin_id)
  } else {
    url.searchParams.set('view', 'pins')
    url.searchParams.set('pin', target.pin_id)
    url.searchParams.set('panel', 'comments')
    url.searchParams.set('comment', target.comment_id)
  }
  return url
}

export const formatCatchUpTime = (value: string, now = new Date()) => {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const minutes = Math.round((date.getTime() - now.getTime()) / 60_000)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  if (Math.abs(minutes) < 60) return formatter.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (Math.abs(hours) < 24) return formatter.format(hours, 'hour')
  return formatter.format(Math.round(hours / 24), 'day')
}

type CatchUpCache = {
  ownerId: string | null
  snapshot: CatchUpSnapshot | null
  scrollTop: number
  fetchedAt: number
  focusItemId: string | null
}

let cache: CatchUpCache = {
  ownerId: null,
  snapshot: null,
  scrollTop: 0,
  fetchedAt: 0,
  focusItemId: null,
}

const emptyCache = (ownerId: string | null): CatchUpCache => ({
  ownerId,
  snapshot: null,
  scrollTop: 0,
  fetchedAt: 0,
  focusItemId: null,
})

export const readCatchUpCache = (ownerId: string | null) => {
  if (!ownerId || cache.ownerId !== ownerId) cache = emptyCache(ownerId)
  return { ...cache }
}

export const writeCatchUpCache = (
  ownerId: string | null,
  snapshot: CatchUpSnapshot | null,
  options: Partial<Pick<CatchUpCache, 'scrollTop' | 'fetchedAt' | 'focusItemId'>> = {}
) => {
  if (!ownerId) {
    cache = emptyCache(null)
    return
  }
  const current = cache.ownerId === ownerId ? cache : emptyCache(ownerId)
  cache = {
    ownerId,
    snapshot,
    scrollTop: Math.max(0, options.scrollTop ?? current.scrollTop),
    fetchedAt: Math.max(0, options.fetchedAt ?? current.fetchedAt),
    focusItemId: options.focusItemId === undefined ? current.focusItemId : options.focusItemId,
  }
}

export const clearCatchUpCache = () => {
  cache = emptyCache(null)
}
