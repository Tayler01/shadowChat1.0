import { useState, useEffect } from 'react'
import { DEBUG } from '../lib/supabase'

export type ClientResetStatus = 'idle' | 'resetting' | 'success' | 'error'

export function useClientResetStatus() {
  const [status, setStatus] = useState<ClientResetStatus>('idle')
  const [lastResetTime, setLastResetTime] = useState<Date | null>(null)

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        if (DEBUG) console.log('🔴 Client reset indicator: Starting reset...')
        setStatus('resetting')
        setLastResetTime(new Date())
        
        // Set a timeout to mark as success after the reset process should be complete
        // This gives time for the visibility refresh logic to run
        const successTimeout = setTimeout(() => {
          if (DEBUG) console.log('🟢 Client reset indicator: Reset complete')
          setStatus('success')
          
          // Auto-hide after 3 seconds
          setTimeout(() => {
            setStatus('idle')
          }, 3000)
        }, 2000) // 2 seconds should be enough for the reset process
        
        // Set an error timeout in case something goes wrong
        const errorTimeout = setTimeout(() => {
          if (DEBUG) console.log('🔴 Client reset indicator: Reset timeout')
          setStatus('error')
          
          // Auto-hide after 5 seconds
          setTimeout(() => {
            setStatus('idle')
          }, 5000)
        }, 10000) // 10 seconds timeout
        
        return () => {
          clearTimeout(successTimeout)
          clearTimeout(errorTimeout)
        }
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [])

  const manualReset = () => {
    setStatus('resetting')
    setLastResetTime(new Date())
    
    setTimeout(() => {
      setStatus('success')
      setTimeout(() => setStatus('idle'), 3000)
    }, 1000)
  }

  return {
    status,
    lastResetTime,
    manualReset
  }
}