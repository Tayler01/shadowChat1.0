import { SHADOW_WAR_ASSETS } from './assets/manifest'

export interface ShadowWarAvatarOption {
  id: string
  name: string
  imageUrl: string
  accentClass: string
}

export interface ShadowWarFactionOption {
  id: string
  name: string
  crest: string
  accentClass: string
}

export interface ShadowWarIdentity {
  avatarId: string
  factionId: string
}

export const SHADOW_WAR_IDENTITY_STORAGE_KEY = 'shadow-war-identity-v1'

export const SHADOW_WAR_AVATARS: readonly ShadowWarAvatarOption[] = [
  {
    id: 'iron-archer',
    name: 'Iron Archer',
    imageUrl: SHADOW_WAR_ASSETS.cards.archer,
    accentClass: 'border-[#8fc7ff]/65 shadow-[0_0_24px_rgba(143,199,255,0.22)]',
  },
  {
    id: 'night-spy',
    name: 'Night Spy',
    imageUrl: SHADOW_WAR_ASSETS.cards.spy,
    accentClass: 'border-[#b64b45]/65 shadow-[0_0_24px_rgba(182,75,69,0.24)]',
  },
  {
    id: 'shield-vow',
    name: 'Shield Vow',
    imageUrl: SHADOW_WAR_ASSETS.cards.shieldbearer,
    accentClass: 'border-[#f0d381]/65 shadow-[0_0_24px_rgba(240,211,129,0.2)]',
  },
  {
    id: 'field-captain',
    name: 'Field Captain',
    imageUrl: SHADOW_WAR_ASSETS.cards.captain,
    accentClass: 'border-[#6fa1d8]/65 shadow-[0_0_24px_rgba(111,161,216,0.2)]',
  },
  {
    id: 'ember-warlord',
    name: 'Ember Warlord',
    imageUrl: SHADOW_WAR_ASSETS.cards.warlord,
    accentClass: 'border-[#d76643]/70 shadow-[0_0_24px_rgba(215,102,67,0.22)]',
  },
  {
    id: 'crown-sovereign',
    name: 'Crown Sovereign',
    imageUrl: SHADOW_WAR_ASSETS.cards.sovereign,
    accentClass: 'border-[#e6c66f]/75 shadow-[0_0_28px_rgba(230,198,111,0.24)]',
  },
]

export const SHADOW_WAR_FACTIONS: readonly ShadowWarFactionOption[] = [
  { id: 'iron-vanguard', name: 'Iron Vanguard', crest: 'IV', accentClass: 'text-[#f0d381] border-[#d7aa46]/45' },
  { id: 'blood-oath', name: 'Blood Oath', crest: 'BO', accentClass: 'text-[#f18468] border-[#a54a38]/50' },
  { id: 'storm-guard', name: 'Storm Guard', crest: 'SG', accentClass: 'text-[#9fd3ff] border-[#4f8dba]/50' },
  { id: 'ashen-crown', name: 'Ashen Crown', crest: 'AC', accentClass: 'text-[#d7c2a1] border-[#8e7a5d]/50' },
]

export const DEFAULT_SHADOW_WAR_IDENTITY: ShadowWarIdentity = {
  avatarId: SHADOW_WAR_AVATARS[0].id,
  factionId: SHADOW_WAR_FACTIONS[0].id,
}

export function getShadowWarAvatar(avatarId?: string | null) {
  return SHADOW_WAR_AVATARS.find(avatar => avatar.id === avatarId) ?? SHADOW_WAR_AVATARS[0]
}

export function getShadowWarFaction(factionId?: string | null) {
  return SHADOW_WAR_FACTIONS.find(faction => faction.id === factionId) ?? SHADOW_WAR_FACTIONS[0]
}

