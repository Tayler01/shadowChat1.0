import { getWorkingClient } from '../../lib/supabase'
import {
  getNotificationTypePolicyV2,
  isNotificationSoundId,
  type NotificationPresentationCategory,
  type NotificationSoundId,
} from './notificationEnvelopeV2'

export interface NotificationCategoryPresentationPreference {
  user_id: string
  category_key: NotificationPresentationCategory
  sound_id: NotificationSoundId
}

export interface NotificationCategoryPresentationOption {
  category: NotificationPresentationCategory
  label: string
  description: string
  defaultSoundId: NotificationSoundId
}

export const ACTIVE_NOTIFICATION_EVENT_TYPES = [
  'dm_message',
  'group_message',
  'mention',
  'reply',
  'reaction',
  'hype_event',
  'shadow_pin_post',
  'shadow_pin_comment',
  'shadow_pin_reply',
  'connection_request',
  'connection_accepted',
  'presence_active',
  'shado_live_room_started',
  'shado_live_room_ended',
  'shado_live_speaker_promoted',
  'shado_live_speaker_demoted',
  'shado_live_participant_muted',
  'shado_live_participant_removed',
  'shadow_checkers_turn',
  'shadow_war_turn',
  'weather_alert',
  'security_alert',
] as const

export type ActiveNotificationEventType =
  typeof ACTIVE_NOTIFICATION_EVENT_TYPES[number]

export type NotificationSoundSection =
  | 'Messages'
  | 'Social & ShadowPin'
  | 'Shado Live'
  | 'Games'
  | 'Weather & Security'

export interface NotificationEventPresentationOption {
  eventType: ActiveNotificationEventType
  category: NotificationPresentationCategory
  section: NotificationSoundSection
  label: string
  description: string
  defaultSoundId: NotificationSoundId
}

export const NOTIFICATION_SOUND_OPTIONS: Array<{
  id: NotificationSoundId
  label: string
}> = [
  { id: 'shadow_whisper', label: 'Shadow Whisper' },
  { id: 'low_glass', label: 'Low Glass' },
  { id: 'gold_signal', label: 'Gold Signal' },
  { id: 'hype_burst', label: 'Hype Burst' },
  { id: 'pin_shutter', label: 'Pin Shutter' },
  { id: 'connection_chime', label: 'Connection Chime' },
  { id: 'presence_pulse', label: 'Presence Pulse' },
  { id: 'live_beacon', label: 'Live Beacon' },
  { id: 'checkers_move', label: 'Checkers Move' },
  { id: 'war_drum', label: 'War Drum' },
  { id: 'weather_glass', label: 'Weather Glass' },
  { id: 'security_signal', label: 'Security Signal' },
  { id: 'system_default', label: 'System Default' },
  { id: 'silent', label: 'Silent' },
]

export const NOTIFICATION_CATEGORY_PRESENTATION_OPTIONS:
  NotificationCategoryPresentationOption[] = [
    {
      category: 'dm',
      label: 'Direct Messages',
      description: 'Private conversations',
      defaultSoundId: getNotificationTypePolicyV2('dm_message').soundId,
    },
    {
      category: 'general_chat',
      label: 'General Chat',
      description: 'New room messages',
      defaultSoundId: getNotificationTypePolicyV2('group_message').soundId,
    },
    {
      category: 'mentions_replies',
      label: 'Mentions & Replies',
      description: 'Activity directed at you',
      defaultSoundId: getNotificationTypePolicyV2('mention').soundId,
    },
    {
      category: 'reactions_hype',
      label: 'Reactions & Hype',
      description: 'Fast social feedback',
      defaultSoundId: getNotificationTypePolicyV2('reaction').soundId,
    },
    {
      category: 'shadow_pin',
      label: 'ShadowPin',
      description: 'Posts and conversations',
      defaultSoundId: getNotificationTypePolicyV2('shadow_pin_post').soundId,
    },
    {
      category: 'connections',
      label: 'Connections',
      description: 'Requests and accepted connections',
      defaultSoundId: getNotificationTypePolicyV2('connection_request').soundId,
    },
    {
      category: 'presence',
      label: 'Active Users',
      description: 'Members becoming active',
      defaultSoundId: getNotificationTypePolicyV2('presence_active').soundId,
    },
    {
      category: 'shado_live',
      label: 'Shado Live',
      description: 'Rooms and stage changes',
      defaultSoundId: getNotificationTypePolicyV2('shado_live_room_started').soundId,
    },
    {
      category: 'shadow_checkers',
      label: 'Shadow Checkers',
      description: 'Your turn is ready',
      defaultSoundId: getNotificationTypePolicyV2('shadow_checkers_turn').soundId,
    },
    {
      category: 'shadow_war',
      label: 'Shadow War',
      description: 'Battle updates and turns',
      defaultSoundId: getNotificationTypePolicyV2('shadow_war_turn').soundId,
    },
    {
      category: 'weather',
      label: 'Weather',
      description: 'Eligible severe alerts',
      defaultSoundId: getNotificationTypePolicyV2('weather_alert').soundId,
    },
    {
      category: 'security',
      label: 'Security',
      description: 'Account and device warnings',
      defaultSoundId: getNotificationTypePolicyV2('security_alert').soundId,
    },
  ]

const eventOption = (
  eventType: ActiveNotificationEventType,
  section: NotificationSoundSection,
  label: string,
  description: string,
): NotificationEventPresentationOption => {
  const policy = getNotificationTypePolicyV2(eventType)
  return {
    eventType,
    category: policy.category,
    section,
    label,
    description,
    defaultSoundId: policy.soundId,
  }
}

