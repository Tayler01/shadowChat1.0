import { act, fireEvent, render as renderBase, screen, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { ComfortProvider } from '../src/hooks/useComfortPreferences'
import { ShadowCheckersScreen } from '../src/features/games/shadow-checkers/ShadowCheckersScreen'
import { createInitialBoard, serializeBoard } from '../src/features/games/shadow-checkers/engine/checkers'
import type { BasicUser, ShadowCheckersMatch } from '../src/lib/supabase'
import { SHADOW_CHECKERS_CHARACTERS } from '../src/features/games/shadow-checkers/assets/manifest'

const mockUseShadowCheckers = jest.fn()
const mockSelectMatch = jest.fn()

const render = (ui: ReactElement) => renderBase(<ComfortProvider>{ui}</ComfortProvider>)

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

test('shows a compact feed and toggles the composer without a room header', () => {
  render(<ShadowCheckersScreen />)
  expect(screen.getByRole('region', { name: 'Recent match chat' })).toHaveTextContent('Nice jump')
  expect(document.querySelector('.shadow-checkers-keyboard-collapse')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open match chat' }))
  expect(screen.getByPlaceholderText(/say something/i)).toBeInTheDocument()
  fireEvent.click(screen.getAllByRole('button', { name: 'Close match chat' })[0])
  expect(screen.queryByRole('region', { name: 'Match chat composer' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Recent match chat' })).toBeInTheDocument()
})

test('chat send closes the composer only on success and preserves a failed draft', async () => {
  const fixture = mockUseShadowCheckers()
  fixture.actions.postChat.mockRejectedValueOnce(new Error('Connection lost'))
  render(<ShadowCheckersScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Open match chat' }))
  const input = screen.getByRole('textbox', { name: 'Match message' })
  fireEvent.change(input, { target: { value: 'Good move' } })
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send match message' })))
  expect(input).toHaveValue('Good move')
  expect(screen.getByRole('alert')).toHaveTextContent('Connection lost')
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Send match message' })))
  expect(fixture.actions.postChat).toHaveBeenCalledWith('match-1', 'Good move')
  expect(screen.queryByRole('region', { name: 'Match chat composer' })).not.toBeInTheDocument()
  expect(screen.getByRole('region', { name: 'Recent match chat' })).toBeInTheDocument()
})

test('the menu owns room controls and can hide the feed independently', () => {
  render(<ShadowCheckersScreen />)
  expect(screen.queryByRole('button', { name: 'Study sound' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open Shadow Checkers menu' }))
  expect(screen.getByRole('button', { name: /master sound/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /piece sounds/i })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /camera help/i })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: /chat feed: shown/i }))
  expect(screen.queryByRole('region', { name: 'Recent match chat' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Open match chat' }))
  expect(screen.getByRole('region', { name: 'Match chat composer' })).toBeInTheDocument()
})

test('lobby pages tables and opens Hall of Fame without page scrolling', () => {
  const fixture = mockUseShadowCheckers()
  mockUseShadowCheckers.mockReturnValue({ ...fixture, activeMatch: null, selectedMatchId: null, matches: [activeMatch, { ...activeMatch, id: 'match-2' }] })
  render(<ShadowCheckersScreen />)
  expect(screen.getByRole('tab', { name: 'Tables' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('1 / 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(screen.getByText('2 / 2')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: 'Hall of Fame' }))
  expect(screen.getByRole('tab', { name: 'Hall of Fame' })).toHaveAttribute('aria-selected', 'true')
  expect(screen.getByText('Complete a match to enter the Hall of Fame.')).toBeInTheDocument()
})

test('themed resignation keeps focus and requires confirmation before dispatch', async () => {
  const fixture = mockUseShadowCheckers()
  render(<ShadowCheckersScreen />)
  const menu = screen.getByRole('button', { name: 'Open Shadow Checkers menu' })
  fireEvent.click(menu)
  fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Leave this contest?' })
  await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Keep playing' })).toHaveFocus())
  expect(fixture.actions.resign).not.toHaveBeenCalled()
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
  expect(within(dialog).getByRole('button', { name: 'Resign match' })).toHaveFocus()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  expect(menu).toHaveFocus()
  fireEvent.click(menu)
  fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Resign match' })) })
  expect(fixture.actions.resign).toHaveBeenCalledTimes(1)
  expect(fixture.actions.resign).toHaveBeenCalledWith('match-1')
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('pending resignation cannot be repeated or dismissed; a failure stays retryable', async () => {
  const fixture = mockUseShadowCheckers()
  let rejectAction!: (error: Error) => void
  fixture.actions.resign.mockImplementationOnce(() => new Promise((_, reject) => { rejectAction = reject }))
  render(<ShadowCheckersScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Open Shadow Checkers menu' }))
  fireEvent.click(screen.getByRole('button', { name: 'Resign' }))
  const confirm = screen.getByRole('button', { name: 'Resign match' })
  fireEvent.click(confirm)
  fireEvent.click(confirm)
  expect(fixture.actions.resign).toHaveBeenCalledTimes(1)
  expect(confirm).toBeDisabled()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  await act(async () => rejectAction(new Error('Connection lost')))
  expect(within(screen.getByRole('alertdialog')).getByRole('alert')).toBeInTheDocument()
  expect(confirm).toBeEnabled()
  await act(async () => { fireEvent.click(confirm) })
  expect(fixture.actions.resign).toHaveBeenCalledTimes(2)
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
})

test('cancelling a waiting table uses the themed confirmation and exact match', async () => {
  const fixture = mockUseShadowCheckers()
  mockUseShadowCheckers.mockReturnValue({ ...fixture, selectedMatchId: null, activeMatch: null, matches: [{ ...activeMatch, status: 'waiting' }] })
  render(<ShadowCheckersScreen />)
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  const dialog = screen.getByRole('alertdialog', { name: 'Cancel this table?' })
  expect(fixture.actions.cancel).not.toHaveBeenCalled()
  fireEvent.click(within(dialog).getByRole('button', { name: 'Keep table' }))
  expect(fixture.actions.cancel).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Cancel table' })) })
  expect(fixture.actions.cancel).toHaveBeenCalledWith('match-1')
})

test('keeps both players, characters and live piece counts available in the match menu', () => {
  const fixture = mockUseShadowCheckers.getMockImplementation()!()
  const match = { ...activeMatch, player_one_character_key: SHADOW_CHECKERS_CHARACTERS[0].key, player_two_character_key: SHADOW_CHECKERS_CHARACTERS[1].key }
  mockUseShadowCheckers.mockReturnValue({ ...fixture, activeMatch: match })
  const view = render(<ShadowCheckersScreen />)
  const toggle = screen.getByRole('button', { name: 'Open Shadow Checkers menu' })
  fireEvent.click(toggle)
  const players = screen.getByRole('region', { name: 'Players at this table' })
  expect(within(players).getByText('Player One')).toBeVisible()
  expect(within(players).getByText('Player Two')).toBeVisible()
  expect(within(players).getByText(`${SHADOW_CHECKERS_CHARACTERS[0].name} · To move`)).toBeVisible()
  expect(within(players).getByText(SHADOW_CHECKERS_CHARACTERS[1].name)).toBeVisible()
  expect(within(players).getByText('Silver · 12 pieces')).toBeVisible()
  expect(within(players).getByText('Black · 12 pieces')).toBeVisible()
  expect(within(players).getByLabelText('Shadow Checkers champion')).toBeVisible()

  const board = createInitialBoard()
  board.pieces.splice(board.pieces.findIndex(piece => piece.owner === 'player_two'), 1)
  const remainingSilver = board.pieces.find(piece => piece.owner === 'player_one')!
  board.pieces = board.pieces.filter(piece => piece.owner === 'player_two' || piece.id === remainingSilver.id)
  mockUseShadowCheckers.mockReturnValue({ ...fixture, activeMatch: { ...match, current_turn_user_id: playerTwo.id, board_state: serializeBoard(board) } })
  view.rerender(<ComfortProvider><ShadowCheckersScreen /></ComfortProvider>)
  expect(within(players).getByText('Black · 11 pieces')).toBeVisible()
  expect(within(players).getByText('Silver · 1 piece')).toBeVisible()
  expect(within(players).getByText(`${SHADOW_CHECKERS_CHARACTERS[1].name} · To move`)).toBeVisible()
  fireEvent.keyDown(screen.getByRole('region', { name: 'Shadow Checkers menu' }), { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Players at this table' })).not.toBeInTheDocument()
  expect(toggle).toHaveFocus()
})

test('dismisses the match menu through its outside shield and from the toggle with Escape', () => {
  render(<ShadowCheckersScreen />)
  const toggle = screen.getByRole('button', { name: 'Open Shadow Checkers menu' })
  fireEvent.click(toggle)
  fireEvent.click(screen.getByRole('button', { name: 'Close Shadow Checkers menu' }))
  expect(screen.queryByRole('region', { name: 'Shadow Checkers menu' })).not.toBeInTheDocument()
  expect(toggle).toHaveFocus()
  fireEvent.click(toggle)
  fireEvent.keyDown(toggle, { key: 'Escape' })
  expect(screen.queryByRole('region', { name: 'Shadow Checkers menu' })).not.toBeInTheDocument()
  expect(toggle).toHaveFocus()
})

test('opens an exact routed match and closes back to the Checkers lobby route', () => {
  const onMatchRoute = jest.fn()
  render(<ShadowCheckersScreen initialMatchId="match-1" onMatchRoute={onMatchRoute} />)

  expect(mockUseShadowCheckers).toHaveBeenCalledWith('match-1', expect.any(Function))

  fireEvent.click(screen.getByRole('button', { name: 'Open Shadow Checkers menu' }))
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

test('identifies the exact Checkers match that owns an unread Play update', () => {
  const currentState = mockUseShadowCheckers()
  mockUseShadowCheckers.mockReturnValue({
    ...currentState,
    activeMatch: null,
    selectedMatchId: null,
  })

  render(<ShadowCheckersScreen unreadMatchCounts={{ [activeMatch.id]: 1 }} />)

  expect(screen.getByTestId(`checkers-unread-${activeMatch.id}`)).toHaveTextContent('1 new')
  expect(screen.getByLabelText('1 unread update for this match')).toBeInTheDocument()
})

describe('original feature controls around the Unity board', () => {
  const showLobby = (overrides = {}) => {
    const state = mockUseShadowCheckers()
    mockUseShadowCheckers.mockReturnValue({ ...state, activeMatch: null, selectedMatchId: null, ...overrides })
    return state.actions
  }

  test.each(['classic', 'cinematic'] as const)('creates a %s table with the chosen character', async boardSkin => {
    const actions = showLobby()
    render(<ShadowCheckersScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Create Public Match' }))
    fireEvent.click(screen.getByRole('button', { name: new RegExp(`^${boardSkin}`, 'i') }))
    const picker = within(screen.getByRole('dialog'))
    for (const character of SHADOW_CHECKERS_CHARACTERS) {
      expect(picker.getByRole('button', { name: character.name })).toBeEnabled()
    }
    fireEvent.click(picker.getByRole('button', { name: 'Corvin' }))
    await act(async () => { fireEvent.click(picker.getByRole('button', { name: 'Create Match' })) })
    expect(actions.create).toHaveBeenCalledWith('cinder-crown', boardSkin)
  })

  test('joining disables the occupied character and selects an available character', async () => {
    const waiting = { ...activeMatch, status: 'waiting', player_one_id: 'player-two', player_one: playerTwo,
      player_two_id: null, player_two: null, player_one_character_key: 'obsidian-sentinel' }
    const actions = showLobby({ matches: [waiting], sessions: [{ id: waiting.session_id }] })
    render(<ShadowCheckersScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Join' }))
    expect(screen.getByRole('button', { name: 'Kael' })).toBeDisabled()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Join Match' })) })
    expect(actions.join).toHaveBeenCalledWith('session-1', 'amber-vow')
  })

  test('spectators can open or queue for the exact table', async () => {
    const watchedMatch = { ...activeMatch, player_one_id: 'someone-else' }
    const actions = showLobby({ matches: [watchedMatch], sessions: [{ id: watchedMatch.session_id }] })
    const onMatchRoute = jest.fn()
    render(<ShadowCheckersScreen onMatchRoute={onMatchRoute} />)
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Queue' })) })
    expect(actions.queue).toHaveBeenCalledWith('session-1', 'obsidian-sentinel')
    fireEvent.click(screen.getByRole('button', { name: 'Spectate' }))
    expect(actions.selectMatch).toHaveBeenCalledWith('match-1')
    expect(onMatchRoute).toHaveBeenCalledWith('push-item', 'match-1')
  })

  test('a spectator receives a disabled Unity snapshot and cannot submit square input', () => {
    const state = mockUseShadowCheckers()
    mockUseShadowCheckers.mockReturnValue({ ...state, activeMatch: { ...activeMatch, player_one_id: 'someone-else' } })
    render(<ShadowCheckersScreen />)
    const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
    const post = jest.spyOn(iframe.contentWindow!, 'postMessage')
    const emit = (data: Record<string, unknown>) => act(() => {
      window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, ...data } }))
    })
    emit({ type: 'ready' })
    const snapshot = post.mock.calls.find(call => call[0].type === 'snapshot')![0].value
    expect(snapshot.disabled).toBe(true)
    emit({ type: 'square', revision: snapshot.revision, row: 5, col: 0 })
    emit({ type: 'square', revision: snapshot.revision, row: 4, col: 1 })
    expect(state.actions.submitMove).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Open Shadow Checkers menu' }))
    expect(screen.queryByRole('button', { name: 'Resign' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hide Hints' })).not.toBeInTheDocument()
    post.mockRestore()
  })

  test.each([
    ['player_one', false, 'Victory', 'Rematch', 'rematch'],
    ['player_one', true, 'Victory', 'Next Challenger', 'nextChallenger'],
    ['player_two', true, 'Defeat', 'Rematch', 'rematch'],
  ] as const)('shows %s results (queue=%s) and routes the continuation action', async (winner, queued, title, label, action) => {
    const state = mockUseShadowCheckers()
    const board = createInitialBoard()
    board.winner = winner
    board.winReason = 'all_pieces_captured'
    board.stats.player_one.captures = 12
    board.stats.player_two.kings = 2
    mockUseShadowCheckers.mockReturnValue({ ...state,
      activeMatch: { ...activeMatch, status: 'completed', move_count: 31, board_state: serializeBoard(board) },
      queue: queued ? [{ id: 'queue-1', user_id: 'challenger' }] : [],
    })
    render(<ShadowCheckersScreen />)
    expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
    const frame = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
    const post = jest.spyOn(frame.contentWindow!, 'postMessage')
    const receive = (data: object) => act(() => { window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: frame.contentWindow, data: { version: 1, ...data } })) })
    receive({ type: 'ready' })
    const revision = post.mock.calls.filter(call => call[0].type === 'snapshot').slice(-1)[0][0].value.revision
    receive({ type: 'rendered', revision })
    receive({ type: 'cinematic', busy: false, stage: 'ready' })
    receive({ type: 'presented', revision: 'stale' })
    expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
    receive({ type: 'presented', revision })
    expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    expect(screen.getByText('Moves: 31')).toBeInTheDocument()
    expect(screen.getByText('Captures: 12')).toBeInTheDocument()
    expect(screen.getByText('Crowns: 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss match result' }))
    expect(screen.queryByRole('heading', { name: title })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Open Shadow Checkers menu' }))
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: label })) })
    expect(state.actions[action]).toHaveBeenCalledWith('match-1')
    expect(state.actions[action === 'rematch' ? 'nextChallenger' : 'rematch']).not.toHaveBeenCalled()
  })
})
