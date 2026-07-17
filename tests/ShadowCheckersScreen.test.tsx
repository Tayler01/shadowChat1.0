import { fireEvent, render, screen } from '@testing-library/react'
import { ShadowCheckersScreen } from '../src/features/games/shadow-checkers/ShadowCheckersScreen'
import { createInitialBoard, serializeBoard } from '../src/features/games/shadow-checkers/engine/checkers'
import type { BasicUser, ShadowCheckersMatch } from '../src/lib/supabase'

const mockUseShadowCheckers = jest.fn()
const mockSelectMatch = jest.fn()

jest.mock('../src/hooks/useAuth', () => ({
  useAuth: () => ({
    user: {
      id: 'player-one',
      username: 'player_one',
      display_name: 'Player One',
    },
  }),
}))

jest.mock('../src/hooks/useAdminAccess', () => ({
  useAdminAccess: () => ({
    isAdmin: false,
  }),
}))

jest.mock('../src/features/games/shadow-checkers/hooks/useShadowCheckers', () => ({
  useShadowCheckers: (
    initialMatchId?: string,
    onAutoSelectMatch?: (matchId: string, routeMode: 'push' | 'replace') => void,
  ) => mockUseShadowCheckers(initialMatchId, onAutoSelectMatch),
}))

const playerOne = {
  id: 'player-one',
  username: 'player_one',
  display_name: 'Player One',
  avatar_url: '',
  avatar_thumbnail_url: '',
  color: '#d7aa46',
  status: 'online',
  admin_role: null,
  checkers_crown: true,
  war_sword: false,
  shadow_pin_gold_pin: false,
  presence_visibility: 'tracked',
  dm_discoverable: true,
} satisfies BasicUser

const playerTwo = {
  ...playerOne,
  id: 'player-two',
  username: 'player_two',
  display_name: 'Player Two',
  checkers_crown: false,
} satisfies BasicUser

const activeMatch: ShadowCheckersMatch = {
  id: 'match-1',
  session_id: 'session-1',
  status: 'active',
  player_one_id: 'player-one',
  player_two_id: 'player-two',
  player_one_character_key: 'raven',
  player_two_character_key: 'ember',
  board_skin: 'classic',
  current_turn_user_id: 'player-one',
  board_state: serializeBoard(createInitialBoard()) as unknown as Record<string, unknown>,
  move_count: 0,
  winner_id: null,
  loser_id: null,
  win_reason: null,
  created_at: '2026-05-19T00:00:00.000Z',
  updated_at: '2026-05-19T00:00:00.000Z',
  completed_at: null,
  cancelled_at: null,
  player_one: playerOne,
  player_two: playerTwo,
  winner: null,
  loser: null,
}

beforeEach(() => {
  mockSelectMatch.mockReset()
  mockUseShadowCheckers.mockReset()
  mockUseShadowCheckers.mockReturnValue({
    sessions: [],
    matches: [activeMatch],
    activeMatch,
    queue: [],
    moves: [],
    chat: [
      {
        id: 'chat-1',
        match_id: activeMatch.id,
        user_id: 'player-two',
        body: 'Nice jump',
        created_at: '2026-05-19T00:01:00.000Z',
        user: playerTwo,
      },
    ],
    leaderboard: [],
    selectedMatchId: activeMatch.id,
    loading: false,
    busy: null,
    error: null,
    actions: {
      create: jest.fn(),
      join: jest.fn(),
      submitMove: jest.fn(),
      resign: jest.fn(),
      cancel: jest.fn(),
      queue: jest.fn(),
      leaveQueue: jest.fn(),
      rematch: jest.fn(),
      nextChallenger: jest.fn(),
      postChat: jest.fn(),
      selectMatch: mockSelectMatch,
    },
  })
})

test('prioritizes Shadow Checkers match chat during Android keyboard compression', () => {
  render(<ShadowCheckersScreen />)

  const chatHeading = screen.getByRole('heading', { name: /match chat/i })
  const chatPanel = chatHeading.closest('section')

  expect(screen.getByPlaceholderText(/say something/i)).toBeInTheDocument()
  expect(chatPanel).toHaveClass('shadow-checkers-match-chat')
  expect(document.querySelectorAll('.shadow-checkers-keyboard-collapse')).toHaveLength(3)
  expect(document.querySelector('.shadow-checkers-match-surface')).toBeInTheDocument()
  expect(document.querySelector('.shadow-checkers-match-chat-wrap')).toBeInTheDocument()
})

test('opens an exact routed match and closes back to the Checkers lobby route', () => {
  const onMatchRoute = jest.fn()
  render(<ShadowCheckersScreen initialMatchId="match-1" onMatchRoute={onMatchRoute} />)

  expect(mockUseShadowCheckers).toHaveBeenCalledWith('match-1', expect.any(Function))

  fireEvent.click(screen.getByRole('button', { name: /back to shadow checkers lobby/i }))
  expect(mockSelectMatch).toHaveBeenCalledWith(null)
  expect(onMatchRoute).toHaveBeenCalledWith('close-item', undefined)
})

test('auto-selected matches push from the lobby and replace an existing match route without duplicates', () => {
  const onMatchRoute = jest.fn()
  render(<ShadowCheckersScreen initialMatchId="match-1" onMatchRoute={onMatchRoute} />)

  const onAutoSelectMatch = mockUseShadowCheckers.mock.calls[0]?.[1] as (
    matchId: string,
    routeMode: 'push' | 'replace',
  ) => void

  onAutoSelectMatch('match-1', 'push')
  onAutoSelectMatch('match-2', 'replace')

  expect(onMatchRoute).toHaveBeenCalledTimes(1)
  expect(onMatchRoute).toHaveBeenCalledWith('replace-item', 'match-2')
})
