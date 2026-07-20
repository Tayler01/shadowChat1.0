import { useCallback, useEffect, useState } from 'react'
import { useAuth } from './useAuth'
import {
  disablePushForCurrentDevice,
  enablePushForCurrentDevice,
  fetchNotificationPreferences,
  getNotificationGuidance,
  getNotificationGuidanceText,
  getDefaultNotificationPreferences,
  getNotificationPermission,
  getPushSupportStatus,
  syncCurrentDeviceSubscription,
  type NotificationGuidance,
  type NotificationPreferences,
  type PushSupportStatus,
  upsertNotificationPreferences,
} from '../lib/push'
import {
  isNativeAppWebView,
  openNativeNotificationSettings,
  requestNativeNotificationDisable,
  requestNativeNotificationEnable,
  requestNativeNotificationState,
  subscribeToNativeNotificationState,
  type NativeNotificationStage,
} from '../lib/nativeAppBridge'
import { supabase } from '../lib/supabase'

type UsePushNotificationsOptions = {
  enabled?: boolean
}

type PushNotificationState = {
  preferences: NotificationPreferences | null
  subscribed: boolean
  permission: NotificationPermission | 'unsupported'
  support: PushSupportStatus
}

const cachedPushStateByUserId = new Map<string, PushNotificationState>()
const pushStateRequestByUserId = new Map<string, Promise<PushNotificationState>>()
const NATIVE_PUSH_SUPPORT: PushSupportStatus = {
  supported: true,
  canPrompt: true,
  reason: null,
}

const loadPushState = async (userId: string, force = false) => {
  const cached = cachedPushStateByUserId.get(userId)
  if (!force && cached) return cached

  const existingRequest = pushStateRequestByUserId.get(userId)
  if (!force && existingRequest) return existingRequest

  const request = (async () => {
    const prefs = await fetchNotificationPreferences(userId)
    const synced = await syncCurrentDeviceSubscription(userId).catch(() => false)
    const nextState = {
      preferences: prefs,
      subscribed: synced,
      permission: getNotificationPermission(),
      support: getPushSupportStatus(),
    }
    cachedPushStateByUserId.set(userId, nextState)
    return nextState
  })().finally(() => {
    pushStateRequestByUserId.delete(userId)
  })

  pushStateRequestByUserId.set(userId, request)
  return request
}

const updateCachedPushState = (userId: string, partial: Partial<PushNotificationState>) => {
  const current = cachedPushStateByUserId.get(userId) ?? {
    preferences: null,
    subscribed: false,
    permission: getNotificationPermission(),
    support: getPushSupportStatus(),
  }

  cachedPushStateByUserId.set(userId, {
    ...current,
    ...partial,
  })
}

