import { act, renderHook, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import {
  ComfortPreferencesProvider,
  useComfortPreferences,
} from '../src/hooks/useComfortPreferences'
import {
  COMFORT_MEDIA_QUERIES,
  COMFORT_RESET_EVENT,
  COMFORT_STORAGE_KEY,
  DEFAULT_COMFORT_PREFERENCES,
  type ComfortPreferences,
} from '../src/lib/comfortPreferences'

type MediaListener = (event: MediaQueryListEvent) => void

const mediaState = new Map<string, boolean>()
const mediaListeners = new Map<string, Set<MediaListener>>()
const originalMatchMedia = window.matchMedia

const installMatchMedia = () => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn((query: string) => ({
      media: query,
      get matches() {
        return mediaState.get(query) ?? false
      },
      onchange: null,
      addEventListener: (_type: string, listener: MediaListener) => {
        const listeners = mediaListeners.get(query) ?? new Set<MediaListener>()
        listeners.add(listener)
        mediaListeners.set(query, listeners)
      },
      removeEventListener: (_type: string, listener: MediaListener) => {
        mediaListeners.get(query)?.delete(listener)
      },
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    })),
  })
}

const setMediaPreference = (query: string, matches: boolean) => {
  mediaState.set(query, matches)
  mediaListeners.get(query)?.forEach(listener => listener({ matches, media: query } as MediaQueryListEvent))
}

const wrapper = ({ children }: { children: ReactNode }) => (
  <ComfortPreferencesProvider>{children}</ComfortPreferencesProvider>
)

beforeEach(() => {
  localStorage.clear()
  mediaState.clear()
  mediaListeners.clear()
  installMatchMedia()
  Array.from(document.documentElement.attributes)
    .filter(attribute => attribute.name.startsWith('data-comfort-'))
    .forEach(attribute => document.documentElement.removeAttribute(attribute.name))
})

afterEach(() => {
  jest.restoreAllMocks()
})

afterAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: originalMatchMedia,
  })
})

test('loads saved preferences, resolves system settings, and publishes document attributes', async () => {
  const saved: ComfortPreferences = {
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'custom',
    textScale: 115,
    touchTarget: 'large',
  }
  localStorage.setItem(COMFORT_STORAGE_KEY, JSON.stringify(saved))
  mediaState.set(COMFORT_MEDIA_QUERIES.reducedMotion, true)
  mediaState.set(COMFORT_MEDIA_QUERIES.reducedTransparency, true)
  mediaState.set(COMFORT_MEDIA_QUERIES.highContrast, true)

  const { result } = renderHook(() => useComfortPreferences(), { wrapper })

  await waitFor(() => expect(result.current.effectivePreferences.motion).toBe('reduced'))
  expect(result.current.preferences.textScale).toBe(115)
  expect(result.current.systemPreferences).toMatchObject({
    reducedMotion: true,
    reducedTransparency: true,
    highContrast: true,
  })
  expect(result.current.isReducedMotion).toBe(true)
  expect(result.current.shouldAutoplayMedia).toBe(true)
  expect(document.documentElement).toHaveAttribute('data-comfort-motion', 'reduced')
  expect(document.documentElement).toHaveAttribute('data-comfort-transparency', 'solid')
  expect(document.documentElement).toHaveAttribute('data-comfort-contrast', 'high')
  expect(document.documentElement).toHaveAttribute('data-comfort-text-scale', '115')
  expect(document.documentElement).toHaveAttribute('data-comfort-touch-target', 'large')
})

test('updates settings as a custom preset and persists the normalized result', async () => {
  const { result } = renderHook(() => useComfortPreferences(), { wrapper })

  act(() => {
    result.current.updatePreferences({ motion: 'none', autoplay: 'never', textScale: 130 })
  })

  await waitFor(() => expect(result.current.preferences.motion).toBe('none'))
  expect(result.current.preferences.preset).toBe('custom')
  expect(result.current.effectivePreferences.textScale).toBe(130)
  expect(result.current.isReducedMotion).toBe(true)
  expect(result.current.shouldAutoplayMedia).toBe(false)
  expect(document.documentElement).toHaveAttribute('data-comfort-motion', 'none')
  expect(document.documentElement).toHaveAttribute('data-comfort-autoplay', 'never')
  expect(JSON.parse(localStorage.getItem(COMFORT_STORAGE_KEY) ?? '{}')).toMatchObject({
    preset: 'custom',
    motion: 'none',
    autoplay: 'never',
    textScale: 130,
  })
})

