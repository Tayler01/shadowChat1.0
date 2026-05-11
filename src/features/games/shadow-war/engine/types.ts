export type ShadowWarLane = 'left' | 'center' | 'right'
export type ShadowWarPlayerSlot = 'player_one' | 'player_two'

export type ShadowWarAbilityKey =
  | 'intel'
  | 'sabotage'
  | 'rally'
  | 'volley'
  | 'guard'
  | 'stable'
  | 'command'
  | 'duelist'
  | 'dominate'
  | 'crown'

export interface ShadowWarCard {
  instanceId: string
  cardId: string
  name: string
  rank: number
  archetype: string
  abilityKey: ShadowWarAbilityKey
  description: string
  imageUrl?: string
}

export type ShadowWarPlacement = Record<ShadowWarLane, ShadowWarCard>
export type ShadowWarPlacementInput = Record<ShadowWarLane, string>

export interface ShadowWarPlayerState {
  userId: string
  deck: ShadowWarCard[]
  hand: ShadowWarCard[]
  discard: ShadowWarCard[]
  scoutBonusDraws: number
}

export interface ShadowWarLaneResult {
  lane: ShadowWarLane
  playerOneCard: ShadowWarCard
  playerTwoCard: ShadowWarCard
  playerOneStrength: number
  playerTwoStrength: number
  winner: ShadowWarPlayerSlot | 'contested'
  notes: string[]
}

export interface ShadowWarSuddenWarResult {
  playerOneCard?: ShadowWarCard | null
  playerTwoCard?: ShadowWarCard | null
  playerOneStrength: number
  playerTwoStrength: number
  winner: ShadowWarPlayerSlot | 'contested'
}

export interface ShadowWarRoundResolution {
  laneResults: ShadowWarLaneResult[]
  roundWinner: ShadowWarPlayerSlot | 'draw' | null
  needsSuddenWar: boolean
  suddenWar?: ShadowWarSuddenWarResult
  postRound: {
    playerOneScoutBonus: number
    playerTwoScoutBonus: number
  }
  notes: string[]
}

export interface ShadowWarRoundHistoryEntry extends ShadowWarRoundResolution {
  roundNumber: number
  resolvedAt: string
}

export interface ShadowWarMatchPublicState {
  lockedPlayerIds: string[]
  rounds: ShadowWarRoundHistoryEntry[]
  lastRound?: ShadowWarRoundHistoryEntry | null
  rematchVotes?: string[]
}
