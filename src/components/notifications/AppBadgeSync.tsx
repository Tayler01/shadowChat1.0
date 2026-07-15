import { useEffect, useMemo } from 'react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { APP_BADGE_REFRESH_EVENT, refreshAppBadge } from '../../lib/appBadge'

export function AppBadgeSync() {
  const { conversations } = useDirectMessages()
  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  )

  useEffect(() => {
    void refreshAppBadge(totalUnread)
  }, [totalUnread])

  useEffect(() => {
    const syncBadge = () => {
      if (document.visibilityState === 'hidden') {
        return
      }

      void refreshAppBadge(totalUnread)
    }

    window.addEventListener('focus', syncBadge)
    window.addEventListener('pageshow', syncBadge)
    window.addEventListener(APP_BADGE_REFRESH_EVENT, syncBadge)
    document.addEventListener('visibilitychange', syncBadge)

    return () => {
      window.removeEventListener('focus', syncBadge)
      window.removeEventListener('pageshow', syncBadge)
      window.removeEventListener(APP_BADGE_REFRESH_EVENT, syncBadge)
      document.removeEventListener('visibilitychange', syncBadge)
    }
  }, [totalUnread])

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void refreshAppBadge(totalUnread)
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [totalUnread])

  return null
}
