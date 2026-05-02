import { useCallback, useEffect, useRef } from 'react'
import toast from 'react-hot-toast'
import {
  fetchPendingAdminRoleNotifications,
  markAdminRoleNotificationSeen,
  type AdminRoleNotification,
} from '../lib/supabase'
import { useAuth } from './useAuth'

const ADMIN_NOTICE_POLL_MS = 30000

export function useAdminRoleNotifications() {
  const { user } = useAuth()
  const handledRef = useRef<Set<string>>(new Set())

  const handleNotification = useCallback(async (notification: AdminRoleNotification) => {
    if (handledRef.current.has(notification.id)) return
    handledRef.current.add(notification.id)

    toast.success(notification.message)
    await markAdminRoleNotificationSeen(notification.id).catch(() => undefined)
  }, [])

  const fetchPending = useCallback(async () => {
    if (!user) return

    const notifications = await fetchPendingAdminRoleNotifications().catch(() => [])
    await Promise.all(notifications.map(handleNotification))
  }, [handleNotification, user])

  useEffect(() => {
    if (!user) return

    let disposed = false

    const checkPending = () => {
      if (!disposed) {
        void fetchPending()
      }
    }

    const handleVisibility = () => {
      if (!document.hidden) {
        checkPending()
      }
    }

    checkPending()
    const interval = window.setInterval(checkPending, ADMIN_NOTICE_POLL_MS)
    window.addEventListener('focus', checkPending)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      disposed = true
      window.clearInterval(interval)
      window.removeEventListener('focus', checkPending)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [fetchPending, user])
}
