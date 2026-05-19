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
  const { user } = useAuth()
  const cachedState = user ? cachedPushStateByUserId.get(user.id) : undefined
  const [support, setSupport] = useState<PushSupportStatus>(() => cachedState?.support ?? getPushSupportStatus())
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => cachedState?.permission ?? getNotificationPermission())
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(() => cachedState?.preferences ?? null)
  const [subscribed, setSubscribed] = useState(() => cachedState?.subscribed ?? false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupport(getPushSupportStatus())
    setPermission(getNotificationPermission())
  }, [])

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
      updateCachedPushState(user.id, {
        preferences: fallbackPreferences,
        subscribed: false,
        permission: getNotificationPermission(),
        support: getPushSupportStatus(),
      })
    } finally {
      setLoading(false)
    }
  }, [enabled, user])

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

  const updatePreference = useCallback(
    async (key: keyof Omit<NotificationPreferences, 'user_id'>, value: NotificationPreferences[typeof key]) => {
      if (!user) return
      setSaving(true)
      setError(null)

      try {
        const next = await upsertNotificationPreferences(user.id, { [key]: value })
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

  const enablePush = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setError(null)

    try {
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
      setPermission(getNotificationPermission())
      throw err
    } finally {
      setSaving(false)
    }
  }, [user])

  const disablePush = useCallback(async () => {
    if (!user) return
    setSaving(true)
    setError(null)

    try {
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
  }, [user])

  return {
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
    error,
    enablePush,
    disablePush,
    updatePreference,
    refreshState,
  }
}
