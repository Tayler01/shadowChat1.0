import {
  creatorStudioHistoryKind,
  enterCreatorStudioHistory,
  hasCreatorStudioQuery,
  isCreatorStudioHistoryEntry,
  replaceCreatorStudioHistory,
  requestCreatorStudioClose,
} from '../src/features/shadow-pin/creator/creatorHistory'

const makeTarget = (href = 'https://shadowchat.test/?view=pins') => {
  const location = { href }
  let state: Record<string, unknown> = { preserved: true }
  const history = {
    get state() { return state },
    pushState: jest.fn((next: Record<string, unknown>, _unused: string, url?: string | URL | null) => {
      state = next
      if (url) location.href = String(url)
    }),
    replaceState: jest.fn((next: Record<string, unknown>, _unused: string, url?: string | URL | null) => {
      state = next
      if (url) location.href = String(url)
    }),
    back: jest.fn(),
  }
  const target = { location, history, dispatchEvent: jest.fn() }
  return { target: target as unknown as Window, history, location }
}

describe('ShadowPin Creator Studio browser history', () => {
  test('pushes one marked entry for an in-app open and does not duplicate it', () => {
    const { target, history } = makeTarget()

    expect(enterCreatorStudioHistory(target)).toBe('pushed')
    expect(hasCreatorStudioQuery(target)).toBe(true)
    expect(creatorStudioHistoryKind(target)).toBe('pushed')
    expect(isCreatorStudioHistoryEntry(target)).toBe(true)
    expect(history.pushState).toHaveBeenCalledTimes(1)

    expect(enterCreatorStudioHistory(target)).toBe('pushed')
    expect(history.pushState).toHaveBeenCalledTimes(1)
  })

  test('marks a cold studio URL by replacement rather than adding history', () => {
    const { target, history } = makeTarget('https://shadowchat.test/?view=pins&studio=creator')

    expect(enterCreatorStudioHistory(target)).toBe('cold')
    expect(creatorStudioHistoryKind(target)).toBe('cold')
    expect(history.replaceState).toHaveBeenCalledTimes(1)
    expect(history.pushState).not.toHaveBeenCalled()
  })

  test('closes pushed entries with Back and cold entries with replacement plus callback', () => {
    const pushed = makeTarget()
    enterCreatorStudioHistory(pushed.target)
    const pushedClose = jest.fn()
    expect(requestCreatorStudioClose(pushedClose, pushed.target)).toBe('back')
    expect(pushed.history.back).toHaveBeenCalledTimes(1)
    expect(pushedClose).not.toHaveBeenCalled()

    const cold = makeTarget('https://shadowchat.test/?view=pins&studio=creator')
    enterCreatorStudioHistory(cold.target)
    const coldClose = jest.fn()
    expect(requestCreatorStudioClose(coldClose, cold.target)).toBe('cold-close')
    expect(cold.history.replaceState).toHaveBeenCalledTimes(2)
    expect(cold.location.href).toBe('https://shadowchat.test/?view=pins')
    expect(coldClose).toHaveBeenCalledTimes(1)
  })

  test('removes only Studio state and query on successful route replacement', () => {
    const { target, history, location } = makeTarget()
    enterCreatorStudioHistory(target)

    replaceCreatorStudioHistory(target)

    expect(location.href).toBe('https://shadowchat.test/?view=pins')
    expect(history.state).toEqual({ preserved: true })
    expect(isCreatorStudioHistoryEntry(target)).toBe(false)
  })
})
