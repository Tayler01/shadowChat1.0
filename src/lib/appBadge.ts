import { getWorkingClient } from './supabase'

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

const normalizeBadgeCount = (count: number) => {
  if (!Number.isFinite(count) || count <= 0) {
    return 0
  }

  return Math.min(99, Math.floor(count))
}

export const APP_BADGE_REFRESH_EVENT = 'shadowchat:app-badge-refresh'
export const APP_BADGE_STATE_EVENT = 'shadowchat:app-badge-state'

export interface ShadowPinBadgeDestination {
  categoryId: string
  imageId: string
  unreadCount: number
  postCount: number
  discussionCount: number
  postEventIds: string[]
  discussionEventIds: string[]
}

export interface GameBadgeDestination {
  experience: 'shadow-checkers' | 'shado-live' | 'shadow-war'
  itemId: string
  unreadCount: number
  eventIds: string[]
}

export interface AppBadgeState {
  total: number
  dm: number
  group: number
  interactions: number
  connections: number
  shadow_pin: number
  games: number
  shadowPinDestinations: ShadowPinBadgeDestination[]
  gameDestinations: GameBadgeDestination[]
}

export const EMPTY_APP_BADGE_STATE: AppBadgeState = {
  total: 0,
  dm: 0,
  group: 0,
  interactions: 0,
  connections: 0,
  shadow_pin: 0,
  games: 0,
  shadowPinDestinations: [],
  gameDestinations: [],
}

let cachedBadgeState: AppBadgeState = EMPTY_APP_BADGE_STATE
let badgeStateRequest: Promise<AppBadgeState> | null = null

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const normalizeIdList = (value: unknown) => (
  Array.isArray(value)
    ? value.filter((candidate): candidate is string => typeof candidate === 'string' && candidate.length > 0)
    : []
)

const normalizeShadowPinDestinations = (value: unknown): ShadowPinBadgeDestination[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    const record = asRecord(candidate)
    if (!record) return []
    const categoryId = record?.category_id
    const imageId = record?.image_id
    if (typeof categoryId !== 'string' || typeof imageId !== 'string') return []
    return [{
      categoryId,
      imageId,
      unreadCount: normalizeBadgeCount(Number(record.unread_count ?? 0)),
      postCount: normalizeBadgeCount(Number(record.post_count ?? 0)),
      discussionCount: normalizeBadgeCount(Number(record.discussion_count ?? 0)),
      postEventIds: normalizeIdList(record.post_event_ids),
      discussionEventIds: normalizeIdList(record.discussion_event_ids),
    }]
  })
}

const normalizeGameDestinations = (value: unknown): GameBadgeDestination[] => {
  if (!Array.isArray(value)) return []
  return value.flatMap(candidate => {
    const record = asRecord(candidate)
    if (!record) return []
    const experience = record?.experience
    const itemId = record?.item_id
    if (
      (experience !== 'shadow-checkers' && experience !== 'shado-live' && experience !== 'shadow-war')
      || typeof itemId !== 'string'
    ) return []
    return [{
      experience,
      itemId,
      unreadCount: normalizeBadgeCount(Number(record.unread_count ?? 0)),
      eventIds: normalizeIdList(record.event_ids),
    }]
  })
}

export const normalizeBadgeState = (value: unknown): AppBadgeState => {
  const state: Record<string, unknown> = asRecord(value) ?? { ...EMPTY_APP_BADGE_STATE }
  return {
    total: normalizeBadgeCount(Number(state.total ?? 0)),
    dm: normalizeBadgeCount(Number(state.dm ?? 0)),
    group: normalizeBadgeCount(Number(state.group ?? 0)),
    interactions: normalizeBadgeCount(Number(state.interactions ?? 0)),
    connections: normalizeBadgeCount(Number(state.connections ?? 0)),
    shadow_pin: normalizeBadgeCount(Number(state.shadow_pin ?? 0)),
    games: normalizeBadgeCount(Number(state.games ?? 0)),
    shadowPinDestinations: normalizeShadowPinDestinations(state.shadow_pin_destinations),
    gameDestinations: normalizeGameDestinations(state.game_destinations),
  }
}

