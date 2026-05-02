import { getWorkingClient } from './supabase'

export type ReadSurface = 'general_chat' | 'news_chat' | 'dm' | (string & {})

export interface UserReadCursor {
  user_id: string
  surface: string
  scope_id: string
  last_read_message_id: string | null
  last_read_at: string
  updated_at: string
}

const normalizeScopeId = (scopeId?: string | null) => {
  const trimmed = scopeId?.trim()
  return trimmed || 'main'
}

export const fetchUserReadCursor = async (
  surface: ReadSurface,
  scopeId?: string | null
) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('get_user_read_cursor', {
    target_surface: surface,
    target_scope_id: normalizeScopeId(scopeId),
  })

  if (error) throw error
  const rows = (data ?? []) as UserReadCursor[]
  return rows[0] ?? null
}

export const setUserReadCursor = async (
  surface: ReadSurface,
  scopeId: string | null | undefined,
  messageId: string | null,
  messageCreatedAt?: string | null
) => {
  const workingClient = await getWorkingClient()
  const { data, error } = await workingClient.rpc('set_user_read_cursor', {
    target_surface: surface,
    target_scope_id: normalizeScopeId(scopeId),
    target_last_read_message_id: messageId,
    target_last_read_at: messageCreatedAt ?? new Date().toISOString(),
  })

  if (error) throw error
  const rows = (data ?? []) as UserReadCursor[]
  return rows[0] ?? null
}