test('applies named presets and resets to device-following defaults', async () => {
  const { result } = renderHook(() => useComfortPreferences(), { wrapper })

  act(() => result.current.applyPreset('calm'))
  await waitFor(() => expect(result.current.preferences.preset).toBe('calm'))
  expect(result.current.effectivePreferences).toMatchObject({
    motion: 'none',
    transparency: 'solid',
    autoplay: 'never',
  })
  expect(result.current.shouldAutoplayMedia).toBe(false)

  act(() => result.current.resetPreferences())
  await waitFor(() => expect(result.current.preferences.preset).toBe('follow-device'))
  expect(result.current.preferences).toEqual(DEFAULT_COMFORT_PREFERENCES)
  expect(document.documentElement).toHaveAttribute('data-comfort-preset', 'follow-device')
})

test('accepts the global reset command used by the fixed Comfort header', async () => {
  const { result } = renderHook(() => useComfortPreferences(), { wrapper })
  act(() => result.current.applyPreset('calm'))
  await waitFor(() => expect(result.current.preferences.preset).toBe('calm'))

  act(() => window.dispatchEvent(new Event(COMFORT_RESET_EVENT)))

  await waitFor(() => expect(result.current.preferences.preset).toBe('follow-device'))
  expect(result.current.preferences).toEqual(DEFAULT_COMFORT_PREFERENCES)
})

test('reacts to media-query changes and removes listeners on unmount', async () => {
  const { result, unmount } = renderHook(() => useComfortPreferences(), { wrapper })

  act(() => setMediaPreference(COMFORT_MEDIA_QUERIES.forcedColors, true))
  await waitFor(() => expect(result.current.systemPreferences.forcedColors).toBe(true))
  expect(result.current.effectivePreferences).toMatchObject({
    contrast: 'high',
    transparency: 'solid',
  })

  unmount()
  expect(Array.from(mediaListeners.values()).every(listeners => listeners.size === 0)).toBe(true)
})

test('supports legacy Safari media-query listeners', () => {
  const addListener = jest.fn()
  const removeListener = jest.fn()
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: jest.fn((query: string) => ({
      media: query,
      matches: false,
      addListener,
      removeListener,
    })),
  })

  const { unmount } = renderHook(() => useComfortPreferences(), { wrapper })
  expect(addListener).toHaveBeenCalledTimes(Object.keys(COMFORT_MEDIA_QUERIES).length)

  unmount()
  expect(removeListener).toHaveBeenCalledTimes(Object.keys(COMFORT_MEDIA_QUERIES).length)
})

test('synchronizes cross-tab storage changes without writing the event back', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem')
  const { result } = renderHook(() => useComfortPreferences(), { wrapper })
  await waitFor(() => expect(setItemSpy).toHaveBeenCalled())
  setItemSpy.mockClear()

  const incoming = {
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'large-touch' as const,
    textScale: 115 as const,
    density: 'spacious' as const,
    touchTarget: 'large' as const,
  }
  act(() => {
    window.dispatchEvent(new StorageEvent('storage', {
      key: COMFORT_STORAGE_KEY,
      newValue: JSON.stringify(incoming),
    }))
  })

  await waitFor(() => expect(result.current.preferences.preset).toBe('large-touch'))
  expect(result.current.effectivePreferences.touchTarget).toBe('large')
  expect(setItemSpy).not.toHaveBeenCalled()
})

test('falls back safely when browser storage writes fail', async () => {
  const setItemSpy = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('Storage blocked')
  })
  const { result } = renderHook(() => useComfortPreferences(), { wrapper })

  act(() => result.current.applyPreset('high-visibility'))

  await waitFor(() => expect(result.current.preferences.preset).toBe('high-visibility'))
  expect(result.current.effectivePreferences.contrast).toBe('high')
  expect(setItemSpy).toHaveBeenCalled()
})

test('requires the provider boundary', () => {
  const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined)
  try {
    expect(() => renderHook(() => useComfortPreferences())).toThrow(
      'useComfortPreferences must be used within ComfortPreferencesProvider'
    )
  } finally {
    consoleError.mockRestore()
  }
})

test('renders safely through the server renderer before effects run', () => {
  expect(() => renderToString(
    <ComfortPreferencesProvider><span>Server content</span></ComfortPreferencesProvider>
  )).not.toThrow()
})
