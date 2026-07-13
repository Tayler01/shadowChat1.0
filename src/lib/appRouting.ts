import { ACTIVITY_FEATURE_ENABLED, BOARDS_FEATURE_ENABLED } from '../config/featureFlags'
import type { AppView } from '../types/navigation'

export type AppLocationState = {
  view: AppView
  conversation: string | null
  message: string | null
  thread?: string | null
  dmPanel: 'details' | 'search' | 'shared' | null
  pin: string | null
  comment: string | null
  pinPanel: 'viewer' | 'comments' | null
  playExperience: PlayExperience | null
  playItem: string | null
}

export type ChatThreadRouteAction = 'push-thread' | 'replace-thread' | 'close-thread'
export type ChatThreadHistoryLayer = 'chat-thread' | null
export type ChatThreadRouteMutation =
  | { method: 'back' }
  | { method: 'push' | 'replace'; url: URL; layer: ChatThreadHistoryLayer }

const normalizeChatMessageId = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized && normalized.length <= 160 ? normalized : null
}

export const resolveChatThreadRouteMutation = ({
  currentUrl,
  currentLayer,
  action,
  threadRootId,
  targetMessageId,
}: {
  currentUrl: URL
  currentLayer: ChatThreadHistoryLayer
  action: ChatThreadRouteAction
  threadRootId?: string
  targetMessageId?: string
}): ChatThreadRouteMutation | null => {
  if (action === 'close-thread' && currentLayer === 'chat-thread') return { method: 'back' }

  const url = new URL(currentUrl)
  url.searchParams.set('view', 'chat')
  url.searchParams.delete('conversation')
  url.searchParams.delete('pin')
  url.searchParams.delete('comment')
  url.searchParams.delete('panel')
  url.searchParams.delete('experience')
  url.searchParams.delete('item')

  if (action === 'close-thread') {
    url.searchParams.delete('thread')
    url.searchParams.delete('message')
    return { method: 'replace', url, layer: null }
  }

  const nextThreadRootId = normalizeChatMessageId(threadRootId)
  if (!nextThreadRootId) return null

  const nextTargetMessageId = normalizeChatMessageId(targetMessageId) ?? nextThreadRootId
  url.searchParams.set('thread', nextThreadRootId)
  url.searchParams.set('message', nextTargetMessageId)

  return {
    method: action === 'push-thread' ? 'push' : 'replace',
    url,
    layer: action === 'push-thread' ? 'chat-thread' : currentLayer,
  }
}

export type PlayExperience =
  | 'shadow-runner'
  | 'shadow-war'
  | 'shadow-checkers'
  | 'shado-tv'
  | 'shadow-mystery'
  | 'will-kirk'

export type PlayRouteAction = 'push-experience' | 'push-item' | 'close-item' | 'close-experience'
export type PlayHistoryLayer = 'play-experience' | 'play-item' | null
export type PlayRouteMutation =
  | { method: 'back' }
  | { method: 'push' | 'replace'; url: URL; layer: PlayHistoryLayer }

const PLAY_EXPERIENCES = new Set<PlayExperience>([
  'shadow-runner',
  'shadow-war',
  'shadow-checkers',
  'shado-tv',
  'shadow-mystery',
  'will-kirk',
])

const PLAY_EXPERIENCES_WITH_ITEMS = new Set<PlayExperience>(['shado-tv', 'shadow-mystery'])

export const normalizePlayExperience = (value: string | null): PlayExperience | null => (
  value && PLAY_EXPERIENCES.has(value as PlayExperience) ? value as PlayExperience : null
)

const normalizePlayItem = (value: string | null) => {
  const normalized = value?.trim()
  return normalized && normalized.length <= 160 ? normalized : null
}

