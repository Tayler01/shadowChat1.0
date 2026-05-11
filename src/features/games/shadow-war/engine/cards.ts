import type { ShadowWarAbilityKey, ShadowWarCard } from './types'

export interface ShadowWarCardDefinition {
  cardId: string
  name: string
  rank: number
  archetype: string
  abilityKey: ShadowWarAbilityKey
  description: string
  shortRules: string
  imageUrl: string
}

export const SHADOW_WAR_CARD_DEFINITIONS: readonly ShadowWarCardDefinition[] = [
  {
    cardId: 'scout',
    name: 'Scout',
    rank: 1,
    archetype: 'Recon',
    abilityKey: 'intel',
    description: 'If Scout loses its lane, draw 1 extra card next round.',
    shortRules: 'Lose lane: +1 draw next round',
    imageUrl: '/games/shadow-war/cards/scout.webp',
  },
  {
    cardId: 'spy',
    name: 'Spy',
    rank: 2,
    archetype: 'Infiltrator',
    abilityKey: 'sabotage',
    description: 'If Spy faces rank 8, 9, or 10, reduce that enemy by 3.',
    shortRules: 'Counters ranks 8-10 by -3',
    imageUrl: '/games/shadow-war/cards/spy.webp',
  },
  {
    cardId: 'squire',
    name: 'Squire',
    rank: 3,
    archetype: 'Support',
    abilityKey: 'rally',
    description: 'Gives +1 to the weakest adjacent friendly lane with lower base rank.',
    shortRules: '+1 to a weaker adjacent lane',
    imageUrl: '/games/shadow-war/cards/squire.webp',
  },
  {
    cardId: 'archer',
    name: 'Archer',
    rank: 4,
    archetype: 'Marksman',
    abilityKey: 'volley',
    description: 'Gives +1 to the lane on the right, or Center if played Right.',
    shortRules: '+1 pressure to right/center',
    imageUrl: '/games/shadow-war/cards/archer.webp',
  },
  {
    cardId: 'shieldbearer',
    name: 'Shieldbearer',
    rank: 5,
    archetype: 'Defender',
    abilityKey: 'guard',
    description: 'If this lane would lose by 1 or 2, it becomes contested.',
    shortRules: 'Narrow loss becomes contested',
    imageUrl: '/games/shadow-war/cards/shieldbearer.webp',
  },
  {
    cardId: 'knight',
    name: 'Knight',
    rank: 6,
    archetype: 'Vanguard',
    abilityKey: 'stable',
    description: 'Reliable raw strength with no timing risk.',
    shortRules: 'Reliable strength',
    imageUrl: '/games/shadow-war/cards/knight.webp',
  },
  {
    cardId: 'captain',
    name: 'Captain',
    rank: 7,
    archetype: 'Commander',
    abilityKey: 'command',
    description: 'Gives +1 to the weakest friendly lane this round.',
    shortRules: '+1 to weakest friendly lane',
    imageUrl: '/games/shadow-war/cards/captain.webp',
  },
  {
    cardId: 'champion',
    name: 'Champion',
    rank: 8,
    archetype: 'Duelist',
    abilityKey: 'duelist',
    description: 'Gains +2 when facing an enemy with higher base rank.',
    shortRules: '+2 versus stronger enemy',
    imageUrl: '/games/shadow-war/cards/champion.webp',
  },
  {
    cardId: 'warlord',
    name: 'Warlord',
    rank: 9,
    archetype: 'Overlord',
    abilityKey: 'dominate',
    description: 'If Warlord has raw advantage, gives +1 to the weakest adjacent friendly lane.',
    shortRules: 'Raw advantage buffs adjacent lane',
    imageUrl: '/games/shadow-war/cards/warlord.webp',
  },
  {
    cardId: 'sovereign',
    name: 'Sovereign',
    rank: 10,
    archetype: 'Crown',
    abilityKey: 'crown',
    description: 'Highest raw power, but vulnerable to Spy sabotage.',
    shortRules: 'Huge power, Spy-vulnerable',
    imageUrl: '/games/shadow-war/cards/sovereign.webp',
  },
] as const

export const SHADOW_WAR_TARGET_SCORE = 5
export const SHADOW_WAR_HAND_SIZE = 5
export const SHADOW_WAR_DECK_COPIES = 2

export const getShadowWarCardDefinition = (cardId: string) =>
  SHADOW_WAR_CARD_DEFINITIONS.find(card => card.cardId === cardId) ?? null

export const createCardInstance = (
  cardId: string,
  copyIndex: number,
  deckOwner: string,
  sequence: number
): ShadowWarCard => {
  const definition = getShadowWarCardDefinition(cardId)
  if (!definition) {
    throw new Error(`Unknown Shadow War card: ${cardId}`)
  }

  return {
    instanceId: `${deckOwner}-${definition.cardId}-${copyIndex}-${sequence}`,
    cardId: definition.cardId,
    name: definition.name,
    rank: definition.rank,
    archetype: definition.archetype,
    abilityKey: definition.abilityKey,
    description: definition.description,
    imageUrl: definition.imageUrl,
  }
}
