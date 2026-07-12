export const COMFORT_STORAGE_KEY = 'shadowchat:comfort-preferences:v1'
export const COMFORT_RESET_EVENT = 'shadowchat:comfort-reset'
export const COMFORT_PREFERENCES_VERSION = 1 as const

export type ComfortPresetId =
  | 'follow-device'
  | 'calm'
  | 'high-visibility'
  | 'large-touch'
  | 'custom'

export type ComfortMotionPreference = 'system' | 'full' | 'reduced' | 'none'
export type ComfortTransparencyPreference = 'system' | 'glass' | 'solid'
export type ComfortContrastPreference = 'system' | 'standard' | 'high'
export type ComfortTextScale = 100 | 115 | 130
export type ComfortDensity = 'compact' | 'comfortable' | 'spacious'
export type ComfortTouchTarget = 'standard' | 'large'
export type ComfortAutoplay = 'muted' | 'never'

export type ComfortPreferences = {
  version: typeof COMFORT_PREFERENCES_VERSION
  preset: ComfortPresetId
  motion: ComfortMotionPreference
  transparency: ComfortTransparencyPreference
  contrast: ComfortContrastPreference
  textScale: ComfortTextScale
  density: ComfortDensity
  touchTarget: ComfortTouchTarget
  autoplay: ComfortAutoplay
  uiSounds: boolean
  celebrationSounds: boolean
  gameMusic: boolean
  gameSfx: boolean
  haptics: boolean
}

export type SystemComfortPreferences = {
  reducedMotion: boolean
  reducedTransparency: boolean
  highContrast: boolean
  forcedColors: boolean
}

export type EffectiveComfortPreferences = Omit<
  ComfortPreferences,
  'motion' | 'transparency' | 'contrast'
> & {
  motion: Exclude<ComfortMotionPreference, 'system'>
  transparency: Exclude<ComfortTransparencyPreference, 'system'>
  contrast: Exclude<ComfortContrastPreference, 'system'>
}

export type ComfortStorage = Pick<Storage, 'getItem' | 'setItem'>
export type ComfortMatchMedia = (query: string) => Pick<MediaQueryList, 'matches'>

export const COMFORT_MEDIA_QUERIES = {
  reducedMotion: '(prefers-reduced-motion: reduce)',
  reducedTransparency: '(prefers-reduced-transparency: reduce)',
  highContrast: '(prefers-contrast: more)',
  forcedColors: '(forced-colors: active)',
} as const

export const DEFAULT_SYSTEM_COMFORT_PREFERENCES: SystemComfortPreferences = Object.freeze({
  reducedMotion: false,
  reducedTransparency: false,
  highContrast: false,
  forcedColors: false,
})

export const DEFAULT_COMFORT_PREFERENCES: ComfortPreferences = Object.freeze({
  version: COMFORT_PREFERENCES_VERSION,
  preset: 'follow-device',
  motion: 'system',
  transparency: 'system',
  contrast: 'system',
  textScale: 100,
  density: 'comfortable',
  touchTarget: 'standard',
  autoplay: 'muted',
  uiSounds: true,
  celebrationSounds: true,
  gameMusic: true,
  gameSfx: true,
  haptics: true,
})

export const COMFORT_PRESETS: Readonly<Record<ComfortPresetId, ComfortPreferences>> = Object.freeze({
  'follow-device': DEFAULT_COMFORT_PREFERENCES,
  calm: Object.freeze({
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'calm',
    motion: 'none',
    transparency: 'solid',
    autoplay: 'never',
    uiSounds: false,
    celebrationSounds: false,
    gameMusic: false,
    gameSfx: false,
    haptics: false,
  }),
  'high-visibility': Object.freeze({
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'high-visibility',
    transparency: 'solid',
    contrast: 'high',
    textScale: 115,
    touchTarget: 'large',
  }),
  'large-touch': Object.freeze({
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'large-touch',
    textScale: 115,
    density: 'spacious',
    touchTarget: 'large',
  }),
  custom: Object.freeze({
    ...DEFAULT_COMFORT_PREFERENCES,
    preset: 'custom',
  }),
})

