import { chooseSquare, makeUnitySnapshot, parseSquareEvent } from '../src/features/games/shadow-checkers/unity/bridge'
import { createInitialBoard, getLegalMoves } from '../src/features/games/shadow-checkers/engine/checkers'
import type { ShadowCheckersBoardProps } from '../src/features/games/shadow-checkers/components/ShadowCheckersBoard'

const props = (): ShadowCheckersBoardProps => ({
  state: createInitialBoard(), viewerSlot: 'player_one', selectedPieceId: 'p1-5-0',
  legalMoves: getLegalMoves(createInitialBoard(), 'player_one', 'p1-5-0'),
  onSelectMove: jest.fn(), onSelectPiece: jest.fn(), onInvalidDestination: jest.fn(),
})

test('rejects stale, malformed and out-of-range Unity input', () => {
  const valid = { version: 1, type: 'square', revision: 'current', row: 4, col: 1 }
  expect(parseSquareEvent(valid, 'current')).toEqual({ row: 4, col: 1 })
  for (const patch of [{ version: 2 }, { revision: 'old' }, { row: -1 }, { col: 8 }, { row: 1.5 }, { col: '1' }, { type: 'win' }]) {
    expect(parseSquareEvent({ ...valid, ...patch }, 'current')).toBeNull()
  }
})

test('forwards only a host-generated legal move', () => {
  const p = props()
  expect(chooseSquare(p, { row: 4, col: 1 })).toBe('move')
  expect(p.onSelectMove).toHaveBeenCalledWith(p.legalMoves[0])
  expect(chooseSquare(p, { row: 0, col: 1 })).toBe('piece')
  expect(chooseSquare(p, { row: 3, col: 0 })).toBe('invalid')
  expect(p.onSelectMove).toHaveBeenCalledTimes(1)
})

test.each([{ disabled: true }, { viewerSlot: 'spectator' as const }, { state: { ...createInitialBoard(), winner: 'player_two' as const } }])('blocks input when game interaction is unavailable: %j', patch => {
  const p = { ...props(), ...patch }
  expect(chooseSquare(p, { row: 4, col: 1 })).toBe('ignored')
  expect(p.onSelectMove).not.toHaveBeenCalled()
})

test('sends presentation-only state and the shared comfort policy', () => {
  const snapshot = makeUnitySnapshot({ ...props(), showHints: false }, 'r1', true, true)
  expect(snapshot).toMatchObject({ version: 1, revision: 'r1', reducedMotion: true, highContrast: true, showHints: false })
  expect(snapshot.pieces).toHaveLength(24)
  expect(snapshot.destinations).toEqual([{ row: 4, col: 1 }])
  expect(snapshot).not.toHaveProperty('session')
  expect(snapshot).not.toHaveProperty('access_token')
})
