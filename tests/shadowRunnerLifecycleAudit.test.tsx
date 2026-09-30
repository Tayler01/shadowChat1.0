import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowRunnerGame } from '../src/features/games/shadow-runner/ShadowRunnerGame'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { SHADOW_RUNNER_LEVEL_CONFIGS } from '../src/features/games/shadow-runner/game/levels'
import { createInitialShadowRunnerSimulation, getShadowRunnerHudState } from '../src/features/games/shadow-runner/game/simulation'

jest.mock('../src/hooks/useComfortPreferences', () => ({ useComfortPreferences: () => ({ isReducedMotion: false }) }))
jest.mock('../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame', () => ({ createShadowRunnerPhaserGame: jest.fn() }))

const createGame = jest.mocked(createShadowRunnerPhaserGame)

beforeEach(() => {
  jest.clearAllMocks()
  createGame.mockReturnValue({ setPaused: jest.fn(), setReducedMotion: jest.fn(), destroy: jest.fn() } as unknown as ReturnType<typeof createShadowRunnerPhaserGame>)
})

afterEach(() => {
  cleanup()
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test.each([false, true].flatMap(failed => ['blur', 'hidden', 'portrait'].map(interruption => ({ failed, interruption }))))(
  '$interruption leaves only the required loader dialog when failed=$failed', async ({ failed, interruption }) => {
  render(<ShadowRunnerGame levelId="tutorial" />)
  await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
  if (failed) act(() => createGame.mock.calls[0][0].onLoadError?.(new Error('Required image failed')))

  if (interruption === 'blur') fireEvent.blur(window)
  if (interruption === 'hidden') {
    jest.spyOn(document, 'hidden', 'get').mockReturnValue(true)
    fireEvent(document, new Event('visibilitychange'))
  }
  if (interruption === 'portrait') {
    jest.spyOn(window, 'innerWidth', 'get').mockReturnValue(390)
    jest.spyOn(window, 'innerHeight', 'get').mockReturnValue(844)
    fireEvent.resize(window)
  }

  expect(screen.getByRole('dialog', { name: failed ? 'Route unavailable' : 'Loading route' })).toBeInTheDocument()
  expect(screen.getAllByRole('dialog').length).toBe(1)
})

test.each(['external suspension', 'pause menu'])('finale does not advance behind %s', async interruption => {
  const view = render(<ShadowRunnerGame levelId="level-10" />)
  await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
  act(() => createGame.mock.calls[0][0].onReady?.())
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
  const hud = getShadowRunnerHudState(createInitialShadowRunnerSimulation(level), level.coins.length, 0)
  const firstBeat = level.finale!.beats[0]
  jest.useFakeTimers()
  act(() => createGame.mock.calls[0][0].onHudChange({ ...hud, defeated: true }))
  expect(screen.queryByRole('heading', { name: firstBeat.title })).toBeInTheDocument()

  if (interruption === 'external suspension') view.rerender(<ShadowRunnerGame levelId="level-10" suspended />)
  else fireEvent.blur(window)
  act(() => jest.advanceTimersByTime(firstBeat.durationMs + 1))
  if (interruption === 'external suspension') view.rerender(<ShadowRunnerGame levelId="level-10" />)
  else fireEvent.click(screen.getByRole('button', { name: 'Resume' }))

  expect(screen.queryByRole('heading', { name: firstBeat.title })).toBeInTheDocument()
})
