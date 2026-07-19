import type {
  NotificationEventRecord,
  NotificationPresentation,
} from './notificationModel'

export const NOTIFICATION_ENVELOPE_VERSION = 2 as const

export const NOTIFICATION_PRESENTATION_CATEGORIES = [
  'dm',
  'general_chat',
  'mentions_replies',
  'reactions_hype',
  'shadow_pin',
  'connections',
  'presence',
  'shado_live',
  'shadow_checkers',
  'shadow_war',
  'weather',
  'security',
  'system',
] as const

export type NotificationPresentationCategory =
  typeof NOTIFICATION_PRESENTATION_CATEGORIES[number]

export const NOTIFICATION_SOUND_IDS = [
  'shadow_whisper',
  'low_glass',
  'gold_signal',
  'hype_burst',
  'pin_shutter',
  'connection_chime',
  'presence_pulse',
  'live_beacon',
  'checkers_move',
  'war_drum',
  'weather_glass',
  'security_signal',
  'system_default',
  'silent',
] as const

export type NotificationSoundId = typeof NOTIFICATION_SOUND_IDS[number]

export const NOTIFICATION_PRIVACY_MODES = ['full', 'sender_only', 'private'] as const
export const NOTIFICATION_PRIORITIES = ['ambient', 'normal', 'high', 'urgent'] as const
export const NOTIFICATION_ACTION_KEYS = ['open', 'mark_read'] as const
export const NOTIFICATION_BADGE_CATEGORIES = [
  'dm',
  'group',
  'interactions',
  'connections',
  'shadow_pin',
  'games',
  'none',
] as const
export const NOTIFICATION_ANDROID_CHANNEL_KEYS = [
  'messages_v1',
  'mentions_v1',
  'social_v1',
  'live_v1',
  'games_v1',
  'weather_v1',
  'security_v1',
] as const

export type NotificationPrivacyMode = typeof NOTIFICATION_PRIVACY_MODES[number]
export type NotificationPriority = typeof NOTIFICATION_PRIORITIES[number]
export type NotificationActionKey = typeof NOTIFICATION_ACTION_KEYS[number]
export type NotificationBadgeCategory = typeof NOTIFICATION_BADGE_CATEGORIES[number]
export type NotificationAndroidChannelKey =
  typeof NOTIFICATION_ANDROID_CHANNEL_KEYS[number]

export interface NotificationEnvelopeV2 {
  schemaVersion: typeof NOTIFICATION_ENVELOPE_VERSION
  eventId: string
  eventIds: string[]
  type: string
  category: NotificationPresentationCategory
  entityId: string
  route: string
  groupKey: string
  priority: NotificationPriority
  privacy: NotificationPrivacyMode
  actor: {
    id: string
    label: string
    avatarUrl: string | null
  } | null
  content: {
    eyebrow: string
    title: string
    body: string | null
    privateTitle: string
    privateBody: string | null
  }
  media: {
    kind: 'image' | 'video'
    thumbnailUrl: string
    alt: string
  } | null
  actions: NotificationActionKey[]
  soundId: NotificationSoundId
  androidChannelKey: NotificationAndroidChannelKey
  badgeCategory: NotificationBadgeCategory
  autoRead: boolean
  createdAt: string
  expiresAt: string
}

export interface NotificationPresentationPolicyV2 {
  previewMode?: NotificationPrivacyMode
  mediaEnabled?: boolean
  soundId?: NotificationSoundId | null
}

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
)

const asString = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : null
)

const bounded = (value: string | null, maxLength: number) => (
  value && value.length > maxLength ? `${value.slice(0, maxLength - 1)}…` : value
)

const MAX_NOTIFICATION_MEDIA_URL_LENGTH = 2048
const APPROVED_NOTIFICATION_APP_HOSTS = new Set([
  'shadochat.online',
  'www.shadochat.online',
  'shadowchat.app',
  'www.shadowchat.app',
])
const APPROVED_NOTIFICATION_SUPABASE_HOSTS = new Set([
  'shsqqouecvdoifzufkqm.supabase.co',
])

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split('.')
  if (
    octets.length !== 4 ||
    octets.some(octet => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    return false
  }
  const [first, second] = octets.map(Number)
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  )
}

const isUnsafeNotificationMediaHostname = (value: string) => {
  const hostname = value.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '')
  return (
    !hostname ||
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    isPrivateIpv4(hostname) ||
    hostname === '::' ||
    hostname === '::1' ||
    hostname.startsWith('fc') ||
    hostname.startsWith('fd') ||
    hostname.startsWith('fe80:') ||
    hostname.startsWith('::ffff:127.') ||
    hostname.startsWith('::ffff:10.') ||
    hostname.startsWith('::ffff:192.168.')
  )
}

