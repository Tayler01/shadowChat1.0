import { supabase } from '../../lib/supabase'
import { embedPublicProfile } from '../../../supabase/functions/_shared/public-profile'
import {
  normalizeCatchUpSnapshot,
  type CatchUpActor,
  type CatchUpItem,
  type CatchUpSnapshot,
} from './catchUpModel'

type RawNotificationEvent = {
  id: string
  type: string
  category: string | null
  actor_id: string | null
  route: string | null
  payload: unknown
  created_at: string
  actor: unknown
}

type PendingNotificationRead = {
  eventId: string
  queuedAt: number
}

export type NotificationInboxPage = {
  items: CatchUpItem[]
  totalCount: number
}

const PENDING_NOTIFICATION_READ_STORAGE_PREFIX = 'shadowchat:pending-notification-reads:v1:'
const PENDING_NOTIFICATION_READ_TTL_MS = 7 * 24 * 60 * 60 * 1_000
const PENDING_NOTIFICATION_READ_LIMIT = 50

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const asText = (value: unknown) => typeof value === 'string' && value.trim()
  ? value.trim()
  : null

const getPendingNotificationReadStorageKey = (userId: string) => (
  `${PENDING_NOTIFICATION_READ_STORAGE_PREFIX}${userId}`
)

const parsePendingNotificationReads = (value: unknown): PendingNotificationRead[] => {
  if (!Array.isArray(value)) return []
  const oldestAllowed = Date.now() - PENDING_NOTIFICATION_READ_TTL_MS
  const seen = new Set<string>()
  return value.flatMap(candidate => {
    const record = asRecord(candidate)
    const eventId = asText(record?.eventId)
    const queuedAt = typeof record?.queuedAt === 'number' && Number.isFinite(record.queuedAt)
      ? record.queuedAt
      : 0
    if (!eventId || queuedAt < oldestAllowed || seen.has(eventId)) return []
    seen.add(eventId)
    return [{ eventId, queuedAt }]
  }).slice(-PENDING_NOTIFICATION_READ_LIMIT)
}

const readPendingNotificationReads = (userId: string): PendingNotificationRead[] => {
  if (!userId || typeof localStorage === 'undefined') return []
  try {
    return parsePendingNotificationReads(
      JSON.parse(localStorage.getItem(getPendingNotificationReadStorageKey(userId)) || '[]')
    )
  } catch {
    return []
  }
}

const writePendingNotificationReads = (
  userId: string,
  entries: PendingNotificationRead[]
) => {
  if (!userId || typeof localStorage === 'undefined') return
  const key = getPendingNotificationReadStorageKey(userId)
  try {
    if (entries.length === 0) {
      localStorage.removeItem(key)
      return
    }
    localStorage.setItem(key, JSON.stringify(entries.slice(-PENDING_NOTIFICATION_READ_LIMIT)))
  } catch {
    // Persistence is a reliability enhancement. The live RPC remains canonical.
  }
}

export const getPendingNotificationReadEventIds = (userId: string) => (
  readPendingNotificationReads(userId).map(entry => entry.eventId)
)

export const queuePendingNotificationRead = (userId: string, eventId: string) => {
  const normalizedEventId = eventId.trim()
  if (!userId || !normalizedEventId) return
  const current = readPendingNotificationReads(userId)
    .filter(entry => entry.eventId !== normalizedEventId)
  writePendingNotificationReads(userId, [
    ...current,
    { eventId: normalizedEventId, queuedAt: Date.now() },
  ])
}

export const clearPendingNotificationRead = (userId: string, eventId: string) => {
  if (!userId || !eventId) return
  writePendingNotificationReads(
    userId,
    readPendingNotificationReads(userId).filter(entry => entry.eventId !== eventId)
  )
}

const notificationActor = (
  payload: Record<string, unknown>,
  actorId: string | null,
  currentActor: unknown
): CatchUpActor | null => {
  const raw = asRecord(currentActor) ?? asRecord(payload.actor)
  const id = asText(raw?.id) || actorId
  if (!id) return null
  return {
    id,
    display_name: asText(raw?.display_name),
    username: asText(raw?.username),
    avatar_url: asText(raw?.avatar_url),
    avatar_thumbnail_url: asText(raw?.avatar_thumbnail_url),
    color: asText(raw?.color),
  }
}

const categoryTitle = (category: string | null) => {
  if (category === 'dm') return 'Direct message'
  if (category === 'group') return 'General Chat'
  if (category === 'interactions') return 'Interaction'
  if (category === 'connections') return 'Connection'
  if (category === 'shadow_pin') return 'ShadowPin'
  if (category === 'games') return 'Play'
  return 'ShadowChat update'
}

