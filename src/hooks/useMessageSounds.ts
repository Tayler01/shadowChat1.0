import { useEffect, useState, useCallback } from 'react'

export type MessageSound = 'chime' | 'pop'

export function useMessageSounds() {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('messageSoundsEnabled')
      if (stored === null) return true
      return stored === 'true'
    }
    return true
  })

  const [sound, setSound] = useState<MessageSound>(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('messageSoundChoice') as MessageSound | null
      if (stored === 'chime' || stored === 'pop') return stored
    }
    return 'chime'
  })

  useEffect(() => {
    try {
      localStorage.setItem('messageSoundsEnabled', String(enabled))
    } catch {}
  }, [enabled])

  useEffect(() => {
    try {
      localStorage.setItem('messageSoundChoice', sound)
    } catch {}
  }, [sound])

  const play = useCallback(() => {
    if (!enabled) return
    const audio = new Audio(`/sounds/${sound}.wav`)
    audio.play().catch(() => {})
  }, [enabled, sound])

  return { enabled, setEnabled, sound, setSound, play }
}
