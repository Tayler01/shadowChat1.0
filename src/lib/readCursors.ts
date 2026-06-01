import { getWorkingClient } from './supabase'

export type ReadSurface = 'general_chat' | 'news_chat' | 'board_chat' | 'dm' | (string & {})

export interface MessageKey {
  created_at: string | null | undefined
  id: string | null | undefined
}

export interface UserReadCursor {
  user_id: string
  surface: string
  scope_id: string
  last_read_message_id: string | null
  last_read_at: string
  updated_at: string
}

type CursorKeySource = Pick<UserReadCursor, 'last_read_at' | 'last_read_message_id'>

const normalizeScopeId = (scopeId?: string | null) => {
  const trimmed = scopeId?.trim()
  return trimmed || 'main'
}

const compareCreatedAt = (
  leftCreatedAt: string | null | undefined,
  rightCreatedAt: string | null | undefined
) => {
  const leftValue = leftCreatedAt ?? ''
  const rightValue = rightCreatedAt ?? ''
  const leftTime = Date.parse(leftValue)
  const rightTime = Date.parse(rightValue)

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    if (leftTime < rightTime) return -1
    if (leftTime > rightTime) return 1
    return 0
  }

  return leftValue.localeCompare(rightValue)
}

const cursorToMessageKey = (cursor: CursorKeySource | null | undefined): MessageKey | null => {
  if (!cursor?.last_read_at) return null

  return {
    created_at: cursor.last_read_at,
    id: cursor.last_read_message_id,
  }
}

const isCursorKeySource = (
  keyOrCursor: MessageKey | CursorKeySource
): keyOrCursor is CursorKeySource => 'last_read_at' in keyOrCursor

const resolveComparableKey = (
  keyOrCursor: MessageKey | CursorKeySource | null | undefined
) => {
  if (!keyOrCursor) return null
  if (isCursorKeySource(keyOrCursor)) {
    return cursorToMessageKey(keyOrCursor)
  }

  return keyOrCursor
}

export const compareMessageKey = (
  left: MessageKey | null | undefined,
  right: MessageKey | null | undefined
) => {
  const createdAtOrder = compareCreatedAt(left?.created_at, right?.created_at)
  if (createdAtOrder !== 0) return createdAtOrder

  return (left?.id ?? '').localeCompare(right?.id ?? '')
}

export const isMessageAfterCursor = (
  message: MessageKey | null | undefined,
  cursor: CursorKeySource | null | undefined
) => {
  const cursorKey = cursorToMessageKey(cursor)
  if (!message || !cursorKey) return false

  return compareMessageKey(message, cursorKey) > 0
}

export const isMessageKeyAtOrBefore = (
  message: MessageKey | null | undefined,
  cursorOrKey: MessageKey | CursorKeySource | null | undefined
) => {
  const comparisonKey = resolveComparableKey(cursorOrKey)
  if (!message || !comparisonKey) return false

  return compareMessageKey(message, comparisonKey) <= 0
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