const presetIds = new Set<ComfortPresetId>(Object.keys(COMFORT_PRESETS) as ComfortPresetId[])
const motionValues = new Set<ComfortMotionPreference>(['system', 'full', 'reduced', 'none'])
const transparencyValues = new Set<ComfortTransparencyPreference>(['system', 'glass', 'solid'])
const contrastValues = new Set<ComfortContrastPreference>(['system', 'standard', 'high'])
const textScaleValues = new Set<ComfortTextScale>([100, 115, 130])
const densityValues = new Set<ComfortDensity>(['compact', 'comfortable', 'spacious'])
const touchTargetValues = new Set<ComfortTouchTarget>(['standard', 'large'])
const autoplayValues = new Set<ComfortAutoplay>(['muted', 'never'])

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
)

const parseUnknownJson = (raw: unknown): unknown => {
  if (typeof raw !== 'string') return raw
  try {
    return JSON.parse(raw) as unknown
  } catch {
    return null
  }
}

export function parseComfortPreferences(raw: unknown): ComfortPreferences {
  const value = parseUnknownJson(raw)
  if (!isRecord(value)) return { ...DEFAULT_COMFORT_PREFERENCES }

  const preset = typeof value.preset === 'string' && presetIds.has(value.preset as ComfortPresetId)
    ? value.preset as ComfortPresetId
    : DEFAULT_COMFORT_PREFERENCES.preset
  const base = COMFORT_PRESETS[preset]

  return {
    version: COMFORT_PREFERENCES_VERSION,
    preset,
    motion: typeof value.motion === 'string' && motionValues.has(value.motion as ComfortMotionPreference)
      ? value.motion as ComfortMotionPreference
      : base.motion,
    transparency: typeof value.transparency === 'string' && transparencyValues.has(value.transparency as ComfortTransparencyPreference)
      ? value.transparency as ComfortTransparencyPreference
      : base.transparency,
    contrast: typeof value.contrast === 'string' && contrastValues.has(value.contrast as ComfortContrastPreference)
      ? value.contrast as ComfortContrastPreference
      : base.contrast,
    textScale: typeof value.textScale === 'number' && textScaleValues.has(value.textScale as ComfortTextScale)
      ? value.textScale as ComfortTextScale
      : base.textScale,
    density: typeof value.density === 'string' && densityValues.has(value.density as ComfortDensity)
      ? value.density as ComfortDensity
      : base.density,
    touchTarget: typeof value.touchTarget === 'string' && touchTargetValues.has(value.touchTarget as ComfortTouchTarget)
      ? value.touchTarget as ComfortTouchTarget
      : base.touchTarget,
    autoplay: typeof value.autoplay === 'string' && autoplayValues.has(value.autoplay as ComfortAutoplay)
      ? value.autoplay as ComfortAutoplay
      : base.autoplay,
    uiSounds: typeof value.uiSounds === 'boolean' ? value.uiSounds : base.uiSounds,
    celebrationSounds: typeof value.celebrationSounds === 'boolean' ? value.celebrationSounds : base.celebrationSounds,
    gameMusic: typeof value.gameMusic === 'boolean' ? value.gameMusic : base.gameMusic,
    gameSfx: typeof value.gameSfx === 'boolean' ? value.gameSfx : base.gameSfx,
    haptics: typeof value.haptics === 'boolean' ? value.haptics : base.haptics,
  }
}

