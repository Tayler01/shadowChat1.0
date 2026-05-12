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

function portrait(name: string, accent: string, sigil: string, glow: string) {
  return svgDataUrl(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320">
    <defs>
      <radialGradient id="g" cx="50%" cy="35%" r="70%">
        <stop offset="0%" stop-color="${glow}"/>
        <stop offset="48%" stop-color="${accent}"/>
        <stop offset="100%" stop-color="#040405"/>
      </radialGradient>
      <linearGradient id="frame" x1="0" x2="1" y1="0" y2="1">
        <stop stop-color="#f2d88b"/>
        <stop offset="0.45" stop-color="#8b6428"/>
        <stop offset="1" stop-color="#2a1b08"/>
      </linearGradient>
    </defs>
    <rect width="320" height="320" rx="64" fill="#050505"/>
    <rect x="14" y="14" width="292" height="292" rx="56" fill="url(#g)" opacity="0.92"/>
    <path d="M57 263c18-70 56-105 103-105s85 35 103 105" fill="#08090a" opacity="0.88"/>
    <path d="M94 144c2-44 27-76 66-76s64 32 66 76c-19 17-41 26-66 26s-47-9-66-26z" fill="#111318"/>
    <path d="M112 111c23-33 73-33 96 0l-16 44h-64l-16-44z" fill="#1f232b"/>
    <path d="M103 151h114l-23 58h-68z" fill="#12151a"/>
    <path d="M121 122c22 10 56 10 78 0" fill="none" stroke="#d7aa46" stroke-width="5" stroke-linecap="round" opacity="0.75"/>
    <circle cx="160" cy="184" r="28" fill="#08090a" stroke="url(#frame)" stroke-width="7"/>
    <text x="160" y="196" text-anchor="middle" font-family="Georgia,serif" font-size="40" fill="#f7df9a">${sigil}</text>
    <rect x="19" y="19" width="282" height="282" rx="52" fill="none" stroke="url(#frame)" stroke-width="7"/>
    <rect x="36" y="36" width="248" height="248" rx="42" fill="none" stroke="#f8e5aa" stroke-opacity="0.22" stroke-width="2"/>
    <text x="160" y="286" text-anchor="middle" font-family="Georgia,serif" font-size="20" letter-spacing="2" fill="#f6e0a2">${name}</text>
  </svg>`)
}

export const SHADOW_CHECKERS_ASSETS = {
  logo: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 360">
      <defs>
        <linearGradient id="gold" x1="0" x2="1">
          <stop stop-color="#fff0b7"/><stop offset="0.5" stop-color="#d3a243"/><stop offset="1" stop-color="#704714"/>
        </linearGradient>
        <radialGradient id="mist" cx="50%" cy="55%" r="70%">
          <stop stop-color="#19202a"/><stop offset="1" stop-color="#020303"/>
        </radialGradient>
      </defs>
      <rect width="1200" height="360" rx="54" fill="url(#mist)"/>
      <rect x="24" y="24" width="1152" height="312" rx="42" fill="none" stroke="url(#gold)" stroke-width="8"/>
      <g transform="translate(95 82)">
        <circle cx="95" cy="95" r="82" fill="#08090a" stroke="url(#gold)" stroke-width="12"/>
        <circle cx="70" cy="80" r="38" fill="#0b0d10" stroke="#d7aa46" stroke-width="8"/>
        <circle cx="120" cy="118" r="38" fill="#d7aa46" stroke="#fff0b7" stroke-width="8"/>
        <path d="M95 32l18 31 36 2-27 24 9 35-36-18-35 18 8-35-27-24 36-2z" fill="#f4dda0"/>
      </g>
      <text x="270" y="154" font-family="Georgia,serif" font-size="92" fill="url(#gold)" font-weight="700">Shadow</text>
      <text x="270" y="252" font-family="Georgia,serif" font-size="104" fill="url(#gold)" font-weight="700">Checkers</text>
      <text x="832" y="112" font-family="Arial,sans-serif" font-size="26" fill="#b9a16f" letter-spacing="9">MULTIPLAYER DUEL</text>
    </svg>`),
  pickerArt: svgDataUrl(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 760">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1"><stop stop-color="#050505"/><stop offset="0.52" stop-color="#13100a"/><stop offset="1" stop-color="#020303"/></linearGradient>
        <linearGradient id="gold" x1="0" x2="1"><stop stop-color="#f8e7ad"/><stop offset="1" stop-color="#7c5018"/></linearGradient>
      </defs>
      <rect width="1600" height="760" fill="url(#bg)"/>
      <path d="M0 660c270-160 560-230 870-210 250 16 470-35 730-210v520H0z" fill="#090b0d"/>
      <g transform="translate(625 135) rotate(-7)">
        <rect x="0" y="0" width="520" height="520" rx="36" fill="#0b0d10" stroke="url(#gold)" stroke-width="11"/>
        ${Array.from({ length: 64 }, (_, i) => {
          const row = Math.floor(i / 8)
          const col = i % 8
          return `<rect x="${30 + col * 57}" y="${30 + row * 57}" width="57" height="57" fill="${(row + col) % 2 ? '#2d2416' : '#090b0e'}"/>`
        }).join('')}
        <circle cx="116" cy="402" r="33" fill="#d7aa46" stroke="#fff0b7" stroke-width="8"/>
        <circle cx="230" cy="402" r="33" fill="#d7aa46" stroke="#fff0b7" stroke-width="8"/>
        <circle cx="344" cy="402" r="33" fill="#d7aa46" stroke="#fff0b7" stroke-width="8"/>
        <circle cx="173" cy="116" r="33" fill="#050505" stroke="#8fa3ba" stroke-width="8"/>
        <circle cx="287" cy="116" r="33" fill="#050505" stroke="#8fa3ba" stroke-width="8"/>
        <circle cx="401" cy="116" r="33" fill="#050505" stroke="#8fa3ba" stroke-width="8"/>
      </g>
    </svg>`),
  victory: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540"><rect width="900" height="540" fill="#050505"/><path d="M92 420c190-210 508-210 698 0" fill="#10100b"/><circle cx="450" cy="206" r="132" fill="#d7aa46" opacity=".28"/><text x="450" y="255" text-anchor="middle" font-family="Georgia,serif" font-size="92" fill="#f6e0a2">Victory</text></svg>`),
  defeat: svgDataUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 900 540"><rect width="900" height="540" fill="#050505"/><path d="M100 420c170-150 530-150 700 0" fill="#12070a"/><circle cx="450" cy="206" r="132" fill="#872439" opacity=".24"/><text x="450" y="255" text-anchor="middle" font-family="Georgia,serif" font-size="92" fill="#e7c8cb">Defeat</text></svg>`),
}

