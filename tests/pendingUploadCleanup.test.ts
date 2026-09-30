import { enqueuePendingUploadCleanup, readPendingUploadCleanup, retryPendingUploadCleanup } from '../src/lib/pendingUploadCleanup'

beforeEach(() => localStorage.clear())

test('a different account never drains another account cleanup queue', async () => {
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/orphan.png')
  const remove = jest.fn().mockResolvedValue(undefined)
  await retryPendingUploadCleanup('account-b', 'chat', remove)
  expect(remove).not.toHaveBeenCalled()
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual(['account-a/orphan.png'])
})

test('failed deletion remains pending until a later same-account retry succeeds', async () => {
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/orphan.png')
  await retryPendingUploadCleanup('account-a', 'chat', jest.fn().mockRejectedValue(new Error('offline')))
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual(['account-a/orphan.png'])
  const remove = jest.fn().mockResolvedValue(undefined)
  await retryPendingUploadCleanup('account-a', 'chat', remove)
  expect(remove).toHaveBeenCalledWith('account-a/orphan.png')
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual([])
})

test('cleanup queue is bounded and deduplicates paths', () => {
  for (let index = 0; index < 70; index++) enqueuePendingUploadCleanup('account-a', 'chat', `account-a/${index}.png`)
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/69.png')
  const pending = readPendingUploadCleanup('account-a', 'chat')
  expect(pending).toHaveLength(64)
  expect(pending[pending.length - 1]).toBe('account-a/69.png')
})

test('account switch stops a pending drain before its next deletion', async () => {
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/first.png')
  enqueuePendingUploadCleanup('account-a', 'chat', 'account-a/second.png')
  let finishFirst!: () => void
  const first = new Promise<void>(resolve => { finishFirst = resolve })
  const remove = jest.fn().mockImplementation(() => first)
  let activeAccount = 'account-a'
  const draining = retryPendingUploadCleanup('account-a', 'chat', remove, () => activeAccount === 'account-a')
  expect(remove).toHaveBeenCalledWith('account-a/first.png')
  activeAccount = 'account-b'
  finishFirst()
  await draining
  expect(remove).toHaveBeenCalledTimes(1)
  expect(readPendingUploadCleanup('account-a', 'chat')).toEqual(['account-a/second.png'])
})
