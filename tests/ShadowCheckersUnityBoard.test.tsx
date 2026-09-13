import { fireEvent, render, screen, act } from '@testing-library/react'
import { ComfortProvider } from '../src/hooks/useComfortPreferences'
import { ShadowCheckersUnityBoard } from '../src/features/games/shadow-checkers/components/ShadowCheckersUnityBoard'
import { createInitialBoard, getLegalMoves } from '../src/features/games/shadow-checkers/engine/checkers'

test('rejects messages from another frame and releases Unity for accessible controls', () => {
  render(<ComfortProvider><ShadowCheckersUnityBoard state={createInitialBoard()} viewerSlot="player_one" legalMoves={[]} /></ComfortProvider>)
  const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: window, data: { version: 1, type: 'ready' } })))
  expect(screen.getByText('Preparing your table')).toBeInTheDocument()
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, type: 'ready' } })))
  expect(screen.queryByText('Preparing your table')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Accessible board' }))
  expect(screen.queryByTitle('Shadow Checkers 3D board')).not.toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /player_one piece/ })).toHaveLength(12)
})

test('locks duplicate move input before React or server state changes', () => {
  const state = createInitialBoard()
  const onSelectMove = jest.fn()
  render(<ComfortProvider><ShadowCheckersUnityBoard state={state} viewerSlot="player_one" selectedPieceId="p1-5-0" legalMoves={getLegalMoves(state, 'player_one', 'p1-5-0')} onSelectMove={onSelectMove} /></ComfortProvider>)
  const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  const post = jest.spyOn(iframe.contentWindow!, 'postMessage')
  act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, type: 'ready' } })))
  const snapshot = post.mock.calls.find(call => call[0].type === 'snapshot')![0].value
  const move = () => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, type: 'square', revision: snapshot.revision, row: 4, col: 1 } }))
  act(() => { move(); move() })
  expect(onSelectMove).toHaveBeenCalledTimes(1)
})
