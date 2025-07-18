import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { getWorkingClient } from '../lib/supabase'

interface SoundEffectsContextValue {
  enabled: boolean
  setEnabled: (v: boolean) => void
  playMessage: () => void
  playReaction: () => void
}

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(undefined)

const defaultUrls = {
  message: '/sounds/message.mp3',
  reaction: '/sounds/reaction.mp3',
}

function useProvideSoundEffects(): SoundEffectsContextValue {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('soundEffectsEnabled')
      if (stored === null) return true
      return stored === 'true'
    }
    return true
  })

  const [urls, setUrls] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      try {
        const raw = localStorage.getItem('notificationSoundUrls')
        if (raw) {
          const parsed = JSON.parse(raw) as Record<string, string>
          return { ...defaultUrls, ...parsed }
        }
      } catch {
        // ignore parse errors
      }
    }
    return defaultUrls
  })

  const messageAudioRef = useRef<HTMLAudioElement | null>(null)
  const reactionAudioRef = useRef<HTMLAudioElement | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem('soundEffectsEnabled', String(enabled))
    } catch {
      // ignore storage errors
    }
  }, [enabled])

  useEffect(() => {
    ;(async () => {
      try {
        const client = await getWorkingClient()
        const { data, error } = await client
          .from('notification_sounds')
          .select('name, url')
        if (!error && data) {
          const map = { ...defaultUrls }
          data.forEach((row: { name: string; url: string }) => {
            if (row.name === 'message') map.message = row.url
            if (row.name === 'reaction') map.reaction = row.url
          })
          setUrls(map)
          try {
            localStorage.setItem('notificationSoundUrls', JSON.stringify(map))
          } catch {
            // ignore storage errors
          }
        }
      } catch {
        // ignore fetch errors
      }
    })()
  }, [])

  useEffect(() => {
    const message = new Audio(urls.message)
    message.crossOrigin = 'anonymous'
    message.volume = 0.5
    message.load()
    messageAudioRef.current = message

    const reaction = new Audio(urls.reaction)
    reaction.crossOrigin = 'anonymous'
    reaction.volume = 0.5
    reaction.load()
    reactionAudioRef.current = reaction

    // Unlock audio playback on first user interaction (required on mobile)
    const unlock = () => {
      ;[messageAudioRef.current, reactionAudioRef.current].forEach(a => {
        if (!a) return
        try {
          a.play().catch(() => {})
          a.pause()
          a.currentTime = 0
        } catch {
          // ignore errors
        }
      })
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
    }
    document.addEventListener('touchstart', unlock, { once: true })
    document.addEventListener('click', unlock, { once: true })
    return () => {
      document.removeEventListener('touchstart', unlock)
      document.removeEventListener('click', unlock)
    }
  }, [urls])

  const play = useCallback(
    (audio?: HTMLAudioElement) => {
      if (!enabled || !audio) return
      try {
        audio.currentTime = 0
        audio.play().catch(() => {})
      } catch {
        // ignore playback errors
      }
    },
    [enabled]
  )

  const playMessage = useCallback(() => play(messageAudioRef.current), [play])
  const playReaction = useCallback(() => play(reactionAudioRef.current), [play])

  return { enabled, setEnabled, playMessage, playReaction }
}

export function SoundEffectsProvider({ children }: { children: React.ReactNode }) {
  const value = useProvideSoundEffects()
  return <SoundEffectsContext.Provider value={value}>{children}</SoundEffectsContext.Provider>
}

export function useSoundEffects() {
  const ctx = useContext(SoundEffectsContext)
  if (!ctx) {
    throw new Error('useSoundEffects must be used within a SoundEffectsProvider')
  }
  return ctx
}
