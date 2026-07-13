export const SHADOW_PIN_CREATOR_HISTORY_KEY = 'shadowPinCreatorStudio'
export const SHADOW_PIN_CREATOR_QUERY_VALUE = 'creator'
export type CreatorStudioHistoryKind = 'pushed' | 'cold'

type HistoryWindow = Pick<Window, 'location' | 'history' | 'dispatchEvent'>

export const hasCreatorStudioQuery = (target: Pick<Window, 'location'> = window) => (
  new URL(target.location.href).searchParams.get('studio') === SHADOW_PIN_CREATOR_QUERY_VALUE
)

export const creatorStudioHistoryKind = (target: HistoryWindow = window): CreatorStudioHistoryKind | null => {
  const value = target.history.state?.[SHADOW_PIN_CREATOR_HISTORY_KEY]
  return value === 'pushed' || value === 'cold' ? value : null
}

export const isCreatorStudioHistoryEntry = (target: HistoryWindow = window) => (
  creatorStudioHistoryKind(target) !== null && hasCreatorStudioQuery(target)
)

export const enterCreatorStudioHistory = (target: HistoryWindow = window) => {
  const currentKind = creatorStudioHistoryKind(target)
  if (isCreatorStudioHistoryEntry(target)) return currentKind
  const url = new URL(target.location.href)
  if (url.searchParams.get('studio') === SHADOW_PIN_CREATOR_QUERY_VALUE) {
    target.history.replaceState({
      ...(target.history.state && typeof target.history.state === 'object' ? target.history.state : {}),
      [SHADOW_PIN_CREATOR_HISTORY_KEY]: 'cold',
    }, '', url)
    return 'cold' as const
  }
  url.searchParams.set('studio', SHADOW_PIN_CREATOR_QUERY_VALUE)
  target.history.pushState({
    ...(target.history.state && typeof target.history.state === 'object' ? target.history.state : {}),
    [SHADOW_PIN_CREATOR_HISTORY_KEY]: 'pushed',
  }, '', url)
  return 'pushed' as const
}

export const replaceCreatorStudioHistory = (target: HistoryWindow = window) => {
  const url = new URL(target.location.href)
  url.searchParams.delete('studio')
  const state = { ...(target.history.state && typeof target.history.state === 'object' ? target.history.state : {}) }
  delete state[SHADOW_PIN_CREATOR_HISTORY_KEY]
  target.history.replaceState(state, '', url)
}

export const requestCreatorStudioClose = (
  coldClose: () => void,
  target: HistoryWindow = window
) => {
  if (isCreatorStudioHistoryEntry(target) && creatorStudioHistoryKind(target) === 'pushed') {
    target.history.back()
    return 'back' as const
  }
  replaceCreatorStudioHistory(target)
  coldClose()
  return 'cold-close' as const
}
