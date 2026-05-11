import {
  SHADOW_WAR_CARD_DEFINITIONS,
  SHADOW_WAR_DECK_COPIES,
  SHADOW_WAR_HAND_SIZE,
  createCardInstance,
} from './cards'
import type { ShadowWarCard, ShadowWarPlayerState } from './types'

const hashSeed = (seed: string) => {
  let hash = 2166136261
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const createSeededRandom = (seed: string) => {
  let state = hashSeed(seed) || 1
  return () => {
    state = Math.imul(1664525, state) + 1013904223
    return ((state >>> 0) / 4294967296)
  }
}
export const shuffleDeck = (cards: ShadowWarCard[], seed = 'shadow-war') => {
  const random = createSeededRandom(seed)
  const next = [...cards]

  for (let index = next.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1))
    const current = next[index]
    next[index] = next[swapIndex]
    next[swapIndex] = current
  }

  return next
}

export const createInitialDeck = (ownerKey = 'warband') => {
  let sequence = 0
  const cards: ShadowWarCard[] = []

  for (let copyIndex = 1; copyIndex <= SHADOW_WAR_DECK_COPIES; copyIndex += 1) {
    SHADOW_WAR_CARD_DEFINITIONS.forEach(definition => {
      sequence += 1
      cards.push(createCardInstance(definition.cardId, copyIndex, ownerKey, sequence))
    })
  }

  return cards
}

export const drawCards = (
  state: ShadowWarPlayerState,
  targetHandSize = SHADOW_WAR_HAND_SIZE,
  seed = 'shadow-war'
): ShadowWarPlayerState => {
  let deck = [...state.deck]
  let hand = [...state.hand]
  let discard = [...state.discard]

  while (hand.length < targetHandSize) {
    if (deck.length === 0) {
      if (discard.length === 0) break
      deck = shuffleDeck(discard, `${seed}:reshuffle:${hand.length}:${discard.length}`)
      discard = []
    }

    const nextCard = deck[0]
    deck = deck.slice(1)
    if (nextCard) {
      hand = [...hand, nextCard]
    }
  }

  return {
    ...state,
    deck,
    hand,
    discard,
  }
}

export const createInitialPlayerState = (userId: string, slot: string, seed: string): ShadowWarPlayerState => {
  const deck = shuffleDeck(createInitialDeck(slot), `${seed}:${slot}`)
  return drawCards({
    userId,
    deck,
    hand: [],
    discard: [],
    scoutBonusDraws: 0,
  }, SHADOW_WAR_HAND_SIZE, seed)
}

export const removeCardsFromHand = (
  state: ShadowWarPlayerState,
  cardIds: string[]
): ShadowWarPlayerState => {
  const selected = new Set(cardIds)
  const played: ShadowWarCard[] = []
  const hand = state.hand.filter(card => {
    if (!selected.has(card.instanceId)) return true
    played.push(card)
    return false
  })

  return {
    ...state,
    hand,
    discard: [...state.discard, ...played],
  }
}