export const NOTIFICATION_EVENT_PRESENTATION_OPTIONS: NotificationEventPresentationOption[] = [
  eventOption('dm_message', 'Messages', 'Direct message', 'A new private message'),
  eventOption('group_message', 'Messages', 'General Chat message', 'A new room message'),
  eventOption('mention', 'Messages', 'Mention', 'Someone mentions you'),
  eventOption('reply', 'Messages', 'Reply', 'Someone replies directly to you'),
  eventOption('reaction', 'Social & ShadowPin', 'Reaction', 'Someone reacts to your message'),
  eventOption('hype_event', 'Social & ShadowPin', 'Hype', 'Someone hypes your message'),
  eventOption('shadow_pin_post', 'Social & ShadowPin', 'New ShadowPin', 'A new post is published'),
  eventOption('shadow_pin_comment', 'Social & ShadowPin', 'ShadowPin comment', 'A comment on your pin'),
  eventOption('shadow_pin_reply', 'Social & ShadowPin', 'ShadowPin reply', 'A reply in a pin conversation'),
  eventOption('connection_request', 'Social & ShadowPin', 'Connection request', 'A member wants to connect'),
  eventOption('connection_accepted', 'Social & ShadowPin', 'Connection accepted', 'A request is accepted'),
  eventOption('presence_active', 'Social & ShadowPin', 'Member active', 'An eligible member becomes active'),
  eventOption('shado_live_room_started', 'Shado Live', 'Room started', 'A Shado Live room begins'),
  eventOption('shado_live_room_ended', 'Shado Live', 'Room ended', 'A Shado Live room closes'),
  eventOption('shado_live_speaker_promoted', 'Shado Live', 'Invited to speak', 'You are invited onto the stage'),
  eventOption('shado_live_speaker_demoted', 'Shado Live', 'Returned to listener', 'Your stage role changes'),
  eventOption('shado_live_participant_muted', 'Shado Live', 'Muted by host', 'A host mutes your microphone'),
  eventOption('shado_live_participant_removed', 'Shado Live', 'Removed from room', 'A host removes you from a room'),
  eventOption('shadow_checkers_turn', 'Games', 'Shadow Checkers turn', 'Your next move is ready'),
  eventOption('shadow_war_turn', 'Games', 'Shadow War turn', 'Your next move is ready'),
  eventOption('weather_alert', 'Weather & Security', 'Weather alert', 'Important weather near a saved location'),
  eventOption('security_alert', 'Weather & Security', 'Security alert', 'Important account and safety information'),
]

export const getDefaultNotificationSoundMap = () => (
  Object.fromEntries(
    NOTIFICATION_CATEGORY_PRESENTATION_OPTIONS.map(option => [
      option.category,
      option.defaultSoundId,
    ]),
  ) as Record<NotificationPresentationCategory, NotificationSoundId>
)

export const getDefaultNotificationEventSoundMap = (
  categorySoundMap: Record<NotificationPresentationCategory, NotificationSoundId> =
    getDefaultNotificationSoundMap(),
) => (
  Object.fromEntries(
    NOTIFICATION_EVENT_PRESENTATION_OPTIONS.map(option => [
      option.eventType,
      categorySoundMap[option.category] ?? option.defaultSoundId,
    ]),
  ) as Record<ActiveNotificationEventType, NotificationSoundId>
)

export const fetchNotificationCategoryPresentationPreferences = async (
  userId: string,
) => {
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('notification_category_presentation_preferences')
    .select('user_id, category_key, sound_id')
    .eq('user_id', userId)

  if (error) {
    if (
      error.code === '42P01' ||
      error.message?.includes('notification_category_presentation_preferences')
    ) {
      return getDefaultNotificationSoundMap()
    }
    throw error
  }

  const result = getDefaultNotificationSoundMap()
  for (const row of data ?? []) {
    const category = row.category_key as NotificationPresentationCategory
    if (category in result && isNotificationSoundId(row.sound_id)) {
      result[category] = row.sound_id
    }
  }
  return result
}

export const updateNotificationCategorySound = async (
  userId: string,
  category: NotificationPresentationCategory,
  soundId: NotificationSoundId,
) => {
  const client = await getWorkingClient()
  const { error } = await client
    .from('notification_category_presentation_preferences')
    .upsert({
      user_id: userId,
      category_key: category,
      sound_id: soundId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,category_key',
    })

  if (error) throw error
}

export const fetchNotificationEventPresentationPreferences = async (
  userId: string,
  categorySoundMap?: Record<NotificationPresentationCategory, NotificationSoundId>,
) => {
  const fallback = categorySoundMap ??
    await fetchNotificationCategoryPresentationPreferences(userId)
  const result = getDefaultNotificationEventSoundMap(fallback)
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('notification_event_presentation_preferences')
    .select('event_type, sound_id')
    .eq('user_id', userId)

  if (error) {
    if (
      error.code === '42P01' ||
      error.message?.includes('notification_event_presentation_preferences')
    ) {
      return result
    }
    throw error
  }

  for (const row of data ?? []) {
    const eventType = row.event_type as ActiveNotificationEventType
    if (eventType in result && isNotificationSoundId(row.sound_id)) {
      result[eventType] = row.sound_id
    }
  }
  return result
}

export const updateNotificationEventSound = async (
  userId: string,
  eventType: ActiveNotificationEventType,
  soundId: NotificationSoundId,
) => {
  const client = await getWorkingClient()
  const { error } = await client
    .from('notification_event_presentation_preferences')
    .upsert({
      user_id: userId,
      event_type: eventType,
      sound_id: soundId,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id,event_type',
    })

  if (error) throw error
}

export const getNotificationSoundLabel = (soundId: NotificationSoundId) => (
  NOTIFICATION_SOUND_OPTIONS.find(option => option.id === soundId)?.label ??
  'System Default'
)
