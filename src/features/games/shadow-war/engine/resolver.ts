import { SHADOW_WAR_HAND_SIZE } from './cards'
import type {
  ShadowWarCard,
  ShadowWarLane,
  ShadowWarPlacement,
  ShadowWarPlacementInput,
  ShadowWarPlayerSlot,
  ShadowWarRoundResolution,
} from './types'

export const SHADOW_WAR_LANES: readonly ShadowWarLane[] = ['left', 'center', 'right'] as const

const otherSlot = (slot: ShadowWarPlayerSlot): ShadowWarPlayerSlot =>
  slot === 'player_one' ? 'player_two' : 'player_one'

const getLaneIndex = (lane: ShadowWarLane) => SHADOW_WAR_LANES.indexOf(lane)

const getAdjacentLanes = (lane: ShadowWarLane) => {
  const index = getLaneIndex(lane)
  return SHADOW_WAR_LANES.filter((_, nextIndex) => Math.abs(nextIndex - index) === 1)
}

const createStrengthMap = (placement: ShadowWarPlacement) =>
  Object.fromEntries(SHADOW_WAR_LANES.map(lane => [lane, placement[lane].rank])) as Record<ShadowWarLane, number>

const findWeakestLane = (
  placement: ShadowWarPlacement,
  candidates: readonly ShadowWarLane[] = SHADOW_WAR_LANES,
  predicate: (card: ShadowWarCard) => boolean = () => true
) => {
  return candidates
    .filter(lane => predicate(placement[lane]))
    .sort((a, b) => placement[a].rank - placement[b].rank || getLaneIndex(a) - getLaneIndex(b))[0] ?? null
}

const applyBuff = (
  strengths: Record<ShadowWarLane, number>,
  lane: ShadowWarLane | null,
  amount: number,
  notes: string[],
  label: string
) => {
  if (!lane) return
  strengths[lane] += amount
  notes.push(`${label}: ${lane} ${amount > 0 ? '+' : ''}${amount}`)
}

export const getPlacementFromHand = (
  hand: ShadowWarCard[],
  placement: ShadowWarPlacementInput
): ShadowWarPlacement => {
  const cardsById = new Map(hand.map(card => [card.instanceId, card]))
  const selectedIds = SHADOW_WAR_LANES.map(lane => placement[lane])

  selectedIds.forEach(id => {
    if (!id || !cardsById.has(id)) {
      throw new Error('Each lane must use a card from your hand.')
    }
  })

  if (new Set(selectedIds).size !== SHADOW_WAR_LANES.length) {
    throw new Error('A card can only be placed in one lane.')
  }

  return {
    left: cardsById.get(placement.left)!,
    center: cardsById.get(placement.center)!,
    right: cardsById.get(placement.right)!,
  }
}

export const validatePlacement = (hand: ShadowWarCard[], placement: Partial<ShadowWarPlacementInput>) => {
  if (!placement.left || !placement.center || !placement.right) {
    return { valid: false, message: 'Place one card in each lane.' }
  }

  try {
    getPlacementFromHand(hand, placement as ShadowWarPlacementInput)
    return { valid: true, message: null }
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Invalid formation.',
    }
  }
}

const applyDirectEffects = (
  owner: ShadowWarPlayerSlot,
  ownPlacement: ShadowWarPlacement,
  enemyPlacement: ShadowWarPlacement,
  ownStrengths: Record<ShadowWarLane, number>,
  enemyStrengths: Record<ShadowWarLane, number>,
  notes: string[]
) => {
  SHADOW_WAR_LANES.forEach(lane => {
    const card = ownPlacement[lane]
    const enemy = enemyPlacement[lane]

    if (card.abilityKey === 'sabotage' && enemy.rank >= 8) {
      enemyStrengths[lane] -= 3
      notes.push(`${owner} Spy sabotaged ${enemy.name} on ${lane}.`)
    }

    if (card.abilityKey === 'duelist' && enemy.rank > card.rank) {
      ownStrengths[lane] += 2
      notes.push(`${owner} Champion rose to the duel on ${lane}.`)
    }
  })
}

const applyFormationEffects = (
  owner: ShadowWarPlayerSlot,
  ownPlacement: ShadowWarPlacement,
  enemyPlacement: ShadowWarPlacement,
  ownStrengths: Record<ShadowWarLane, number>,
  notes: string[]
) => {
  SHADOW_WAR_LANES.forEach(lane => {
    const card = ownPlacement[lane]

    if (card.abilityKey === 'rally') {
      const target = findWeakestLane(
        ownPlacement,
        getAdjacentLanes(lane),
        candidate => candidate.rank < card.rank
      )
      applyBuff(ownStrengths, target, 1, notes, `${owner} Squire rally`)
    }

    if (card.abilityKey === 'volley') {
      const target = lane === 'right' ? 'center' : SHADOW_WAR_LANES[getLaneIndex(lane) + 1]
      applyBuff(ownStrengths, target ?? null, 1, notes, `${owner} Archer volley`)
    }

    if (card.abilityKey === 'command') {
      const target = findWeakestLane(ownPlacement)
      applyBuff(ownStrengths, target, 1, notes, `${owner} Captain command`)
    }

    if (card.abilityKey === 'dominate' && card.rank > enemyPlacement[lane].rank) {
      const target = findWeakestLane(ownPlacement, getAdjacentLanes(lane))
      applyBuff(ownStrengths, target, 1, notes, `${owner} Warlord pressure`)
    }
  })
}

