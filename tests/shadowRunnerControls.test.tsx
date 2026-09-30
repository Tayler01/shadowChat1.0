import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RunnerControls } from '../src/features/games/shadow-runner/components/RunnerControls'
import { ShadowRunnerScrollMenu } from '../src/features/games/shadow-runner/ShadowRunnerScrollMenu'
import { createShadowRunnerInputState, releaseShadowRunnerInputs, setShadowRunnerAction } from '../src/features/games/shadow-runner/game/input'

test('releasing controls preserves consumed action counters and jump clears crouch', () => {
  const state = createShadowRunnerInputState()
  state.crouch = true
  setShadowRunnerAction(state, 'jump', true)
  setShadowRunnerAction(state, 'jump', true)
  setShadowRunnerAction(state, 'attack', true)
  expect(state.crouch).toBe(false)
  expect(state.jumpPresses).toBe(1)
  releaseShadowRunnerInputs(state)
  expect(state).toEqual({ left: false, right: false, jump: false, attack: false, crouch: false, jumpPresses: 1, attackPresses: 1 })
  setShadowRunnerAction(state, 'attack', true)
  expect(state.attackPresses).toBe(2)
})

test('direction press moves immediately, cancellation releases, and crouch exposes toggle state', () => {
  const onAction = jest.fn()
  const toggle = jest.fn()
  const view = render(<RunnerControls crouched={false} onAction={onAction} onToggleCrouch={toggle} />)
  const right = screen.getByRole('button', { name: 'Move right' })
  fireEvent.pointerDown(right, { pointerId: 1, button: 0 })
  expect(onAction).toHaveBeenLastCalledWith('right', true)
  fireEvent.pointerCancel(right, { pointerId: 1 })
  expect(onAction).toHaveBeenLastCalledWith('right', false)
  fireEvent.click(screen.getByRole('button', { name: 'Crouch' }))
  expect(toggle).toHaveBeenCalledTimes(1)
  view.rerender(<RunnerControls crouched onAction={onAction} onToggleCrouch={toggle} />)
  expect(screen.getByRole('button', { name: 'Crouch' })).toHaveAttribute('aria-pressed', 'true')
})

test('focused movement supports held keyboard activation and blur release', () => {
  const onAction = jest.fn()
  render(<RunnerControls crouched={false} onAction={onAction} onToggleCrouch={() => {}} />)
  const left = screen.getByRole('button', { name: 'Move left' })
  fireEvent.keyDown(left, { key: ' ' })
  expect(onAction).toHaveBeenLastCalledWith('left', true)
  fireEvent.keyDown(left, { key: ' ', repeat: true })
  expect(onAction).toHaveBeenCalledTimes(1)
  fireEvent.keyUp(left, { key: ' ' })
  expect(onAction).toHaveBeenLastCalledWith('left', false)
  fireEvent.keyDown(left, { key: 'Enter' })
  fireEvent.blur(left)
  expect(onAction).toHaveBeenLastCalledWith('left', false)
})

