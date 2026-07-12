import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  COMFORT_PRESETS,
  COMFORT_STORAGE_KEY,
  DEFAULT_COMFORT_PREFERENCES,
  applyComfortAttributes,
  getComfortAttributeMap,
  loadComfortPreferences,
  parseComfortPreferences,
  readSystemComfortPreferences,
  resolveComfortPreferences,
  saveComfortPreferences,
  type ComfortMatchMedia,
  type ComfortStorage,
} from '../src/lib/comfortPreferences'

describe('comfort preference contract', () => {
  test('normalizes presets, partial overrides, and corrupt values safely', () => {
    expect(parseComfortPreferences(null)).toEqual(DEFAULT_COMFORT_PREFERENCES)
    expect(parseComfortPreferences('{not json')).toEqual(DEFAULT_COMFORT_PREFERENCES)
    expect(parseComfortPreferences(JSON.stringify({
      version: 99,
      preset: 'calm',
      motion: 'invalid',
      textScale: 130,
      uiSounds: true,
      unexpected: 'ignored',
    }))).toEqual({
      ...COMFORT_PRESETS.calm,
      textScale: 130,
      uiSounds: true,
    })
    expect(parseComfortPreferences({
      preset: 'custom',
      motion: 'reduced',
      transparency: 'glass',
      contrast: 'high',
      density: 'compact',
      touchTarget: 'large',
      autoplay: 'never',
      haptics: false,
    })).toMatchObject({
      version: 1,
      preset: 'custom',
      motion: 'reduced',
      transparency: 'glass',
      contrast: 'high',
      density: 'compact',
      touchTarget: 'large',
      autoplay: 'never',
      haptics: false,
    })
  })

  test('loads and saves through storage without leaking storage failures', () => {
    const values = new Map<string, string>()
    const storage: ComfortStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }
    values.set(COMFORT_STORAGE_KEY, JSON.stringify(COMFORT_PRESETS['large-touch']))
    expect(loadComfortPreferences(storage)).toEqual(COMFORT_PRESETS['large-touch'])

    expect(saveComfortPreferences(COMFORT_PRESETS['high-visibility'], storage)).toBe(true)
    expect(JSON.parse(values.get(COMFORT_STORAGE_KEY) ?? '{}')).toEqual(COMFORT_PRESETS['high-visibility'])

    const unavailable: ComfortStorage = {
      getItem: () => { throw new Error('SecurityError') },
      setItem: () => { throw new Error('QuotaExceededError') },
    }
    expect(loadComfortPreferences(unavailable)).toEqual(DEFAULT_COMFORT_PREFERENCES)
    expect(saveComfortPreferences(COMFORT_PRESETS.calm, unavailable)).toBe(false)
  })

  test('migrates existing sound choices when the comfort record is first created', () => {
    const values = new Map<string, string>([
      ['soundEffectsEnabled', 'false'],
      ['hypeSoundEffectsEnabled', 'true'],
    ])
    const storage: ComfortStorage = {
      getItem: key => values.get(key) ?? null,
      setItem: (key, value) => { values.set(key, value) },
    }

    expect(loadComfortPreferences(storage)).toMatchObject({
      uiSounds: false,
      celebrationSounds: true,
    })
  })

  test('reads system signals defensively and resolves system choices', () => {
    const enabledQueries = new Set([
      '(prefers-reduced-motion: reduce)',
      '(forced-colors: active)',
    ])
    const matchMedia: ComfortMatchMedia = query => ({ matches: enabledQueries.has(query) })
    const system = readSystemComfortPreferences(matchMedia)
    expect(system).toEqual({
      reducedMotion: true,
      reducedTransparency: false,
      highContrast: false,
      forcedColors: true,
    })

    expect(resolveComfortPreferences(DEFAULT_COMFORT_PREFERENCES, system)).toMatchObject({
      motion: 'reduced',
      transparency: 'solid',
      contrast: 'high',
    })
    expect(resolveComfortPreferences(COMFORT_PRESETS.calm, system)).toMatchObject({
      motion: 'none',
      transparency: 'solid',
      contrast: 'high',
      autoplay: 'never',
      haptics: false,
    })

    const throwingMatchMedia: ComfortMatchMedia = () => { throw new Error('unsupported') }
    expect(readSystemComfortPreferences(throwingMatchMedia)).toEqual({
      reducedMotion: false,
      reducedTransparency: false,
      highContrast: false,
      forcedColors: false,
    })
  })

  test('applies a complete and deterministic HTML attribute contract', () => {
    const effective = resolveComfortPreferences(COMFORT_PRESETS['high-visibility'], {
      reducedMotion: true,
      reducedTransparency: false,
      highContrast: false,
      forcedColors: false,
    })
    const attributes = getComfortAttributeMap(effective)
    expect(attributes).toEqual({
      'data-comfort-version': '1',
      'data-comfort-preset': 'high-visibility',
      'data-comfort-motion': 'reduced',
      'data-comfort-transparency': 'solid',
      'data-comfort-contrast': 'high',
      'data-comfort-text-scale': '115',
      'data-comfort-density': 'comfortable',
      'data-comfort-touch-target': 'large',
      'data-comfort-autoplay': 'muted',
      'data-comfort-ui-sounds': 'on',
      'data-comfort-celebration-sounds': 'on',
      'data-comfort-game-music': 'on',
      'data-comfort-game-sfx': 'on',
      'data-comfort-haptics': 'on',
    })

    const setAttribute = jest.fn()
    expect(applyComfortAttributes({ setAttribute }, effective)).toEqual(attributes)
    expect(setAttribute).toHaveBeenCalledTimes(Object.keys(attributes).length)
    expect(setAttribute).toHaveBeenCalledWith('data-comfort-touch-target', 'large')
  })

  test('keeps the pre-paint bootstrap in parity with the TypeScript contract', () => {
    const stored = {
      ...COMFORT_PRESETS.custom,
      motion: 'system' as const,
      transparency: 'system' as const,
      contrast: 'system' as const,
      textScale: 130 as const,
      uiSounds: false,
    }
    const system = {
      reducedMotion: true,
      reducedTransparency: true,
      highContrast: true,
      forcedColors: false,
    }
    const attributes = new Map<string, string>()
    const bootstrapWindow = {
      localStorage: { getItem: (key: string) => key === COMFORT_STORAGE_KEY ? JSON.stringify(stored) : null },
      matchMedia: (query: string) => ({
        matches: query === '(prefers-reduced-motion: reduce)'
          || query === '(prefers-reduced-transparency: reduce)'
          || query === '(prefers-contrast: more)',
      }),
      __shadowchatComfortBootstrap: undefined as unknown,
    }
    const bootstrapDocument = {
      documentElement: { setAttribute: (name: string, value: string) => attributes.set(name, value) },
    }
    const source = readFileSync(resolve(process.cwd(), 'public/comfort-bootstrap.js'), 'utf8')
    new Function('window', 'document', source)(bootstrapWindow, bootstrapDocument)

    const expected = getComfortAttributeMap(resolveComfortPreferences(parseComfortPreferences(stored), system))
    expect(Object.fromEntries(attributes)).toEqual(expected)
    expect((bootstrapWindow.__shadowchatComfortBootstrap as { attributes: Record<string, string> }).attributes).toEqual(expected)
  })
})
