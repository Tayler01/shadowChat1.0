import { SHADOW_WAR_HAND_SIZE, SHADOW_WAR_TARGET_SCORE } from '../src/features/games/shadow-war/engine/cards'
import { createInitialDeck, createInitialPlayerState, drawCards } from '../src/features/games/shadow-war/engine/deck'
import { getPlacementFromHand, resolveRound, validatePlacement } from '../src/features/games/shadow-war/engine/resolver'
import type { ShadowWarCard, ShadowWarPlacement } from '../src/features/games/shadow-war/engine/types'

const card = (cardId: string, rank: number, abilityKey: ShadowWarCard['abilityKey'] = 'stable'): ShadowWarCard => ({
  instanceId: `${cardId}-${rank}-${Math.random()}`,
  cardId,
  name: cardId,
  rank,
  archetype: cardId,
  abilityKey,
  description: cardId,
})

const placement = (left: ShadowWarCard, center: ShadowWarCard, right: ShadowWarCard): ShadowWarPlacement => ({
  left,
  center,
  right,
})

describe('Shadow War engine', () => {
  it('creates a balanced original unit deck with two copies of ranks 1 through 10', () => {
    const deck = createInitialDeck('p1')

    expect(deck).toHaveLength(20)
    expect(deck.map(unit => unit.rank).sort((a, b) => a - b)).toEqual([
      1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10,
    ])
    expect(deck.some(unit => /ace|king|queen|jack|joker|suit|tarot/i.test(unit.name))).toBe(false)
  })

  it('draws a starting hand and preserves deck/discard state', () => {
    const player = createInitialPlayerState('u1', 'player-one', 'match-seed')

    expect(player.hand).toHaveLength(SHADOW_WAR_HAND_SIZE)
    expect(player.deck).toHaveLength(15)
    expect(player.discard).toHaveLength(0)

    const redrawn = drawCards({ ...player, hand: player.hand.slice(0, 3) }, SHADOW_WAR_HAND_SIZE)
    expect(redrawn.hand).toHaveLength(SHADOW_WAR_HAND_SIZE)
  })

  it('validates one unique hand card per lane', () => {
    const hand = [card('scout', 1, 'intel'), card('spy', 2, 'sabotage'), card('knight', 6)]

    expect(validatePlacement(hand, {
      left: hand[0].instanceId,
      center: hand[1].instanceId,
      right: hand[2].instanceId,
    }).valid).toBe(true)

    expect(validatePlacement(hand, {
      left: hand[0].instanceId,
      center: hand[0].instanceId,
      right: hand[2].instanceId,
    }).valid).toBe(false)
  })

  it('maps placements from the current hand', () => {
    const hand = [card('scout', 1, 'intel'), card('spy', 2, 'sabotage'), card('knight', 6)]
    const mapped = getPlacementFromHand(hand, {
      left: hand[0].instanceId,
      center: hand[1].instanceId,
      right: hand[2].instanceId,
    })

    expect(mapped.left.cardId).toBe('scout')
    expect(mapped.center.cardId).toBe('spy')
    expect(mapped.right.cardId).toBe('knight')
  })

  it('awards the round to the player winning best two of three lanes', () => {
    const result = resolveRound({
      playerOnePlacement: placement(card('a', 6), card('b', 7), card('c', 1, 'intel')),
      playerTwoPlacement: placement(card('d', 5), card('e', 3), card('f', 10, 'crown')),
    })

    expect(result.roundWinner).toBe('player_one')
    expect(result.needsSuddenWar).toBe(false)
  })

  it('lets Spy reduce high-rank enemies and Shieldbearer contest a narrow loss', () => {
    const result = resolveRound({
      playerOnePlacement: placement(card('spy', 2, 'sabotage'), card('shieldbearer', 5, 'guard'), card('knight', 6)),
      playerTwoPlacement: placement(card('sovereign', 10, 'crown'), card('captain', 7, 'command'), card('scout', 1, 'intel')),
    })

    expect(result.laneResults[0].playerTwoStrength).toBe(7)
    expect(result.laneResults[0].winner).toBe('player_two')
    expect(result.laneResults[1].winner).toBe('contested')
  })

  it('applies Squire, Archer, Captain, Champion, and Warlord effects deterministically', () => {
    const result = resolveRound({
      playerOnePlacement: placement(card('squire', 3, 'rally'), card('archer', 4, 'volley'), card('captain', 7, 'command')),
      playerTwoPlacement: placement(card('warlord', 9, 'dominate'), card('champion', 8, 'duelist'), card('sovereign', 10, 'crown')),
    })

    expect(result.laneResults.some(lane => lane.playerOneStrength > lane.playerOneCard.rank)).toBe(true)
    expect(result.laneResults[1].playerTwoStrength).toBeGreaterThan(8)
    expect(result.notes.length).toBeGreaterThan(0)
  })

  it('uses sudden-war when lane results cannot decide the round', () => {
    const result = resolveRound({
      playerOnePlacement: placement(card('a', 5), card('b', 5), card('c', 1, 'intel')),
      playerTwoPlacement: placement(card('d', 5), card('e', 1, 'intel'), card('f', 5)),
      suddenWar: {
        playerOneCard: card('reserve', 4),
        playerTwoCard: card('reserve', 9),
      },
    })

    expect(result.needsSuddenWar).toBe(false)
    expect(result.roundWinner).toBe('player_two')
    expect(result.suddenWar?.winner).toBe('player_two')
  })

  it('keeps the target score mobile-friendly', () => {
    expect(SHADOW_WAR_TARGET_SCORE).toBe(5)
  })
})
