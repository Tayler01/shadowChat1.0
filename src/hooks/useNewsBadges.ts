import { useCallback } from 'react'
import { useBoardBadges } from './useBoardBadges'

export function useNewsBadges() {
  const boardBadges = useBoardBadges()

  const markSeen = useCallback(async (section: 'all' | 'feed' | 'chat') => {
    if (section === 'feed' || section === 'all') {
      await boardBadges.markFeedSeen()
      return
    }
    await boardBadges.refresh()
  }, [boardBadges])

  return {
    count: boardBadges.count,
    refresh: boardBadges.refresh,
    markSeen,
  }
}
