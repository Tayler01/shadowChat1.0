import type { NotificationPreferences } from '../../lib/push'

export type NotificationCategory =
  | 'dm'
  | 'group'
  | 'interactions'
  | 'connections'
  | 'shadow_pin'
  | 'presence'
  | 'live'
  | 'games'
  | 'system'

export interface NotificationEventRecord {
  id: string
  user_id: string
  type: string
  category: NotificationCategory
  entity_id: string
  conversation_id: string | null
  message_id: string | null
  dm_message_id: string | null
  actor_id: string | null
  route: string | null
  payload: Record<string, unknown> | null
  sent_at: string | null
  read_at: string | null
  presented_at: string | null
  resolved_at: string | null
  created_at: string
  presentation_expires_at: string
}

export type NotificationCoordinatorPreferences = NotificationPreferences & {
  checkers_turn_enabled?: boolean
  badge_games_enabled?: boolean
}

export interface NotificationPresentation {
  event: NotificationEventRecord
  title: string
  body: string | null
  route: string
  actorLabel: string | null
  avatarUrl: string | null
  autoRead: boolean
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)

const asString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
)

const getActor = (payload: Record<string, unknown>) =>
  asRecord(payload.actor ?? payload.sender ?? payload.profile)

const getActorLabel = (payload: Record<string, unknown>) => {
  const actor = getActor(payload)
  const username = asString(actor.username)
  return (
    asString(actor.display_name) ??
    (username ? `@${username}` : null) ??
    asString(payload.sender_name) ??
    asString(payload.actor_name)
  )
}

const getShadowPinRoute = (payload: Record<string, unknown>) => {
  const imageId = asString(payload.image_id ?? payload.imageId)
  const commentId = asString(payload.comment_id ?? payload.commentId)
  const params = new URLSearchParams({ view: 'pins' })
  if (imageId) params.set('pin', imageId)
  if (commentId) {
    params.set('comment', commentId)
    params.set('panel', 'comments')
  }
  return `/?${params.toString()}`
}

const getFallbackRoute = (
  event: NotificationEventRecord,
  payload: Record<string, unknown>,
) => {
  if (event.type === 'dm_message' || payload.is_dm === true) {
    const params = new URLSearchParams({ view: 'dms' })
    if (event.conversation_id) params.set('conversation', event.conversation_id)
    const messageId = event.dm_message_id ?? event.entity_id
    if (messageId) params.set('message', messageId)
    return `/?${params.toString()}`
  }

  if (
    event.type === 'group_message' ||
    event.type === 'mention' ||
    event.type === 'reply' ||
    event.type === 'reaction' ||
    event.type === 'hype_event'
  ) {
    const params = new URLSearchParams({ view: 'chat' })
    const threadId = asString(payload.thread_id ?? payload.threadId)
    if (threadId) params.set('thread', threadId)
    const messageId = event.message_id ?? asString(payload.message_id ?? payload.messageId)
    if (messageId) params.set('message', messageId)
    return `/?${params.toString()}`
  }

  if (event.type.startsWith('shadow_pin_')) return getShadowPinRoute(payload)
  if (event.type.startsWith('connection_')) return '/?view=dms&panel=connections'
  if (event.type === 'presence_active') return '/?view=active-users'
  if (event.type.startsWith('shado_live_')) {
    const roomId = asString(payload.room_id ?? payload.roomId) ?? event.entity_id
    return `/?${new URLSearchParams({
      view: 'games',
      experience: 'shado-live',
      item: roomId,
    }).toString()}`
  }
  if (event.type === 'shadow_checkers_turn') {
    const matchId = asString(payload.match_id ?? payload.matchId) ?? event.entity_id
    return `/?${new URLSearchParams({
      view: 'games',
      experience: 'shadow-checkers',
      item: matchId,
    }).toString()}`
  }
  return '/?view=catchup'
}

