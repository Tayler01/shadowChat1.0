import { useEffect, useMemo } from 'react'
import { useDirectMessages } from '../../hooks/useDirectMessages'
import { updateAppBadge } from '../../lib/appBadge'

export function AppBadgeSync() {
  const { conversations } = useDirectMessages()
  const totalUnread = useMemo(
    () => conversations.reduce((sum, conversation) => sum + (conversation.unread_count || 0), 0),
    [conversations]
  )

  useEffect(() => {
    void updateAppBadge(totalUnread)
  }, [totalUnread])

  useEffect(() => {
    const syncBadge = () => {
      void updateAppBadge(totalUnread)
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

  return null
}