test('relay readiness swaps only the attack label and icon without input or layout changes', () => {
  const onAction = jest.fn()
  const toggle = jest.fn()
  const view = render(<RunnerControls crouched onAction={onAction} onToggleCrouch={toggle} />)
  const attack = screen.getByRole('button', { name: 'Sword attack' })
  const buttons = screen.getAllByRole('button')
  expect(attack).toHaveAttribute('title', 'Sword attack')
  expect(attack.querySelector('svg')).toHaveClass('lucide-sword')
  expect(buttons).toHaveLength(5)
  buttons.forEach(button => expect(button).toBeEnabled())

  view.rerender(<RunnerControls crouched igniteReady onAction={onAction} onToggleCrouch={toggle} />)
  expect(screen.getByRole('button', { name: 'Ignite relay' })).toBe(attack)
  expect(attack).toHaveAttribute('title', 'Ignite relay')
  expect(attack).toHaveClass('runner-control')
  expect(attack.querySelector('svg')).toHaveClass('lucide-flame')
  expect(attack.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  screen.getAllByRole('button').forEach((button, index) => expect(button).toBe(buttons[index]))

  view.rerender(<RunnerControls crouched onAction={onAction} onToggleCrouch={toggle} />)
  expect(screen.getByRole('button', { name: 'Sword attack' })).toBe(attack)
  expect(attack.querySelector('svg')).toHaveClass('lucide-sword')
  expect(screen.getByRole('button', { name: 'Crouch' })).toHaveAttribute('aria-pressed', 'true')
  expect(onAction).not.toHaveBeenCalled()
  expect(toggle).not.toHaveBeenCalled()
})

test.each([false, true])('touch attack stays fresh across readiness changes (initial ready: %s)', igniteReady => {
  const state = createShadowRunnerInputState()
  state.crouch = true
  const onAction = jest.fn((action, pressed) => setShadowRunnerAction(state, action, pressed))
  const toggle = jest.fn()
  const view = render(<RunnerControls crouched igniteReady={igniteReady} onAction={onAction} onToggleCrouch={toggle} />)
  const attack = screen.getByRole('button', { name: igniteReady ? 'Ignite relay' : 'Sword attack' })
  fireEvent.pointerDown(attack, { pointerId: 1, pointerType: 'touch', button: 0 })
  expect(state.attackPresses).toBe(1)
  expect(attack).toHaveAttribute('data-pressed', 'true')
  onAction.mockClear()

  view.rerender(<RunnerControls crouched igniteReady={!igniteReady} onAction={onAction} onToggleCrouch={toggle} />)
  expect(onAction).not.toHaveBeenCalled()
  expect(state.attack).toBe(true)
  fireEvent.pointerUp(attack, { pointerId: 1, pointerType: 'touch' })
  fireEvent.click(attack, { detail: 1 })
  expect(state.attack).toBe(false)
  expect(state.attackPresses).toBe(1)
  fireEvent.pointerDown(attack, { pointerId: 2, pointerType: 'touch', button: 0 })
  fireEvent.pointerUp(attack, { pointerId: 2, pointerType: 'touch' })
  expect(state.attackPresses).toBe(2)
  expect(state.crouch).toBe(true)
  expect(toggle).not.toHaveBeenCalled()
})

test.each([' ', 'Enter'])('relay ignition uses fresh attack presses from keyboard %j', key => {
  const state = createShadowRunnerInputState()
  const onAction = jest.fn((action, pressed) => setShadowRunnerAction(state, action, pressed))
  render(<RunnerControls crouched={false} igniteReady onAction={onAction} onToggleCrouch={jest.fn()} />)
  const ignite = screen.getByRole('button', { name: 'Ignite relay' })
  fireEvent.keyDown(ignite, { key })
  fireEvent.keyDown(ignite, { key, repeat: true })
  expect(onAction).toHaveBeenCalledTimes(1)
  expect(onAction).toHaveBeenLastCalledWith('attack', true)
  expect(state.attackPresses).toBe(1)
  fireEvent.keyUp(ignite, { key })
  expect(state.attack).toBe(false)
  fireEvent.keyDown(ignite, { key })
  fireEvent.keyUp(ignite, { key })
  expect(state.attackPresses).toBe(2)
})

test('relay ignition accepts an assistive click through the existing attack action', () => {
  const onAction = jest.fn()
  render(<RunnerControls crouched={false} igniteReady onAction={onAction} onToggleCrouch={jest.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: 'Ignite relay' }), { detail: 0 })
  expect(onAction.mock.calls).toEqual([['attack', true], ['attack', false]])
})

test.each(['Space', 'Enter'])('held %s across relay readiness cancels the default click until a fresh press', async key => {
  const user = userEvent.setup()
  const defaultClick = jest.fn()
  const state = createShadowRunnerInputState()
  const onAction = jest.fn((action, pressed) => setShadowRunnerAction(state, action, pressed))
  const toggle = jest.fn()
  const view = render(<>
    <button onClick={defaultClick}>Native activation baseline</button>
    <RunnerControls crouched={false} onAction={onAction} onToggleCrouch={toggle} />
  </>)
  const baseline = screen.getByRole('button', { name: 'Native activation baseline' })
  baseline.focus()
  await user.keyboard(`[${key}]`)
  expect(defaultClick).toHaveBeenCalledTimes(1)
  expect(defaultClick.mock.calls[0][0].detail).toBe(0)

  const attack = screen.getByRole('button', { name: 'Sword attack' })
  const generatedClick = jest.fn()
  const keyEvents: KeyboardEvent[] = []
  const recordKey = (event: KeyboardEvent) => { keyEvents.push(event) }
  attack.addEventListener('click', generatedClick)
  attack.addEventListener('keydown', recordKey)
  attack.addEventListener('keyup', recordKey)
  attack.focus()
  await act(async () => { await user.keyboard(`[${key}>]`) })
  expect(state.attack).toBe(true)
  expect(state.attackPresses).toBe(1)

  view.rerender(<>
    <button onClick={defaultClick}>Native activation baseline</button>
    <RunnerControls crouched={false} igniteReady onAction={onAction} onToggleCrouch={toggle} />
  </>)
  expect(screen.getByRole('button', { name: 'Ignite relay' })).toBe(attack)
  expect(attack).toHaveFocus()
  expect(onAction.mock.calls).toEqual([['attack', true]])
  await act(async () => { await user.keyboard(`[/${key}]`) })
  expect(keyEvents.map(event => [event.type, event.defaultPrevented])).toEqual([
    ['keydown', true], ['keyup', true],
  ])
  expect(generatedClick).not.toHaveBeenCalled()
  expect(onAction.mock.calls).toEqual([['attack', true], ['attack', false]])
  expect(state.attack).toBe(false)
  expect(state.attackPresses).toBe(1)

  await act(async () => { await user.keyboard(`[${key}]`) })
  expect(state.attackPresses).toBe(2)
  expect(state.attack).toBe(false)
  expect(generatedClick).not.toHaveBeenCalled()

  // A standalone assistive click is a new activation, not a canceled key default.
  fireEvent.click(attack, { detail: 0 })
  expect(generatedClick).toHaveBeenCalledTimes(1)
  expect(state.attackPresses).toBe(3)
  expect(state.attack).toBe(false)
})