const getDefaultTitle = (
  event: NotificationEventRecord,
  actorLabel: string | null,
  payload: Record<string, unknown>,
) => {
  const actor = actorLabel ?? 'Someone'
  switch (event.type) {
    case 'dm_message': return actor
    case 'group_message': return `${actor} posted in General Chat`
    case 'mention': return `${actor} mentioned you`
    case 'reply': return `${actor} replied to you`
    case 'reaction': return `${actor} reacted to your message`
    case 'hype_event': return `${actor} sent Hype`
    case 'connection_request': return `${actor} sent you a connection request`
    case 'connection_accepted': return `${actor} accepted your connection request`
    case 'shadow_pin_post': return `${actor} posted a new ShadowPin`
    case 'shadow_pin_comment': return `${actor} commented on your ShadowPin`
    case 'shadow_pin_reply': return `${actor} replied to your ShadowPin comment`
    case 'presence_active': return `${actor} is active now`
    case 'shado_live_room_started': return `${actor} is live now`
    case 'shado_live_room_ended': return 'Shado Live room ended'
    case 'shado_live_speaker_promoted': return 'You were invited to speak'
    case 'shado_live_speaker_demoted': return 'You are now listening'
    case 'shado_live_participant_muted': return 'A Shado Live host muted your microphone'
    case 'shado_live_participant_removed': return 'You were removed from a Shado Live room'
    case 'shadow_checkers_turn':
      return asString(payload.opponent_name)
        ? `Your move against ${asString(payload.opponent_name)}`
        : 'Your move in Shadow Checkers'
    default: return 'New ShadowChat update'
  }
}

export const buildNotificationPresentation = (
  event: NotificationEventRecord,
): NotificationPresentation => {
  const payload = asRecord(event.payload)
  const actor = getActor(payload)
  const actorLabel = getActorLabel(payload)
  const canonicalPayloadRoute = (
    event.type.startsWith('shadow_pin_') &&
    asString(payload.image_id ?? payload.imageId)
  )
    ? getShadowPinRoute(payload)
    : null
  const route = canonicalPayloadRoute ?? (
    asString(event.route) ??
    asString(payload.route) ??
    asString(payload.url) ??
    getFallbackRoute(event, payload)
  )

  return {
    event,
    title: asString(payload.title) ?? getDefaultTitle(event, actorLabel, payload),
    body: (
      asString(payload.body) ??
      asString(payload.body_preview) ??
      asString(payload.preview) ??
      asString(payload.content)
    ),
    route,
    actorLabel,
    avatarUrl: asString(actor.avatar_thumbnail_url ?? actor.avatar_url),
    autoRead: event.type === 'presence_active',
  }
}

export const isNotificationPresentationCandidate = (
  event: NotificationEventRecord,
  visibleSinceMs: number,
  nowMs = Date.now(),
) => {
  if (
    event.read_at ||
    event.presented_at ||
    event.resolved_at
  ) {
    return false
  }

  const createdAt = Date.parse(event.created_at)
  const expiresAt = Date.parse(event.presentation_expires_at)
  return (
    Number.isFinite(createdAt) &&
    Number.isFinite(expiresAt) &&
    createdAt >= visibleSinceMs &&
    expiresAt > nowMs
  )
}

const getTimePartsInZone = (date: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const hour = Number(parts.find(part => part.type === 'hour')?.value)
    const minute = Number(parts.find(part => part.type === 'minute')?.value)
    if (Number.isFinite(hour) && Number.isFinite(minute)) return (hour * 60) + minute
  } catch {
    // Invalid or unavailable zones safely fall back to device-local time.
  }
  return (date.getHours() * 60) + date.getMinutes()
}

const parseClockMinutes = (value: string | null | undefined) => {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})/.exec(value)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return null
  return (hour * 60) + minute
}

export const isNotificationQuietNow = (
  preferences: Partial<NotificationCoordinatorPreferences>,
  now = new Date(),
) => {
  if (
    preferences.mute_until &&
    Date.parse(preferences.mute_until) > now.getTime()
  ) {
    return true
  }

  const start = parseClockMinutes(preferences.quiet_hours_start)
  const end = parseClockMinutes(preferences.quiet_hours_end)
  if (start === null || end === null || start === end) return false

  const current = getTimePartsInZone(
    now,
    preferences.quiet_hours_timezone || 'UTC',
  )
  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}

