
import { cleanupDeletedAccountLocalState } from '../src/lib/accountDeletionCleanup'

const authKey = 'sb-example-auth-token'
const deleted = '00000000-0000-4000-8000-000000000001'
const other = '00000000-0000-4000-8000-000000000002'
const record = (id: string) => JSON.stringify({ user: { id }, access_token: 'synthetic-token' })
beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('chatHistory', 'history')
  localStorage.setItem('failed-dm', 'retry')
})

test('clears matching primary and legacy fresh records before resetting the deleted session', () => {
  localStorage.setItem(authKey, record(deleted))
  localStorage.setItem(`${authKey}-fresh-one`, JSON.stringify({ currentSession: { user: { id: deleted } } }))
  localStorage.setItem('sb-other-project-auth-token', record(deleted))
  expect(cleanupDeletedAccountLocalState(deleted, deleted, authKey)).toEqual({ clearedSharedCaches: true, reloadDeletedSession: true })
  expect(localStorage.getItem(authKey)).toBeNull()
  expect(localStorage.getItem(`${authKey}-fresh-one`)).toBeNull()
  expect(localStorage.getItem('sb-other-project-auth-token')).not.toBeNull()
  expect(localStorage.getItem('chatHistory')).toBeNull()
  expect(localStorage.getItem('failed-dm')).toBeNull()
})

test.each([other, undefined])('a different or unknown SDK identity (%p) keeps shared caches and its running page', current => {
  localStorage.setItem(authKey, record(deleted))
  expect(cleanupDeletedAccountLocalState(deleted, current, authKey)).toEqual({ clearedSharedCaches: false, reloadDeletedSession: false })
  expect(localStorage.getItem(authKey)).toBeNull()
  expect(localStorage.getItem('chatHistory')).toBe('history')
  expect(localStorage.getItem('failed-dm')).toBe('retry')
})

test('anonymous recovery may clear shared caches when no persisted account conflicts', () => {
  expect(cleanupDeletedAccountLocalState(deleted, null, authKey)).toEqual({ clearedSharedCaches: true, reloadDeletedSession: false })
  expect(localStorage.getItem('chatHistory')).toBeNull()
})

test.each([authKey, `${authKey}-fresh-new`])('a newer persisted identity in %p blocks old-session reset and shared cleanup', key => {
  localStorage.setItem(key, record(other))
  expect(cleanupDeletedAccountLocalState(deleted, deleted, authKey)).toEqual({ clearedSharedCaches: false, reloadDeletedSession: false })
  expect(localStorage.getItem(key)).toBe(record(other))
  expect(localStorage.getItem('chatHistory')).toBe('history')
})

test('rechecks the exact credential record before removal when another tab replaces it', () => {
  localStorage.setItem(authKey, record(deleted))
  const original = Storage.prototype.getItem
  let reads = 0
  const get = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
    if (key === authKey && ++reads === 2) this.setItem(key, record(other))
    return original.call(this, key)
  })
  try {
    expect(cleanupDeletedAccountLocalState(deleted, deleted, authKey)).toEqual({ clearedSharedCaches: false, reloadDeletedSession: false })
    expect(localStorage.getItem(authKey)).toBe(record(other))
    expect(localStorage.getItem('chatHistory')).toBe('history')
  } finally { get.mockRestore() }
})

test.each(['not-json', '{}', '{"user":{}}'])('unreadable persisted identity %p fails closed', raw => {
  localStorage.setItem(authKey, raw)
  expect(cleanupDeletedAccountLocalState(deleted, null, authKey)).toEqual({ clearedSharedCaches: false, reloadDeletedSession: false })
  expect(localStorage.getItem(authKey)).toBe(raw)
  expect(localStorage.getItem('chatHistory')).toBe('history')
})

test('storage removal failure does not trigger a reload', () => {
  localStorage.setItem(authKey, record(deleted))
  const remove = jest.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('Storage blocked') })
  try {
    expect(cleanupDeletedAccountLocalState(deleted, deleted, authKey)).toEqual({ clearedSharedCaches: false, reloadDeletedSession: false })
    expect(localStorage.getItem('chatHistory')).toBe('history')
  } finally { remove.mockRestore() }
})
