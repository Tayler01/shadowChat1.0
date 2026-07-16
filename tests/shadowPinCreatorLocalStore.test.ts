import { createInitialCreatorState } from '../src/features/shadow-pin/creator/creatorModel'
import {
  clearCreatorLocalDraft,
  loadCreatorLocalDraft,
  saveCreatorLocalDraft,
} from '../src/features/shadow-pin/creator/creatorLocalStore'

test('device storage failures never block the server-backed Creator draft', () => {
  const setItem = jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota exceeded', 'QuotaExceededError')
  })
  const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError')
  })
  const removeItem = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
    throw new DOMException('Storage blocked', 'SecurityError')
  })

  try {
    expect(() => saveCreatorLocalDraft('user-1', createInitialCreatorState())).not.toThrow()
    expect(loadCreatorLocalDraft('user-1')).toBeNull()
    expect(() => clearCreatorLocalDraft('user-1')).not.toThrow()
  } finally {
    setItem.mockRestore()
    getItem.mockRestore()
    removeItem.mockRestore()
  }
})

test('a terminal publish receipt cannot repopulate local recovery after cleanup', () => {
  const state = createInitialCreatorState('category-1')
  state.values.title = 'Published Pin'
  state.values.sourceMode = 'url'
  state.values.sourceUrl = 'https://example.com/published.jpg'
  window.localStorage.clear()

  saveCreatorLocalDraft('user-1', state)
  expect(loadCreatorLocalDraft('user-1')).not.toBeNull()

  saveCreatorLocalDraft('user-1', { ...state, operation: 'published' })
  expect(loadCreatorLocalDraft('user-1')).toBeNull()
})
