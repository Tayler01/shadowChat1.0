import React from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { useAuth } from '../src/hooks/useAuth'
import { useComfortPreferences } from '../src/hooks/useComfortPreferences'
import { ShadowRunnerScreen } from '../src/features/games/shadow-runner/ShadowRunnerScreen'
import { shadowRunnerProgressApi } from '../src/features/games/shadow-runner/progressApi'
import { loadShadowRunnerImages } from '../src/features/games/shadow-runner/loading'
import { createShadowRunnerSfxController, SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY } from '../src/features/games/shadow-runner/audio'
import { SHADOW_RUNNER_ASSETS } from '../src/features/games/shadow-runner/assets/manifest'
import { createShadowRunnerProgressStore, type ShadowRunnerRun } from '../src/features/games/shadow-runner/progress'

jest.mock('../src/hooks/useAuth', () => ({ useAuth: jest.fn() }))
jest.mock('../src/hooks/useComfortPreferences', () => ({ useComfortPreferences: jest.fn() }))
jest.mock('../src/features/games/shadow-runner/progressApi', () => ({ shadowRunnerProgressApi: { read: jest.fn(), record: jest.fn() } }))
jest.mock('../src/features/games/shadow-runner/loading', () => ({ loadShadowRunnerImages: jest.fn() }))
jest.mock('../src/features/games/shadow-runner/audio', () => ({
  ...jest.requireActual('../src/features/games/shadow-runner/audio'),
  createShadowRunnerSfxController: jest.fn(),
}))
jest.mock('../src/features/games/shadow-runner/ShadowRunnerGame', () => ({
  ShadowRunnerGame: ({ onLevelComplete }: { onLevelComplete: (id: string, run: ShadowRunnerRun) => void }) => (
    <button type="button" onClick={() => onLevelComplete('tutorial', { score: 500, coinsCollected: 2, totalCoins: 2, enemiesDefeated: 1, totalEnemies: 1, fullClear: true, perfectRoute: true })}>Finish mocked route</button>
  ),
}))

const auth = jest.mocked(useAuth)
const api = jest.mocked(shadowRunnerProgressApi)
const load = jest.mocked(loadShadowRunnerImages)
const createSfx = jest.mocked(createShadowRunnerSfxController)
const setOwner = (id: string | null) => auth.mockReturnValue({ user: id ? { id } : null, loading: false } as ReturnType<typeof useAuth>)

