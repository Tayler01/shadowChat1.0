import { subscribeBadgeLifecycle } from '../apps/mobile/src/lib/notifications/badgeLifecycle'
import { createBadgeSynchronizer } from '../apps/mobile/src/lib/notifications/badgeSynchronizer'
import { diagnosedBadgeOperations } from '../apps/mobile/src/lib/notifications/badgeDiagnostics'

test('late delivery and leaving the app reconcile canonical counts without clearing unrelated unread', async () => {
  let state!: (value: string) => void
  let received!: () => void
  let total = 0
  let osBadge = 1
  const read = jest.fn(async () => ({ total }))
  const synchronizer = createBadgeSynchronizer({ identity: () => 'reviewer', read, apply: async value => { osBadge = value } })
  const work: Promise<void>[] = []
  const removeState = jest.fn(), removeReceived = jest.fn()
  const dispose = subscribeBadgeLifecycle({
    refresh: () => { const task = synchronizer.sync(); work.push(task); return task },
    subscribeState: fn => { state = fn; return { remove: removeState } },
    subscribeReceived: fn => { received = fn; return { remove: removeReceived } },
  })
  await Promise.all(work)
  expect(osBadge).toBe(0)
  osBadge = 1 // External OS delivery after the prior successful canonical write.
  received()
  await Promise.all(work)
  expect(osBadge).toBe(0)
  total = 2 // Other conversations remain unread; never substitute zero.
  state('inactive')
  await Promise.all(work)
  expect(osBadge).toBe(2)
  state('active')
  await Promise.all(work)
  expect(osBadge).toBe(2)
  dispose()
  const calls = read.mock.calls.length
  received(); state('background')
  await Promise.all(work)
  expect(read).toHaveBeenCalledTimes(calls)
  expect(removeState).toHaveBeenCalledTimes(1)
  expect(removeReceived).toHaveBeenCalledTimes(1)
})

test('diagnostics report actual OS mismatch and redact private backend failures', async () => {
  const report = jest.fn()
  const operations = diagnosedBadgeOperations({
    identity: () => 'reviewer',
    read: async () => { throw { status: 401, message: 'secret-token-private-user' } },
    write: async () => undefined, readOS: async () => 1, report,
  })
  await expect(operations.read()).rejects.toMatchObject({ status: 401 })
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'auth_failed', expected: null }))
  await operations.apply(0)
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'mismatch', expected: 0, observed: 1 }))
  expect(JSON.stringify(report.mock.calls)).not.toMatch(/secret|reviewer/)
})

test('completed OS readback cannot report into a different identity', async () => {
  let identity = 'old'
  let finish!: (value: number) => void
  const report = jest.fn()
  const operations = diagnosedBadgeOperations({ identity: () => identity, read: async () => ({ total: 0 }),
    write: async () => undefined, readOS: () => new Promise(resolve => { finish = resolve }), report })
  const task = operations.apply(0)
  await Promise.resolve()
  identity = 'new'
  finish(0)
  await task
  expect(report).toHaveBeenCalledTimes(1)
  expect(report.mock.calls[0][0].status).toBe('applying')
})

test('invalid canonical response reports failure rather than remaining in reading state', async () => {
  const report = jest.fn(), write = jest.fn()
  const operations = diagnosedBadgeOperations({ identity: () => 'user', read: async () => ({ total: 'invalid' }), write, readOS: async () => 0, report })
  await expect(operations.read()).rejects.toThrow('Invalid notification badge response')
  expect(report).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'read_failed' }))
  expect(write).not.toHaveBeenCalled()
})