export const resolvePlayRouteMutation = ({
  currentUrl,
  currentLayer,
  action,
  experience,
  item,
}: {
  currentUrl: URL
  currentLayer: PlayHistoryLayer
  action: PlayRouteAction
  experience?: PlayExperience
  item?: string
}): PlayRouteMutation | null => {
  if (action === 'close-item' && currentLayer === 'play-item') return { method: 'back' }
  if (action === 'close-experience' && currentLayer === 'play-experience') return { method: 'back' }

  const url = new URL(currentUrl)
  url.searchParams.set('view', 'games')
  url.searchParams.delete('conversation')
  url.searchParams.delete('message')
  url.searchParams.delete('pin')
  url.searchParams.delete('comment')
  url.searchParams.delete('panel')

  if (action === 'close-experience') {
    url.searchParams.delete('experience')
    url.searchParams.delete('item')
    return { method: 'replace', url, layer: null }
  }

  const nextExperience = experience ?? normalizePlayExperience(url.searchParams.get('experience'))
  if (!nextExperience) return null
  url.searchParams.set('experience', nextExperience)

  if (action === 'close-item') {
    url.searchParams.delete('item')
    return { method: 'replace', url, layer: currentLayer === 'play-item' ? 'play-experience' : currentLayer }
  }

  if (action === 'push-item') {
    const nextItem = normalizePlayItem(item ?? null)
    if (!PLAY_EXPERIENCES_WITH_ITEMS.has(nextExperience) || !nextItem) return null
    url.searchParams.set('item', nextItem)
    return { method: 'push', url, layer: 'play-item' }
  }

  url.searchParams.delete('item')
  return { method: 'push', url, layer: 'play-experience' }
}

export type DMRouteAction =
  | 'push-thread'
  | 'replace-thread'
  | 'push-details'
  | 'push-search'
  | 'push-shared'
  | 'replace-search'
  | 'replace-shared'
  | 'close-panel'
  | 'close-thread'

export type DMHistoryLayer =
  | 'dm-thread'
  | 'dm-panel'
  | 'dm-panel-cold'
  | 'dm-result'
  | 'dm-result-cold'
  | null

export type DMRouteMutation =
  | { method: 'back' }
  | { method: 'back-two' }
  | { method: 'push' | 'replace'; url: URL; layer: DMHistoryLayer }

export const resolveDMRouteMutation = ({
  currentUrl,
  currentLayer,
  action,
  conversationId,
  messageId,
}: {
  currentUrl: URL
  currentLayer: DMHistoryLayer
  action: DMRouteAction
  conversationId?: string
  messageId?: string
}): DMRouteMutation | null => {
  if (action === 'close-panel' && currentLayer === 'dm-panel') return { method: 'back' }
  if (action === 'close-thread' && currentLayer === 'dm-thread') return { method: 'back' }
  if (action === 'close-thread' && currentLayer === 'dm-result') return { method: 'back-two' }

  const url = new URL(currentUrl)
  url.searchParams.set('view', 'dms')
  url.searchParams.delete('pin')
  url.searchParams.delete('comment')
  url.searchParams.delete('experience')
  url.searchParams.delete('item')

  if (action === 'close-thread') {
    url.searchParams.delete('conversation')
    url.searchParams.delete('message')
    url.searchParams.delete('panel')
    return { method: 'replace', url, layer: null }
  }

  if (action === 'close-panel') {
    if (conversationId) url.searchParams.set('conversation', conversationId)
    url.searchParams.delete('panel')
    return {
      method: 'replace',
      url,
      layer: currentLayer === 'dm-panel'
        ? 'dm-thread'
        : currentLayer === 'dm-panel-cold'
          ? null
          : currentLayer,
    }
  }

  if (!conversationId) return null
  url.searchParams.set('conversation', conversationId)
  if (messageId) url.searchParams.set('message', messageId)
  else url.searchParams.delete('message')

  const panel = action === 'push-details'
    ? 'details'
    : action === 'push-search' || action === 'replace-search'
      ? 'search'
      : action === 'push-shared' || action === 'replace-shared'
        ? 'shared'
        : null
  if (panel) {
    url.searchParams.set('panel', panel)
    const panelLayer: DMHistoryLayer = currentLayer === 'dm-thread' || currentLayer === 'dm-result'
      ? 'dm-panel'
      : 'dm-panel-cold'
    const replacePanel = action === 'replace-search' || action === 'replace-shared' || panelLayer === 'dm-panel-cold'
    return {
      method: replacePanel ? 'replace' : 'push',
      url,
      layer: action === 'replace-search' || action === 'replace-shared' ? currentLayer : panelLayer,
    }
  }

  url.searchParams.delete('panel')
  return {
    method: action === 'push-thread' ? 'push' : 'replace',
    url,
    layer: action === 'push-thread'
      ? 'dm-thread'
      : currentLayer === 'dm-panel'
        ? 'dm-result'
        : currentLayer === 'dm-panel-cold'
          ? 'dm-result-cold'
          : currentLayer,
  }
}

export type PinRouteAction =
  | 'push-viewer'
  | 'replace-viewer'
  | 'push-comments'
  | 'close-comments'
  | 'close-viewer'