describe('Shadow Runner progress and loader screen integration', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    localStorage.clear()
    setOwner('alice')
    jest.mocked(useComfortPreferences).mockReturnValue({ effectivePreferences: { gameSfx: true, gameMusic: true }, isReducedMotion: true } as ReturnType<typeof useComfortPreferences>)
    api.read.mockResolvedValue([])
    api.record.mockResolvedValue(undefined)
    load.mockResolvedValue(undefined)
    createSfx.mockReturnValue({ preload: jest.fn(() => new Promise(() => undefined)), play: jest.fn(), dispose: jest.fn(), getStatus: jest.fn() })
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: jest.fn().mockImplementation(() => ({ matches: true, addEventListener: jest.fn(), removeEventListener: jest.fn() })) })
  })

  it('starts a route with sound disabled without constructing or waiting for SFX', async () => {
    localStorage.setItem(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY, 'false')
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Tutorial' }))
    expect(await screen.findByRole('button', { name: 'Finish mocked route' })).toBeInTheDocument()
    expect(createSfx).not.toHaveBeenCalled()
  })

  it('never waits for a hanging optional sound preload before entering gameplay', async () => {
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Tutorial' }))
    expect(await screen.findByRole('button', { name: 'Finish mocked route' })).toBeInTheDocument()
    expect(createSfx).toHaveBeenCalledTimes(1)
  })

  it('respects live Comfort music and SFX policy without overwriting local preferences', async () => {
    const onPlayMusic = jest.fn()
    const onPauseMusic = jest.fn()
    const view = render(<ShadowRunnerScreen onPlayMusic={onPlayMusic} onPauseMusic={onPauseMusic} />)
    await screen.findByRole('button', { name: 'Start Tutorial' })
    expect(onPlayMusic).toHaveBeenCalled()
    onPlayMusic.mockClear()
    const previous = createSfx.mock.results[0].value
    jest.mocked(useComfortPreferences).mockReturnValue({ effectivePreferences: { gameSfx: false, gameMusic: false }, isReducedMotion: true } as ReturnType<typeof useComfortPreferences>)
    view.rerender(<ShadowRunnerScreen onPlayMusic={onPlayMusic} onPauseMusic={onPauseMusic} />)
    expect(previous.dispose).toHaveBeenCalled()
    expect(onPauseMusic).toHaveBeenCalled()
    expect(onPlayMusic).not.toHaveBeenCalled()
    expect(localStorage.getItem(SHADOW_RUNNER_SFX_ENABLED_STORAGE_KEY)).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Options' }))
    expect(screen.getByRole('checkbox', { name: /Music/ })).toBeDisabled()
    expect(onPlayMusic).not.toHaveBeenCalled()
    expect(createSfx).toHaveBeenCalledTimes(1)
  })

  it('does not intercept dialog selection or context menus at the Screen ancestor', async () => {
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Options' }))
    const dialog = await screen.findByRole('dialog')
    const selection = new Event('selectstart', { bubbles: true, cancelable: true })
    dialog.dispatchEvent(selection)
    expect(selection.defaultPrevented).toBe(false)
    const context = new Event('contextmenu', { bubbles: true, cancelable: true })
    dialog.dispatchEvent(context)
    expect(context.defaultPrevented).toBe(false)
    expect(dialog.closest('section')).not.toHaveClass('shadow-runner-no-select')
  })

  it('leaves runtime image loading to Phaser without a duplicate React preload', async () => {
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Tutorial' }))
    expect(await screen.findByRole('button', { name: 'Finish mocked route' })).toBeInTheDocument()
    expect(load.mock.calls.every(([sources]) => !sources.includes(SHADOW_RUNNER_ASSETS.hero.runStrip))).toBe(true)
  })

  it('offers Back and Retry when title art fails', async () => {
    load.mockRejectedValue(new Error('Title art unavailable'))
    const onExit = jest.fn()
    render(<ShadowRunnerScreen onExit={onExit} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Title art unavailable')
    expect(screen.queryByRole('button', { name: 'Start Tutorial' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onExit).toHaveBeenCalledTimes(1)
    load.mockResolvedValue(undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(await screen.findByRole('button', { name: 'Start Tutorial' })).toBeInTheDocument()
  })

  it('ends the old route and shows only the new account after switching', async () => {
    const view = render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Tutorial' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish mocked route' }))
    await waitFor(() => expect(api.record).toHaveBeenCalledTimes(1))
    expect(api.record.mock.calls[0][0]).toBe('alice')
    setOwner('bob')
    view.rerender(<ShadowRunnerScreen />)
    expect(screen.queryByRole('button', { name: 'Finish mocked route' })).not.toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Start Tutorial' })).toBeInTheDocument()
    await waitFor(() => expect(api.read).toHaveBeenCalledWith('bob', expect.any(AbortSignal)))
    const progress = createShadowRunnerProgressStore('bob', api).getSnapshot().progress
    expect(progress.levels).toEqual({})
    expect(api.record.mock.calls.every(call => call[0] === 'alice')).toBe(true)
  })

  it('allows replay of a restored server completion even when an earlier ledger row is absent', async () => {
    api.read.mockResolvedValue([{ ownerId: 'alice', levelId: 'level-3', completedAt: '2026-09-08', score: 500, coinsCollected: 2, totalCoins: 3, enemiesDefeated: 1, totalEnemies: 2 }])
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Select Level' }))
    fireEvent.click(await screen.findByRole('button', { name: /details, Cleared/ }))
    expect(screen.getByRole('button', { name: 'Replay' })).toBeEnabled()
    expect(api.record).not.toHaveBeenCalled()
  })

  it('exposes a failed completion and retries on the online event', async () => {
    api.record.mockRejectedValue(new Error('offline'))
    render(<ShadowRunnerScreen />)
    fireEvent.click(await screen.findByRole('button', { name: 'Start Tutorial' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Finish mocked route' }))
    expect(await screen.findByText('Save needs attention')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Save details' }))
    expect(await screen.findByText(/Completion sync failed/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Retry save' })).toBeInTheDocument()
    api.record.mockResolvedValue(undefined)
    await act(async () => { window.dispatchEvent(new Event('online')) })
    await waitFor(() => expect(screen.queryByText(/Completion sync failed/)).not.toBeInTheDocument())
    expect(api.record).toHaveBeenCalledTimes(2)
  })

  it('does not restart SFX when progress rerenders under StrictMode', async () => {
    render(<React.StrictMode><ShadowRunnerScreen /></React.StrictMode>)
    await screen.findByRole('button', { name: 'Start Tutorial' })
    expect(createSfx).toHaveBeenCalledTimes(2)
    expect(createSfx.mock.results[0].value.dispose).toHaveBeenCalled()
  })
})
