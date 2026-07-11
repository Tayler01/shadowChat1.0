import { createContext, useContext } from 'react'
import type { ActivityEvent, ActivityFilter } from './activityModel'

export type ActivityContextValue = {
  items: ActivityEvent[]
  filter: ActivityFilter
  loading: boolean
  loadingMore: boolean
  error: string | null
  unreadCount: number
  hasMore: boolean
  announcement: string
  realtimeStatus: 'idle' | 'connecting' | 'live' | 'recovering'
  setFilter: (filter: ActivityFilter) => void
  refresh: () => Promise<void>
  loadMore: () => Promise<void>
  markRead: (id: string) => Promise<boolean>
  markAllRead: () => Promise<boolean>
}

export const ActivityContext = createContext<ActivityContextValue | null>(null)

export function useActivity() {
  const context = useContext(ActivityContext)
  if (!context) throw new Error('useActivity must be used within ActivityProvider')
  return context
}

export function useOptionalActivity() {
  return useContext(ActivityContext)
}
