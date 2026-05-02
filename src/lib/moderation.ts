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

export interface PublicUserChannelBan {
  target_user_id: string
  scope: ChannelBanScope
  reason: string | null
  expires_at: string | null
  created_at: string
}

export const CHANNEL_BANS_CHANGED_EVENT = 'shadowchat:channel-bans-changed'

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

export const formatChannelBanExpiry = (value?: string | null) => {
  if (!value) return 'Permanent'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Timed ban'

  return `Until ${date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })}`
}

export const formatChannelBanTimeLeft = (value?: string | null) => {
  if (!value) return 'Permanent ban'

  const end = new Date(value).getTime()
  if (Number.isNaN(end)) return 'Timed ban'

  const remainingMs = Math.max(0, end - Date.now())
  if (remainingMs === 0) return 'Expiring now'

  const minutes = Math.ceil(remainingMs / 60000)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} left`

  const hours = Math.ceil(minutes / 60)
  if (hours < 48) return `${hours} hour${hours === 1 ? '' : 's'} left`

  const days = Math.ceil(hours / 24)
  return `${days} day${days === 1 ? '' : 's'} left`
}

export const formatChannelBanBlockMessage = (ban: PublicUserChannelBan | UserChannelBan) => {
  const reason = ban.reason?.trim() || 'No reason provided.'
  return `You are banned from ${getChannelBanLabel(ban.scope)}. ${formatChannelBanTimeLeft(ban.expires_at)}. Reason: ${reason}`
}

export const describeChannelBanScopes = (bans: Array<PublicUserChannelBan | UserChannelBan>) =>
  bans.map(ban => getChannelBanLabel(ban.scope)).join(', ')

export const notifyChannelBansChanged = (targetUserId: string) => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CHANNEL_BANS_CHANGED_EVENT, { detail: { targetUserId } }))
}

export const listUserChannelBans = async (targetUserId: string) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('list_user_channel_bans', {
    target_user_id: targetUserId,
  })

  if (error) throw error
  return (data ?? []) as UserChannelBan[]
}

export const listPublicUserChannelBans = async (targetUserIds: string[]) => {
  const uniqueIds = Array.from(new Set(targetUserIds.filter(Boolean)))
  if (uniqueIds.length === 0) return [] as PublicUserChannelBan[]

  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('list_public_user_channel_bans', {
    target_user_ids: uniqueIds,
  })

  if (error) throw error
  return (data ?? []) as PublicUserChannelBan[]
}

export const expireUserChannelBans = async () => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('expire_user_channel_bans')
  if (error) throw error
  return Number(data ?? 0)
}

export const getCurrentUserChannelBan = async (scope: ChannelBanScope) => {
  const workingClient = await getWorkingClient()
  const { data: userResult, error: userError } = await workingClient.auth.getUser()
  if (userError || !userResult.user) return null

  const bans = await listPublicUserChannelBans([userResult.user.id])
  return bans.find(ban => ban.scope === scope) ?? null
}

const getErrorText = (error: unknown) => {
  if (!error) return ''
  if (error instanceof Error) return error.message
  if (typeof error === 'object' && 'message' in error) {
    const value = (error as { message?: unknown }).message
    return typeof value === 'string' ? value : ''
  }
  return String(error)
}

export const getBlockedActionMessage = async (
  scope: ChannelBanScope,
  error: unknown,
  fallback: string
) => {
  const directMessage = getErrorText(error)
  if (/you are banned from/i.test(directMessage)) {
    return directMessage
  }

  try {
    const ban = await getCurrentUserChannelBan(scope)
    if (ban) {
      return formatChannelBanBlockMessage(ban)
    }
  } catch {
    // Keep the original action error below if the status check cannot load.
  }

  return fallback
}

export const setUserChannelBans = async (
  targetUserId: string,
  scopes: ChannelBanScope[],
  durationMinutes: number | null,
  reason: string
) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('set_user_channel_bans', {
    target_user_id: targetUserId,
    scopes,
    duration_minutes: durationMinutes,
    reason,
  })

  if (error) throw error
  return (data ?? []) as UserChannelBan[]
}