export const SHADOW_CHECKERS_CHARACTERS: ShadowCheckersCharacter[] = [
  { key: 'obsidian-sentinel', name: 'Kael', title: 'Obsidian Sentinel', accent: '#6f7f91', portrait: portrait('KAEL', '#0b1016', 'K', '#34465a') },
  { key: 'amber-vow', name: 'Seren', title: 'Amber Vow', accent: '#d7aa46', portrait: portrait('SEREN', '#3a260c', 'S', '#c28a24') },
  { key: 'veil-rogue', name: 'Nyx', title: 'Veil Rogue', accent: '#8b3557', portrait: portrait('NYX', '#1b0b12', 'N', '#7d2846') },
  { key: 'iron-oracle', name: 'Mara', title: 'Iron Oracle', accent: '#74818f', portrait: portrait('MARA', '#11151a', 'M', '#5f6f7e') },
  { key: 'gilded-wolf', name: 'Rook', title: 'Gilded Wolf', accent: '#c08a2a', portrait: portrait('ROOK', '#2e1f0b', 'R', '#b88422') },
  { key: 'ashen-warden', name: 'Veyra', title: 'Ashen Warden', accent: '#69635d', portrait: portrait('VEYRA', '#151312', 'V', '#5b5651') },
  { key: 'night-regent', name: 'Dorian', title: 'Night Regent', accent: '#5966a1', portrait: portrait('DORIAN', '#0c0f22', 'D', '#38447f') },
  { key: 'cinder-crown', name: 'Ivara', title: 'Cinder Crown', accent: '#b34830', portrait: portrait('IVARA', '#210b07', 'I', '#9e341d') },
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
