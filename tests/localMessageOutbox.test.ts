import { upsertLocalOutboxEntry, loadLocalOutboxEntries, getLocalOutboxStorageKey } from '../src/lib/localMessageOutbox'
const entry = { id: 'stable', clientMessageId: 'stable', senderId: 'reader', content: 'draft', messageType: 'text' as const, createdAt: '2026-09-30T12:00:00Z', failedAt: '2026-09-30T12:00:00Z' }
afterEach(() => { jest.restoreAllMocks(); localStorage.clear() })
test('records pending intent synchronously and reuses the stable ID on retry', () => {
  upsertLocalOutboxEntry('test', entry, { requirePersistence: true })
  expect(localStorage.getItem(getLocalOutboxStorageKey('test'))).toContain('stable')
  upsertLocalOutboxEntry('test', { ...entry, content: 'retry' }, { requirePersistence: true })
  expect(loadLocalOutboxEntries('test')).toEqual([{ ...entry, content: 'retry' }])
})
test('refuses a new send when durable pending intent cannot be stored', () => {
  jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
  expect(() => upsertLocalOutboxEntry('test', entry, { requirePersistence: true })).toThrow('could not save')
  expect(loadLocalOutboxEntries('test')).toEqual([])
})