const isApprovedNotificationMediaUrl = (url: URL) => {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (
    APPROVED_NOTIFICATION_APP_HOSTS.has(hostname) ||
    hostname.endsWith('.b-cdn.net')
  ) return true
  return (
    APPROVED_NOTIFICATION_SUPABASE_HOSTS.has(hostname) &&
    (
      url.pathname.startsWith('/storage/v1/object/public/') ||
      url.pathname.startsWith('/storage/v1/render/image/public/')
    )
  )
}

const normalizeSafeRoute = (route: string) => {
  try {
    const parsed = new URL(route, 'https://shadowchat.invalid')
    if (parsed.origin !== 'https://shadowchat.invalid') return '/?view=catchup'
    if (!parsed.pathname.startsWith('/') || parsed.pathname.startsWith('//')) {
      return '/?view=catchup'
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return '/?view=catchup'
  }
}

export const normalizeNotificationMediaUrl = (value: unknown) => {
  const candidate = asString(value)
  if (!candidate || candidate.length > MAX_NOTIFICATION_MEDIA_URL_LENGTH) return null
  try {
    const parsed = new URL(candidate)
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      isUnsafeNotificationMediaHostname(parsed.hostname) ||
      !isApprovedNotificationMediaUrl(parsed)
    ) return null
    return parsed.href
  } catch {
    return null
  }
}

interface NotificationTypePolicy {
  category: NotificationPresentationCategory
  eyebrow: string
  groupKey: (event: NotificationEventRecord, payload: Record<string, unknown>) => string
  priority: NotificationPriority
  soundId: NotificationSoundId
  channel: NotificationAndroidChannelKey
  badge: NotificationBadgeCategory
  actionLabel: string
}

const entityGroup = (prefix: string) => (event: NotificationEventRecord) =>
  `${prefix}:${event.entity_id}`

