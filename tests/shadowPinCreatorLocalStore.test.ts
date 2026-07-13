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
