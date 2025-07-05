import { useState, useEffect, useRef } from 'react'
import { useClientReset } from './ClientResetContext'

export function useConnectivity() {
  const { manualReset } = useClientReset()
  const [offline, setOffline] = useState(typeof navigator !== 'undefined' ? !navigator.onLine : false)
  const intervalRef = useRef<number | null>(null)

  const checkConnectivity = async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setOffline(true)
      return
    }
    try {
      const controller = new AbortController()
      const timeoutId = window.setTimeout(() => controller.abort(), 3000)
      // Use a more reliable endpoint for connectivity check
      await fetch('https://www.google.com/favicon.ico', { 
        method: 'HEAD', 
        cache: 'no-store', 
        signal: controller.signal,
        mode: 'no-cors' // Avoid CORS issues
      })
      clearTimeout(timeoutId)
      if (offline) {
        setOffline(false)
        try {
          await manualReset()
        } catch {
          // ignore
        }
      }
    } catch {
      setOffline(true)
    }
  }

  useEffect(() => {
    const handleOnline = () => {
      checkConnectivity()
    }
    const handleOffline = () => {
      setOffline(true)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    checkConnectivity()
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  useEffect(() => {
    if (offline) {
      if (intervalRef.current === null) {
        intervalRef.current = window.setInterval(checkConnectivity, 5000)
      }
    } else if (intervalRef.current !== null) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
  }, [offline])

  return { offline }
}
