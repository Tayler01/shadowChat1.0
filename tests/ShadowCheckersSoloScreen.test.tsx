import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ComfortProvider } from '../src/hooks/useComfortPreferences'
import { getLegalMoves } from '../src/features/games/shadow-checkers/engine/checkers'
import * as checkers from '../src/features/games/shadow-checkers/engine/checkers'
import type { ShadowCheckersAiChoice } from '../src/features/games/shadow-checkers/engine/checkersAi'
import type { CheckersBoardState } from '../src/features/games/shadow-checkers/engine/types'
import { ShadowCheckersSoloScreen } from '../src/features/games/shadow-checkers/ShadowCheckersSoloScreen'

const mockChooseMove = jest.fn<Promise<ShadowCheckersAiChoice | null>, [CheckersBoardState, { signal?: AbortSignal }]>()
const mockDispose = jest.fn()

jest.mock('../src/features/games/shared/useLandscapeGate', () => ({ useLandscapeGate: () => false }))
jest.mock('../src/features/games/shadow-checkers/engine/checkersAiClient', () => ({
  chooseShadowCheckersAiMoveAsync: (state: CheckersBoardState, options: { signal?: AbortSignal }) => mockChooseMove(state, options),
  disposeSharedShadowCheckersAiClient: () => mockDispose(),
}))
jest.mock('../src/features/games/shadow-checkers/components/ShadowCheckersUnityBoard', () => ({
  ShadowCheckersUnityBoard: React.forwardRef(function MockBoard(props: any, ref) {
    React.useImperativeHandle(ref, () => ({ openCameraHelp: jest.fn(), toggleAccessibleBoard: jest.fn(), resetCamera: jest.fn() }))
    const firstHumanPiece = props.state.pieces.find((piece: { owner: string }) => piece.owner === 'player_one')
    return <div data-testid="solo-board" data-move-number={props.state.moveNumber} data-turn={props.state.turn} data-selected={props.selectedPieceId ?? ''} data-helpers={props.helperMoves.length}>
      {props.state.pieces.filter((piece: { owner: string }) => piece.owner === 'player_one').map((piece: { id: string }) => <button key={piece.id} onClick={() => props.onSelectPiece(piece)}>Select {piece.id}</button>)}
      <button type="button" onClick={() => props.onSelectPiece(firstHumanPiece)}>Select first piece</button>
      <button type="button" disabled={!props.legalMoves.length} onClick={() => props.onSelectMove(props.legalMoves[0])}>Make first move</button>
      <button type="button" onClick={() => props.onPresentationComplete(props.state)}>Present board</button>
    </div>
  }),
}))

function renderSolo(overrides: Partial<React.ComponentProps<typeof ShadowCheckersSoloScreen>> = {}) {
  return render(<ComfortProvider><ShadowCheckersSoloScreen difficulty="casual" onLeaveMode={jest.fn()} {...overrides} /></ComfortProvider>)
}

