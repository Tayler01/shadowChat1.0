import { useEffect } from 'react'
import {
  REALTIME_RECOVERY_EVENT,
  type RealtimeRecoveryResult,
} from '../lib/realtimeRecovery'

export function useRealtimeRecovery(
  onRecovered: (result: RealtimeRecoveryResult) => void,
  delayMs = 150
) {
  useEffect(() => {
    const handleRecovered = (event: Event) => {
      const result = (event as CustomEvent<RealtimeRecoveryResult>).detail
      if (!result?.ok) {
        return
      }

      if (delayMs > 0) {
        window.setTimeout(() => onRecovered(result), delayMs)
        return
      }

      onRecovered(result)
    }

    window.addEventListener(REALTIME_RECOVERY_EVENT, handleRecovered)
    return () => window.removeEventListener(REALTIME_RECOVERY_EVENT, handleRecovered)
  }, [delayMs, onRecovered])
}

