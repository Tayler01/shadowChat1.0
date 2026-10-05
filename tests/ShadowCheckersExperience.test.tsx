import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowCheckersExperience } from '../src/features/games/shadow-checkers/ShadowCheckersExperience'

jest.mock('../src/features/games/shared/useLandscapeGate', () => ({ useLandscapeGate: () => false }))
jest.mock('../src/features/games/shadow-checkers/ShadowCheckersScreen', () => ({
  ShadowCheckersScreen: ({ initialMatchId, onExit }: { initialMatchId?: string; onExit?: () => void }) => (
    <section aria-label="mock multiplayer"><span>Multiplayer {initialMatchId ?? 'lobby'}</span><button type="button" onClick={onExit}>Leave multiplayer</button></section>
  ),
}))
jest.mock('../src/features/games/shadow-checkers/ShadowCheckersSoloScreen', () => ({
  ShadowCheckersSoloScreen: ({ difficulty, onLeaveMode }: { difficulty: string; onLeaveMode: () => void }) => (
    <section aria-label="mock solo"><span>Solo {difficulty}</span><button type="button" onClick={onLeaveMode}>Leave solo</button></section>
  ),
}))

describe('Shadow Checkers mode selection', () => {
  function mockFullscreen() {
    const originals = [
      [HTMLElement.prototype, 'requestFullscreen'], [document, 'fullscreenElement'],
      [document, 'exitFullscreen'], [window.screen, 'orientation'],
    ] as const
    const descriptors = originals.map(([owner, key]) => Object.getOwnPropertyDescriptor(owner, key))
    let fullscreenElement: Element | null = null
    const setElement = (element: Element | null) => { fullscreenElement = element }
    const request = jest.fn(function (this: HTMLElement) { setElement(this); return Promise.resolve() })
    const exit = jest.fn(() => { fullscreenElement = null; return Promise.resolve() })
    const lock = jest.fn(() => Promise.resolve())
    const unlock = jest.fn()
    Object.defineProperty(HTMLElement.prototype, 'requestFullscreen', { configurable: true, value: request })
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreenElement })
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit })
    Object.defineProperty(window.screen, 'orientation', { configurable: true, value: { lock, unlock } })
    return {
      request, exit, lock, unlock,
      setElement,
      restore: () => originals.forEach(([owner, key], index) => {
        const descriptor = descriptors[index]
        if (descriptor) Object.defineProperty(owner, key, descriptor)
        else Reflect.deleteProperty(owner, key)
      }),
    }
  }

  test('keeps the fullscreen element mounted through solo, multiplayer, and mode changes', async () => {
    const fullscreen = mockFullscreen()
    const view = render(<ShadowCheckersExperience />)
    try {
      const root = view.container.firstElementChild
      await waitFor(() => expect(fullscreen.lock).toHaveBeenCalledWith('landscape'))
      fireEvent.click(screen.getByRole('button', { name: /play computer/i }))
      fireEvent.click(screen.getByRole('button', { name: /enter the study/i }))
      expect(root).toContainElement(screen.getByLabelText('mock solo'))
      expect(view.container.firstElementChild).toBe(root)
      fireEvent.click(screen.getByRole('button', { name: /leave solo/i }))
      fireEvent.click(screen.getByRole('button', { name: /play a person/i }))
      expect(root).toContainElement(await screen.findByLabelText('mock multiplayer'))
      fireEvent.click(screen.getByRole('button', { name: /leave multiplayer/i }))
      expect(view.container.firstElementChild).toBe(root)
      expect(document.fullscreenElement).toBe(root)
      expect(fullscreen.request).toHaveBeenCalledTimes(1)
      expect(fullscreen.exit).not.toHaveBeenCalled()
      view.unmount()
      expect(fullscreen.exit).toHaveBeenCalledTimes(1)
      expect(fullscreen.unlock).toHaveBeenCalledTimes(1)
    } finally { view.unmount(); fullscreen.restore() }
  })

  test('does not close or unlock another surface that has taken fullscreen', async () => {
    const fullscreen = mockFullscreen()
    const view = render(<ShadowCheckersExperience />)
    try {
      await waitFor(() => expect(fullscreen.lock).toHaveBeenCalledTimes(1))
      fullscreen.setElement(document.body)
      view.unmount()
      expect(fullscreen.exit).not.toHaveBeenCalled()
      expect(fullscreen.unlock).not.toHaveBeenCalled()
    } finally { view.unmount(); fullscreen.restore() }
  })

  test('cleans up a fullscreen request that completes after leaving the game', async () => {
    const fullscreen = mockFullscreen()
    let finish: (() => void) | undefined
    const deferRequest = (root: HTMLElement) => new Promise<void>(resolve => {
      finish = () => { fullscreen.setElement(root); resolve() }
    })
    fullscreen.request.mockImplementation(function (this: HTMLElement) {
      return deferRequest(this)
    })
    const view = render(<ShadowCheckersExperience />)
    try {
      view.unmount()
      await act(async () => finish?.())
      expect(fullscreen.exit).toHaveBeenCalledTimes(1)
      expect(fullscreen.lock).not.toHaveBeenCalled()
    } finally { view.unmount(); fullscreen.restore() }
  })

  test('releases an orientation lock that completes after leaving the game', async () => {
    const fullscreen = mockFullscreen()
    let finish: (() => void) | undefined
    fullscreen.lock.mockImplementation(() => new Promise<void>(resolve => { finish = resolve }))
    const view = render(<ShadowCheckersExperience />)
    try {
      await waitFor(() => expect(fullscreen.lock).toHaveBeenCalledTimes(1))
      view.unmount()
      await act(async () => finish?.())
      expect(fullscreen.exit).toHaveBeenCalledTimes(1)
      expect(fullscreen.unlock).toHaveBeenCalledTimes(1)
    } finally { view.unmount(); fullscreen.restore() }
  })

  test('offers solo and multiplayer without mounting either game early', () => {
    render(<ShadowCheckersExperience />)
    expect(screen.getByRole('button', { name: /play computer/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play a person/i })).toBeInTheDocument()
    expect(screen.queryByLabelText('mock solo')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('mock multiplayer')).not.toBeInTheDocument()
  })

  test('selects one of four difficulties and returns to mode selection', () => {
    render(<ShadowCheckersExperience />)
    fireEvent.click(screen.getByRole('button', { name: /play computer/i }))
    const levels = screen.getAllByRole('radio')
    expect(levels).toHaveLength(4)
    fireEvent.click(screen.getByRole('radio', { name: /master/i }))
    fireEvent.click(screen.getByRole('button', { name: /enter the study/i }))
    expect(screen.getByText('Solo master')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /leave solo/i }))
    expect(screen.getByRole('button', { name: /play computer/i })).toBeInTheDocument()
  })

  test('opens multiplayer on demand and deep links bypass the chooser', async () => {
    const view = render(<ShadowCheckersExperience />)
    fireEvent.click(screen.getByRole('button', { name: /play a person/i }))
    expect(await screen.findByText('Multiplayer lobby')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /leave multiplayer/i }))
    expect(screen.getByRole('button', { name: /play a person/i })).toBeInTheDocument()

    view.rerender(<ShadowCheckersExperience initialMatchId="match-42" />)
    expect(await screen.findByText('Multiplayer match-42')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /play computer/i })).not.toBeInTheDocument()
  })
})
