import { useEffect, useMemo } from 'react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { refreshAppBadge, updateAppBadge } from '../../lib/appBadge'

export function AppBadgeSync() {
  const { conversations } = useDirectMessages()
  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  )

  useEffect(() => {
    void updateAppBadge(totalUnread)
    void refreshAppBadge(totalUnread)
  }, [totalUnread])

  useEffect(() => {
    const syncBadge = () => {
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
        void refreshAppBadge(totalUnread)
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [totalUnread])

  return null
}
