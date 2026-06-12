import { SHADOW_RUNNER_ASSETS } from './assets/manifest'

export const SHADOW_RUNNER_MUSIC_ENABLED_STORAGE_KEY = 'shadow-runner-music-enabled-v1'
export const SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY = 'shadow-runner-sfx-enabled-v1'

export const SHADOW_RUNNER_SOUND_EVENTS = [
  'menu-click',
  'menu-back',
  'menu-denied',
  'level-select',
  'pause',
  'resume',
  'jump',
  'double-jump',
  'land',
  'sword-swing',
  'enemy-hit',
  'stomp',
  'player-hurt',
  'life-lost',
  'respawn',
  'coin',
  'enemy-defeat',
  'level-complete',
  'route-failed',
] as const

export type ShadowRunnerSoundEvent = typeof SHADOW_RUNNER_SOUND_EVENTS[number]

export const SHADOW_RUNNER_SOUND_ASSETS: Record<ShadowRunnerSoundEvent, string> = {
  'menu-click': SHADOW_RUNNER_ASSETS.sfx.menuClick,
  'menu-back': SHADOW_RUNNER_ASSETS.sfx.menuBack,
  'menu-denied': SHADOW_RUNNER_ASSETS.sfx.menuDenied,
  'level-select': SHADOW_RUNNER_ASSETS.sfx.levelSelect,
  pause: SHADOW_RUNNER_ASSETS.sfx.pause,
  resume: SHADOW_RUNNER_ASSETS.sfx.resume,
  jump: SHADOW_RUNNER_ASSETS.sfx.jump,
  'double-jump': SHADOW_RUNNER_ASSETS.sfx.doubleJump,
  land: SHADOW_RUNNER_ASSETS.sfx.land,
  'sword-swing': SHADOW_RUNNER_ASSETS.sfx.swordSwing,
  'enemy-hit': SHADOW_RUNNER_ASSETS.sfx.enemyHit,
  stomp: SHADOW_RUNNER_ASSETS.sfx.stomp,
  'player-hurt': SHADOW_RUNNER_ASSETS.sfx.playerHurt,
  'life-lost': SHADOW_RUNNER_ASSETS.sfx.lifeLost,
  respawn: SHADOW_RUNNER_ASSETS.sfx.respawn,
  coin: SHADOW_RUNNER_ASSETS.sfx.coin,
  'enemy-defeat': SHADOW_RUNNER_ASSETS.sfx.enemyDefeat,
  'level-complete': SHADOW_RUNNER_ASSETS.sfx.levelComplete,
  'route-failed': SHADOW_RUNNER_ASSETS.sfx.routeFailed,
}

export const SHADOW_RUNNER_SOUND_VOLUME: Record<ShadowRunnerSoundEvent, number> = {
  'menu-click': 0.34,
  'menu-back': 0.3,
  'menu-denied': 0.25,
  'level-select': 0.36,
  pause: 0.26,
  resume: 0.28,
  jump: 0.3,
  'double-jump': 0.33,
  land: 0.28,
  'sword-swing': 0.31,
  'enemy-hit': 0.34,
  stomp: 0.36,
  'player-hurt': 0.32,
  'life-lost': 0.36,
  respawn: 0.32,
  coin: 0.38,
  'enemy-defeat': 0.38,
  'level-complete': 0.42,
  'route-failed': 0.36,
}

const SHADOW_RUNNER_SOUND_COOLDOWN_MS: Partial<Record<ShadowRunnerSoundEvent, number>> = {
  land: 90,
  'sword-swing': 70,
  'enemy-hit': 60,
  stomp: 80,
  coin: 45,
}

const yieldAfterSoundDecode = () => new Promise<void>(resolve => {
  if (typeof window === 'undefined') {
    resolve()
    return
  }
  window.setTimeout(resolve, 0)
})

type ShadowRunnerAudioWindow = Window & typeof globalThis & {
  webkitAudioContext?: typeof AudioContext
}

export interface ShadowRunnerSfxStatus {
  available: boolean
  loaded: number
  loading: number
  total: number
  contextState?: AudioContextState
}

