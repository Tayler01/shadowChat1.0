/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from 'react'

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

type ToneVariant = 'message' | 'reaction' | 'hype-bell' | 'hype-message'

type ToneDefinition = {
  frequencies: readonly number[]
  interval: number
  duration: number
  oscillator: OscillatorType
  peakGain: number
}

const toneDefinitions: Record<ToneVariant, ToneDefinition> = {
  message: {
    frequencies: [523.25, 783.99],
    interval: 0.075,
    duration: 0.3,
    oscillator: 'sine',
    peakGain: 0.08,
  },
  reaction: {
    frequencies: [659.25, 1046.5],
    interval: 0.055,
    duration: 0.22,
    oscillator: 'triangle',
    peakGain: 0.065,
  },
  'hype-bell': {
    frequencies: [784, 988, 1175, 1568],
    interval: 0.085,
    duration: 0.52,
    oscillator: 'triangle',
    peakGain: 0.16,
  },
  'hype-message': {
    frequencies: [523, 659, 880, 1319],
    interval: 0.085,
    duration: 0.52,
    oscillator: 'sine',
    peakGain: 0.16,
  },
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

  const audioContextRef = useRef<AudioContext | null>(null)

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null

    const existing = audioContextRef.current
    if (existing && existing.state !== 'closed') return existing

    const audioWindow = window as typeof window & {
      webkitAudioContext?: typeof AudioContext
    }
    const AudioContextCtor = window.AudioContext ?? audioWindow.webkitAudioContext
    if (!AudioContextCtor) return null

    const context = new AudioContextCtor()
    audioContextRef.current = context
    return context
  }, [])

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
    try {
      localStorage.removeItem('notificationSoundUrls')
    } catch {
      // Ignore storage errors while retiring the old remote-sound cache.
    }

    // Create and resume the shared context from a user gesture for mobile browsers.
    const unlock = () => {
      try {
        const context = ensureAudioContext()
        if (context?.state === 'suspended') {
          context.resume().catch(() => {})
        }
      } catch {
        // Visual feedback still runs if browser audio is unavailable.
      }
    }
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })

    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)

      const context = audioContextRef.current
      audioContextRef.current = null
      if (context && context.state !== 'closed') {
        context.close().catch(() => {})
      }
    }
  }, [ensureAudioContext])

  const playTone = useCallback((variant: ToneVariant) => {
    try {
      const context = ensureAudioContext()
      if (!context) return
      if (context.state === 'suspended') {
        context.resume().catch(() => {})
      }

      const definition = toneDefinitions[variant]
      const startTime = context.currentTime
      const master = context.createGain()
      const finishTime = startTime
        + definition.interval * (definition.frequencies.length - 1)
        + definition.duration
      master.gain.setValueAtTime(0.0001, startTime)
      master.gain.exponentialRampToValueAtTime(definition.peakGain, startTime + 0.015)
      master.gain.exponentialRampToValueAtTime(0.0001, finishTime)
      master.connect(context.destination)

      definition.frequencies.forEach((frequency, index) => {
        const start = startTime + index * definition.interval
        const oscillator = context.createOscillator()
        const gain = context.createGain()
        oscillator.type = definition.oscillator
        oscillator.frequency.setValueAtTime(frequency, start)
        gain.gain.setValueAtTime(0.0001, start)
        gain.gain.exponentialRampToValueAtTime(index === 0 ? 0.2 : 0.12, start + 0.012)
        gain.gain.exponentialRampToValueAtTime(0.0001, start + definition.duration)
        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(start)
        oscillator.stop(start + definition.duration)
      })
    } catch {
      // Visual feedback still runs if browser audio is blocked.
    }
  }, [ensureAudioContext])

  const playMessage = useCallback(() => {
    if (enabled) playTone('message')
  }, [enabled, playTone])

  const playReaction = useCallback(() => {
    if (enabled) playTone('reaction')
  }, [enabled, playTone])

  const playHypeTone = useCallback((variant: 'bell' | 'message') => {
    if (!hypeEnabled) return
    playTone(variant === 'bell' ? 'hype-bell' : 'hype-message')
  }, [hypeEnabled, playTone])

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