const typePolicies: Record<string, NotificationTypePolicy> = {
  dm_message: {
    category: 'dm',
    eyebrow: 'Direct message',
    groupKey: (event) => `dm:${event.conversation_id ?? event.entity_id}`,
    priority: 'high',
    soundId: 'shadow_whisper',
    channel: 'messages_v1',
    badge: 'dm',
    actionLabel: 'Open DM',
  },
  group_message: {
    category: 'general_chat',
    eyebrow: 'General Chat',
    groupKey: (event, payload) => `group:${asString(payload.thread_id) ?? event.message_id ?? 'general'}`,
    priority: 'normal',
    soundId: 'low_glass',
    channel: 'messages_v1',
    badge: 'group',
    actionLabel: 'Open Chat',
  },
  mention: {
    category: 'mentions_replies',
    eyebrow: 'Mention',
    groupKey: entityGroup('mention'),
    priority: 'high',
    soundId: 'gold_signal',
    channel: 'mentions_v1',
    badge: 'interactions',
    actionLabel: 'View Message',
  },
  reply: {
    category: 'mentions_replies',
    eyebrow: 'Reply',
    groupKey: entityGroup('reply'),
    priority: 'high',
    soundId: 'gold_signal',
    channel: 'mentions_v1',
    badge: 'interactions',
    actionLabel: 'View Reply',
  },
  reaction: {
    category: 'reactions_hype',
    eyebrow: 'Reaction',
    groupKey: (event) => `message:${event.message_id ?? event.dm_message_id ?? event.entity_id}:reactions`,
    priority: 'normal',
    soundId: 'hype_burst',
    channel: 'social_v1',
    badge: 'interactions',
    actionLabel: 'View Reaction',
  },
  hype_event: {
    category: 'reactions_hype',
    eyebrow: 'Hype',
    groupKey: entityGroup('hype'),
    priority: 'normal',
    soundId: 'hype_burst',
    channel: 'social_v1',
    badge: 'interactions',
    actionLabel: 'Open Hype',
  },
  shadow_pin_post: {
    category: 'shadow_pin',
    eyebrow: 'ShadowPin',
    groupKey: entityGroup('pin'),
    priority: 'normal',
    soundId: 'pin_shutter',
    channel: 'social_v1',
    badge: 'shadow_pin',
    actionLabel: 'View Pin',
  },
  shadow_pin_comment: {
    category: 'shadow_pin',
    eyebrow: 'ShadowPin conversation',
    groupKey: (event, payload) => `pin:${asString(payload.image_id) ?? event.entity_id}:conversation`,
    priority: 'normal',
    soundId: 'pin_shutter',
    channel: 'social_v1',
    badge: 'shadow_pin',
    actionLabel: 'View Comment',
  },
  shadow_pin_reply: {
    category: 'shadow_pin',
    eyebrow: 'ShadowPin conversation',
    groupKey: (event, payload) => `pin:${asString(payload.image_id) ?? event.entity_id}:conversation`,
    priority: 'high',
    soundId: 'gold_signal',
    channel: 'mentions_v1',
    badge: 'shadow_pin',
    actionLabel: 'View Reply',
  },
  connection_request: {
    category: 'connections',
    eyebrow: 'Connection request',
    groupKey: (event) => `connection:${event.actor_id ?? event.entity_id}`,
    priority: 'high',
    soundId: 'connection_chime',
    channel: 'social_v1',
    badge: 'connections',
    actionLabel: 'Review Connection',
  },
  connection_accepted: {
    category: 'connections',
    eyebrow: 'Connection',
    groupKey: (event) => `connection:${event.actor_id ?? event.entity_id}`,
    priority: 'normal',
    soundId: 'connection_chime',
    channel: 'social_v1',
    badge: 'connections',
    actionLabel: 'View Connection',
  },
  presence_active: {
    category: 'presence',
    eyebrow: 'Active now',
    groupKey: (event) => `presence:${event.actor_id ?? event.entity_id}`,
    priority: 'ambient',
    soundId: 'presence_pulse',
    channel: 'social_v1',
    badge: 'none',
    actionLabel: 'View Active Users',
  },
  shado_live_room_started: {
    category: 'shado_live',
    eyebrow: 'Shado Live',
    groupKey: entityGroup('live'),
    priority: 'high',
    soundId: 'live_beacon',
    channel: 'live_v1',
    badge: 'games',
    actionLabel: 'Join Live',
  },
  shado_live_room_ended: {
    category: 'shado_live',
    eyebrow: 'Shado Live',
    groupKey: entityGroup('live'),
    priority: 'ambient',
    soundId: 'silent',
    channel: 'live_v1',
    badge: 'games',
    actionLabel: 'View Room',
  },
  shado_live_speaker_promoted: {
    category: 'shado_live',
    eyebrow: 'Shado Live stage',
    groupKey: entityGroup('live'),
    priority: 'high',
    soundId: 'live_beacon',
    channel: 'live_v1',
    badge: 'games',
    actionLabel: 'Join Stage',
  },
  shado_live_speaker_demoted: {
    category: 'shado_live',
    eyebrow: 'Shado Live stage',
    groupKey: entityGroup('live'),
    priority: 'normal',
    soundId: 'live_beacon',
    channel: 'live_v1',
    badge: 'games',
    actionLabel: 'Open Room',
  },
  shado_live_participant_muted: {
    category: 'shado_live',
    eyebrow: 'Shado Live stage',
    groupKey: entityGroup('live'),
    priority: 'high',
    soundId: 'live_beacon',
    channel: 'live_v1',
    badge: 'games',
    actionLabel: 'Open Room',
  },
  shado_live_participant_removed: {
    category: 'shado_live',
    eyebrow: 'Shado Live stage',
    groupKey: entityGroup('live'),
    priority: 'urgent',
    soundId: 'security_signal',
    channel: 'security_v1',
    badge: 'games',
    actionLabel: 'Review',
  },
  shadow_checkers_turn: {
    category: 'shadow_checkers',
    eyebrow: 'Shadow Checkers',
    groupKey: entityGroup('checkers'),
    priority: 'high',
    soundId: 'checkers_move',
    channel: 'games_v1',
    badge: 'games',
    actionLabel: 'Play Turn',
  },
  shadow_war_turn: {
    category: 'shadow_war',
    eyebrow: 'Shadow War',
    groupKey: entityGroup('shadow-war'),
    priority: 'high',
    soundId: 'war_drum',
    channel: 'games_v1',
    badge: 'games',
    actionLabel: 'Open Battle',
  },
  weather_alert: {
    category: 'weather',
    eyebrow: 'Weather alert',
    groupKey: entityGroup('weather'),
    priority: 'urgent',
    soundId: 'weather_glass',
    channel: 'weather_v1',
    badge: 'none',
    actionLabel: 'View Weather',
  },
  security_alert: {
    category: 'security',
    eyebrow: 'Security',
    groupKey: entityGroup('security'),
    priority: 'urgent',
    soundId: 'security_signal',
    channel: 'security_v1',
    badge: 'interactions',
    actionLabel: 'Review',
  },
}

