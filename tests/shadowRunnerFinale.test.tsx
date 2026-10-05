import { act, fireEvent, render, screen } from '@testing-library/react'
import { RunnerFinale } from '../src/features/games/shadow-runner/components/RunnerFinale'
import { RunnerDialogSuspensionContext } from '../src/features/games/shadow-runner/components/runnerDialogSuspension'
import { SHADOW_RUNNER_LEVEL_TEN } from '../src/features/games/shadow-runner/game/levelTen'

const finale = SHADOW_RUNNER_LEVEL_TEN.finale!

test('rotation suspends the finale without advancing it or resetting artwork recovery', () => {
  const advance = jest.fn()
  const complete = jest.fn()
  const content = (suspended: boolean) => (
    <RunnerDialogSuspensionContext.Provider value={suspended}>
      <RunnerFinale finale={finale} beatIndex={1} reducedMotion={true} onAdvance={advance} onComplete={complete} />
    </RunnerDialogSuspensionContext.Provider>
  )
  const view = render(content(false))
  fireEvent.error(view.container.querySelector('img')!)
  expect(screen.getByRole('button', { name: 'Reload scene artwork' })).toBeInTheDocument()
  view.rerender(content(true))
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  fireEvent.keyDown(document, { key: 'Escape' })
  view.rerender(content(false))
  expect(screen.getByRole('button', { name: 'Reload scene artwork' })).toBeInTheDocument()
  expect(advance).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
})

test('the ending follows world ignition and waits for deliberate cinematic advancement', () => {
  jest.useFakeTimers()
  const advance = jest.fn()
  const complete = jest.fn()
  const view = render(<RunnerFinale finale={finale} beatIndex={0} reducedMotion={false} onAdvance={advance} onComplete={complete} />)
  expect(view.container.querySelector('img')).toHaveAttribute('src', finale.beats[0].asset)
  expect(finale.beats[0].asset).not.toBe(finale.asset)
  act(() => { jest.advanceTimersByTime(60000) })
  expect(advance).not.toHaveBeenCalled()
  expect(complete).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Follow the signal' }))
  expect(advance).toHaveBeenCalledTimes(1)
  view.rerender(<RunnerFinale finale={finale} beatIndex={1} reducedMotion={false} onAdvance={advance} onComplete={complete} />)
  expect(view.container.querySelector('img')).toHaveAttribute('src', finale.beats[1].asset)
  expect(screen.getByRole('button', { name: 'See the dawn' })).toBeInTheDocument()
  jest.useRealTimers()
})

test('artwork failure preserves story, retry and navigation without showing premature dawn', () => {
  const advance = jest.fn()
  const view = render(<RunnerFinale finale={finale} beatIndex={0} reducedMotion onAdvance={advance} onComplete={() => {}} />)
  fireEvent.error(view.container.querySelector('img')!)
  expect(view.container.querySelector('img')).not.toBeInTheDocument()
  expect(screen.getByText(/He forged the lockdown/)).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Reload scene artwork' }))
  expect(view.container.querySelector('img')).toHaveAttribute('src', finale.beats[0].asset)
  fireEvent.click(screen.getByRole('button', { name: 'Follow the signal' }))
  expect(advance).toHaveBeenCalledTimes(1)
  expect(screen.getByRole('dialog')).toHaveAttribute('data-reduced-motion', 'true')
})

test('every winner can finish or skip and the ending traps keyboard focus', () => {
  const complete = jest.fn()
  const view = render(<RunnerFinale finale={finale} beatIndex={3} reducedMotion onAdvance={() => {}} onComplete={complete} />)
  expect(screen.getByText(/the Rival waits beside the Captain/)).toBeInTheDocument()
  const results = screen.getByRole('button', { name: 'View Results' })
  results.focus()
  fireEvent.keyDown(results, { key: 'Tab' })
  expect(screen.getByRole('button', { name: 'Skip cinematic' })).toHaveFocus()
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
  expect(complete).not.toHaveBeenCalled()
  fireEvent.click(results)
  expect(complete).toHaveBeenCalledTimes(1)
  view.rerender(<RunnerFinale finale={finale} beatIndex={0} reducedMotion onAdvance={() => {}} onComplete={complete} />)
  fireEvent.click(screen.getByRole('button', { name: 'Skip cinematic' }))
  expect(complete).toHaveBeenCalledTimes(2)
})