const getDefaultStorage = (): ComfortStorage | null => {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadComfortPreferences(storage: ComfortStorage | null = getDefaultStorage()): ComfortPreferences {
  if (!storage) return { ...DEFAULT_COMFORT_PREFERENCES }
  try {
    const current = storage.getItem(COMFORT_STORAGE_KEY)
    if (current !== null) return parseComfortPreferences(current)

    const legacyUiSounds = storage.getItem('soundEffectsEnabled')
    const legacyCelebrationSounds = storage.getItem('hypeSoundEffectsEnabled')
    return parseComfortPreferences({
      ...DEFAULT_COMFORT_PREFERENCES,
      uiSounds: legacyUiSounds === null ? DEFAULT_COMFORT_PREFERENCES.uiSounds : legacyUiSounds === 'true',
      celebrationSounds: legacyCelebrationSounds === null
        ? DEFAULT_COMFORT_PREFERENCES.celebrationSounds
        : legacyCelebrationSounds === 'true',
    })
  } catch {
    return { ...DEFAULT_COMFORT_PREFERENCES }
  }
}

export function saveComfortPreferences(
  preferences: ComfortPreferences,
  storage: ComfortStorage | null = getDefaultStorage()
): boolean {
  if (!storage) return false
  try {
    storage.setItem(COMFORT_STORAGE_KEY, JSON.stringify(parseComfortPreferences(preferences)))
    return true
  } catch {
    return false
  }
}

export function readSystemComfortPreferences(
  matchMedia: ComfortMatchMedia | null = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia.bind(window)
    : null
): SystemComfortPreferences {
  if (!matchMedia) return { ...DEFAULT_SYSTEM_COMFORT_PREFERENCES }
  const matches = (query: string) => {
    try {
      return Boolean(matchMedia(query).matches)
    } catch {
      return false
    }
  }
  return {
    reducedMotion: matches(COMFORT_MEDIA_QUERIES.reducedMotion),
    reducedTransparency: matches(COMFORT_MEDIA_QUERIES.reducedTransparency),
    highContrast: matches(COMFORT_MEDIA_QUERIES.highContrast),
    forcedColors: matches(COMFORT_MEDIA_QUERIES.forcedColors),
  }
}

export function resolveComfortPreferences(
  preferences: ComfortPreferences,
  system: SystemComfortPreferences = DEFAULT_SYSTEM_COMFORT_PREFERENCES
): EffectiveComfortPreferences {
  const normalized = parseComfortPreferences(preferences)
  return {
    ...normalized,
    motion: normalized.motion === 'system'
      ? system.reducedMotion ? 'reduced' : 'full'
      : normalized.motion,
    transparency: normalized.transparency === 'system'
      ? system.reducedTransparency || system.forcedColors ? 'solid' : 'glass'
      : normalized.transparency,
    contrast: normalized.contrast === 'system'
      ? system.highContrast || system.forcedColors ? 'high' : 'standard'
      : normalized.contrast,
  }
}

export const COMFORT_ATTRIBUTE_NAMES = Object.freeze([
  'data-comfort-version',
  'data-comfort-preset',
  'data-comfort-motion',
  'data-comfort-transparency',
  'data-comfort-contrast',
  'data-comfort-text-scale',
  'data-comfort-density',
  'data-comfort-touch-target',
  'data-comfort-autoplay',
  'data-comfort-ui-sounds',
  'data-comfort-celebration-sounds',
  'data-comfort-game-music',
  'data-comfort-game-sfx',
  'data-comfort-haptics',
] as const)

export type ComfortAttributeName = typeof COMFORT_ATTRIBUTE_NAMES[number]
export type ComfortAttributeMap = Record<ComfortAttributeName, string>

const enabledAttribute = (enabled: boolean) => enabled ? 'on' : 'off'

export function getComfortAttributeMap(effective: EffectiveComfortPreferences): ComfortAttributeMap {
  return {
    'data-comfort-version': String(effective.version),
    'data-comfort-preset': effective.preset,
    'data-comfort-motion': effective.motion,
    'data-comfort-transparency': effective.transparency,
    'data-comfort-contrast': effective.contrast,
    'data-comfort-text-scale': String(effective.textScale),
    'data-comfort-density': effective.density,
    'data-comfort-touch-target': effective.touchTarget,
    'data-comfort-autoplay': effective.autoplay,
    'data-comfort-ui-sounds': enabledAttribute(effective.uiSounds),
    'data-comfort-celebration-sounds': enabledAttribute(effective.celebrationSounds),
    'data-comfort-game-music': enabledAttribute(effective.gameMusic),
    'data-comfort-game-sfx': enabledAttribute(effective.gameSfx),
    'data-comfort-haptics': enabledAttribute(effective.haptics),
  }
}

export function applyComfortAttributes(
  root: Pick<HTMLElement, 'setAttribute'>,
  effective: EffectiveComfortPreferences
): ComfortAttributeMap {
  const attributes = getComfortAttributeMap(effective)
  COMFORT_ATTRIBUTE_NAMES.forEach(name => root.setAttribute(name, attributes[name]))
  return attributes
}
