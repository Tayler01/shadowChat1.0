import type { AppView } from '../../types/navigation'

export const ACTIVITY_PAGE_SIZE = 30

export type ActivityType =
  | 'dm_message'
  | 'mention'
  | 'reply'
  | 'reaction'
  | 'hype_event'
  | 'shadow_pin_post'
  | 'shadow_pin_comment'
  | 'shadow_pin_reply'

export type ActivityFilter = 'all' | 'unread'

export type ActivityActor = {
  id: string
  display_name: string | null
  username: string | null
  avatar_url: string | null
  avatar_thumbnail_url: string | null
  color: string | null
}

export type ActivityEvent = {
  id: string
  user_id: string
  actor_id: string
  type: ActivityType
  entity_id: string
  conversation_id: string | null
  message_id: string | null
  dm_message_id: string | null
  shadow_pin_image_id: string | null
  shadow_pin_comment_id: string | null
  body_preview: string
  metadata: Record<string, unknown>
  read_at: string | null
  occurred_at: string
  actor: ActivityActor | null
}

export type ActivityTarget = {
  view: Extract<AppView, 'chat' | 'dms' | 'pins'>
  conversation: string | null
  message: string | null
  pin: string | null
  comment: string | null
}

export type ActivityGroup = 'Today' | 'Yesterday' | 'Earlier'

const activityTypes = new Set<ActivityType>([
  'dm_message',
  'mention',
  'reply',
  'reaction',
  'hype_event',
  'shadow_pin_post',
  'shadow_pin_comment',
  'shadow_pin_reply',
])

const asString = (value: unknown) => typeof value === 'string' ? value : null

const asActor = (value: unknown): ActivityActor | null => {
  const candidate = Array.isArray(value) ? value[0] : value
  if (!candidate || typeof candidate !== 'object') return null
  const record = candidate as Record<string, unknown>
  const id = asString(record.id)
  if (!id) return null

  return {
    id,
    display_name: asString(record.display_name),
    username: asString(record.username),
    avatar_url: asString(record.avatar_url),
    avatar_thumbnail_url: asString(record.avatar_thumbnail_url),
    color: asString(record.color),
  }
}

export const normalizeActivityEvent = (value: unknown): ActivityEvent | null => {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  const type = asString(record.type)
  const id = asString(record.id)
  const userId = asString(record.user_id)
  const actorId = asString(record.actor_id)
  const entityId = asString(record.entity_id)
  const occurredAt = asString(record.occurred_at)

  if (!id || !userId || !actorId || !entityId || !occurredAt || !type || !activityTypes.has(type as ActivityType)) {
    return null
  }

  const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
    ? record.metadata as Record<string, unknown>
    : {}

  return {
    id,
    user_id: userId,
    actor_id: actorId,
    type: type as ActivityType,
    entity_id: entityId,
    conversation_id: asString(record.conversation_id),
    message_id: asString(record.message_id),
    dm_message_id: asString(record.dm_message_id),
    shadow_pin_image_id: asString(record.shadow_pin_image_id),
    shadow_pin_comment_id: asString(record.shadow_pin_comment_id),
    body_preview: asString(record.body_preview) ?? '',
    metadata,
    read_at: asString(record.read_at),
    occurred_at: occurredAt,
    actor: asActor(record.actor),
  }
}

export const sortAndDedupeActivity = (items: ActivityEvent[]) => {
  const byId = new Map(items.map(item => [item.id, item]))
  return [...byId.values()].sort((left, right) => {
    const timeDifference = new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
    return timeDifference || right.id.localeCompare(left.id)
  })
}

export const getActivityTarget = (item: ActivityEvent): ActivityTarget | null => {
  if (item.type === 'dm_message' || (item.type === 'reaction' && item.dm_message_id)) {
    if (!item.conversation_id || !item.dm_message_id) return null
    return {
      view: 'dms',
      conversation: item.conversation_id,
      message: item.dm_message_id,
      pin: null,
      comment: null,
    }
  }

  if (item.type === 'mention' || item.type === 'reply' || item.type === 'reaction' || item.type === 'hype_event') {
    if (!item.message_id) return null
    return {
      view: 'chat',
      conversation: null,
      message: item.message_id,
      pin: null,
      comment: null,
    }
  }

  if (item.type.startsWith('shadow_pin_') && item.shadow_pin_image_id) {
    return {
      view: 'pins',
      conversation: null,
      message: null,
      pin: item.shadow_pin_image_id,
      comment: item.shadow_pin_comment_id,
    }
  }

  return null
}

export const getActivityGroup = (occurredAt: string, now = new Date()): ActivityGroup => {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) return 'Earlier'

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfYesterday = new Date(startOfToday)
  startOfYesterday.setDate(startOfToday.getDate() - 1)

  if (date >= startOfToday) return 'Today'
  if (date >= startOfYesterday) return 'Yesterday'
  return 'Earlier'
}

export const getActivityActorLabel = (item: ActivityEvent) => (
  item.actor?.display_name || item.actor?.username || 'A ShadowChat member'
)

export const getActivityActionLabel = (item: ActivityEvent) => {
  const actor = getActivityActorLabel(item)
  switch (item.type) {
    case 'dm_message': return `${actor} sent you a message`
    case 'mention': return `${actor} mentioned you`
    case 'reply': return `${actor} replied to you`
    case 'reaction': {
      const emoji = typeof item.metadata.emoji === 'string' ? ` ${item.metadata.emoji}` : ''
      return `${actor} reacted${emoji} to your message`
    }
    case 'hype_event': return `${actor} hyped your message`
    case 'shadow_pin_post': return `${actor} posted a new pin`
    case 'shadow_pin_comment': return `${actor} commented on your pin`
    case 'shadow_pin_reply': return `${actor} replied to your pin comment`
  }
}

export const formatActivityTime = (occurredAt: string, now = new Date()) => {
  const date = new Date(occurredAt)
  if (Number.isNaN(date.getTime())) return ''
  const seconds = Math.round((date.getTime() - now.getTime()) / 1000)
  const absoluteSeconds = Math.abs(seconds)
  const formatter = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

  if (absoluteSeconds < 60) return formatter.format(seconds, 'second')
  if (absoluteSeconds < 3600) return formatter.format(Math.round(seconds / 60), 'minute')
  if (absoluteSeconds < 86400) return formatter.format(Math.round(seconds / 3600), 'hour')
  if (absoluteSeconds < 604800) return formatter.format(Math.round(seconds / 86400), 'day')
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export const formatActivityBadge = (count: number) => count > 99 ? '99+' : String(Math.max(0, count))
