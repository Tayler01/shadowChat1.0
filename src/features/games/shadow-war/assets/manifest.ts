function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

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

export const SHADOW_WAR_SWORD_BADGE = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs>
      <linearGradient id="gold" x1="10" y1="8" x2="54" y2="58" gradientUnits="userSpaceOnUse">
        <stop stop-color="#fff4bf"/>
        <stop offset="0.52" stop-color="#d4a141"/>
        <stop offset="1" stop-color="#8b5a16"/>
      </linearGradient>
      <linearGradient id="steel" x1="24" y1="8" x2="42" y2="48" gradientUnits="userSpaceOnUse">
        <stop stop-color="#f8fbff"/>
        <stop offset="0.45" stop-color="#aab4c2"/>
        <stop offset="1" stop-color="#45505e"/>
      </linearGradient>
    </defs>
    <circle cx="32" cy="32" r="29" fill="#090806" stroke="url(#gold)" stroke-width="4"/>
    <path d="M35 8l7 7-21 26-5 7-5-5 7-5z" fill="url(#steel)" stroke="#fff0b4" stroke-width="2" stroke-linejoin="round"/>
    <path d="M31 12l7 7" stroke="#1b1b1b" stroke-width="2" stroke-linecap="round"/>
    <path d="M19 40l5 5-8 9-6-6z" fill="url(#gold)" stroke="#fff0b4" stroke-width="2" stroke-linejoin="round"/>
    <path d="M16 37l11 11" stroke="#d9a94d" stroke-width="5" stroke-linecap="round"/>
  </svg>`)

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
