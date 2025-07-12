import { useEffect, useState } from 'react'

export type MessageSound = 'beep1' | 'beep2'

interface SoundEffects {
  enabled: boolean
  setEnabled: (v: boolean) => void
  sound: MessageSound
  setSound: (s: MessageSound) => void
}

export function useSoundEffects(): SoundEffects {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('soundEffectsEnabled')
      if (stored !== null) return stored === 'true'
    }
    return true
  })

  const [sound, setSound] = useState<MessageSound>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('messageSound') as MessageSound | null
      if (stored === 'beep2') return 'beep2'
    }
    return 'beep1'
  })

  useEffect(() => {
    try {
      localStorage.setItem('soundEffectsEnabled', String(enabled))
    } catch {
      // ignore
    }
  }, [enabled])

  useEffect(() => {
    try {
      localStorage.setItem('messageSound', sound)
    } catch {
      // ignore
    }
  }, [sound])

  return { enabled, setEnabled, sound, setSound }
}
