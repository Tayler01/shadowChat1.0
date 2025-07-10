import { useEffect, useState } from 'react'

export type MessageSound = 'chime' | 'pop'

export function useSoundEffects() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('soundsEnabled')
      if (stored === null) return true
      return stored === 'true'
    }
    return true
  })

  const [sound, setSound] = useState<MessageSound>(() => {
    if (typeof localStorage !== 'undefined') {
      return (localStorage.getItem('messageSound') as MessageSound) || 'chime'
    }
    return 'chime'
  })

  useEffect(() => {
    try {
      localStorage.setItem('soundsEnabled', String(enabled))
    } catch {}
  }, [enabled])

  useEffect(() => {
    try {
      localStorage.setItem('messageSound', sound)
    } catch {}
  }, [sound])

  return { enabled, setEnabled, sound, setSound }
}
