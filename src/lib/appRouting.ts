import { BOARDS_FEATURE_ENABLED } from '../config/featureFlags'
import type { AppView } from '../types/navigation'

export type AppLocationState = {
  view: AppView
  conversation: string | null
  message: string | null
}

const isEnabledView = (value: string | null): value is AppView => (
  value === 'chat' ||
  value === 'dms' ||
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

  return {
    view,
    conversation: view === 'dms' ? params.get('conversation') : null,
    message: view === 'dms' || view === 'chat' ? params.get('message') : null,
  }
}
