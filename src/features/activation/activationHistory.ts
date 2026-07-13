export const ACTIVATION_HISTORY_KEY = 'shadowchatFirstRunActivation'

type ActivationHistoryWindow = Pick<Window, 'history' | 'location'>

export const isActivationHistoryEntry = (target: ActivationHistoryWindow = window) => (
  target.history.state?.[ACTIVATION_HISTORY_KEY] === true
)

export const enterActivationHistory = (target: ActivationHistoryWindow = window) => {
  if (isActivationHistoryEntry(target)) return false
  target.history.pushState({
    ...(target.history.state && typeof target.history.state === 'object' ? target.history.state : {}),
    [ACTIVATION_HISTORY_KEY]: true,
  }, '', target.location.href)
  return true
}

export const replaceActivationHistory = (target: ActivationHistoryWindow = window) => {
  if (!isActivationHistoryEntry(target)) return false
  const state = { ...(target.history.state && typeof target.history.state === 'object' ? target.history.state : {}) }
  delete state[ACTIVATION_HISTORY_KEY]
  target.history.replaceState(state, '', target.location.href)
  return true
}

export const closeActivationHistory = (
  coldClose: () => void,
  target: ActivationHistoryWindow = window
) => {
  if (isActivationHistoryEntry(target)) {
    target.history.back()
    return 'back' as const
  }
  coldClose()
  return 'cold-close' as const
}
