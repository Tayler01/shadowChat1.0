import { useEffect } from 'react'
import { expireUserChannelBans, notifyChannelBansChanged } from '../lib/moderation'
import { useAuth } from './useAuth'

const SWEEP_INTERVAL_MS = 60000

export function useChannelBanExpirySweep() {
  const { user } = useAuth()

  useEffect(() => {
    if (!user) return

    let cancelled = false

    const runSweep = async () => {
      try {
        const expiredCount = await expireUserChannelBans()
        if (!cancelled && expiredCount > 0) {
          notifyChannelBansChanged('')
        }
      } catch {
        // Expiry is a cleanup aid; direct ban checks still block expired rows by timestamp.
      }
    }

    void runSweep()
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') {
        void runSweep()
      }
    }, SWEEP_INTERVAL_MS)

    return () => {
      cancelled = true
      window.clearInterval(interval)
    }
  }, [user])
}
