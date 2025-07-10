import { useEffect, useState } from 'react'
import { requestPushPermission, deletePushToken } from '../lib/firebaseMessaging'

export function usePushNotifications() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('pushNotifications')
      return stored === 'true'
    }
    return false
  })

  useEffect(() => {
    try {
      localStorage.setItem('pushNotifications', String(enabled))
    } catch {
      // ignore
    }

    if (enabled) {
      requestPushPermission().catch(console.error)
    } else {
      deletePushToken().catch(() => {})
    }
  }, [enabled])

  return { enabled, setEnabled }
}