export function usePushNotifications(options: UsePushNotificationsOptions = {}) {
  const enabled = options.enabled ?? true
  const nativeApp = isNativeAppWebView()
  const { user } = useAuth()
  const cachedState = user ? cachedPushStateByUserId.get(user.id) : undefined
  const [support, setSupport] = useState<PushSupportStatus>(
    () => nativeApp ? NATIVE_PUSH_SUPPORT : cachedState?.support ?? getPushSupportStatus()
  )
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(
    () => nativeApp ? 'default' : cachedState?.permission ?? getNotificationPermission()
  )
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(() => cachedState?.preferences ?? null)
  const [subscribed, setSubscribed] = useState(() => cachedState?.subscribed ?? false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nativeBusy, setNativeBusy] = useState(false)
  const [nativeStage, setNativeStage] =
    useState<NativeNotificationStage>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (nativeApp) {
      setSupport(NATIVE_PUSH_SUPPORT)
      const unsubscribe = subscribeToNativeNotificationState(state => {
        setSubscribed(state.enabled)
        setPermission(
          state.permission === 'undetermined' || state.permission === 'unknown'
            ? 'default'
            : state.permission
        )
        setNativeBusy(state.busy)
        setNativeStage(state.stage)
        setError(state.error)
        if (user) {
          updateCachedPushState(user.id, {
            subscribed: state.enabled,
            permission:
              state.permission === 'undetermined' || state.permission === 'unknown'
                ? 'default'
                : state.permission,
            support: NATIVE_PUSH_SUPPORT,
          })
        }
      })
      requestNativeNotificationState()
      return unsubscribe
    }

    setSupport(getPushSupportStatus())
    setPermission(getNotificationPermission())
    setNativeBusy(false)
    setNativeStage('idle')
  }, [nativeApp, user])

  const refreshState = useCallback(async (force = false) => {
    if (!user) {
      setPreferences(null)
      setSubscribed(false)
      setLoading(false)
      return
    }

    if (!enabled && !force) {
      const cached = cachedPushStateByUserId.get(user.id)
      if (cached) {
        setPreferences(cached.preferences)
        setSubscribed(cached.subscribed)
        setPermission(cached.permission)
        setSupport(cached.support)
      }
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (nativeApp) {
        const prefs = await fetchNotificationPreferences(user.id)
        setPreferences(prefs)
        setSupport(NATIVE_PUSH_SUPPORT)
        updateCachedPushState(user.id, {
          preferences: prefs,
          support: NATIVE_PUSH_SUPPORT,
        })
        requestNativeNotificationState()
        return
      }

      const nextState = await loadPushState(user.id, force)
      setPreferences(nextState.preferences)
      setSubscribed(nextState.subscribed)
      setPermission(nextState.permission)
      setSupport(nextState.support)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification settings.')
      const fallbackPreferences = getDefaultNotificationPreferences(user.id)
      setPreferences(fallbackPreferences)
      setSubscribed(false)
      if (nativeApp) {
        setSupport(NATIVE_PUSH_SUPPORT)
        requestNativeNotificationState()
        updateCachedPushState(user.id, {
          preferences: fallbackPreferences,
          subscribed: false,
          support: NATIVE_PUSH_SUPPORT,
        })
      } else {
        updateCachedPushState(user.id, {
          preferences: fallbackPreferences,
          subscribed: false,
          permission: getNotificationPermission(),
          support: getPushSupportStatus(),
        })
      }
    } finally {
      setLoading(false)
    }
  }, [enabled, nativeApp, user])

  useEffect(() => {
    refreshState()
  }, [refreshState])

  useEffect(() => {
    if (!user || !enabled) return

    const refreshWhenVisible = () => {
      if (document.visibilityState === 'hidden') return
      void refreshState()
    }

    window.addEventListener('focus', refreshWhenVisible)
    window.addEventListener('pageshow', refreshWhenVisible)
    document.addEventListener('visibilitychange', refreshWhenVisible)

    return () => {
      window.removeEventListener('focus', refreshWhenVisible)
      window.removeEventListener('pageshow', refreshWhenVisible)
      document.removeEventListener('visibilitychange', refreshWhenVisible)
    }
  }, [enabled, refreshState, user])

  const updatePreferences = useCallback(
    async (updates: Partial<Omit<NotificationPreferences, 'user_id'>>) => {
      if (!user) return
      setSaving(true)
      setError(null)

      try {
        const next = await upsertNotificationPreferences(user.id, updates)
        setPreferences(next)
        updateCachedPushState(user.id, { preferences: next })
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save notification preference.')
        throw err
      } finally {
        setSaving(false)
      }
    },
    [user]
  )

  const updatePreference = useCallback(
    async <K extends keyof Omit<NotificationPreferences, 'user_id'>>(
      key: K,
      value: NotificationPreferences[K]
    ) => updatePreferences({ [key]: value } as Pick<NotificationPreferences, K>),
    [updatePreferences]
  )

  const enablePush = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setError(null)

    try {
      if (nativeApp) {
        setNativeStage('syncing_session')
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError
        const webSession = data.session
        if (
          !webSession?.access_token ||
          !webSession.refresh_token ||
          !webSession.user?.id
        ) {
          requestNativeNotificationState()
          throw new Error(
            'Your secure ShadoChat session is still syncing. Try the notification switch again.'
          )
        }
        const state = await requestNativeNotificationEnable(
          {
            accessToken: webSession.access_token,
            refreshToken: webSession.refresh_token,
            expiresAt: webSession.expires_at ?? null,
            userId: webSession.user.id,
          }
        )
        setSubscribed(state.enabled)
        setPermission(
          state.permission === 'undetermined' || state.permission === 'unknown'
            ? 'default'
            : state.permission
        )
        const next = await fetchNotificationPreferences(user.id)
        setPreferences(next)
        updateCachedPushState(user.id, {
          preferences: next,
          subscribed: state.enabled,
          permission:
            state.permission === 'undetermined' || state.permission === 'unknown'
              ? 'default'
              : state.permission,
          support: NATIVE_PUSH_SUPPORT,
        })
        if (!state.enabled) {
          throw new Error(
            state.permission === 'denied'
              ? 'Notifications are disabled in your phone settings.'
              : 'Notifications were not enabled on this device.'
          )
        }
        return
      }

      await enablePushForCurrentDevice(user.id)
      setSubscribed(true)
      setPermission(getNotificationPermission())
      const next = await fetchNotificationPreferences(user.id)
      setPreferences(next)
      updateCachedPushState(user.id, {
        preferences: next,
        subscribed: true,
        permission: getNotificationPermission(),
        support: getPushSupportStatus(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to enable push notifications.'
      setError(message)
      if (nativeApp) {
        requestNativeNotificationState()
      } else {
        setPermission(getNotificationPermission())
      }
      throw err
    } finally {
      setSaving(false)
    }
  }, [nativeApp, user])

  const disablePush = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setError(null)

    try {
      if (nativeApp) {
        const state = await requestNativeNotificationDisable()
        setSubscribed(false)
        setPermission(
          state.permission === 'undetermined' || state.permission === 'unknown'
            ? 'default'
            : state.permission
        )
        const next = await fetchNotificationPreferences(user.id)
        setPreferences(next)
        updateCachedPushState(user.id, {
          preferences: next,
          subscribed: false,
          permission:
            state.permission === 'undetermined' || state.permission === 'unknown'
              ? 'default'
              : state.permission,
          support: NATIVE_PUSH_SUPPORT,
        })
        return
      }

      await disablePushForCurrentDevice(user.id)
      setSubscribed(false)
      const next = await fetchNotificationPreferences(user.id)
      setPreferences(next)
      updateCachedPushState(user.id, {
        preferences: next,
        subscribed: false,
        permission: getNotificationPermission(),
        support: getPushSupportStatus(),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to disable push notifications.'
      setError(message)
      throw err
    } finally {
      setSaving(false)
    }
  }, [nativeApp, user])

  const openDeviceNotificationSettings = useCallback(() => {
    if (!nativeApp) return false
    return openNativeNotificationSettings()
  }, [nativeApp])

  return {
    nativeApp,
    supported: support.supported,
    canPrompt: support.canPrompt,
    supportReason: support.reason,
    permission,
    guidance: getNotificationGuidance(permission, support) as NotificationGuidance,
    guidanceText: getNotificationGuidanceText(getNotificationGuidance(permission, support)),
    preferences,
    subscribed,
    loading: loading || Boolean(enabled && user && !cachedPushStateByUserId.has(user.id)),
    saving,
    nativeBusy,
    nativeStage,
    error,
    enablePush,
    disablePush,
    openDeviceNotificationSettings,
    updatePreference,
    updatePreferences,
    refreshState,
  }
}
