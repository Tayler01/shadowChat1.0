import { useEffect, useMemo, useRef } from 'react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { refreshAppBadge, updateAppBadge } from '../../lib/appBadge'

export function AppBadgeSync() {
  const { conversations } = useDirectMessages()
  const previousUnreadRef = useRef(0)
  const trustLocalClearUntilRef = useRef(0)
  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  )

  useEffect(() => {
    const previousUnread = previousUnreadRef.current
    previousUnreadRef.current = totalUnread

    if (totalUnread === 0 && previousUnread > 0) {
      trustLocalClearUntilRef.current = Date.now() + 10000
    }

    void updateAppBadge(totalUnread)
    if (totalUnread > 0) {
      void refreshAppBadge(totalUnread)
    }
  }, [totalUnread])

  useEffect(() => {
    const syncBadge = () => {
      if (totalUnread === 0 && Date.now() < trustLocalClearUntilRef.current) {
        void updateAppBadge(0)
        return
      }

      void refreshAppBadge(totalUnread)
    }

    window.addEventListener('focus', syncBadge)
    window.addEventListener('pageshow', syncBadge)
    document.addEventListener('visibilitychange', syncBadge)

    return () => {
      window.removeEventListener('focus', syncBadge)
      window.removeEventListener('pageshow', syncBadge)
      document.removeEventListener('visibilitychange', syncBadge)
    }
  }, [totalUnread])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        if (totalUnread === 0 && Date.now() < trustLocalClearUntilRef.current) {
          void updateAppBadge(0)
          return
        }

        void refreshAppBadge(totalUnread)
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [totalUnread])

  return null
}
