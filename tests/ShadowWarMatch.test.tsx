import { render, screen } from '@testing-library/react'
import React from 'react'
import { ShadowWarMatch } from '../src/features/games/shadow-war/components/ShadowWarMatch'
import type {
  GameSession,
  GameSessionQueueEntry,
  ShadowWarMatch as ShadowWarMatchRow,
  ShadowWarMove,
  ShadowWarPlayerStateRow,
} from '../src/lib/supabase'

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'player-one', username: 'winner' },
  }),
}))

const completedSession = (overrides: Partial<GameSession> = {}): GameSession => ({
  id: 'session-1',
  game_type: 'shadow_war',
  status: 'completed',
  created_by: 'player-one',
  player_one_id: 'player-one',
  player_two_id: 'player-two',
  winner_id: 'player-one',
  loser_id: 'player-two',
  current_match_id: 'match-1',
  created_at: '2026-05-11T00:00:00.000Z',
  updated_at: '2026-05-11T00:00:00.000Z',
  completed_at: '2026-05-11T00:00:00.000Z',
  ...overrides,
})

const completedMatch = (): ShadowWarMatchRow => ({
  id: 'match-1',
  session_id: 'session-1',
  status: 'completed',
  round_number: 5,
  target_score: 5,
  player_one_score: 5,
  player_two_score: 3,
  current_phase: 'complete',
  state: { rounds: [] },
  created_at: '2026-05-11T00:00:00.000Z',
  updated_at: '2026-05-11T00:00:00.000Z',
  completed_at: '2026-05-11T00:00:00.000Z',
})

const playerState = (): ShadowWarPlayerStateRow => ({
  match_id: 'match-1',
  user_id: 'player-one',
  player_slot: 'player_one',
  state: { hand: [], deck: [], discard: [] },
  updated_at: '2026-05-11T00:00:00.000Z',
})

const queuedChallenger = (): GameSessionQueueEntry => ({
  id: 'queue-1',
  session_id: 'session-1',
  user_id: 'player-three',
  position: 1,
  status: 'queued',
  created_at: '2026-05-11T00:00:00.000Z',
  updated_at: '2026-05-11T00:00:00.000Z',
})

function renderCompletedMatch(queue: GameSessionQueueEntry[] = [], session = completedSession()) {
  render(
    <ShadowWarMatch
      session={session}
      match={completedMatch()}
      playerStateRow={playerState()}
      moves={[] as ShadowWarMove[]}
      queue={queue}
      busy={null}
      onSubmitPlacement={jest.fn()}
      onSubmitSuddenWarCard={jest.fn()}
      onResolveRound={jest.fn()}
      onRematch={jest.fn()}
      onNextChallenger={jest.fn()}
    />
  )
}

describe('ShadowWarMatch completed state', () => {
  it('blocks rematch and enables next challenger for the winner when queue is waiting', () => {
    renderCompletedMatch([queuedChallenger()])

    expect(screen.getByText('Winner is recorded. A queued challenger is waiting.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled()
  })

  it('allows rematch and disables next challenger when nobody is queued', () => {
    renderCompletedMatch()

    expect(screen.getByText('Winner is recorded. Run it back or wait for the next challenger.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Rematch' })).toBeEnabled()
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })

  it('does not allow the loser to start the next challenger', () => {
    renderCompletedMatch([queuedChallenger()], completedSession({ winner_id: 'player-two', loser_id: 'player-one' }))

    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled()
  })
})
