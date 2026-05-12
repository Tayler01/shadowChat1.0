import React from 'react'
import { render, screen } from '@testing-library/react'
import { ShadowWarBattleCinematic } from '../src/features/games/shadow-war/components/ShadowWarBattleCinematic'
import { createCardInstance } from '../src/features/games/shadow-war/engine/cards'
import type { ShadowWarRoundHistoryEntry } from '../src/features/games/shadow-war/engine/types'

const card = (cardId: string, sequence: number) =>
  createCardInstance(cardId, 1, 'test-player', sequence)

const round = (): ShadowWarRoundHistoryEntry => ({
  roundNumber: 3,
  resolvedAt: '2026-05-12T13:30:00.000Z',
  roundWinner: 'player_one',
  needsSuddenWar: false,
  postRound: {
    playerOneScoutBonus: 0,
    playerTwoScoutBonus: 0,
  },
  notes: [],
  laneResults: [
    {
      lane: 'left',
      playerOneCard: card('archer', 1),
      playerTwoCard: card('spy', 2),
      playerOneStrength: 4,
      playerTwoStrength: 2,
      winner: 'player_one',
      notes: [],
    },
    {
      lane: 'center',
      playerOneCard: card('knight', 3),
      playerTwoCard: card('sovereign', 4),
      playerOneStrength: 6,
      playerTwoStrength: 10,
      winner: 'player_two',
      notes: [],
    },
    {
      lane: 'right',
      playerOneCard: card('shieldbearer', 5),
      playerTwoCard: card('captain', 6),
      playerOneStrength: 5,
      playerTwoStrength: 6,
      winner: 'contested',
      notes: [],
    },
  ],
})

describe('ShadowWarBattleCinematic', () => {
  it('renders a state-driven round clash summary', () => {
    render(<ShadowWarBattleCinematic round={round()} mySlot="player_one" />)

    expect(screen.getByText('Round 3')).toBeInTheDocument()
    expect(screen.getByText('Round Won')).toBeInTheDocument()
    expect(screen.getByText('Left')).toBeInTheDocument()
    expect(screen.getByText('Center')).toBeInTheDocument()
    expect(screen.getByText('Right')).toBeInTheDocument()
    expect(screen.getByText('Won')).toBeInTheDocument()
    expect(screen.getByText('Lost')).toBeInTheDocument()
    expect(screen.getByText('Contested')).toBeInTheDocument()
  })
})