const fallbackPolicy: NotificationTypePolicy = {
  category: 'system',
  eyebrow: 'ShadowChat',
  groupKey: entityGroup('system'),
  priority: 'normal',
  soundId: 'system_default',
  channel: 'security_v1',
  badge: 'interactions',
  actionLabel: 'Open',
}

export const getNotificationTypePolicyV2 = (type: string) =>
  typePolicies[type] ?? fallbackPolicy

export const isNotificationSoundId = (value: unknown): value is NotificationSoundId =>
  typeof value === 'string' && NOTIFICATION_SOUND_IDS.includes(value as NotificationSoundId)

export const buildNotificationEnvelopeV2 = (
  event: NotificationEventRecord,
  presentation: NotificationPresentation,
  policy: NotificationPresentationPolicyV2 = {},
): NotificationEnvelopeV2 => {
  const payload = asRecord(event.payload)
  const typePolicy = getNotificationTypePolicyV2(event.type)
  const actorPayload = asRecord(payload.actor ?? payload.sender ?? payload.profile)
  const actorLabel = presentation.actorLabel
  const actorId = event.actor_id ?? asString(actorPayload.id)
  const previewMode = policy.previewMode ?? 'full'
  const thumbnailUrl = normalizeNotificationMediaUrl(
    payload.thumbnail_url ??
    payload.thumbnailUrl ??
    payload.image_thumbnail_url ??
    payload.media_thumbnail_url,
  )
  const mediaKind = asString(payload.media_kind ?? payload.mediaKind) === 'video'
    ? 'video'
    : 'image'
  const eventId = bounded(asString(event.id), 128) ?? 'notification'
  const entityId = bounded(asString(event.entity_id), 128) ?? eventId
  const type = bounded(asString(event.type), 64) ?? 'notification'
  const rawGroupKey = typePolicy.groupKey(event, payload)
  const groupKey = (
    rawGroupKey.length <= 160 &&
    /^[a-z0-9_:-]+$/.test(rawGroupKey)
  )
    ? rawGroupKey
    : `system:${eventId}`
  const eventIds = [eventId]

  return {
    schemaVersion: NOTIFICATION_ENVELOPE_VERSION,
    eventId,
    eventIds,
    type,
    category: typePolicy.category,
    entityId,
    route: normalizeSafeRoute(presentation.route),
    groupKey,
    priority: typePolicy.priority,
    privacy: previewMode,
    actor: previewMode === 'private' || !actorId || !actorLabel
      ? null
      : {
          id: actorId,
          label: bounded(actorLabel, 80) ?? 'ShadowChat member',
          avatarUrl: normalizeNotificationMediaUrl(presentation.avatarUrl),
        },
    content: {
      eyebrow: typePolicy.eyebrow,
      title: bounded(presentation.title, 120) ?? 'New ShadowChat update',
      body: bounded(presentation.body, 240),
      privateTitle: 'New ShadowChat notification',
      privateBody: 'Open ShadowChat to view it.',
    },
    media: (
      previewMode === 'full' &&
      policy.mediaEnabled !== false &&
      thumbnailUrl
    )
      ? {
          kind: mediaKind,
          thumbnailUrl,
          alt: bounded(asString(payload.media_alt ?? payload.title), 120) ?? '',
        }
      : null,
    actions: ['open', 'mark_read'],
    soundId: policy.soundId && isNotificationSoundId(policy.soundId)
      ? policy.soundId
      : typePolicy.soundId,
    androidChannelKey: typePolicy.channel,
    badgeCategory: typePolicy.badge,
    autoRead: presentation.autoRead,
    createdAt: event.created_at,
    expiresAt: event.presentation_expires_at,
  }
}

export const getEnvelopeVisibleContent = (envelope: NotificationEnvelopeV2) => {
  if (envelope.privacy === 'private') {
    return {
      title: envelope.content.privateTitle,
      body: envelope.content.privateBody,
      actor: null,
      media: null,
    }
  }
  if (envelope.privacy === 'sender_only') {
    return {
      title: envelope.content.title,
      body: 'Open ShadowChat to view it.',
      actor: envelope.actor,
      media: null,
    }
  }
  return {
    title: envelope.content.title,
    body: envelope.content.body,
    actor: envelope.actor,
    media: envelope.media,
  }
}

export const getNotificationPrimaryActionLabel = (type: string) =>
  getNotificationTypePolicyV2(type).actionLabel

const ENVELOPE_KEYS = [
  'schemaVersion',
  'eventId',
  'eventIds',
  'type',
  'category',
  'entityId',
  'route',
  'groupKey',
  'priority',
  'privacy',
  'actor',
  'content',
  'media',
  'actions',
  'soundId',
  'androidChannelKey',
  'badgeCategory',
  'autoRead',
  'createdAt',
  'expiresAt',
] as const

