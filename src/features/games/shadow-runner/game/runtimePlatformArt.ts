import type { ShadowRunnerMasonryArt } from './runtimeOpeningArt'

export const SHADOW_RUNNER_RELAY_MASONRY: ShadowRunnerMasonryArt = {
  textureKey: 'shadow-runner-relay-masonry', width: 1024, height: 272,
  scale: 0.5, topHeight: 64, bodyY: 68, bodyHeight: 74,
  leftX: 0, capWidth: 28, centerX: 28, centerWidth: 968, rightX: 996,
}

export const SHADOW_RUNNER_CAPTAIN_MASONRY: ShadowRunnerMasonryArt = {
  textureKey: 'shadow-runner-captain-masonry', width: 1024, height: 224,
  scale: 0.5, topHeight: 44, bodyY: 120, bodyHeight: 52,
  leftX: 0, capWidth: 28, centerX: 28, centerWidth: 968, rightX: 996,
}

export function usesShadowRunnerCaptainMasonry(platform: { terrainSet?: string; visualId?: string; id: string; hidden?: boolean }) {
  return !platform.hidden && platform.terrainSet === 'captain'
    && ['captain-recovery-step', 'captain-barricade'].includes(platform.visualId ?? platform.id)
}

export function usesShadowRunnerRelayMasonry(platform: { terrainSet?: string; visualId?: string; id: string; hidden?: boolean }) {
  return !platform.hidden && platform.terrainSet === 'relay'
    && ['relay-recovery-stair', 'relay-cover-pylon'].includes(platform.visualId ?? platform.id)
}

export interface ShadowRunnerPlatformContact {
  top: number
  bottom: number
}

// Contact rows describe the load-bearing surface, not the first decorative
// pixel. Candles, chains, and parapets can extend above that surface.
export const SHADOW_RUNNER_PLATFORM_CONTACTS: Record<string, Record<string, ShadowRunnerPlatformContact>> = {
  'shadow-runner-candle-readable-terrain-atlas': {
    'terrain-candle-wide-stage': { top: 57, bottom: 231 },
    'terrain-candle-rubble-floor': { top: 62, bottom: 199 },
    'terrain-candle-high-shelf': { top: 48, bottom: 196 },
    'terrain-candle-small-plank': { top: 46, bottom: 155 },
    'terrain-candle-hanging-shelf': { top: 154, bottom: 306 },
    'terrain-candle-lintel': { top: 2, bottom: 175 },
  },
  'shadow-runner-clock-terrain-atlas': {
    'terrain-clock-wide-floor': { top: 50, bottom: 214 },
    'terrain-clock-medium-ledge': { top: 47, bottom: 189 },
    'terrain-clock-gear-bridge': { top: 54, bottom: 184 },
    'terrain-clock-rubble-floor': { top: 60, bottom: 161 },
  },
  'shadow-runner-moon-terrain-atlas': {
    'terrain-moon-wide-floor': { top: 43, bottom: 196 },
    'terrain-moon-medium-ledge': { top: 5, bottom: 150 },
    'terrain-moon-rubble-floor': { top: 47, bottom: 168 },
  },
  'shadow-runner-catacomb-terrain-atlas': {
    'terrain-catacomb-chain-bridge': { top: 98, bottom: 140 },
  },
  'shadow-runner-captain-terrain-atlas': {
    'terrain-captain-wide-floor': { top: 31, bottom: 162 },
    'terrain-captain-arena-floor': { top: 31, bottom: 162 },
    'terrain-captain-rubble-floor': { top: 53, bottom: 163 },
    'terrain-captain-recovery-slab': { top: 53, bottom: 163 },
    'terrain-captain-medium-ledge': { top: 52, bottom: 161 },
    'terrain-captain-counterweight-bridge': { top: 147, bottom: 178 },
    'terrain-captain-chain-bridge': { top: 147, bottom: 178 },
    'terrain-captain-lift': { top: 87, bottom: 157 },
    'terrain-captain-counterweight-lift': { top: 87, bottom: 157 },
  },
  'shadow-runner-relay-terrain-atlas': {
    'terrain-relay-wide-floor': { top: 9, bottom: 157 },
    'terrain-relay-cracked-floor': { top: 9, bottom: 157 },
    'terrain-relay-moon-glass-ledge': { top: 15, bottom: 118 },
    'terrain-relay-phase-bridge': { top: 29, bottom: 95 },
    'terrain-relay-lift': { top: 123, bottom: 230 },
  },
}

export function getShadowRunnerPlatformArtLayout(
  body: { height: number },
  frameHeight: number,
  contact: ShadowRunnerPlatformContact | undefined,
) {
  if (!contact || !Number.isFinite(body.height) || body.height <= 0
    || !Number.isFinite(frameHeight) || frameHeight <= 0
    || !Number.isFinite(contact.top) || !Number.isFinite(contact.bottom)
    || contact.top < 0 || contact.bottom > frameHeight || contact.top >= contact.bottom) return null

  const scale = body.height / (contact.bottom - contact.top)
  const displayHeight = frameHeight * scale
  return {
    displayHeight,
    offsetY: displayHeight / 2 - contact.top * scale - body.height / 2,
  }
}