export const isNotificationTypeEnabled = (
  event: NotificationEventRecord,
  preferences: Partial<NotificationCoordinatorPreferences>,
  now = new Date(),
) => {
  if (preferences.notifications_enabled === false || isNotificationQuietNow(preferences, now)) {
    return false
  }

  const payload = asRecord(event.payload)
  switch (event.type) {
    case 'dm_message': return preferences.dm_enabled !== false
    case 'group_message':
      return preferences.group_enabled !== false && preferences.general_chat_muted !== true
    case 'mention': return preferences.mention_enabled !== false
    case 'reply': return preferences.reply_enabled !== false
    case 'reaction': return preferences.reaction_enabled !== false
    case 'hype_event': return preferences.hype_enabled !== false
    case 'shadow_pin_post': return preferences.shadow_pin_new_post_enabled !== false
    case 'shadow_pin_comment': return preferences.shadow_pin_comment_enabled !== false
    case 'shadow_pin_reply': return preferences.shadow_pin_reply_enabled !== false
    case 'connection_request':
    case 'connection_accepted':
      return (
        preferences.connection_notifications_enabled !== false &&
        payload.notify !== false
      )
    case 'presence_active':
      return (
        preferences.presence_in_app_enabled !== false &&
        payload.notify_in_app !== false
      )
    case 'shado_live_room_started':
    case 'shado_live_room_ended':
    case 'shado_live_speaker_promoted':
    case 'shado_live_speaker_demoted':
    case 'shado_live_participant_muted':
    case 'shado_live_participant_removed':
      return preferences.shado_live_in_app_enabled !== false
    case 'shadow_checkers_turn': return preferences.checkers_turn_enabled !== false
    default: return false
  }
}

export const getNotificationEventMediaIds = (event: NotificationEventRecord) => {
  const payload = asRecord(event.payload)
  return {
    imageId: asString(payload.image_id ?? payload.imageId),
    commentId: asString(payload.comment_id ?? payload.commentId),
    matchId: asString(payload.match_id ?? payload.matchId),
  }
}

const canonicalSearch = (url: URL) => (
  [...url.searchParams.entries()]
    .sort(([leftKey, leftValue], [rightKey, rightValue]) => (
      leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue)
    ))
    .map(([key, value]) => `${key}=${value}`)
    .join('&')
)

export const isNotificationSourceActive = (
  route: string,
  currentHref: string,
) => {
  const expected = new URL(route, currentHref)
  const current = new URL(currentHref)
  if (
    expected.pathname === current.pathname &&
    canonicalSearch(expected) === canonicalSearch(current)
  ) {
    return true
  }

  const expectedView = expected.searchParams.get('view') ?? 'chat'
  const currentView = current.searchParams.get('view') ?? 'chat'
  if (expectedView !== currentView) return false

  if (expectedView === 'dms') {
    const expectedConversation = expected.searchParams.get('conversation')
    return Boolean(
      expectedConversation &&
      expectedConversation === current.searchParams.get('conversation'),
    )
  }

  if (expectedView === 'chat') {
    const expectedThread = expected.searchParams.get('thread')
    const currentThread = current.searchParams.get('thread')
    return expectedThread ? expectedThread === currentThread : !currentThread
  }

  if (expectedView === 'pins') {
    const expectedPin = expected.searchParams.get('pin')
    const expectedComment = expected.searchParams.get('comment')
    const currentPin = current.searchParams.get('pin')
    const currentComment = current.searchParams.get('comment')
    if (!expectedPin) return !currentPin
    if (expectedPin !== currentPin) return false
    return expectedComment ? expectedComment === currentComment : true
  }

  if (expectedView === 'games') {
    return (
      expected.searchParams.get('experience') === current.searchParams.get('experience') &&
      (
        !expected.searchParams.get('item') ||
        expected.searchParams.get('item') === current.searchParams.get('item')
      )
    )
  }

  if (expectedView === 'active-users' || expectedView === 'weather' || expectedView === 'catchup') {
    return true
  }

  return false
}