describe('Shadow Checkers solo game', () => {
  beforeEach(() => {
    mockChooseMove.mockReset()
    mockDispose.mockReset()
  })

  test('can deselect, switch pieces, and recover from choosing a piece barred by a mandatory jump', () => {
    const state = {
      ...checkers.createInitialBoard(),
      pieces: [
        { id: 'jump', owner: 'player_one' as const, row: 5, col: 0, king: false },
        { id: 'other-jump', owner: 'player_one' as const, row: 5, col: 4, king: false },
        { id: 'blocked', owner: 'player_one' as const, row: 7, col: 6, king: false },
        { id: 'victim', owner: 'player_two' as const, row: 4, col: 1, king: false },
        { id: 'other-victim', owner: 'player_two' as const, row: 4, col: 5, king: false },
      ],
    }
    const initial = jest.spyOn(checkers, 'createInitialBoard').mockReturnValue(state)
    try {
      renderSolo()
      const select = (id: string) => fireEvent.click(screen.getByRole('button', { name: `Select ${id}` }))
      const board = screen.getByTestId('solo-board')
      select('jump')
      select('other-jump')
      expect(board).toHaveAttribute('data-selected', 'other-jump')
      select('other-jump')
      expect(board).toHaveAttribute('data-selected', '')
      select('jump')
      select('blocked')
      expect(board).toHaveAttribute('data-selected', '')
      expect(board).toHaveAttribute('data-helpers', '2')
      select('other-jump')
      fireEvent.click(screen.getByRole('button', { name: /make first move/i }))
      expect(board).toHaveAttribute('data-move-number', '1')
    } finally { initial.mockRestore() }
  })

  test('waits for the human animation, then applies a legal computer reply', async () => {
    let resolveChoice: ((choice: ShadowCheckersAiChoice) => void) | undefined
    mockChooseMove.mockImplementation(state => new Promise(resolve => {
      const move = getLegalMoves(state, 'player_two')[0]
      resolveChoice = choice => resolve(choice)
      expect(move).toBeDefined()
    }))
    renderSolo()

    fireEvent.click(screen.getByRole('button', { name: /select first piece/i }))
    fireEvent.click(screen.getByRole('button', { name: /make first move/i }))
    expect(screen.getByTestId('solo-board')).toHaveAttribute('data-move-number', '1')
    expect(mockChooseMove).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: /present board/i }))
    await waitFor(() => expect(mockChooseMove).toHaveBeenCalledTimes(1))
    const aiState = mockChooseMove.mock.calls[0][0]
    const move = getLegalMoves(aiState, 'player_two')[0]
    await act(async () => resolveChoice?.({ move, difficulty: 'casual', depth: 2, nodes: 20, score: 0 }))

    await waitFor(() => expect(screen.getByTestId('solo-board')).toHaveAttribute('data-move-number', '2'))
    expect(screen.getByTestId('solo-board')).toHaveAttribute('data-turn', 'player_one')
    expect(screen.getByText(/your move/i)).toBeInTheDocument()
  })

  test('restart aborts outstanding computer work and restores the opening board', async () => {
    let signal: AbortSignal | undefined
    mockChooseMove.mockImplementation((_state, options) => {
      signal = options.signal
      return new Promise(() => {})
    })
    renderSolo()
    fireEvent.click(screen.getByRole('button', { name: /select first piece/i }))
    fireEvent.click(screen.getByRole('button', { name: /make first move/i }))
    fireEvent.click(screen.getByRole('button', { name: /present board/i }))
    await waitFor(() => expect(mockChooseMove).toHaveBeenCalledTimes(1))

    fireEvent.click(screen.getByRole('button', { name: /open solo game menu/i }))
    fireEvent.click(screen.getByRole('button', { name: /restart game/i }))
    expect(signal?.aborted).toBe(true)
    expect(screen.getByTestId('solo-board')).toHaveAttribute('data-move-number', '0')
    expect(screen.getByTestId('solo-board')).toHaveAttribute('data-turn', 'player_one')
  })

  test('closes the solo menu with Escape and returns focus to its toggle', () => {
    renderSolo()
    const toggle = screen.getByRole('button', { name: /open solo game menu/i })
    fireEvent.click(toggle)
    const menu = screen.getByRole('region', { name: /solo game menu/i })
    fireEvent.keyDown(menu, { key: 'Escape' })
    expect(screen.queryByRole('region', { name: /solo game menu/i })).not.toBeInTheDocument()
    expect(toggle).toHaveFocus()
  })

  test('traps result focus and dismisses the modal with Escape', async () => {
    renderSolo()
    fireEvent.click(screen.getByRole('button', { name: /open solo game menu/i }))
    fireEvent.click(screen.getByRole('button', { name: /concede game/i }))
    fireEvent.click(screen.getByRole('button', { name: /present board/i }))
    const dialog = await screen.findByRole('dialog', { name: /solo game result/i })
    const dismiss = screen.getByRole('button', { name: /dismiss result/i })
    await waitFor(() => expect(dismiss).toHaveFocus())
    const last = screen.getByRole('button', { name: /choose mode/i })
    last.focus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(dismiss).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(dialog).not.toBeInTheDocument()
  })
})
