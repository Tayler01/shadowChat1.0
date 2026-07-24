export const NOTIFICATION_ENVELOPE_VERSION = 2 as const;

export const NOTIFICATION_CATEGORIES_V2 = [
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
] as const;

export type NotificationCategoryV2 = typeof NOTIFICATION_CATEGORIES_V2[number];

export const NOTIFICATION_SOUND_IDS_V2 = [
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
] as const;

export type NotificationSoundId = typeof NOTIFICATION_SOUND_IDS_V2[number];

const priorities = ['ambient', 'normal', 'high', 'urgent'] as const;
const privacyModes = ['full', 'sender_only', 'private'] as const;
const actionKeys = ['open', 'mark_read'] as const;
const androidChannelKeys = [
  'messages_v1',
  'mentions_v1',
  'social_v1',
  'live_v1',
  'games_v1',
  'weather_v1',
  'security_v1',
] as const;
const badgeCategories = [
  'dm',
  'group',
  'interactions',
  'connections',
  'shadow_pin',
  'games',
  'none',
] as const;

export interface NotificationEnvelopeV2 {
  schemaVersion: 2;
  eventId: string;
  eventIds: string[];
  type: string;
  category: NotificationCategoryV2;
  entityId: string;
  route: string;
  groupKey: string;
  priority: typeof priorities[number];
  privacy: typeof privacyModes[number];
  actor: {
    id: string;
    label: string;
    avatarUrl: string | null;
  } | null;
  content: {
    eyebrow: string;
    title: string;
    body: string | null;
    privateTitle: string;
    privateBody: string | null;
  };
  media: {
    kind: 'image' | 'video';
    thumbnailUrl: string;
    alt: string;
  } | null;
  actions: Array<typeof actionKeys[number]>;
  soundId: NotificationSoundId;
  androidChannelKey: typeof androidChannelKeys[number];
  badgeCategory: typeof badgeCategories[number];
  autoRead: boolean;
  createdAt: string;
  expiresAt: string;
}

const categorySet = new Set<string>(NOTIFICATION_CATEGORIES_V2);
const soundSet = new Set<string>(NOTIFICATION_SOUND_IDS_V2);
const prioritySet = new Set<string>(priorities);
const privacySet = new Set<string>(privacyModes);
const actionSet = new Set<string>(actionKeys);
const androidChannelSet = new Set<string>(androidChannelKeys);
const badgeCategorySet = new Set<string>(badgeCategories);
const MAX_NOTIFICATION_MEDIA_URL_LENGTH = 2048;
const approvedAppHosts = new Set([
  'shadochat.online',
  'www.shadochat.online',
  'shadowchat.app',
  'www.shadowchat.app',
]);
const approvedSupabaseHosts = new Set([
  'shsqqouecvdoifzufkqm.supabase.co',
]);
const envelopeKeys = [
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
];

const asRecord = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const hasExactKeys = (
  record: Record<string, unknown>,
  keys: readonly string[]
) => {
  const actual = Object.keys(record);
  return actual.length === keys.length && actual.every(key => keys.includes(key));
};

const isBoundedString = (
  value: unknown,
  maxLength: number,
  allowEmpty = false
): value is string => (
  typeof value === 'string' &&
  value.length <= maxLength &&
  (allowEmpty || value.trim().length > 0)
);

const isNullableBoundedString = (
  value: unknown,
  maxLength: number
): value is string | null => (
  value === null ||
  (typeof value === 'string' && value.length <= maxLength)
);

const isNotificationDateTime = (value: unknown): value is string => (
  typeof value === 'string' &&
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) &&
  Number.isFinite(Date.parse(value))
);

const isPrivateIpv4 = (hostname: string) => {
  const octets = hostname.split('.');
  if (
    octets.length !== 4 ||
    octets.some(octet => !/^\d{1,3}$/.test(octet) || Number(octet) > 255)
  ) {
    return false;
  }
  const [first, second] = octets.map(Number);
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    first >= 224
  );
};

