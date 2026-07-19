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

export const getDefaultNotificationSoundMap = () => (
  Object.fromEntries(
    NOTIFICATION_CATEGORY_PRESENTATION_OPTIONS.map(option => [
      option.category,
      option.defaultSoundId,
    ]),
  ) as Record<NotificationPresentationCategory, NotificationSoundId>
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
