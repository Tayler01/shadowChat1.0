import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShadowRunnerGame } from '../src/features/games/shadow-runner/ShadowRunnerGame'
import { createShadowRunnerPhaserGame } from '../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame'
import { SHADOW_RUNNER_LEVEL_CONFIGS, type ShadowRunnerPlayableLevelId } from '../src/features/games/shadow-runner/game/levels'
import { createInitialShadowRunnerSimulation, getShadowRunnerHudState } from '../src/features/games/shadow-runner/game/simulation'

jest.mock('../src/hooks/useComfortPreferences', () => ({ useComfortPreferences: () => ({ isReducedMotion: true }) }))
jest.mock('../src/features/games/shadow-runner/game/createShadowRunnerPhaserGame', () => ({ createShadowRunnerPhaserGame: jest.fn() }))

const createGame = jest.mocked(createShadowRunnerPhaserGame)
const pause = jest.fn()
const resume = jest.fn()
const setPaused = jest.fn((value: boolean) => value ? pause('ShadowRunnerLevelScene') : resume('ShadowRunnerLevelScene'))
const destroy = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  createGame.mockReturnValue({ setPaused, setReducedMotion: jest.fn(), destroy } as unknown as ReturnType<typeof createShadowRunnerPhaserGame>)
})

async function ready(index = 0) {
  await waitFor(() => expect(createGame).toHaveBeenCalledTimes(index + 1))
  act(() => createGame.mock.calls[index][0].onReady?.())
}

function finish(levelId: ShadowRunnerPlayableLevelId, index = 0) {
  const level = SHADOW_RUNNER_LEVEL_CONFIGS[levelId]
  const state = createInitialShadowRunnerSimulation(level)
  const hud = getShadowRunnerHudState(state, level.coins.length, 0)
  act(() => createGame.mock.calls[index][0].onHudChange({ ...hud, defeated: true,
    ...(level.finishInteraction ? { deliveryState: 'delivered' as const } : {}) }))
}