const determineLaneWinner = (
  lane: ShadowWarLane,
  playerOnePlacement: ShadowWarPlacement,
  playerTwoPlacement: ShadowWarPlacement,
  playerOneStrength: number,
  playerTwoStrength: number,
  notes: string[]
) => {
  let winner: ShadowWarPlayerSlot | 'contested' =
    playerOneStrength > playerTwoStrength
      ? 'player_one'
      : playerTwoStrength > playerOneStrength
        ? 'player_two'
        : 'contested'

  const p1Card = playerOnePlacement[lane]
  const p2Card = playerTwoPlacement[lane]
  const margin = Math.abs(playerOneStrength - playerTwoStrength)

  if (winner === 'player_two' && p1Card.abilityKey === 'guard' && margin <= 2) {
    winner = 'contested'
    notes.push('Shieldbearer guarded a narrow loss for player_one.')
  }

  if (winner === 'player_one' && p2Card.abilityKey === 'guard' && margin <= 2) {
    winner = 'contested'
    notes.push('Shieldbearer guarded a narrow loss for player_two.')
  }

  return winner
}

const pickRoundWinner = (laneWinners: Array<ShadowWarPlayerSlot | 'contested'>): ShadowWarPlayerSlot | null => {
  const playerOneWins = laneWinners.filter(winner => winner === 'player_one').length
  const playerTwoWins = laneWinners.filter(winner => winner === 'player_two').length

  if (playerOneWins >= 2) return 'player_one'
  if (playerTwoWins >= 2) return 'player_two'
  if (playerOneWins === playerTwoWins) return null
  return playerOneWins > playerTwoWins ? 'player_one' : 'player_two'
}

export const resolveRound = ({
  playerOnePlacement,
  playerTwoPlacement,
  suddenWar,
}: {
  playerOnePlacement: ShadowWarPlacement
  playerTwoPlacement: ShadowWarPlacement
  suddenWar?: {
    playerOneCard?: ShadowWarCard | null
    playerTwoCard?: ShadowWarCard | null
  }
}): ShadowWarRoundResolution => {
  const notes: string[] = []
  const playerOneStrengths = createStrengthMap(playerOnePlacement)
  const playerTwoStrengths = createStrengthMap(playerTwoPlacement)

  applyDirectEffects('player_one', playerOnePlacement, playerTwoPlacement, playerOneStrengths, playerTwoStrengths, notes)
  applyDirectEffects('player_two', playerTwoPlacement, playerOnePlacement, playerTwoStrengths, playerOneStrengths, notes)
  applyFormationEffects('player_one', playerOnePlacement, playerTwoPlacement, playerOneStrengths, notes)
  applyFormationEffects('player_two', playerTwoPlacement, playerOnePlacement, playerTwoStrengths, notes)

  const laneResults = SHADOW_WAR_LANES.map(lane => {
    const laneNotes: string[] = []
    const winner = determineLaneWinner(
      lane,
      playerOnePlacement,
      playerTwoPlacement,
      playerOneStrengths[lane],
      playerTwoStrengths[lane],
      laneNotes
    )

    return {
      lane,
      playerOneCard: playerOnePlacement[lane],
      playerTwoCard: playerTwoPlacement[lane],
      playerOneStrength: playerOneStrengths[lane],
      playerTwoStrength: playerTwoStrengths[lane],
      winner,
      notes: laneNotes,
    }
  })

  let roundWinner: ShadowWarPlayerSlot | 'draw' | null = pickRoundWinner(laneResults.map(result => result.winner))
  let needsSuddenWar = roundWinner === null
  const suddenWarResult = suddenWar && needsSuddenWar
    ? {
        playerOneCard: suddenWar.playerOneCard ?? null,
        playerTwoCard: suddenWar.playerTwoCard ?? null,
        playerOneStrength: suddenWar.playerOneCard?.rank ?? 0,
        playerTwoStrength: suddenWar.playerTwoCard?.rank ?? 0,
        winner: (suddenWar.playerOneCard?.rank ?? 0) > (suddenWar.playerTwoCard?.rank ?? 0)
          ? 'player_one' as const
          : (suddenWar.playerTwoCard?.rank ?? 0) > (suddenWar.playerOneCard?.rank ?? 0)
            ? 'player_two' as const
            : 'contested' as const,
      }
    : undefined

  if (suddenWarResult) {
    roundWinner = suddenWarResult.winner === 'contested' ? 'draw' : suddenWarResult.winner
    needsSuddenWar = false
  }

  const playerOneScoutBonus = laneResults.filter(result =>
    result.playerOneCard.abilityKey === 'intel' && result.winner === 'player_two'
  ).length
  const playerTwoScoutBonus = laneResults.filter(result =>
    result.playerTwoCard.abilityKey === 'intel' && result.winner === 'player_one'
  ).length

  return {
    laneResults,
    roundWinner,
    needsSuddenWar,
    suddenWar: suddenWarResult,
    postRound: {
      playerOneScoutBonus: Math.min(playerOneScoutBonus, SHADOW_WAR_HAND_SIZE),
      playerTwoScoutBonus: Math.min(playerTwoScoutBonus, SHADOW_WAR_HAND_SIZE),
    },
    notes,
  }
}
