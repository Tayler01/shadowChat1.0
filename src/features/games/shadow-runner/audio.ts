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