test('briefing pauses the game until explicit start, then keyboard pause resumes safely', async () => {
  render(<ShadowRunnerGame levelId="tutorial" />)
  await ready()
  expect(screen.getByRole('button', { name: 'Begin delivery' })).toBeInTheDocument()
  expect(pause).toHaveBeenCalledWith('ShadowRunnerLevelScene')
  expect(screen.queryByRole('button', { name: 'Move right' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  expect(resume).toHaveBeenCalledWith('ShadowRunnerLevelScene')
  fireEvent.click(screen.getByRole('button', { name: 'Open pause menu' }), { detail: 0 })
  expect(screen.getByRole('dialog', { name: 'Pause' })).toBeInTheDocument()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Resume' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog', { name: 'Pause' })).not.toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Move right' })).toBeInTheDocument()
})

test('route changes never credit the old victory to a new level and retry is always available', async () => {
  const complete = jest.fn()
  const view = render(<ShadowRunnerGame levelId="level-1" nextLevelId="level-2" onPlayLevel={() => {}} onLevelComplete={complete} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  finish('level-1')
  expect(complete).toHaveBeenCalledTimes(1)
  expect(complete.mock.calls[0][0]).toBe('level-1')
  expect(screen.getByRole('button', { name: 'Retry Route' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Next Route' })).toBeInTheDocument()
  view.rerender(<ShadowRunnerGame levelId="level-2" onLevelComplete={complete} />)
  await ready(1)
  expect(complete).toHaveBeenCalledTimes(1)
  finish('level-1', 0)
  expect(complete).toHaveBeenCalledTimes(1)
  finish('level-2', 1)
  expect(complete).toHaveBeenCalledTimes(2)
  expect(complete.mock.calls[1][0]).toBe('level-2')
})

test('engine failure offers retry and an exit', async () => {
  const back = jest.fn()
  createGame.mockImplementationOnce(() => { throw new Error('Failed to prepare route') })
  render(<ShadowRunnerGame levelId="tutorial" onBackToMap={back} />)
  expect(await screen.findByRole('dialog', { name: 'Route unavailable' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Return to Map' }))
  expect(back).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await ready(1)
  expect(screen.queryByRole('dialog', { name: 'Route unavailable' })).not.toBeInTheDocument()
})

test('required runtime asset failures never report readiness and can be retried', async () => {
  render(<ShadowRunnerGame levelId="tutorial" />)
  await waitFor(() => expect(createGame).toHaveBeenCalledTimes(1))
  act(() => createGame.mock.calls[0][0].onLoadError?.(new Error('Required image failed')))
  expect(screen.getByRole('dialog', { name: 'Route unavailable' })).toHaveTextContent('Required image failed')
  expect(screen.queryByRole('button', { name: 'Begin delivery' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await ready(1)
  expect(destroy).toHaveBeenCalledTimes(1)
  expect(screen.queryByRole('dialog', { name: 'Route unavailable' })).not.toBeInTheDocument()
})

test('cinematic replay does not submit another completion or restart gameplay', async () => {
  const complete = jest.fn()
  render(<ShadowRunnerGame levelId="level-10" onLevelComplete={complete} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  finish('level-10')
  expect(complete).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: 'Follow the signal' }))
  fireEvent.click(screen.getByRole('button', { name: 'See the dawn' }))
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
  fireEvent.click(screen.getByRole('button', { name: 'View Results' }))
  fireEvent.click(screen.getByRole('button', { name: 'Replay ending' }))
  expect(screen.getByRole('button', { name: 'Follow the signal' })).toBeInTheDocument()
  expect(complete).toHaveBeenCalledTimes(1)
  expect(createGame).toHaveBeenCalledTimes(1)
  expect(setPaused).toHaveBeenLastCalledWith(true)
})

test('world ignition stays playable before the press and never saves or opens the cinematic before delivery', async () => {
  const complete = jest.fn()
  render(<ShadowRunnerGame levelId="level-10" onLevelComplete={complete} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  const level = SHADOW_RUNNER_LEVEL_CONFIGS['level-10']
  const hud = getShadowRunnerHudState(createInitialShadowRunnerSimulation(level), level.coins.length, 0)
  act(() => createGame.mock.calls[0][0].onHudChange({ ...hud, deliveryState: 'ready' }))
  expect(screen.getByRole('button', { name: 'Ignite relay' })).not.toBeDisabled()
  expect(screen.queryByRole('dialog', { name: 'Dawn Relay Spire finale' })).not.toBeInTheDocument()
  expect(complete).not.toHaveBeenCalled()
  act(() => createGame.mock.calls[0][0].onHudChange({ ...hud, deliveryState: 'igniting' }))
  expect(screen.getByRole('button', { name: 'Ignite relay' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Move right' })).toBeDisabled()
  expect(screen.getByRole('button', { name: 'Open pause menu' })).not.toBeDisabled()
  expect(complete).not.toHaveBeenCalled()
  finish('level-10')
  expect(complete).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog', { name: 'Dawn Relay Spire finale' })).toBeInTheDocument()
})

test('pause sound setting exposes its state and cannot override Comfort', async () => {
  const toggle = jest.fn()
  const view = render(<ShadowRunnerGame levelId="tutorial" soundEffectsEnabled onToggleSoundEffects={toggle} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open pause menu' }))
  expect(screen.getByRole('checkbox', { name: 'Sound effects' })).toBeChecked()
  fireEvent.click(screen.getByRole('checkbox', { name: 'Sound effects' }))
  expect(toggle).toHaveBeenCalledTimes(1)
  view.rerender(<ShadowRunnerGame levelId="tutorial" soundEffectsEnabled soundEffectsAllowed={false} onToggleSoundEffects={toggle} />)
  expect(screen.getByRole('checkbox', { name: /Sound effects/ })).toBeDisabled()
  expect(screen.getByRole('checkbox', { name: /Sound effects/ })).not.toBeChecked()
})

test('earned moments open a paused journal and stale scenes cannot add discoveries', async () => {
  const discover = jest.fn()
  const view = render(<ShadowRunnerGame levelId="tutorial" onStoryDiscover={discover} />)
  await ready()
  fireEvent.click(screen.getByRole('button', { name: 'Begin delivery' }))
  act(() => createGame.mock.calls[0][0].onStoryMoment?.('tutorial-courier-mark'))
  expect(discover).toHaveBeenCalledWith('tutorial', 'tutorial-courier-mark')
  fireEvent.click(screen.getByRole('button', { name: 'The Courier Mark' }))
  expect(screen.getByRole('dialog', { name: 'Courier journal' })).toHaveTextContent('The old road still bears the courier seal')
  expect(setPaused).toHaveBeenLastCalledWith(true)
  view.rerender(<ShadowRunnerGame levelId="level-1" onStoryDiscover={discover} />)
  await ready(1)
  act(() => createGame.mock.calls[0][0].onStoryMoment?.('tutorial-waiting-gate'))
  expect(discover).toHaveBeenCalledTimes(1)
})
