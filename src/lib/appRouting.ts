import { BOARDS_FEATURE_ENABLED } from '../config/featureFlags'
import type { AppView } from '../types/navigation'

export type AppLocationState = {
  view: AppView
  conversation: string | null
  message: string | null
  pin: string | null
  comment: string | null
  pinPanel: 'viewer' | 'comments' | null
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
  value === 'activity' ||
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

  return isEnabledView(value) ? value : null
}

export const getLocationStateFromUrl = (url: URL): AppLocationState => {
  const params = new URLSearchParams(url.search)
  const nextView = params.get('view')
  const view = nextView === 'profile'
    ? 'settings'
    : normalizeViewParam(nextView) ?? 'chat'

  const pin = view === 'pins' ? params.get('pin') : null
  const comment = view === 'pins' ? params.get('comment') : null
  const panel = view === 'pins' ? params.get('panel') : null

  return {
    view,
    conversation: view === 'dms' ? params.get('conversation') : null,
    message: view === 'dms' || view === 'chat' ? params.get('message') : null,
    pin,
    comment,
    pinPanel: pin ? (comment || panel === 'comments' ? 'comments' : 'viewer') : null,
  }
}
