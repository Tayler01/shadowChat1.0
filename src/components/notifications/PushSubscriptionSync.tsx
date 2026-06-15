import { useCallback, useEffect, useRef } from 'react'
import { useAuth } from '../../hooks/useAuth'
import {
  getNotificationPermission,
  getPushSupportStatus,
  syncCurrentDeviceSubscription,
} from '../../lib/push'

const PUSH_SUBSCRIPTION_SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000
const PUSH_SUBSCRIPTION_SYNC_RETRY_MS = 60 * 1000
const PUSH_SUBSCRIPTION_SYNC_STORAGE_PREFIX = 'shadowchat:push-subscription-sync:'

const getSyncStorageKey = (userId: string) =>
  `${PUSH_SUBSCRIPTION_SYNC_STORAGE_PREFIX}${userId}`

const getLastSuccessfulSync = (userId: string) => {
  if (typeof window === 'undefined') return 0

  try {
    const storedValue = window.localStorage.getItem(getSyncStorageKey(userId))
    const timestamp = Number(storedValue)
    return Number.isFinite(timestamp) ? timestamp : 0
  } catch {
    return 0
  }
}

const recordSuccessfulSync = (userId: string, timestamp: number) => {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(getSyncStorageKey(userId), String(timestamp))
  } catch {
    // Local persistence is only a throttle. Push delivery should not depend on it.
  }
}

export function PushSubscriptionSync() {
  const { user } = useAuth()
  const inFlightRef = useRef(false)
  const lastAttemptAtRef = useRef(0)

  const syncIfDue = useCallback(() => {
    if (!user || typeof window === 'undefined') {
      return
    }

    if (document.visibilityState === 'hidden') {
      return
    }

    const support = getPushSupportStatus()
    if (!support.supported || getNotificationPermission() !== 'granted') {
      return
    }

    const now = Date.now()
    if (
      inFlightRef.current ||
      now - lastAttemptAtRef.current < PUSH_SUBSCRIPTION_SYNC_RETRY_MS ||
      now - getLastSuccessfulSync(user.id) < PUSH_SUBSCRIPTION_SYNC_INTERVAL_MS
    ) {
      return
    }

    inFlightRef.current = true
    lastAttemptAtRef.current = now

    void syncCurrentDeviceSubscription(user.id)
      .then((synced) => {
        if (synced) {
          recordSuccessfulSync(user.id, Date.now())
        }
      })
      .catch(() => {
        // Background subscription repair is best-effort and must not interrupt app use.
      })
      .finally(() => {
        inFlightRef.current = false
      })
  }, [user])

  useEffect(() => {
    syncIfDue()
  }, [syncIfDue])

  useEffect(() => {
    if (!user) return

    const syncWhenVisible = () => {
      syncIfDue()
    }

    window.addEventListener('focus', syncWhenVisible)
    window.addEventListener('pageshow', syncWhenVisible)
    document.addEventListener('visibilitychange', syncWhenVisible)

    return () => {
      window.removeEventListener('focus', syncWhenVisible)
      window.removeEventListener('pageshow', syncWhenVisible)
      document.removeEventListener('visibilitychange', syncWhenVisible)
    }
  }, [syncIfDue, user])

  return null
}