test.each([false, true])('disabled controls block synthetic presses and preserve crouch (ready: %s)', igniteReady => {
  const state = createShadowRunnerInputState()
  state.crouch = true
  const onAction = jest.fn((action, pressed) => setShadowRunnerAction(state, action, pressed))
  const toggle = jest.fn()
  render(<RunnerControls crouched disabled igniteReady={igniteReady} onAction={onAction} onToggleCrouch={toggle} />)
  onAction.mockClear()
  screen.getAllByRole('button').forEach(button => {
    expect(button).toBeDisabled()
    fireEvent.pointerDown(button, { pointerId: 1, pointerType: 'touch', button: 0 })
    fireEvent.pointerUp(button, { pointerId: 1 })
    for (const key of [' ', 'Enter']) {
      fireEvent.keyDown(button, { key })
      fireEvent.keyDown(button, { key, repeat: true })
      fireEvent.keyUp(button, { key })
    }
    fireEvent.click(button, { detail: 0 })
    fireEvent.click(button, { detail: 1 })
  })
  expect(onAction.mock.calls.some(([, pressed]) => pressed)).toBe(false)
  expect(state).toEqual({ left: false, right: false, jump: false, attack: false, crouch: true, jumpPresses: 0, attackPresses: 0 })
  expect(toggle).not.toHaveBeenCalled()
  expect(screen.getByRole('button', { name: 'Crouch' })).toHaveAttribute('aria-pressed', 'true')
})

test.each(['touch', 'keyboard'])('disabling releases every held %s action and re-enabling requires fresh input', source => {
  const state = createShadowRunnerInputState()
  const onAction = jest.fn((action, pressed) => setShadowRunnerAction(state, action, pressed))
  const toggle = jest.fn()
  const view = render(<RunnerControls crouched igniteReady onAction={onAction} onToggleCrouch={toggle} />)
  const buttons = ['Move left', 'Move right', 'Ignite relay', 'Jump'].map(name => screen.getByRole('button', { name }))
  buttons.forEach((button, index) => {
    if (source === 'touch') fireEvent.pointerDown(button, { pointerId: index + 1, pointerType: 'touch', button: 0 })
    else fireEvent.keyDown(button, { key: ' ' })
    expect(button).toHaveAttribute('data-pressed', 'true')
  })
  state.crouch = true
  onAction.mockClear()
  view.rerender(<RunnerControls crouched igniteReady disabled onAction={onAction} onToggleCrouch={toggle} />)
  expect(onAction.mock.calls).toEqual([['left', false], ['right', false], ['attack', false], ['jump', false]])
  expect(state).toEqual({ left: false, right: false, jump: false, attack: false, crouch: true, jumpPresses: 1, attackPresses: 1 })
  buttons.forEach(button => expect(button).toHaveAttribute('data-pressed', 'false'))
  expect(toggle).not.toHaveBeenCalled()
  onAction.mockClear()

  view.rerender(<RunnerControls crouched igniteReady onAction={onAction} onToggleCrouch={toggle} />)
  expect(onAction).not.toHaveBeenCalled()
  const ignite = screen.getByRole('button', { name: 'Ignite relay' })
  fireEvent.keyDown(ignite, { key: ' ', repeat: true })
  fireEvent.pointerUp(ignite, { pointerId: 3 })
  fireEvent.lostPointerCapture(ignite, { pointerId: 3 })
  expect(onAction).not.toHaveBeenCalled()
  if (source === 'touch') fireEvent.pointerDown(ignite, { pointerId: 5, pointerType: 'touch', button: 0 })
  else fireEvent.keyDown(ignite, { key: ' ' })
  expect(state.attackPresses).toBe(2)
  expect(ignite).toHaveAttribute('data-pressed', 'true')
  view.unmount()
  expect(state.attack).toBe(false)
  expect(state.crouch).toBe(true)
})

test('pause dialog traps focus, accepts keyboard click, and closes with Escape', async () => {
  const onClose = jest.fn()
  const onResume = jest.fn()
  render(<ShadowRunnerScrollMenu title="Pause" onClose={onClose} actions={[{ id: 'resume', label: 'Resume', onClick: onResume }, { id: 'quit', label: 'Quit Level', onClick: () => {} }]} />)
  const close = screen.getByRole('button', { name: 'Close dialog' })
  const quit = screen.getByRole('button', { name: 'Quit Level' })
  await waitFor(() => expect(close).toHaveFocus())
  quit.focus()
  fireEvent.keyDown(quit, { key: 'Tab' })
  expect(close).toHaveFocus()
  fireEvent.click(screen.getByRole('button', { name: 'Resume' }), { detail: 0 })
  expect(onResume).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(close, { key: 'Escape' })
  expect(onClose).toHaveBeenCalledTimes(1)
})
