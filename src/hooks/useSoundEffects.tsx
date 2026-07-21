/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
} from 'react'
import { useComfortPreferences } from './useComfortPreferences'
import type { NotificationSoundId } from '../features/notifications/notificationEnvelopeV2'

interface SoundEffectsContextValue {
  enabled: boolean
  setEnabled: (v: boolean) => void
  hypeEnabled: boolean
  setHypeEnabled: (v: boolean) => void
  playMessage: () => void
  playReaction: () => void
  playHypeBell: () => void
  playHypeMessage: () => void
  playNotificationCue: (soundId: NotificationSoundId) => void
  previewNotificationCue: (soundId: NotificationSoundId) => Promise<boolean>
  stopNotificationCuePreview: () => void
}

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(undefined)

type ToneVariant =
  | 'message'
  | 'reaction'
  | 'hype-bell'
  | 'hype-message'
  | Exclude<NotificationSoundId, 'system_default' | 'silent'>

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
  shadow_whisper: {
    frequencies: [392, 523.25],
    interval: 0.105,
    duration: 0.28,
    oscillator: 'sine',
    peakGain: 0.055,
  },
  low_glass: {
    frequencies: [440, 659.25],
    interval: 0.085,
    duration: 0.3,
    oscillator: 'sine',
    peakGain: 0.06,
  },
  gold_signal: {
    frequencies: [659.25, 987.77],
    interval: 0.09,
    duration: 0.34,
    oscillator: 'triangle',
    peakGain: 0.07,
  },
  hype_burst: {
    frequencies: [523.25, 783.99, 1046.5],
    interval: 0.06,
    duration: 0.3,
    oscillator: 'triangle',
    peakGain: 0.075,
  },
  pin_shutter: {
    frequencies: [880, 587.33, 783.99],
    interval: 0.045,
    duration: 0.18,
    oscillator: 'square',
    peakGain: 0.035,
  },
  connection_chime: {
    frequencies: [493.88, 659.25, 880],
    interval: 0.09,
    duration: 0.38,
    oscillator: 'sine',
    peakGain: 0.06,
  },
  presence_pulse: {
    frequencies: [349.23, 440],
    interval: 0.13,
    duration: 0.32,
    oscillator: 'sine',
    peakGain: 0.045,
  },
  live_beacon: {
    frequencies: [196, 392, 783.99],
    interval: 0.11,
    duration: 0.42,
    oscillator: 'sine',
    peakGain: 0.07,
  },
  checkers_move: {
    frequencies: [293.66, 440],
    interval: 0.055,
    duration: 0.2,
    oscillator: 'triangle',
    peakGain: 0.065,
  },
  war_drum: {
    frequencies: [110, 146.83, 220],
    interval: 0.09,
    duration: 0.38,
    oscillator: 'sine',
    peakGain: 0.09,
  },
  weather_glass: {
    frequencies: [587.33, 739.99, 880],
    interval: 0.12,
    duration: 0.48,
    oscillator: 'sine',
    peakGain: 0.055,
  },
  security_signal: {
    frequencies: [440, 369.99, 440],
    interval: 0.12,
    duration: 0.42,
    oscillator: 'triangle',
    peakGain: 0.075,
  },
}

function useProvideSoundEffects(): SoundEffectsContextValue {
  const { preferences, updatePreferences } = useComfortPreferences()
  const enabled = preferences.uiSounds
  const hypeEnabled = preferences.celebrationSounds
  const audioContextRef = useRef<AudioContext | null>(null)
  const notificationPreviewRef = useRef<HTMLAudioElement | null>(null)
  const soundPolicyRef = useRef({ enabled, hypeEnabled })
  const lastNotificationCueAtRef = useRef(0)
  soundPolicyRef.current = { enabled, hypeEnabled }

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

  const unlockAudioContext = useCallback(() => {
    try {
      const context = ensureAudioContext()
      if (context?.state === 'suspended') {
        context.resume().catch(() => {})
      }
    } catch {
      // Visual feedback still runs if browser audio is unavailable.
    }
  }, [ensureAudioContext])

  const setEnabled = useCallback((value: boolean) => {
    if (value) unlockAudioContext()
    updatePreferences({ uiSounds: value })
  }, [unlockAudioContext, updatePreferences])
  const setHypeEnabled = useCallback((value: boolean) => {
    if (value) unlockAudioContext()
    updatePreferences({ celebrationSounds: value })
  }, [unlockAudioContext, updatePreferences])

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
      const policy = soundPolicyRef.current
      if (!policy.enabled && !policy.hypeEnabled) return
      unlockAudioContext()
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
      const preview = notificationPreviewRef.current
      notificationPreviewRef.current = null
      if (preview) {
        preview.pause()
        preview.currentTime = 0
      }
    }
  }, [unlockAudioContext])

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
  const playNotificationCue = useCallback((soundId: NotificationSoundId) => {
    if (!enabled || soundId === 'silent') return
    const now = Date.now()
    if (now - lastNotificationCueAtRef.current < 700) return
    lastNotificationCueAtRef.current = now
    playTone(soundId === 'system_default' ? 'message' : soundId)
  }, [enabled, playTone])

  const stopNotificationCuePreview = useCallback(() => {
    const preview = notificationPreviewRef.current
    notificationPreviewRef.current = null
    if (!preview) return
    preview.pause()
    preview.currentTime = 0
  }, [])

  const previewNotificationCue = useCallback(async (
    soundId: NotificationSoundId,
  ) => {
    stopNotificationCuePreview()
    if (
      typeof Audio === 'undefined' ||
      soundId === 'silent' ||
      soundId === 'system_default'
    ) return false

    const preview = new Audio(`/notification-sounds/${soundId}.wav`)
    preview.preload = 'auto'
    preview.volume = 0.82
    notificationPreviewRef.current = preview
    preview.onended = () => {
      if (notificationPreviewRef.current === preview) {
        notificationPreviewRef.current = null
      }
    }
    try {
      await preview.play()
      return true
    } catch {
      if (notificationPreviewRef.current === preview) {
        notificationPreviewRef.current = null
      }
      return false
    }
  }, [stopNotificationCuePreview])

  return {
    enabled,
    setEnabled,
    hypeEnabled,
    setHypeEnabled,
    playMessage,
    playReaction,
    playHypeBell,
    playHypeMessage,
    playNotificationCue,
    previewNotificationCue,
    stopNotificationCuePreview,
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
