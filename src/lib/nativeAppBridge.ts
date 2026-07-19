export const NATIVE_APP_MESSAGE_EVENT = 'shadowchat:native-message'

export type NativeNotificationPermission =
  | 'granted'
  | 'denied'
  | 'undetermined'
  | 'unknown'

export type NativeNotificationState = {
  enabled: boolean
  permission: NativeNotificationPermission
  busy: boolean
  error: string | null
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
  | { version: 1; type: 'notifications_enable' }
  | { version: 1; type: 'notifications_disable' }
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
    typeof window.ReactNativeWebView?.postMessage === 'function'
  )

export const postNativeAppMessage = (message: NativeAppOutboundMessage) => {
  if (!isNativeAppWebView() || !window.ReactNativeWebView) return false

  window.ReactNativeWebView.postMessage(JSON.stringify(message))
  return true
}

const waitForNativeNotificationState = (
  message: NativeAppOutboundMessage,
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
  }, 60_000)

  if (!postNativeAppMessage(message)) {
    finish(() => reject(new Error('The native notification bridge is unavailable.')))
  }
})

export const requestNativeNotificationEnable = () =>
  waitForNativeNotificationState(
    { version: 1, type: 'notifications_enable' },
    state => !state.busy && (
      state.enabled ||
      state.permission === 'denied' ||
      state.permission === 'undetermined'
    )
  )

export const requestNativeNotificationDisable = () =>
  waitForNativeNotificationState(
    { version: 1, type: 'notifications_disable' },
    state => !state.busy && !state.enabled
  )

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

    listener({
      enabled: record.enabled === true,
      permission,
      busy: record.busy === true,
      error: typeof record.error === 'string' ? record.error : null,
    })
  }

  window.addEventListener(NATIVE_APP_MESSAGE_EVENT, handleMessage)
  return () => window.removeEventListener(NATIVE_APP_MESSAGE_EVENT, handleMessage)
}