export interface ShadowRunnerSfxController {
  preload: (events?: readonly ShadowRunnerSoundEvent[]) => Promise<void>
  play: (event: ShadowRunnerSoundEvent, enabled?: boolean) => void
  dispose: () => void
  getStatus: () => ShadowRunnerSfxStatus
}

export function createShadowRunnerSfxController(): ShadowRunnerSfxController {
  const AudioContextCtor = typeof window === 'undefined'
    ? undefined
    : window.AudioContext ?? (window as ShadowRunnerAudioWindow).webkitAudioContext
  let context: AudioContext | null = null
  let disposed = false
  const buffers = new Map<ShadowRunnerSoundEvent, AudioBuffer>()
  const loading = new Map<ShadowRunnerSoundEvent, Promise<void>>()
  const lastPlayedAt = new Map<ShadowRunnerSoundEvent, number>()

  const getContext = () => {
    if (disposed || !AudioContextCtor) return null
    context ??= new AudioContextCtor()
    return context
  }

  const loadEvent = (event: ShadowRunnerSoundEvent) => {
    if (disposed || buffers.has(event)) return Promise.resolve()

    const existing = loading.get(event)
    if (existing) return existing

    const task = (async () => {
      const audioContext = getContext()
      if (!audioContext) return

      const response = await fetch(SHADOW_RUNNER_SOUND_ASSETS[event])
      if (!response.ok) {
        throw new Error(`Unable to load Shadow Runner sound: ${event}`)
      }
      const arrayBuffer = await response.arrayBuffer()
      const decoded = await audioContext.decodeAudioData(arrayBuffer.slice(0))
      if (!disposed) {
        buffers.set(event, decoded)
      }
    })()
      .catch(error => {
        console.warn('[ShadowRunner] SFX preload failed', event, error)
      })
      .finally(() => {
        loading.delete(event)
      })

    loading.set(event, task)
    return task
  }

  const preload = async (events: readonly ShadowRunnerSoundEvent[] = SHADOW_RUNNER_SOUND_EVENTS) => {
    for (const event of events) {
      if (disposed) return
      await loadEvent(event)
      await yieldAfterSoundDecode()
    }
  }

  const play = (event: ShadowRunnerSoundEvent, enabled = true) => {
    if (!enabled || disposed) return

    const audioContext = getContext()
    if (!audioContext) return

    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => undefined)
    }

    const nowMs = performance.now()
    const cooldownMs = SHADOW_RUNNER_SOUND_COOLDOWN_MS[event] ?? 0
    const last = lastPlayedAt.get(event) ?? 0
    if (cooldownMs > 0 && nowMs - last < cooldownMs) return
    lastPlayedAt.set(event, nowMs)

    const buffer = buffers.get(event)
    if (!buffer) {
      void loadEvent(event)
      return
    }

    const source = audioContext.createBufferSource()
    const gain = audioContext.createGain()
    source.buffer = buffer
    gain.gain.value = SHADOW_RUNNER_SOUND_VOLUME[event]
    source.connect(gain)
    gain.connect(audioContext.destination)
    source.start()
  }

  const dispose = () => {
    disposed = true
    buffers.clear()
    loading.clear()
    lastPlayedAt.clear()
    if (context && context.state !== 'closed') {
      void context.close().catch(() => undefined)
    }
    context = null
  }

  const getStatus = (): ShadowRunnerSfxStatus => ({
    available: Boolean(AudioContextCtor),
    loaded: buffers.size,
    loading: loading.size,
    total: SHADOW_RUNNER_SOUND_EVENTS.length,
    contextState: context?.state,
  })

  return {
    preload,
    play,
    dispose,
    getStatus,
  }
}

export function readShadowRunnerAudioPreference(key: string, fallback: boolean) {
  if (typeof window === 'undefined') return fallback

  try {
    const value = window.localStorage.getItem(key)
    if (value === 'true') return true
    if (value === 'false') return false
  } catch {
    // Private browsing or storage failures should not break the game.
  }

  return fallback
}

export function writeShadowRunnerAudioPreference(key: string, enabled: boolean) {
  if (typeof window === 'undefined') return

  try {
    window.localStorage.setItem(key, String(enabled))
  } catch {
    // Audio preferences are convenience state; gameplay remains usable without storage.
  }
}
