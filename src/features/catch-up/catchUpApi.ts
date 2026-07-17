import { supabase } from '../../lib/supabase'
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
}

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const asText = (value: unknown) => typeof value === 'string' && value.trim()
  ? value.trim()
  : null

const notificationActor = (
  payload: Record<string, unknown>,
  actorId: string | null
): CatchUpActor | null => {
  const raw = asRecord(payload.actor)
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

const normalizeNotificationInboxItem = (raw: RawNotificationEvent): CatchUpItem | null => {
  const payload = asRecord(raw.payload) ?? {}
  const route = asText(raw.route) || asText(payload.route) || asText(payload.url)
  if (!raw.id || !raw.type || !route || (!route.startsWith('/') && !route.startsWith('?'))) return null
  const actor = notificationActor(payload, raw.actor_id)
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

export async function fetchNotificationInbox(): Promise<CatchUpItem[]> {
  const { data, error } = await supabase
    .from('notification_events')
    .select('id, type, category, actor_id, route, payload, created_at')
    .is('read_at', null)
    .is('resolved_at', null)
    .order('created_at', { ascending: false })
    .limit(30)

  if (error) throw error
  return ((data ?? []) as unknown as RawNotificationEvent[])
    .map(normalizeNotificationInboxItem)
    .filter((item): item is CatchUpItem => Boolean(item))
}

export async function acknowledgeNotificationInboxEvent(eventId: string) {
  const { data, error } = await supabase.rpc('mark_my_notification_event_read', {
    target_event_id: eventId,
  })
  if (error) throw error
  return data === true
}
