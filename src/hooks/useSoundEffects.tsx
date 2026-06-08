/* eslint-disable react-refresh/only-export-components */
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
  hypeEnabled: boolean
  setHypeEnabled: (v: boolean) => void
  playMessage: () => void
  playReaction: () => void
  playHypeBell: () => void
  playHypeMessage: () => void
}

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(undefined)

const defaultUrls = {
  message: '/sounds/message.mp3',
  reaction: '/sounds/reaction.mp3',
}

const isUsableSoundUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false
  if (value.includes('example.com')) return false
  return value.startsWith('/') || /^https?:\/\//i.test(value)
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

  const [hypeEnabled, setHypeEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('hypeSoundEffectsEnabled')
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
    try {
      localStorage.setItem('hypeSoundEffectsEnabled', String(hypeEnabled))
    } catch {
      // ignore storage errors
    }
  }, [hypeEnabled])

  useEffect(() => {
    ;(async () => {
      try {
        const client = await getWorkingClient()
        const { data, error } = await client
          .from('notification_sounds')
          .select('name, url')
        if (!error && data) {
          const map = { ...defaultUrls }
          ;(data as Array<{ name?: unknown; url?: unknown }>).forEach(row => {
            if (row.name === 'message' && isUsableSoundUrl(row.url)) map.message = row.url
            if (row.name === 'reaction' && isUsableSoundUrl(row.url)) map.reaction = row.url
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
    (audio: HTMLAudioElement | null | undefined) => {
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

  const playHypeTone = useCallback((variant: 'bell' | 'message') => {
    if (!hypeEnabled || typeof window === 'undefined') return

    const audioWindow = window as typeof window & { webkitAudioContext?: typeof AudioContext }
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext
    if (!AudioContextCtor) return

    try {
      const context = new AudioContextCtor()
      const master = context.createGain()
      master.gain.setValueAtTime(0.0001, context.currentTime)
      master.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.018)
      master.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 1.05)
      master.connect(context.destination)

      const notes = variant === 'bell'
        ? [784, 988, 1175, 1568]
        : [523, 659, 880, 1319]

      notes.forEach((frequency, index) => {
        const start = context.currentTime + index * 0.085
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = variant === 'bell' ? 'triangle' : 'sine'
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.22 : 0.13, start + 0.018)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.48)
        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(start)
        oscillator.stop(start + 0.52)
      })

      window.setTimeout(() => {
        context.close().catch(() => {})
      }, 1300)
    } catch {
      // Visual feedback still runs if browser audio is blocked.
    }
  }, [hypeEnabled])

  const playHypeBell = useCallback(() => playHypeTone('bell'), [playHypeTone])
  const playHypeMessage = useCallback(() => playHypeTone('message'), [playHypeTone])

  return {
    enabled,
    setEnabled,
    hypeEnabled,
    setHypeEnabled,
    playMessage,
    playReaction,
    playHypeBell,
    playHypeMessage,
  }
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
