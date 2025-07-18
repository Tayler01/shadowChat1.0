import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'

interface SoundEffectsContextValue {
  enabled: boolean
  setEnabled: (v: boolean) => void
  playMessage: () => void
  playReaction: () => void
}

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(undefined)

// Default sound URLs - these should be accessible from your public folder
const defaultUrls = {
  message: '/sounds/message.mp3',
  reaction: '/sounds/reaction.mp3'
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
  const [audioCache, setAudioCache] = useState<Record<string, HTMLAudioElement>>({})

  useEffect(() => {
    try {
      localStorage.setItem('soundEffectsEnabled', String(enabled))
    } catch {
      // ignore storage errors
    }
  }, [enabled])

  // Preload and cache audio files
  useEffect(() => {
    const cache: Record<string, HTMLAudioElement> = {}
    
    Object.entries(urls).forEach(([key, url]) => {
      if (url) {
        try {
          const audio = new Audio(url)
          audio.preload = 'auto'
          audio.volume = 0.5
          cache[key] = audio
        } catch (error) {
          console.warn(`Failed to preload ${key} sound:`, error)
        }
      }
    })
    
    setAudioCache(cache)
  }, [urls])

  const play = useCallback(
    (soundType: string) => {
      if (!enabled) return
      
      const audio = audioCache[soundType]
      if (!audio) {
        console.warn(`Sound ${soundType} not found in cache`)
        return
      }
      
      try {
        // Reset audio to beginning in case it was played before
        audio.currentTime = 0
        const playPromise = audio.play()
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            console.warn(`Failed to play ${soundType} sound:`, error)
          })
        }
      } catch (error) {
        console.warn(`Error playing ${soundType} sound:`, error)
      }
    },
    [enabled, audioCache]
  )

  const playMessage = useCallback(() => play('message'), [play])
  const playReaction = useCallback(() => play('reaction'), [play])

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
