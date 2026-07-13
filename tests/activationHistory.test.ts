import {
  closeActivationHistory,
  enterActivationHistory,
  isActivationHistoryEntry,
  replaceActivationHistory,
} from '../src/features/activation/activationHistory'

const target = (state: Record<string, unknown> = {}) => {
  const history = {
    state,
    pushState: jest.fn((next: Record<string, unknown>) => { history.state = next }),
    replaceState: jest.fn((next: Record<string, unknown>) => { history.state = next }),
    back: jest.fn(),
  }
  return {
    location: { href: 'https://shadow.test/?view=dms&conversation=origin' },
    history,
  } as unknown as Window
}

test('uses a same-URL history layer so Back preserves the originating surface', () => {
  const windowTarget = target({ shadowchatLayer: 'dm-thread' })
  expect(enterActivationHistory(windowTarget)).toBe(true)
  expect(isActivationHistoryEntry(windowTarget)).toBe(true)
  expect(windowTarget.history.pushState).toHaveBeenCalledWith(
    expect.objectContaining({ shadowchatLayer: 'dm-thread', shadowchatFirstRunActivation: true }),
    '',
    'https://shadow.test/?view=dms&conversation=origin'
  )
  expect(closeActivationHistory(jest.fn(), windowTarget)).toBe('back')
  expect(windowTarget.history.back).toHaveBeenCalled()
})

test('can replace the activation layer before handing off to a canonical action', () => {
  const windowTarget = target({ shadowchatFirstRunActivation: true, shadowchatLayer: 'dm-thread' })
  expect(replaceActivationHistory(windowTarget)).toBe(true)
  expect(windowTarget.history.replaceState).toHaveBeenCalledWith(
    { shadowchatLayer: 'dm-thread' },
    '',
    'https://shadow.test/?view=dms&conversation=origin'
  )
})
