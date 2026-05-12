export const SHADOW_WAR_ASSETS = {
  assetSheet: '/games/shadow-war/shadow-war-asset-sheet.png',
  battlefield: '/games/shadow-war/battlefield-table.webp',
  cardBack: '/games/shadow-war/card-back.webp',
  banner: '/games/shadow-war/shadow-war-banner.webp',
  logo: '/games/shadow-war/shadow-war-logo.webp',
  music: '/games/shadow-war/audio/chronicles-of-a-hero.mp3',
  cards: {
    scout: '/games/shadow-war/cards/scout.webp',
    spy: '/games/shadow-war/cards/spy.webp',
    squire: '/games/shadow-war/cards/squire.webp',
    archer: '/games/shadow-war/cards/archer.webp',
    shieldbearer: '/games/shadow-war/cards/shieldbearer.webp',
    knight: '/games/shadow-war/cards/knight.webp',
    captain: '/games/shadow-war/cards/captain.webp',
    champion: '/games/shadow-war/cards/champion.webp',
    warlord: '/games/shadow-war/cards/warlord.webp',
    sovereign: '/games/shadow-war/cards/sovereign.webp',
  },
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
  {
    id: 'shadow-war-immersive-backdrop',
    output: SHADOW_WAR_ASSETS.battlefield,
    prompt:
      'Dark cinematic medieval battlefield table backdrop for an original tactical card duel interface, deep obsidian shadows, aged gold rim light, readable behind UI, no playing card suits, no tarot symbols, no copyrighted characters.',
  },
  {
    id: 'shadow-war-header-logo',
    output: SHADOW_WAR_ASSETS.logo,
    prompt:
      'Standalone Shadow War logo banner, dark forged metal and antique gold, original sword-and-shield emblem, text exactly Shadow War, no playing card suits, no tarot symbols.',
  },
] as const
