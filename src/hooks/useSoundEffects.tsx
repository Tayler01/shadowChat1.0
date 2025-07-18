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

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(
  undefined,
)

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

  const [urls, setUrls] = useState(defaultUrls)
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map())

  const preloadAudio = useCallback((url: string) => {
    if (!url || audioCache.current.has(url)) return
    try {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audioCache.current.set(url, audio)
    } catch {
      // ignore preload errors
    }
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem('soundEffectsEnabled', String(enabled))
    } catch {
      // ignore storage errors
    }
  }, [enabled])

  useEffect(() => {
    preloadAudio(urls.message)
    preloadAudio(urls.reaction)
  }, [urls, preloadAudio])

  useEffect(() => {
    ;(async () => {
      try {
        const client = await getWorkingClient()
        const { data, error } = await client
          .from('notification_sounds')
          .select('name, url')
        if (!error && data) {
          const map = { ...defaultUrls }
          data.forEach((row: any) => {
            if (row.name === 'message') map.message = row.url
            if (row.name === 'reaction') map.reaction = row.url
          })
          setUrls(map)
        }
      } catch {
        // ignore fetch errors
      }
    })()
  }, [])

  const play = useCallback(
    (url: string) => {
      if (!enabled || !url) return
      try {
        let audio = audioCache.current.get(url)
        if (!audio) {
          audio = new Audio(url)
          audio.preload = 'auto'
          audioCache.current.set(url, audio)
        }
        audio.currentTime = 0
        audio.play().catch(() => {})
      } catch {
        // ignore playback errors
      }
    },
    [enabled],
  )

  const playMessage = useCallback(
    () => play(urls.message),
    [play, urls.message],
  )
  const playReaction = useCallback(
    () => play(urls.reaction),
    [play, urls.reaction],
  )

  return { enabled, setEnabled, playMessage, playReaction }
}

export function SoundEffectsProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const value = useProvideSoundEffects()
  return (
    <SoundEffectsContext.Provider value={value}>
      {children}
    </SoundEffectsContext.Provider>
  )
}

export function useSoundEffects() {
  const ctx = useContext(SoundEffectsContext)
  if (!ctx) {
    throw new Error(
      'useSoundEffects must be used within a SoundEffectsProvider',
    )
  }
  return ctx
}
