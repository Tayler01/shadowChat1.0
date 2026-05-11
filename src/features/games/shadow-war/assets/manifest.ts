export const SHADOW_WAR_ASSETS = {
  assetSheet: '/games/shadow-war/shadow-war-asset-sheet.png',
  cardBack: '/games/shadow-war/card-back.webp',
  banner: '/games/shadow-war/shadow-war-banner.webp',
} as const

export const SHADOW_WAR_ASSET_PROMPTS = [
  {
    id: 'shadow-war-asset-sheet',
    output: SHADOW_WAR_ASSETS.assetSheet,
    prompt:
      'Single cohesive Shadow War asset sheet with 10 original medieval fantasy unit card faces, one card back, and one compact Shadow War banner/logo. No playing card suits, no tarot, no copyrighted characters.',
  },
  {
    id: 'shadow-war-optimized-card-faces',
    output: '/games/shadow-war/cards/*.webp',
    prompt:
      'Cropped and optimized WebP exports from the approved generated asset sheet for Scout, Spy, Squire, Archer, Shieldbearer, Knight, Captain, Champion, Warlord, and Sovereign.',
  },
] as const
