/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { MotionConfig } from 'framer-motion'
import {
  COMFORT_MEDIA_QUERIES,
  COMFORT_PRESETS,
  COMFORT_RESET_EVENT,
  COMFORT_STORAGE_KEY,
  DEFAULT_COMFORT_PREFERENCES,
  DEFAULT_SYSTEM_COMFORT_PREFERENCES,
  applyComfortAttributes,
  loadComfortPreferences,
  parseComfortPreferences,
  readSystemComfortPreferences,
  resolveComfortPreferences,
  saveComfortPreferences,
  type ComfortPreferences,
  type ComfortPresetId,
  type EffectiveComfortPreferences,
  type SystemComfortPreferences,
} from '../lib/comfortPreferences'

export type ComfortPreferencesContextValue = {
  preferences: ComfortPreferences
  effectivePreferences: EffectiveComfortPreferences
  systemPreferences: SystemComfortPreferences
  updatePreferences: (patch: Partial<ComfortPreferences>) => void
  applyPreset: (preset: ComfortPresetId) => void
  resetPreferences: () => void
  isReducedMotion: boolean
  shouldAutoplayMedia: boolean
}

const ComfortPreferencesContext = createContext<ComfortPreferencesContextValue | null>(null)

type ComfortPreferencesProviderProps = {
  children: ReactNode
}

type CompatibleMediaQueryList = MediaQueryList & {
  addListener?: (listener: (event: MediaQueryListEvent) => void) => void
  removeListener?: (listener: (event: MediaQueryListEvent) => void) => void
}

const readInitialPreferences = () => loadComfortPreferences()

const readInitialSystemPreferences = () => (
  typeof window === 'undefined'
    ? { ...DEFAULT_SYSTEM_COMFORT_PREFERENCES }
    : readSystemComfortPreferences()
)

export function ComfortPreferencesProvider({ children }: ComfortPreferencesProviderProps) {
  const [preferences, setPreferences] = useState<ComfortPreferences>(readInitialPreferences)
  const [systemPreferences, setSystemPreferences] = useState<SystemComfortPreferences>(
    readInitialSystemPreferences
  )
  const skipNextPersistenceRef = useRef(false)

  const effectivePreferences = useMemo(
    () => resolveComfortPreferences(preferences, systemPreferences),
    [preferences, systemPreferences]
  )

  const updatePreferences = useCallback((patch: Partial<ComfortPreferences>) => {
    setPreferences(current => parseComfortPreferences({
      ...current,
      ...patch,
      preset: patch.preset ?? 'custom',
    }))
  }, [])

  const applyPreset = useCallback((preset: ComfortPresetId) => {
    setPreferences(parseComfortPreferences(COMFORT_PRESETS[preset]))
  }, [])

  const resetPreferences = useCallback(() => {
    setPreferences({ ...DEFAULT_COMFORT_PREFERENCES })
  }, [])

  useEffect(() => {
    if (skipNextPersistenceRef.current) {
      skipNextPersistenceRef.current = false
      return
    }
    saveComfortPreferences(preferences)
  }, [preferences])

  useEffect(() => {
    if (typeof document === 'undefined') return
    applyComfortAttributes(document.documentElement, effectivePreferences)
  }, [effectivePreferences])

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return

    const mediaQueries = Object.values(COMFORT_MEDIA_QUERIES).flatMap(query => {
      try {
        return [window.matchMedia(query) as CompatibleMediaQueryList]
      } catch {
        return []
      }
    })
    const refreshSystemPreferences = () => {
      setSystemPreferences(readSystemComfortPreferences())
    }

    refreshSystemPreferences()
    mediaQueries.forEach(mediaQuery => {
      if (typeof mediaQuery.addEventListener === 'function') {
        mediaQuery.addEventListener('change', refreshSystemPreferences)
      } else {
        mediaQuery.addListener?.(refreshSystemPreferences)
      }
    })

    return () => {
      mediaQueries.forEach(mediaQuery => {
        if (typeof mediaQuery.removeEventListener === 'function') {
          mediaQuery.removeEventListener('change', refreshSystemPreferences)
        } else {
          mediaQuery.removeListener?.(refreshSystemPreferences)
        }
      })
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== COMFORT_STORAGE_KEY) return
      skipNextPersistenceRef.current = true
      setPreferences(parseComfortPreferences(event.newValue))
    }

    window.addEventListener('storage', handleStorage)
    return () => window.removeEventListener('storage', handleStorage)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.addEventListener(COMFORT_RESET_EVENT, resetPreferences)
    return () => window.removeEventListener(COMFORT_RESET_EVENT, resetPreferences)
  }, [resetPreferences])

  const value = useMemo<ComfortPreferencesContextValue>(() => ({
    preferences,
    effectivePreferences,
    systemPreferences,
    updatePreferences,
    applyPreset,
    resetPreferences,
    isReducedMotion: effectivePreferences.motion !== 'full',
    shouldAutoplayMedia: effectivePreferences.autoplay !== 'never',
  }), [
    applyPreset,
    effectivePreferences,
    preferences,
    resetPreferences,
    systemPreferences,
    updatePreferences,
  ])

  return (
    <ComfortPreferencesContext.Provider value={value}>
      <MotionConfig reducedMotion={effectivePreferences.motion === 'full' ? 'never' : 'always'}>
        {children}
      </MotionConfig>
    </ComfortPreferencesContext.Provider>
  )
}

export const ComfortProvider = ComfortPreferencesProvider

export function useComfortPreferences() {
  const context = useContext(ComfortPreferencesContext)
  if (!context) {
    throw new Error('useComfortPreferences must be used within ComfortPreferencesProvider')
  }
  return context
}
