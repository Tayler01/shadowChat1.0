import type { User } from './supabase'
import { getWorkingClient } from './supabase'
import { pickPublicProfile } from '../../supabase/functions/_shared/public-profile'

export const PERSONAL_BLOCKS_CHANGED_EVENT = 'shadowchat:personal-blocks-changed'

export type BlockedUserEntry = {
  user: User
  blockedAt: string
}
export const fetchMyBlockedUsers = async (): Promise<BlockedUserEntry[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('get_my_blocked_users')
  if (error) throw error

  return ((data ?? []) as Array<{
    blocked_user?: Record<string, unknown> | null
    blocked_at?: string | null
  }>)
    .filter(row => Boolean(row.blocked_user?.id))
    .map(row => ({
      user: pickPublicProfile(row.blocked_user!) as unknown as User,
      blockedAt: row.blocked_at || new Date(0).toISOString(),
    }))
}

export const blockUser = async (targetUserId: string): Promise<boolean> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('block_user', {
    target_user_id: targetUserId,
  })
  if (error) throw error
  return data === true
}

export const unblockUser = async (targetUserId: string): Promise<boolean> => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('unblock_user', {
    target_user_id: targetUserId,
  })
  if (error) throw error
  return data === true
}

export const isBlockedRelationshipError = (error: unknown) => {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown }
  const message = [candidate.message, candidate.details]
    .filter(value => typeof value === 'string')
    .join(' ')

  return candidate.code === '42501' && /messaging is unavailable/i.test(message)
}