const getNotificationInboxRoute = (
  raw: RawNotificationEvent,
  payload: Record<string, unknown>,
) => {
  if (
    raw.type === 'shadow_pin_post'
    || raw.type === 'shadow_pin_comment'
    || raw.type === 'shadow_pin_reply'
  ) {
    const imageId = asText(payload.image_id) || asText(payload.imageId)
    const commentId = asText(payload.comment_id) || asText(payload.commentId)
    if (imageId) {
      const params = new URLSearchParams({ view: 'pins', pin: imageId })
      if (commentId) {
        params.set('panel', 'comments')
        params.set('comment', commentId)
      }
      return `/?${params.toString()}`
    }
  }
  return asText(raw.route) || asText(payload.route) || asText(payload.url)
}

const normalizeNotificationInboxItem = (raw: RawNotificationEvent): CatchUpItem | null => {
  const payload = asRecord(raw.payload) ?? {}
  const route = getNotificationInboxRoute(raw, payload)
  if (!raw.id || !raw.type || !route || (!route.startsWith('/') && !route.startsWith('?'))) return null
  const actor = notificationActor(payload, raw.actor_id, raw.actor)
  return {
    id: `notification:${raw.id}`,
    kind: raw.type,
    occurredAt: raw.created_at,
    actor,
    title: asText(payload.title) || categoryTitle(raw.category),
    preview: asText(payload.body) || asText(payload.body_preview) || 'Open the exact source to review this update.',
    unreadCount: 1,
    manuallyUnread: false,
    target: { kind: 'app_route', route },
    activityEventIds: [],
    notificationEventIds: [raw.id],
  }
}

export async function fetchCatchUpSnapshot(): Promise<CatchUpSnapshot> {
  const { data, error } = await supabase.rpc('get_my_catch_up_v1', {
    section_limit: 6,
    lookback_hours: 168,
  })
  if (error) throw error
  const snapshot = normalizeCatchUpSnapshot(data)
  if (!snapshot) throw new Error('Catch-Up returned an invalid source snapshot.')
  return snapshot
}

export async function acknowledgeCatchUpEvents(eventIds: string[]) {
  if (eventIds.length === 0) return 0
  const { data, error } = await supabase.rpc('acknowledge_my_catch_up_events', {
    target_event_ids: [...new Set(eventIds)].slice(0, 50),
  })
  if (error) throw error
  return typeof data === 'number' ? data : Number(data ?? 0)
}

export async function fetchNotificationInbox(): Promise<NotificationInboxPage> {
  const { data, error, count } = await supabase
    .from('notification_events')
    .select(`
      id,
      type,
      category,
      actor_id,
      route,
      payload,
      created_at,
      ${embedPublicProfile('actor', 'users!notification_events_actor_id_fkey')}
    `, { count: 'exact' })
    .is('read_at', null)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  const items = ((data ?? []) as unknown as RawNotificationEvent[])
    .map(normalizeNotificationInboxItem)
    .filter((item): item is CatchUpItem => Boolean(item))
  return {
    items,
    totalCount: Math.max(items.length, count ?? items.length),
  }
}

export async function acknowledgeNotificationInboxEvent(eventId: string) {
  const { data, error } = await supabase.rpc('mark_my_notification_event_read', {
    target_event_id: eventId,
  })
  if (error) throw error
  if (data !== true) {
    throw new Error('Notification read acknowledgement was not confirmed.')
  }
  return true
}

export async function acknowledgeAllNotificationInboxEvents() {
  const { data, error } = await supabase.rpc('mark_all_my_notification_events_read')
  if (error) throw error
  const count = typeof data === 'number' ? data : Number(data ?? Number.NaN)
  if (!Number.isFinite(count) || count < 0) {
    throw new Error('Notification inbox acknowledgement returned an invalid count.')
  }
  return count
}

export async function findUnreadNotificationEventIds(eventIds: string[]): Promise<string[]> {
  const uniqueEventIds = [...new Set(eventIds.filter(Boolean))].slice(0, PENDING_NOTIFICATION_READ_LIMIT)
  if (uniqueEventIds.length === 0) return [] as string[]

  const { data, error } = await supabase
    .from('notification_events')
    .select('id')
    .in('id', uniqueEventIds)
    .is('read_at', null)
    .is('resolved_at', null)

  if (error) throw error
  return ((data ?? []) as Array<{ id?: unknown }>)
    .map(row => asText(row.id))
    .filter((eventId): eventId is string => Boolean(eventId))
}

export async function flushPendingNotificationReads(userId: string) {
  const eventIds = getPendingNotificationReadEventIds(userId)
  if (eventIds.length === 0) return { confirmed: [] as string[], failed: [] as string[] }

  const results = await Promise.all(eventIds.map(async eventId => {
    try {
      await acknowledgeNotificationInboxEvent(eventId)
      clearPendingNotificationRead(userId, eventId)
      return { eventId, confirmed: true }
    } catch {
      return { eventId, confirmed: false }
    }
  }))

  return {
    confirmed: results.filter(result => result.confirmed).map(result => result.eventId),
    failed: results.filter(result => !result.confirmed).map(result => result.eventId),
  }
}
