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
  pickerArt: `${ASSET_ROOT}/shadow-checkers-background.webp`,
  background: `${ASSET_ROOT}/shadow-checkers-background.webp`,
  victory: `${ASSET_ROOT}/victory-banner.webp`,
  defeat: `${ASSET_ROOT}/defeat-banner.webp`,
  yourTurn: `${ASSET_ROOT}/your-turn-banner.webp`,
}

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
