export interface ShadowCheckersCharacter {
  key: string
  name: string
  title: string
  accent: string
  portrait: string
}

function svgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const ASSET_ROOT = '/games/shadow-checkers'

export const SHADOW_CHECKERS_ASSETS = {
  logo: `${ASSET_ROOT}/shadow-checkers-logo.webp`,
  pickerLogo: `${ASSET_ROOT}/shadow-checkers-picker-logo.webp`,
  pickerArt: `${ASSET_ROOT}/shadow-checkers-picker-background.webp`,
  background: `${ASSET_ROOT}/shadow-checkers-background.webp`,
  victory: `${ASSET_ROOT}/victory-banner.webp`,
  defeat: `${ASSET_ROOT}/defeat-banner.webp`,
  yourTurn: `${ASSET_ROOT}/your-turn-banner.webp`,
  music: `${ASSET_ROOT}/audio/heart-of-courage.mp3`,
  boardCinematic: `${ASSET_ROOT}/boards/cinematic-board-generated.webp`,
  pieces: {
    amber: `${ASSET_ROOT}/pieces/amber-piece-generated.webp`,
    amberKing: `${ASSET_ROOT}/pieces/amber-king-piece-generated.webp`,
    obsidian: `${ASSET_ROOT}/pieces/obsidian-piece-generated.webp`,
    obsidianKing: `${ASSET_ROOT}/pieces/obsidian-king-piece-generated.webp`,
  },
}

export const SHADOW_CHECKERS_IMAGE2_PROMPTS = [
  {
    id: 'shadow-checkers-cinematic-board',
    output: `${ASSET_ROOT}/boards/cinematic-board-generated.webp`,
    prompt:
      'Cinematic dark medieval Shadow Checkers board asset for a premium mobile game, square 8x8 checkers board viewed from a clean top-down tactical angle, obsidian stone and aged amber-gold squares, engraved metal border, transparent background outside the board frame, no battlefield table background, dramatic rim lighting, high contrast, crisp readable squares, no coordinate labels, no chess pieces, no playing cards, no tarot, no logos, no watermark, no text.',
  },
  {
    id: 'shadow-checkers-amber-piece',
    output: `${ASSET_ROOT}/pieces/amber-piece-generated.webp`,
    prompt:
      'Single regular checkers piece asset, amber gold faction, cinematic dark medieval mobile game style, round stacked war token with a clearly visible side wall and engraved shield motif, polished metal and worn enamel, top-down three-quarter view, transparent background, crisp silhouette, no square background, no chess symbols, no letters, no logos, no watermark, consistent with obsidian and gold Shadow Checkers art direction.',
  },
  {
    id: 'shadow-checkers-amber-king-piece',
    output: `${ASSET_ROOT}/pieces/amber-king-piece-generated.webp`,
    prompt:
      'Single crowned king checkers piece asset, amber gold faction, cinematic dark medieval mobile game style, round stacked war token with a clearly visible side wall, raised crown crest and subtle golden glow, polished engraved metal, top-down three-quarter view, transparent background, crisp silhouette, no square background, no chess symbols, no letters, no logos, no watermark, consistent with obsidian and gold Shadow Checkers art direction.',
  },
  {
    id: 'shadow-checkers-obsidian-piece',
    output: `${ASSET_ROOT}/pieces/obsidian-piece-generated.webp`,
    prompt:
      'Single regular checkers piece asset, obsidian shadow faction, cinematic dark medieval mobile game style, round stacked war token with a clearly visible side wall and engraved shield motif, blackened steel and smoky blue-gray highlights, top-down three-quarter view, transparent background, crisp silhouette, no square background, no chess symbols, no letters, no logos, no watermark, consistent with obsidian and gold Shadow Checkers art direction.',
  },
  {
    id: 'shadow-checkers-obsidian-king-piece',
    output: `${ASSET_ROOT}/pieces/obsidian-king-piece-generated.webp`,
    prompt:
      'Single crowned king checkers piece asset, obsidian shadow faction, cinematic dark medieval mobile game style, round stacked war token with a clearly visible side wall, raised crown crest and cold silver-blue glow, blackened engraved metal, top-down three-quarter view, transparent background, crisp silhouette, no square background, no chess symbols, no letters, no logos, no watermark, consistent with obsidian and gold Shadow Checkers art direction.',
  },
]

export const SHADOW_CHECKERS_CHARACTERS: ShadowCheckersCharacter[] = [
  {
    key: 'obsidian-sentinel',
    name: 'Kael',
    title: 'Obsidian Sentinel',
    accent: '#6f7f91',
    portrait: `${ASSET_ROOT}/characters/obsidian-sentinel.webp`,
  },
  {
    key: 'amber-vow',
    name: 'Seren',
    title: 'Amber Vow',
    accent: '#d7aa46',
    portrait: `${ASSET_ROOT}/characters/amber-vow.webp`,
  },
  {
    key: 'veil-rogue',
    name: 'Nyx',
    title: 'Veil Rogue',
    accent: '#8b3557',
    portrait: `${ASSET_ROOT}/characters/veil-rogue.webp`,
  },
  {
    key: 'iron-oracle',
    name: 'Mara',
    title: 'Iron Oracle',
    accent: '#74818f',
    portrait: `${ASSET_ROOT}/characters/iron-oracle.webp`,
  },
  {
    key: 'gilded-wolf',
    name: 'Rook',
    title: 'Gilded Wolf',
    accent: '#c08a2a',
    portrait: `${ASSET_ROOT}/characters/gilded-wolf.webp`,
  },
  {
    key: 'ashen-warden',
    name: 'Veyra',
    title: 'Ashen Warden',
    accent: '#69635d',
    portrait: `${ASSET_ROOT}/characters/ashen-warden.webp`,
  },
  {
    key: 'night-regent',
    name: 'Dorian',
    title: 'Night Regent',
    accent: '#5966a1',
    portrait: `${ASSET_ROOT}/characters/night-regent.webp`,
  },
  {
    key: 'cinder-crown',
    name: 'Corvin',
    title: 'Cinder Crown',
    accent: '#b34830',
    portrait: `${ASSET_ROOT}/characters/cinder-crown.webp`,
  },
]

export const CHECKERS_CROWN_BADGE = svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
    <defs><linearGradient id="g" x1="0" x2="1"><stop stop-color="#fff2bd"/><stop offset="1" stop-color="#b77a20"/></linearGradient></defs>
    <circle cx="32" cy="32" r="29" fill="#090806" stroke="url(#g)" stroke-width="4"/>
    <path d="M16 42h32l4-23-12 10-8-15-8 15-12-10z" fill="url(#g)"/>
    <path d="M20 46h24" stroke="#fff2bd" stroke-width="4" stroke-linecap="round"/>
  </svg>`)

export function getShadowCheckersCharacter(key?: string | null) {
  return SHADOW_CHECKERS_CHARACTERS.find(character => character.key === key) ?? SHADOW_CHECKERS_CHARACTERS[0]
}