export type PinHistoryLayer = 'pin-viewer' | 'pin-comments' | null

export type PinRouteMutation =
  | { method: 'back' }
  | { method: 'push' | 'replace'; url: URL; layer: PinHistoryLayer }

export const resolvePinRouteMutation = ({
  currentUrl,
  currentLayer,
  action,
  imageId,
  commentId,
}: {
  currentUrl: URL
  currentLayer: PinHistoryLayer
  action: PinRouteAction
  imageId?: string
  commentId?: string
}): PinRouteMutation | null => {
  if (action === 'close-comments' && currentLayer === 'pin-comments') return { method: 'back' }
  if (action === 'close-viewer' && currentLayer === 'pin-viewer') return { method: 'back' }

  const url = new URL(currentUrl)
  url.searchParams.set('view', 'pins')
  url.searchParams.delete('message')
  url.searchParams.delete('conversation')
  url.searchParams.delete('experience')
  url.searchParams.delete('item')

  if (action === 'close-viewer') {
    url.searchParams.delete('pin')
    url.searchParams.delete('comment')
    url.searchParams.delete('panel')
    return { method: 'replace', url, layer: null }
  }

  if (action === 'close-comments') {
    if (imageId) url.searchParams.set('pin', imageId)
    url.searchParams.delete('comment')
    url.searchParams.delete('panel')
    return { method: 'replace', url, layer: currentLayer === 'pin-comments' ? 'pin-viewer' : currentLayer }
  }

  if (!imageId) return null
  url.searchParams.set('pin', imageId)
  if (action === 'push-comments') {
    url.searchParams.set('panel', 'comments')
    if (commentId) url.searchParams.set('comment', commentId)
    else url.searchParams.delete('comment')
    return { method: 'push', url, layer: 'pin-comments' }
  }

  url.searchParams.delete('panel')
  url.searchParams.delete('comment')
  return {
    method: action === 'push-viewer' ? 'push' : 'replace',
    url,
    layer: action === 'push-viewer' ? 'pin-viewer' : currentLayer,
  }
}

const isEnabledView = (value: string | null): value is AppView => (
  value === 'chat' ||
  value === 'dms' ||
  (ACTIVITY_FEATURE_ENABLED && value === 'activity') ||
  value === 'games' ||
  value === 'pins' ||
  value === 'settings' ||
  (BOARDS_FEATURE_ENABLED && value === 'boards')
)

export const normalizeViewParam = (value: string | null): AppView | null => {
  if (value === 'news') {
    return BOARDS_FEATURE_ENABLED ? 'boards' : 'chat'
  }

  if (value === 'boards' && !BOARDS_FEATURE_ENABLED) {
    return 'chat'
  }

  if (value === 'activity' && !ACTIVITY_FEATURE_ENABLED) {
    return 'chat'
  }

  return isEnabledView(value) ? value : null
}

export const getLocationStateFromUrl = (url: URL): AppLocationState => {
  const params = new URLSearchParams(url.search)
  const nextView = params.get('view')
  const pausedActivityRoute = nextView === 'activity' && !ACTIVITY_FEATURE_ENABLED
  const view = nextView === 'profile'
    ? 'settings'
    : normalizeViewParam(nextView) ?? 'chat'

  const pin = view === 'pins' ? params.get('pin') : null
  const comment = view === 'pins' ? params.get('comment') : null
  const panel = view === 'pins' ? params.get('panel') : null
  const dmPanelParam = view === 'dms' ? params.get('panel') : null
  const playExperience = view === 'games' ? normalizePlayExperience(params.get('experience')) : null
  const playItem = playExperience && PLAY_EXPERIENCES_WITH_ITEMS.has(playExperience)
    ? normalizePlayItem(params.get('item'))
    : null

  return {
    view,
    conversation: view === 'dms' ? params.get('conversation') : null,
    message: !pausedActivityRoute && (view === 'dms' || view === 'chat') ? params.get('message') : null,
    thread: !pausedActivityRoute && view === 'chat' ? normalizeChatMessageId(params.get('thread')) : null,
    dmPanel: dmPanelParam === 'details' || dmPanelParam === 'search' || dmPanelParam === 'shared'
      ? dmPanelParam
      : null,
    pin,
    comment,
    pinPanel: pin ? (comment || panel === 'comments' ? 'comments' : 'viewer') : null,
    playExperience,
    playItem,
  }
}
