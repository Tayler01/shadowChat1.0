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

test('presentation completion requires the current snapshot from its own frame and falls back without Unity', () => {
  const state = createInitialBoard()
  const onPresentationComplete = jest.fn()
  const { rerender } = render(<ComfortProvider><ShadowCheckersUnityBoard state={state} legalMoves={[]} onPresentationComplete={onPresentationComplete} /></ComfortProvider>)
  const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  const post = jest.spyOn(iframe.contentWindow!, 'postMessage')
  const receive = (data: object, source: Window = iframe.contentWindow!) => act(() => {window.dispatchEvent(new MessageEvent('message', {origin:location.origin,source,data:{version:1,...data}}))})
  receive({type:'ready'})
  const revision = post.mock.calls.filter(call => call[0].type === 'snapshot').slice(-1)[0][0].value.revision
  receive({type:'presented',revision},window)
  receive({type:'presented',revision:'stale'})
  expect(onPresentationComplete).not.toHaveBeenCalled()
  receive({type:'presented',revision})
  expect(onPresentationComplete).toHaveBeenLastCalledWith(state)
  onPresentationComplete.mockClear()
  const finished = {...state,winner:'player_one' as const}
  rerender(<ComfortProvider><ShadowCheckersUnityBoard state={finished} legalMoves={[]} onPresentationComplete={onPresentationComplete} /></ComfortProvider>)
  receive({type:'presented',revision})
  expect(onPresentationComplete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button',{name:'Accessible board'}))
  expect(onPresentationComplete).toHaveBeenLastCalledWith(finished)
  post.mockRestore()
})

test('a Unity load failure releases results without waiting for an animation timeout', () => {
  const state = {...createInitialBoard(),winner:'player_one' as const}
  const onPresentationComplete = jest.fn()
  render(<ComfortProvider><ShadowCheckersUnityBoard state={state} legalMoves={[]} onPresentationComplete={onPresentationComplete} /></ComfortProvider>)
  const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  act(() => {window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:iframe.contentWindow,data:{version:1,type:'error'}}))})
  expect(onPresentationComplete).toHaveBeenCalledWith(state)
})

test('graphics failure removes the old player and retry sends the latest match state', () => {
  const state = createInitialBoard()
  const onSelectPiece = jest.fn()
  const props = { state, viewerSlot: 'player_one' as const, legalMoves: [], onSelectPiece }
  const { rerender } = render(<ComfortProvider><ShadowCheckersUnityBoard {...props} /></ComfortProvider>)
  const oldFrame = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  const oldWindow = oldFrame.contentWindow!
  const emit = (source: Window, data: object) => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source, data: { version: 1, ...data } }))
  act(() => { emit(oldWindow, { type: 'ready' }); emit(oldWindow, { type: 'cinematic', busy: true, stage: 'intro' }) })
  expect(screen.getByRole('button', { name: 'Skip room reveal' })).toBeInTheDocument()
  act(() => {
    emit(oldWindow, { type: 'error' })
    emit(oldWindow, { type: 'ready' })
  })
  expect(screen.queryByTitle('Shadow Checkers 3D board')).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: 'Skip room reveal' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Camera help' }))
  expect(screen.getByRole('button', { name: 'Overhead' })).toBeDisabled()
  const updated = { ...state, pieces: state.pieces.slice(1) }
  rerender(<ComfortProvider><ShadowCheckersUnityBoard {...props} state={updated} /></ComfortProvider>)
  fireEvent.click(screen.getByRole('button', { name: 'Retry 3D table' }))
  const newFrame = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  expect(newFrame).not.toBe(oldFrame)
  const post = jest.spyOn(newFrame.contentWindow!, 'postMessage')
  act(() => emit(oldWindow, { type: 'ready' }))
  expect(post).not.toHaveBeenCalled()
  act(() => emit(newFrame.contentWindow!, { type: 'ready' }))
  const snapshot = post.mock.calls.find(call => call[0].type === 'snapshot')![0].value
  expect(snapshot.pieces).toEqual(updated.pieces)
  act(() => emit(oldWindow, { type: 'square', revision: snapshot.revision, row: 5, col: 0 }))
  expect(onSelectPiece).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Overhead' })).toBeEnabled()
})