const publishBadgeState = (state: AppBadgeState) => {
  cachedBadgeState = state
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent<AppBadgeState>(APP_BADGE_STATE_EVENT, {
    detail: state,
  }))
}

export const getCachedAppBadgeState = () => ({ ...cachedBadgeState })

const postMessageToServiceWorker = async (message: Record<string, unknown>) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  navigator.serviceWorker.controller?.postMessage(message)

  try {
    const registration = await navigator.serviceWorker.getRegistration?.()
    registration?.active?.postMessage(message)
  } catch {
    // Service worker messaging is best-effort and should never block chat.
  }
}

const postBadgeCountToServiceWorker = async (count: number) => {
  await postMessageToServiceWorker({
    type: 'SHADOWCHAT_BADGE_UPDATE',
    count,
  })
}

const postServiceWorkerMessage = async (message: Record<string, unknown>) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return
  }

  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return
  }

  await postMessageToServiceWorker(message)
}

export const updateAppBadge = async (count: number) => {
  const normalizedCount = normalizeBadgeCount(count)

  if (typeof navigator === 'undefined') {
    return
  }

  const badgeNavigator = navigator as BadgeNavigator

  try {
    if (normalizedCount > 0 && badgeNavigator.setAppBadge) {
      await badgeNavigator.setAppBadge(normalizedCount)
    } else if (normalizedCount === 0 && badgeNavigator.clearAppBadge) {
      await badgeNavigator.clearAppBadge()
    }
  } catch {
    // Some platforms expose the API but still reject depending on install or OS settings.
  }

  await postBadgeCountToServiceWorker(normalizedCount)
}

export const clearDMNotifications = async (
  conversationId: string,
  messageId?: string,
  messageIds?: string[]
) => {
  await postServiceWorkerMessage({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'dm_message',
    conversationId,
    ...(messageId ? { messageId } : {}),
    ...(messageIds?.length ? { messageIds } : {}),
  })
}

export const clearGroupNotifications = async (
  messageId?: string,
  messageIds?: string[],
  threadId?: string
) => {
  await postServiceWorkerMessage({
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    notificationType: 'group_message',
    ...(messageId ? { messageId } : {}),
    ...(messageIds?.length ? { messageIds } : {}),
    ...(threadId ? { threadId } : {}),
  })
}

export const fetchAppBadgeState = async () => {
  if (badgeStateRequest) return badgeStateRequest

  badgeStateRequest = (async () => {
    const workingClient = await getWorkingClient()
    const {
      data: { user },
      error: userError,
    } = await workingClient.auth.getUser()

    if (userError || !user) {
      return EMPTY_APP_BADGE_STATE
    }

    const { data, error } = await workingClient.rpc('get_app_badge_state_v2', {
      target_user_id: user.id,
    })

    if (error) {
      throw error
    }

    return normalizeBadgeState(data)
  })().finally(() => {
    badgeStateRequest = null
  })

  return badgeStateRequest
}

export const fetchUnreadAppBadgeCount = async () => {
  const state = await fetchAppBadgeState()
  return state.total
}

export const refreshAppBadgeState = async (
  fallbackState: AppBadgeState = EMPTY_APP_BADGE_STATE
) => {
  let state: AppBadgeState
  try {
    state = await fetchAppBadgeState()
  } catch {
    state = normalizeBadgeState(fallbackState)
  }

  publishBadgeState(state)
  await updateAppBadge(state.total)
  return state
}

export const refreshAppBadge = async (fallbackCount = 0) => {
  const fallback = {
    ...EMPTY_APP_BADGE_STATE,
    total: normalizeBadgeCount(fallbackCount),
  }
  const state = await refreshAppBadgeState(fallback)
  return state.total
}

export const requestAppBadgeRefresh = () => {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(APP_BADGE_REFRESH_EVENT))
}