const isUnsafeNotificationMediaHostname = (value: string) => {
  const hostname = value.toLowerCase().replace(/\.$/, '').replace(/^\[|\]$/g, '');
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
  );
};

export const normalizeNativeNotificationMediaUrl = (value: unknown) => {
  if (typeof value !== 'string') return null;
  const candidate = value.trim();
  if (!candidate || candidate.length > MAX_NOTIFICATION_MEDIA_URL_LENGTH) return null;
  try {
    const parsed = new URL(candidate);
    const hostname = parsed.hostname.toLowerCase().replace(/\.$/, '');
    const approved = (
      approvedAppHosts.has(hostname) ||
      hostname.endsWith('.b-cdn.net') ||
      (
        approvedSupabaseHosts.has(hostname) &&
        (
          parsed.pathname.startsWith('/storage/v1/object/public/') ||
          parsed.pathname.startsWith('/storage/v1/render/image/public/')
        )
      )
    );
    if (
      parsed.protocol !== 'https:' ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      isUnsafeNotificationMediaHostname(hostname) ||
      !approved
    ) return null;
    if (parsed.pathname.startsWith('/storage/v1/render/image/public/')) {
      parsed.pathname = parsed.pathname.replace(
        '/storage/v1/render/image/public/',
        '/storage/v1/object/public/'
      );
      parsed.search = '';
    }
    return parsed.href;
  } catch {
    return null;
  }
};

export const parseNotificationEnvelopeV2 = (
  value: unknown
): NotificationEnvelopeV2 | null => {
  const record = asRecord(value);
  const eventIds = Array.isArray(record.eventIds) ? record.eventIds : [];
  const actor = record.actor === null ? null : asRecord(record.actor);
  const content = asRecord(record.content);
  const media = record.media === null ? null : asRecord(record.media);
  const actions = Array.isArray(record.actions) ? record.actions : [];
  const expiresAt = typeof record.expiresAt === 'string'
    ? Date.parse(record.expiresAt)
    : Number.NaN;

  const valid = (
    hasExactKeys(record, envelopeKeys) &&
    record.schemaVersion === NOTIFICATION_ENVELOPE_VERSION &&
    isBoundedString(record.eventId, 128) &&
    eventIds.length >= 1 &&
    eventIds.length <= 32 &&
    eventIds.every(id => isBoundedString(id, 128)) &&
    new Set(eventIds).size === eventIds.length &&
    eventIds.includes(record.eventId) &&
    isBoundedString(record.type, 64) &&
    categorySet.has(String(record.category)) &&
    isBoundedString(record.entityId, 128) &&
    isBoundedString(record.route, 1024) &&
    record.route.startsWith('/') &&
    !record.route.startsWith('//') &&
    isBoundedString(record.groupKey, 160) &&
    /^[a-z0-9_:-]+$/.test(record.groupKey) &&
    prioritySet.has(String(record.priority)) &&
    privacySet.has(String(record.privacy)) &&
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
            normalizeNativeNotificationMediaUrl(actor.avatarUrl) !== null
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
        normalizeNativeNotificationMediaUrl(media.thumbnailUrl) !== null &&
        isBoundedString(media.alt, 120, true)
      )
    ) &&
    actions.length >= 1 &&
    actions.length <= 2 &&
    actions.every(action => actionSet.has(String(action))) &&
    new Set(actions).size === actions.length &&
    soundSet.has(String(record.soundId)) &&
    androidChannelSet.has(String(record.androidChannelKey)) &&
    badgeCategorySet.has(String(record.badgeCategory)) &&
    typeof record.autoRead === 'boolean' &&
    isNotificationDateTime(record.createdAt) &&
    isNotificationDateTime(record.expiresAt) &&
    Number.isFinite(expiresAt) &&
    expiresAt > Date.now()
  );

  return valid ? record as unknown as NotificationEnvelopeV2 : null;
};
