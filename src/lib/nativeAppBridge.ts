export const NATIVE_APP_MESSAGE_EVENT = 'shadowchat:native-message'

export type NativeNotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unknown'

export type NativeNotificationStage =
  | 'idle'
  | 'syncing_session'
  | 'reading_permission'
  | 'requesting_permission'
  | 'registering_installation'
  | 'requesting_device_token'
  | 'requesting_expo_token'
  | 'registering_token'
  | 'ready'
  | 'failed'
  | 'unknown'

export type NativeNotificationState = {
  enabled: boolean
  permission: NativeNotificationPermission
  busy: boolean
  error: string | null
  requestId: string | null
  stage: NativeNotificationStage
}

type NativeAppOutboundMessage =
  | { version: 1; type: 'bridge_ready' }
  | {
      version: 1
      type: 'auth_session'
      session: null | {
        accessToken: string
        refreshToken: string
        expiresAt: number | null
        userId: string
      }
    }
  | {
      version: 1
      type: 'notifications_enable'
      requestId: string
      session: null | {
        accessToken: string
        refreshToken: string
        expiresAt: number | null
        userId: string
      }
    }
  | { version: 1; type: 'notifications_disable'; requestId: string }
  | { version: 1; type: 'notifications_open_settings' }
  | { version: 1; type: 'native_state_request' }

declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (message: string) => void
    }
    __SHADOWCHAT_NATIVE_APP__?: boolean
  }
}

export const isNativeAppWebView = () =>
  typeof window !== 'undefined' &&
  (
    window.__SHADOWCHAT_NATIVE_APP__ === true ||
    new URLSearchParams(window.location.search).get('nativeApp') === '1' ||
    typeof window.ReactNativeWebView?.postMessage === 'function'
  )

export const postNativeAppMessage = (message: NativeAppOutboundMessage) => {
  if (!isNativeAppWebView() || !window.ReactNativeWebView) return false

  window.ReactNativeWebView.postMessage(JSON.stringify(message))
  return true
}

const waitForNativeNotificationState = (
  message: NativeAppOutboundMessage,
  isRelevant: (state: NativeNotificationState) => boolean,
  isComplete: (state: NativeNotificationState) => boolean
) => new Promise<NativeNotificationState>((resolve, reject) => {
  let completed = false
  const finish = (callback: () => void) => {
    if (completed) return
    completed = true
    window.clearTimeout(timeoutId)
    unsubscribe()
    callback()
  }
  const unsubscribe = subscribeToNativeNotificationState(state => {
    if (!isRelevant(state)) return
    const stateError = state.error
    if (stateError) {
      finish(() => reject(new Error(stateError)))
      return
    }
    if (isComplete(state)) {
      finish(() => resolve(state))
    }
  })
  const timeoutId = window.setTimeout(() => {
    finish(() => reject(new Error('The native notification request timed out.')))
  }, 120_000)

  if (!postNativeAppMessage(message)) {
    finish(() => reject(new Error('The native notification bridge is unavailable.')))
  }
})

const createNativeRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `native-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

export const requestNativeNotificationEnable = async (
  session: Extract<
    NativeAppOutboundMessage,
    { type: 'notifications_enable' }
  >['session']
) => {
  const requestId = createNativeRequestId()
  let observedBusyState = false
  return waitForNativeNotificationState(
    { version: 1, type: 'notifications_enable', requestId, session },
    state => state.requestId === null || state.requestId === requestId,
    state => {
      if (state.busy) {
        observedBusyState = true
        return false
      }

      return (
        state.enabled ||
        state.permission === 'denied' ||
        (observedBusyState && state.permission === 'undetermined')
      )
    }
  )
}

export const requestNativeNotificationDisable = () => {
  const requestId = createNativeRequestId()
  return waitForNativeNotificationState(
    { version: 1, type: 'notifications_disable', requestId },
    state => state.requestId === null || state.requestId === requestId,
    state => !state.busy && !state.enabled
  )
}

export const openNativeNotificationSettings = () =>
  postNativeAppMessage({ version: 1, type: 'notifications_open_settings' })

export const requestNativeNotificationState = () =>
  postNativeAppMessage({ version: 1, type: 'native_state_request' })

export const subscribeToNativeNotificationState = (
  listener: (state: NativeNotificationState) => void
) => {
  if (typeof window === 'undefined') return () => undefined

  const handleMessage = (event: Event) => {
    const detail = (event as CustomEvent<unknown>).detail
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return

    const record = detail as Record<string, unknown>
    if (record.version !== 1 || record.type !== 'notifications_state') return

    const permission = record.permission
    if (
      permission !== 'granted' &&
      permission !== 'denied' &&
      permission !== 'undetermined' &&
      permission !== 'unknown'
    ) {
      return
    }

    const stage = record.stage
    const normalizedStage: NativeNotificationStage = (
      stage === 'idle' ||
      stage === 'syncing_session' ||
      stage === 'reading_permission' ||
      stage === 'requesting_permission' ||
      stage === 'registering_installation' ||
      stage === 'requesting_device_token' ||
      stage === 'requesting_expo_token' ||
      stage === 'registering_token' ||
      stage === 'ready' ||
      stage === 'failed'
    ) ? stage : 'unknown'

    listener({
      enabled: record.enabled === true,
      permission,
      busy: record.busy === true,
      error: typeof record.error === 'string' ? record.error : null,
      requestId: typeof record.requestId === 'string' ? record.requestId : null,
      stage: normalizedStage,
    })
  }

  window.addEventListener(NATIVE_APP_MESSAGE_EVENT, handleMessage)
  return () => window.removeEventListener(NATIVE_APP_MESSAGE_EVENT, handleMessage)
}
