(function bootstrapShadowChatComfort() {
  'use strict'

  var STORAGE_KEY = 'shadowchat:comfort-preferences:v1'
  var VERSION = 1
  var DEFAULTS = {
    version: VERSION,
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
  }
  var PRESETS = {
    'follow-device': DEFAULTS,
    calm: Object.assign({}, DEFAULTS, {
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
    'high-visibility': Object.assign({}, DEFAULTS, {
      preset: 'high-visibility',
      transparency: 'solid',
      contrast: 'high',
      textScale: 115,
      touchTarget: 'large',
    }),
    'large-touch': Object.assign({}, DEFAULTS, {
      preset: 'large-touch',
      textScale: 115,
      density: 'spacious',
      touchTarget: 'large',
    }),
    custom: Object.assign({}, DEFAULTS, { preset: 'custom' }),
  }

  var allowed = {
    preset: Object.keys(PRESETS),
    motion: ['system', 'full', 'reduced', 'none'],
    transparency: ['system', 'glass', 'solid'],
    contrast: ['system', 'standard', 'high'],
    textScale: [100, 115, 130],
    density: ['compact', 'comfortable', 'spacious'],
    touchTarget: ['standard', 'large'],
    autoplay: ['muted', 'never'],
  }

  function includes(values, value) {
    return values.indexOf(value) !== -1
  }

  function normalize(raw) {
    var value = raw
    if (typeof value === 'string') {
      try {
        value = JSON.parse(value)
      } catch (_error) {
        value = null
      }
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return Object.assign({}, DEFAULTS)
    }

    var preset = typeof value.preset === 'string' && includes(allowed.preset, value.preset)
      ? value.preset
      : DEFAULTS.preset
    var base = PRESETS[preset]
    return {
      version: VERSION,
      preset: preset,
      motion: typeof value.motion === 'string' && includes(allowed.motion, value.motion) ? value.motion : base.motion,
      transparency: typeof value.transparency === 'string' && includes(allowed.transparency, value.transparency) ? value.transparency : base.transparency,
      contrast: typeof value.contrast === 'string' && includes(allowed.contrast, value.contrast) ? value.contrast : base.contrast,
      textScale: typeof value.textScale === 'number' && includes(allowed.textScale, value.textScale) ? value.textScale : base.textScale,
      density: typeof value.density === 'string' && includes(allowed.density, value.density) ? value.density : base.density,
      touchTarget: typeof value.touchTarget === 'string' && includes(allowed.touchTarget, value.touchTarget) ? value.touchTarget : base.touchTarget,
      autoplay: typeof value.autoplay === 'string' && includes(allowed.autoplay, value.autoplay) ? value.autoplay : base.autoplay,
      uiSounds: typeof value.uiSounds === 'boolean' ? value.uiSounds : base.uiSounds,
      celebrationSounds: typeof value.celebrationSounds === 'boolean' ? value.celebrationSounds : base.celebrationSounds,
      gameMusic: typeof value.gameMusic === 'boolean' ? value.gameMusic : base.gameMusic,
      gameSfx: typeof value.gameSfx === 'boolean' ? value.gameSfx : base.gameSfx,
      haptics: typeof value.haptics === 'boolean' ? value.haptics : base.haptics,
    }
  }

  function matches(query) {
    try {
      return typeof window.matchMedia === 'function' && Boolean(window.matchMedia(query).matches)
    } catch (_error) {
      return false
    }
  }

  function readSystem() {
    return {
      reducedMotion: matches('(prefers-reduced-motion: reduce)'),
      reducedTransparency: matches('(prefers-reduced-transparency: reduce)'),
      highContrast: matches('(prefers-contrast: more)'),
      forcedColors: matches('(forced-colors: active)'),
    }
  }

  function readPreferences() {
    try {
      return normalize(window.localStorage.getItem(STORAGE_KEY))
    } catch (_error) {
      return normalize(null)
    }
  }

  function resolve(preferences, system) {
    return Object.assign({}, preferences, {
      motion: preferences.motion === 'system' ? (system.reducedMotion ? 'reduced' : 'full') : preferences.motion,
      transparency: preferences.transparency === 'system'
        ? (system.reducedTransparency || system.forcedColors ? 'solid' : 'glass')
        : preferences.transparency,
      contrast: preferences.contrast === 'system'
        ? (system.highContrast || system.forcedColors ? 'high' : 'standard')
        : preferences.contrast,
    })
  }

  function onOff(value) {
    return value ? 'on' : 'off'
  }

  function attributes(effective) {
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
      'data-comfort-ui-sounds': onOff(effective.uiSounds),
      'data-comfort-celebration-sounds': onOff(effective.celebrationSounds),
      'data-comfort-game-music': onOff(effective.gameMusic),
      'data-comfort-game-sfx': onOff(effective.gameSfx),
      'data-comfort-haptics': onOff(effective.haptics),
    }
  }

  var preferences = readPreferences()
  var system = readSystem()
  var effective = resolve(preferences, system)
  var attributeMap = attributes(effective)
  var root = document.documentElement
  if (root && typeof root.setAttribute === 'function') {
    Object.keys(attributeMap).forEach(function setComfortAttribute(name) {
      root.setAttribute(name, attributeMap[name])
    })
  }

  window.__shadowchatComfortBootstrap = {
    storageKey: STORAGE_KEY,
    preferences: preferences,
    system: system,
    effective: effective,
    attributes: attributeMap,
  }
})()