const hasExactKeys = (
  record: Record<string, unknown>,
  keys: readonly string[],
) => {
  const actual = Object.keys(record)
  return actual.length === keys.length && actual.every(key => keys.includes(key))
}

const isBoundedString = (
  value: unknown,
  maxLength: number,
  allowEmpty = false,
): value is string => (
  typeof value === 'string' &&
  value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0)
)

const isNullableBoundedString = (
  value: unknown,
  maxLength: number,
): value is string | null => (
  value === null ||
  (typeof value === 'string' && value.length <= maxLength)
)

const isNotificationDateTime = (value: unknown): value is string => (
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value))
)

export const isNotificationEnvelopeV2 = (
  value: unknown,
): value is NotificationEnvelopeV2 => {
  const record = asRecord(value)
  const eventIds = Array.isArray(record.eventIds) ? record.eventIds : []
  const actor = record.actor === null ? null : asRecord(record.actor)
  const content = asRecord(record.content)
  const media = record.media === null ? null : asRecord(record.media)
  const actions = Array.isArray(record.actions) ? record.actions : []
  const expiresAt = typeof record.expiresAt === 'string'
    ? Date.parse(record.expiresAt)
    : Number.NaN

  return (
    hasExactKeys(record, ENVELOPE_KEYS) &&
    record.schemaVersion === NOTIFICATION_ENVELOPE_VERSION &&
    isBoundedString(record.eventId, 128) &&
    eventIds.length >= 1 &&
    eventIds.length <= 32 &&
    eventIds.every(id => isBoundedString(id, 128)) &&
    new Set(eventIds).size === eventIds.length &&
    eventIds.includes(record.eventId) &&
    isBoundedString(record.type, 64) &&
    NOTIFICATION_PRESENTATION_CATEGORIES.includes(
      record.category as NotificationPresentationCategory,
    ) &&
    isBoundedString(record.entityId, 128) &&
    isBoundedString(record.route, 1024) &&
    normalizeSafeRoute(record.route) === record.route &&
    isBoundedString(record.groupKey, 160) &&
    /^[a-z0-9_:-]+$/.test(record.groupKey) &&
    NOTIFICATION_PRIORITIES.includes(record.priority as NotificationPriority) &&
    NOTIFICATION_PRIVACY_MODES.includes(record.privacy as NotificationPrivacyMode) &&
    (
      actor === null ||
      (
        hasExactKeys(actor, ['id', 'label', 'avatarUrl']) &&
        isBoundedString(actor.id, 128) &&
        isBoundedString(actor.label, 80) &&
        (
          actor.avatarUrl === null ||
          (
            isBoundedString(actor.avatarUrl, MAX_NOTIFICATION_MEDIA_URL_LENGTH) &&
            normalizeNotificationMediaUrl(actor.avatarUrl) !== null
          )
        )
      )
    ) &&
    hasExactKeys(content, [
      'eyebrow',
      'title',
      'body',
      'privateTitle',
      'privateBody',
    ]) &&
    isBoundedString(content.eyebrow, 40) &&
    isBoundedString(content.title, 120) &&
    isNullableBoundedString(content.body, 240) &&
    isBoundedString(content.privateTitle, 120) &&
    isNullableBoundedString(content.privateBody, 160) &&
    (
      media === null ||
      (
        hasExactKeys(media, ['kind', 'thumbnailUrl', 'alt']) &&
        (media.kind === 'image' || media.kind === 'video') &&
        isBoundedString(media.thumbnailUrl, MAX_NOTIFICATION_MEDIA_URL_LENGTH) &&
        normalizeNotificationMediaUrl(media.thumbnailUrl) !== null &&
        isBoundedString(media.alt, 120, true)
      )
    ) &&
    actions.length >= 1 &&
    actions.length <= 2 &&
    actions.every(action =>
      NOTIFICATION_ACTION_KEYS.includes(action as NotificationActionKey)
    ) &&
    new Set(actions).size === actions.length &&
    isNotificationSoundId(record.soundId) &&
    NOTIFICATION_ANDROID_CHANNEL_KEYS.includes(
      record.androidChannelKey as NotificationAndroidChannelKey,
    ) &&
    NOTIFICATION_BADGE_CATEGORIES.includes(
      record.badgeCategory as NotificationBadgeCategory,
    ) &&
    typeof record.autoRead === 'boolean' &&
    isNotificationDateTime(record.createdAt) &&
    isNotificationDateTime(record.expiresAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  )
}