test('camera gestures are isolated from moves, suppressed during cinematics, and controls are in help', () => {
  const onSelectPiece = jest.fn()
  render(<ComfortProvider><ShadowCheckersUnityBoard state={createInitialBoard()} legalMoves={[]} onSelectPiece={onSelectPiece}/></ComfortProvider>)
  const iframe=screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
  const post=jest.spyOn(iframe.contentWindow!,'postMessage')
  const emit=(data:object)=>act(()=>window.dispatchEvent(new MessageEvent('message',{origin:location.origin,source:iframe.contentWindow,data:{version:1,...data}})))
  emit({type:'ready'})
  const camera=screen.getByRole('group',{name:/Camera: drag/})
  expect(camera).toBeEmptyDOMElement()
  fireEvent.keyDown(camera,{key:'ArrowRight'})
  expect(post).toHaveBeenLastCalledWith(expect.objectContaining({type:'cameraGesture',value:{turn:.04}}),location.origin)
  expect(onSelectPiece).not.toHaveBeenCalled()
  expect(screen.queryByRole('button',{name:'Rotate table left'})).not.toBeInTheDocument()
  expect(screen.queryByRole('button',{name:'Overhead'})).not.toBeInTheDocument()
  emit({type:'cinematic',busy:true,stage:'intro'})
  post.mockClear();fireEvent.keyDown(camera,{key:'ArrowRight'})
  expect(post).not.toHaveBeenCalled()
  emit({type:'cinematic',busy:false,stage:'ready'})
  fireEvent.click(screen.getByRole('button',{name:'Camera help'}))
  expect(camera).toHaveAttribute('aria-disabled','true')
  fireEvent.click(screen.getByRole('button',{name:'Reset table camera'}))
  expect(post).toHaveBeenLastCalledWith(expect.objectContaining({type:'camera',value:'reset'}),location.origin)
  expect(screen.queryByRole('region',{name:'Camera help panel'})).not.toBeInTheDocument()
})

test.each(['portrait', 'background'] as const)('rejects stale move input while paused by %s and accepts it after resume', reason => {
  const state = createInitialBoard()
  const onSelectMove = jest.fn()
  const hidden = jest.spyOn(document, 'hidden', 'get').mockReturnValue(reason === 'background')
  const props = { state, viewerSlot: 'player_one' as const, selectedPieceId: 'p1-5-0', legalMoves: getLegalMoves(state, 'player_one', 'p1-5-0'), onSelectMove }
  try {
    const { rerender } = render(<ComfortProvider><ShadowCheckersUnityBoard {...props} paused={reason === 'portrait'} /></ComfortProvider>)
    const iframe = screen.getByTitle('Shadow Checkers 3D board') as HTMLIFrameElement
    const post = jest.spyOn(iframe.contentWindow!, 'postMessage')
    act(() => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, type: 'ready' } })))
    expect(post.mock.calls[0][0]).toMatchObject({ type: 'paused', value: true })
    const snapshot = post.mock.calls.find(call => call[0].type === 'snapshot')![0].value
    const move = () => window.dispatchEvent(new MessageEvent('message', { origin: location.origin, source: iframe.contentWindow, data: { version: 1, type: 'square', revision: snapshot.revision, row: 4, col: 1 } }))
    act(move)
    expect(onSelectMove).not.toHaveBeenCalled()
    hidden.mockReturnValue(false)
    rerender(<ComfortProvider><ShadowCheckersUnityBoard {...props} paused={false} /></ComfortProvider>)
    act(() => document.dispatchEvent(new Event('visibilitychange')))
    act(move)
    expect(onSelectMove).toHaveBeenCalledTimes(1)
  } finally { hidden.mockRestore() }
})
