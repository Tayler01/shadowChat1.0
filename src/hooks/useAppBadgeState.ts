import { useEffect, useState } from 'react'
import {
  APP_BADGE_STATE_EVENT,
  getCachedAppBadgeState,
  type AppBadgeState,
} from '../lib/appBadge'

export function useAppBadgeState() {
  const [state, setState] = useState<AppBadgeState>(() => getCachedAppBadgeState())

  useEffect(() => {
    const applyPublishedState = (event: Event) => {
      const next = (event as CustomEvent<AppBadgeState>).detail
      if (next) setState(next)
    }

    window.addEventListener(APP_BADGE_STATE_EVENT, applyPublishedState)

    return () => {
      window.removeEventListener(APP_BADGE_STATE_EVENT, applyPublishedState)
    }
  }, [])

  return state
}
