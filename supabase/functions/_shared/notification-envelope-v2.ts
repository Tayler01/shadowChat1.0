export type NotificationPreviewMode = 'full' | 'sender_only' | 'private'

export type NotificationEnvelopeV2Row = {
  event_id: string
  user_id: string
  category_key: string
  title: string
  body: string | null
  private_title: string
  private_body: string | null
  actor_id: string | null
  route: string
  group_key: string
  priority: 'ambient' | 'normal' | 'high' | 'urgent'
  action_keys: string[]
  sound_id: string
  android_channel_key: string
  badge_category: string
  media_ref: Record<string, unknown> | null
  created_at: string
  expires_at: string
}

export type NotificationActorV2 = {
  id: string
  label: string
  avatarUrl: string | null
} | null

export type NotificationMediaV2 = {
  kind: 'image' | 'video'
  thumbnailUrl: string
  alt: string
} | null

const PRESENTATION_CATEGORIES = new Set([
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
])
const SOUND_IDS = new Set([
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
])
const ANDROID_CHANNEL_KEYS = new Set([
  'messages_v1',
  'mentions_v1',
  'social_v1',
  'live_v1',
  'games_v1',
  'weather_v1',
  'security_v1',
])
const BADGE_CATEGORIES = new Set([
  'dm',
  'group',
  'interactions',
  'connections',
  'shadow_pin',
  'games',
  'none',
])
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

const safeRoute = (value: string) => (
  value.startsWith('/') && !value.startsWith('//') && value.length <= 1024
    ? value
    : '/?view=catchup'
)

const bounded = (value: string | null, max: number) => (
  value && value.length > max ? `${value.slice(0, max - 1)}…` : value
)

const boundedRequired = (
  value: unknown,
  max: number,
  fallback: string,
) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return bounded(normalized || fallback, max) ?? fallback
}

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

const getRuntimeSupabaseHostname = () => {
  try {
    const runtime = globalThis as typeof globalThis & {
      Deno?: { env?: { get?: (name: string) => string | undefined } }
    }
    const value = runtime.Deno?.env?.get?.('SUPABASE_URL')
    return value ? new URL(value).hostname.toLowerCase() : null
  } catch {
    return null
  }
}

const isApprovedNotificationMediaUrl = (url: URL) => {
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  const runtimeSupabaseHostname = getRuntimeSupabaseHostname()
  if (
    hostname.endsWith('.b-cdn.net') ||
    APPROVED_NOTIFICATION_APP_HOSTS.has(hostname)
  ) {
    return true
  }
  return Boolean(
    (
      APPROVED_NOTIFICATION_SUPABASE_HOSTS.has(hostname) ||
      (runtimeSupabaseHostname && hostname === runtimeSupabaseHostname)
    ) &&
    (
      url.pathname.startsWith('/storage/v1/object/public/') ||
      url.pathname.startsWith('/storage/v1/render/image/public/')
    )
  )
}

export const normalizeNotificationDeliveryMediaUrl = (value: unknown) => {
  if (typeof value !== 'string') return null
  const candidate = value.trim()
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

const normalizeActor = (
  actor: NotificationActorV2,
  isPrivate: boolean,
): NotificationActorV2 => {
  if (isPrivate || !actor?.id?.trim() || !actor.label?.trim()) return null
  return {
    id: boundedRequired(actor.id, 128, 'unknown'),
    label: boundedRequired(actor.label, 80, 'ShadowChat member'),
    avatarUrl: normalizeNotificationDeliveryMediaUrl(actor.avatarUrl),
  }
}

const normalizeMedia = (
  media: NotificationMediaV2,
  redact: boolean,
): NotificationMediaV2 => {
  if (redact || !media) return null
  const thumbnailUrl = normalizeNotificationDeliveryMediaUrl(media.thumbnailUrl)
  if (!thumbnailUrl) return null
  return {
    kind: media.kind === 'video' ? 'video' : 'image',
    thumbnailUrl,
    alt: bounded(typeof media.alt === 'string' ? media.alt : '', 120) ?? '',
  }
}

export const buildNotificationDeliveryEnvelopeV2 = (
  row: NotificationEnvelopeV2Row,
  options: {
    previewMode: NotificationPreviewMode
    actor: NotificationActorV2
    media: NotificationMediaV2
    soundId?: string | null
    eventType?: string | null
    entityId?: string | null
  },
) => {
  const isPrivate = options.previewMode === 'private'
  const isSenderOnly = options.previewMode === 'sender_only'
  const eventId = boundedRequired(row.event_id, 128, 'notification')
  const category = PRESENTATION_CATEGORIES.has(row.category_key)
    ? row.category_key
    : 'system'
  const fallbackGroupKey = `system:${eventId}`
  const groupKey = (
    row.group_key.length <= 160 &&
    /^[a-z0-9_:-]+$/.test(row.group_key)
  )
    ? row.group_key
    : fallbackGroupKey
  const privateTitle = boundedRequired(
    row.private_title,
    120,
    'New ShadowChat notification',
  )
  const privateBody = bounded(row.private_body, 160)
  const title = boundedRequired(
    isPrivate ? privateTitle : row.title,
    120,
    'New ShadowChat update',
  )
  const body = bounded(
    isPrivate
      ? privateBody
      : isSenderOnly
        ? 'Open ShadowChat to view it.'
        : row.body,
    240,
  )
  const actions = [...new Set(
    row.action_keys.filter(action => action === 'open' || action === 'mark_read'),
  )].slice(0, 2)

  return {
    schemaVersion: 2,
    eventId,
    eventIds: [eventId],
    type: boundedRequired(options.eventType, 64, 'notification'),
    category,
    entityId: boundedRequired(options.entityId, 128, eventId),
    route: safeRoute(row.route),
    groupKey,
    priority: row.priority,
    privacy: options.previewMode,
    actor: normalizeActor(options.actor, isPrivate),
    content: {
      eyebrow: boundedRequired(category.replace(/_/g, ' '), 40, 'ShadowChat'),
      title,
      body,
      privateTitle,
      privateBody,
    },
    media: normalizeMedia(options.media, isPrivate || isSenderOnly),
    actions: actions.length > 0 ? actions : ['open'],
    soundId: SOUND_IDS.has(options.soundId ?? '')
      ? options.soundId
      : SOUND_IDS.has(row.sound_id)
        ? row.sound_id
        : 'system_default',
    androidChannelKey: ANDROID_CHANNEL_KEYS.has(row.android_channel_key)
      ? row.android_channel_key
      : 'security_v1',
    badgeCategory: BADGE_CATEGORIES.has(row.badge_category)
      ? row.badge_category
      : 'interactions',
    autoRead: false,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }
}
