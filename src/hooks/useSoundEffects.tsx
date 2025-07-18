import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { getWorkingClient } from '../lib/supabase'

interface SoundEffectsContextValue {
  enabled: boolean
  setEnabled: (v: boolean) => void
  playMessage: () => void
  playReaction: () => void
}

const SoundEffectsContext = createContext<SoundEffectsContextValue | undefined>(undefined)

function useProvideSoundEffects(): SoundEffectsContextValue {
  const [enabled, setEnabled] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('soundEffectsEnabled')
      if (stored === null) return true
      return stored === 'true'
    }
    return true
  })

  const [urls, setUrls] = useState<Record<string, string>>({})
  const [audioCache, setAudioCache] = useState<Record<string, HTMLAudioElement>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    try {
      localStorage.setItem('soundEffectsEnabled', String(enabled))
    } catch {
      // ignore storage errors
    }
  }, [enabled])

  // Fetch sound URLs from Supabase
  useEffect(() => {
    const fetchSoundUrls = async () => {
      try {
        const client = await getWorkingClient()
        const { data, error } = await client
          .from('notification_sounds')
          .select('name, url')
        
        if (error) {
          console.warn('Failed to fetch notification sounds:', error)
          // Use fallback URLs if database fetch fails
          setUrls({
            message: '/sounds/message.mp3',
            reaction: '/sounds/reaction.mp3'
          })
        } else if (data) {
          const urlMap: Record<string, string> = {}
          data.forEach(sound => {
            urlMap[sound.name] = sound.url
          })
          setUrls(urlMap)
        }
      } catch (error) {
        console.warn('Error fetching notification sounds:', error)
        // Use fallback URLs
        setUrls({
          message: '/sounds/message.mp3',
          reaction: '/sounds/reaction.mp3'
        })
      } finally {
        setLoading(false)
      }
    }

    fetchSoundUrls()
  }, [])
  // Preload and cache audio files
  useEffect(() => {
    if (loading || Object.keys(urls).length === 0) return
    
    const cache: Record<string, HTMLAudioElement> = {}
    
    Object.entries(urls).forEach(([key, url]) => {
      if (url) {
        try {
          const audio = new Audio(url)
          audio.preload = 'auto'
          audio.volume = 0.5
          audio.crossOrigin = 'anonymous' // For external URLs
          cache[key] = audio
        } catch (error) {
          console.warn(`Failed to preload ${key} sound:`, error)
        }
      }
    })
    
    setAudioCache(cache)
  }, [urls, loading])

  const play = useCallback(
    (soundType: string) => {
      if (!enabled) return
      
      const audio = audioCache[soundType]
      if (!audio) {
        console.warn(`Sound ${soundType} not found in cache. Available sounds:`, Object.keys(audioCache))
        return
      }
      
      try {
        // Reset audio to beginning in case it was played before
        audio.currentTime = 0
        const playPromise = audio.play()
        
        if (playPromise !== undefined) {
          playPromise.catch(error => {
            // Handle common autoplay policy errors
            if (error.name === 'NotAllowedError') {
              console.warn(`Autoplay blocked for ${soundType} sound. User interaction required.`)
            } else {
              console.warn(`Failed to play ${soundType} sound:`, error)
            }
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
