import { getWorkingClient } from './supabase'

export type ChannelBanScope = 'general_chat' | 'news_chat' | 'news_feed'

export interface UserChannelBan {
  id: string
  target_user_id: string
  scope: ChannelBanScope
  banned_by?: string | null
  reason?: string | null
  expires_at?: string | null
  revoked_at?: string | null
  revoked_by?: string | null
  created_at: string
  updated_at: string
}

export const CHANNEL_BAN_OPTIONS: Array<{ scope: ChannelBanScope; label: string; description: string }> = [
  {
    scope: 'general_chat',
    label: 'General Chat',
    description: 'Blocks group channel messages, edits, and reactions.',
  },
  {
    scope: 'news_chat',
    label: 'News Chat',
    description: 'Blocks News channel messages, edits, and reactions.',
  },
  {
    scope: 'news_feed',
    label: 'News Feed',
    description: 'Blocks reactions on News Feed articles.',
  },
]

export const CHANNEL_BAN_DURATIONS = [
  { value: '60', label: '1 hour' },
  { value: '1440', label: '24 hours' },
  { value: '10080', label: '7 days' },
  { value: '43200', label: '30 days' },
  { value: 'permanent', label: 'Permanent' },
] as const

export type ChannelBanDuration = typeof CHANNEL_BAN_DURATIONS[number]['value']

export const getChannelBanLabel = (scope: ChannelBanScope) =>
  CHANNEL_BAN_OPTIONS.find(option => option.scope === scope)?.label ?? scope

export const listUserChannelBans = async (targetUserId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('list_user_channel_bans', {
    target_user_id: targetUserId,
  })

  if (error) throw error
  return (data ?? []) as UserChannelBan[]
}

export const setUserChannelBans = async (
  targetUserId: string,
  scopes: ChannelBanScope[],
  durationMinutes: number | null,
  reason?: string | null
) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('set_user_channel_bans', {
    target_user_id: targetUserId,
    scopes,
    duration_minutes: durationMinutes,
    reason: reason ?? null,
  })

  if (error) throw error
  return (data ?? []) as UserChannelBan[]
}
