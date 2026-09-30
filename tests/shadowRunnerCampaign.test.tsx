import { fireEvent, render, screen } from '@testing-library/react'
import { RunnerCampaign } from '../src/features/games/shadow-runner/components/RunnerCampaign'
import { getRunnerChapterState, getRunnerContinueLevel } from '../src/features/games/shadow-runner/game/campaignNavigation'
import { RunnerTitle } from '../src/features/games/shadow-runner/components/RunnerTitle'
import { createShadowRunnerProgressStore } from '../src/features/games/shadow-runner/progress'
import { SHADOW_RUNNER_CAMPAIGN_LEVELS } from '../src/features/games/shadow-runner/game/levels'

const api = { read: jest.fn().mockResolvedValue([]), record: jest.fn().mockResolvedValue(undefined) }
const snapshot = () => createShadowRunnerProgressStore(null, api, { storage: () => ({ length: 0, key: () => null, removeItem: () => {}, getItem: () => null, setItem: () => {} }) }).getSnapshot()

test('continue picks the first incomplete playable chapter without locking restored clears', () => {
  expect(getRunnerContinueLevel([])).toBe('tutorial')
  expect(getRunnerContinueLevel(['tutorial'])).toBe('level-1')
  expect(getRunnerContinueLevel(['tutorial', 'level-1', 'level-2'])).toBe('level-3')
  expect(getRunnerContinueLevel(['tutorial', ...SHADOW_RUNNER_CAMPAIGN_LEVELS.map(level => level.id)])).toBe('level-10')
  expect(getRunnerChapterState(['level-8'], SHADOW_RUNNER_CAMPAIGN_LEVELS[7]).playable).toBe(true)
  expect(getRunnerChapterState([], SHADOW_RUNNER_CAMPAIGN_LEVELS[7]).playable).toBe(false)
})

test('title gives a new player an immediate tutorial and a returning player a continue action', () => {
  const onPlay = jest.fn()
  const props = { heroFrame: 0, onPlay, onMap: jest.fn(), onOptions: jest.fn() }
  const view = render(<RunnerTitle {...props} completedLevels={[]} />)
  expect(screen.getByRole('heading', { name: 'Shadow Runner' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Start Tutorial' }))
  expect(onPlay).toHaveBeenLastCalledWith('tutorial')
  view.rerender(<RunnerTitle {...props} completedLevels={['tutorial', 'level-1']} />)
  fireEvent.click(screen.getByRole('button', { name: 'Continue journey' }))
  expect(onPlay).toHaveBeenLastCalledWith('level-2')
})

test('all chapters can be inspected but a locked chapter cannot start', () => {
  const onPlay = jest.fn()
  render(<RunnerCampaign progress={snapshot()} onBack={() => {}} onPlayLevel={onPlay} />)
  expect(screen.getAllByRole('button', { name: /details,/ })).toHaveLength(10)
  fireEvent.click(screen.getByRole('button', { name: /Dawn Relay Spire details/ }))
  expect(screen.getByRole('dialog', { name: 'Dawn Relay Spire' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Locked' })).toBeDisabled()
  fireEvent.click(screen.getByRole('button', { name: 'Locked' }))
  expect(onPlay).not.toHaveBeenCalled()
  fireEvent.keyDown(screen.getByRole('button', { name: 'Return' }), { key: 'Escape' })
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})

test('mastery is shown from a real local run, never inferred from server maxima', () => {
  const progress = snapshot()
  progress.completedLevels = ['level-1', 'level-2']
  progress.progress.levels['level-1'] = { completedAt: '2026-09-08', perfectRouteAchieved: true, bestRun: { score: 1000, coinsCollected: 10, totalCoins: 10, enemiesDefeated: 2, totalEnemies: 2, fullClear: true, perfectRoute: true, recordedAt: '2026-09-08' } }
  progress.progress.levels['level-2'] = { completedAt: '2026-09-08', serverBest: { score: 2000, coinsCollected: 12, totalCoins: 12, enemiesDefeated: 3, totalEnemies: 3 } }
  render(<RunnerCampaign progress={progress} onBack={() => {}} onPlayLevel={() => {}} />)
  expect(screen.getByRole('button', { name: /East Gate Run details, Perfect route/ })).toHaveTextContent('1,000 best')
  expect(screen.getByRole('button', { name: /Lantern Market Roofs details, Cleared/ })).not.toHaveTextContent('Perfect')
  fireEvent.click(screen.getByRole('button', { name: /Lantern Market Roofs details/ }))
  expect(screen.getByText('Account best')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Replay' })).toBeEnabled()
})

test('journal exposes completed dispatches only and map keeps all routes accessible', () => {
  const progress = snapshot()
  progress.completedLevels = ['tutorial', 'level-1']
  render(<RunnerCampaign progress={progress} onBack={() => {}} onPlayLevel={() => {}} />)
  fireEvent.click(screen.getByRole('button', { name: 'Courier journal' }))
  expect(screen.getByRole('heading', { name: 'East Gate Run' })).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: 'Dawn Relay Spire' })).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }))
  fireEvent.click(screen.getByRole('tab', { name: 'Map' }))
  expect(screen.getByRole('tabpanel', { name: 'Map' })).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: /details,/ })).toHaveLength(10)
})
