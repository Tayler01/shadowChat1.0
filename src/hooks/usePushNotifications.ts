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

export function usePushNotifications() {
  const { user } = useAuth()
  const [support, setSupport] = useState<PushSupportStatus>(() => getPushSupportStatus())
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>(() => getNotificationPermission())
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null)
  const [subscribed, setSubscribed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSupport(getPushSupportStatus())
    setPermission(getNotificationPermission())
  }, [])

  const refreshState = useCallback(async () => {
    if (!user) {
      setPreferences(null)
      setSubscribed(false)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    try {
      const prefs = await fetchNotificationPreferences(user.id)
      setPreferences(prefs)

      const synced = await syncCurrentDeviceSubscription(user.id).catch(() => false)
      setSubscribed(synced)
      setPermission(getNotificationPermission())
      setSupport(getPushSupportStatus())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notification settings.')
      setPreferences(getDefaultNotificationPreferences(user.id))
      setSubscribed(false)
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    refreshState()
  }, [refreshState])

  const updatePreference = useCallback(
    async (key: keyof Omit<NotificationPreferences, 'user_id'>, value: NotificationPreferences[typeof key]) => {
      if (!user) return
      setSaving(true)
      setError(null)

      try {
        const next = await upsertNotificationPreferences(user.id, { [key]: value })
        setPreferences(next)
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
    loading,
    saving,
    error,
    enablePush,
    disablePush,
    updatePreference,
    refreshState,
  }
}
