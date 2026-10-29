import { createBadgeSynchronizer, queueBadgeWrite } from '../apps/mobile/src/lib/notifications/badgeSynchronizer'

const deferred = () => {
  let resolve!: (value: unknown) => void
  let reject!: (reason: Error) => void
  const promise = new Promise<unknown>((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

test('a confirmed web read supersedes the in-flight unread result and writes canonical zero', async () => {
  const stale = deferred()
  const read = jest.fn().mockReturnValueOnce(stale.promise).mockResolvedValue({ total: 0 })
  const apply = jest.fn(async () => undefined)
  const sync = createBadgeSynchronizer({ identity: () => 'demo:reviewer', read, apply })
  const first = sync.sync()
  const next = sync.sync()
  stale.resolve({ total: 1 })
  await Promise.all([first, next])
  expect(read).toHaveBeenCalledTimes(2)
  expect(apply).toHaveBeenCalledTimes(1)
  expect(apply).toHaveBeenCalledWith(0)
})

test('badge refresh hints coalesce and no polling remains after quiescence', async () => {
  const initial = deferred()
  const read = jest.fn().mockReturnValueOnce(initial.promise).mockResolvedValue({ total: 3 })
  const apply = jest.fn(async () => undefined)
  const sync = createBadgeSynchronizer({ identity: () => 'demo:reviewer', read, apply })
  const requests = Array.from({ length: 20 }, () => sync.sync())
  initial.resolve({ total: 4 })
  await Promise.all(requests)
  expect(read).toHaveBeenCalledTimes(2)
  expect(apply).toHaveBeenCalledWith(3)
  await Promise.resolve()
  expect(read).toHaveBeenCalledTimes(2)
})

test.each([null, 'member:another-user'])('old identity cannot write after sign-out/switch to %s', async nextIdentity => {
  let identity: string | null = 'demo:reviewer'
  const initial = deferred()
  const apply = jest.fn(async () => undefined)
  const sync = createBadgeSynchronizer({ identity: () => identity, read: () => initial.promise, apply })
  const pending = sync.sync()
  identity = nextIdentity
  initial.resolve({ total: 9 })
  await pending
  expect(apply).not.toHaveBeenCalled()
})

test('failed or malformed canonical reads retain the badge and a later request can recover', async () => {
  const read = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({}).mockResolvedValue({ total: 0 })
  const apply = jest.fn(async () => undefined)
  const sync = createBadgeSynchronizer({ identity: () => 'demo:reviewer', read, apply })
  await expect(sync.sync()).rejects.toThrow('offline')
  await expect(sync.sync()).rejects.toThrow('Invalid notification badge count')
  expect(apply).not.toHaveBeenCalled()
  await sync.sync()
  expect(apply).toHaveBeenCalledWith(0)
})

test('a newer hint survives failure of the already superseded request', async () => {
  const stale = deferred()
  const read = jest.fn().mockReturnValueOnce(stale.promise).mockResolvedValue({ total: 0 })
  const apply = jest.fn(async () => undefined)
  const sync = createBadgeSynchronizer({ identity: () => 'demo:reviewer', read, apply })
  const first = sync.sync()
  const next = sync.sync()
  stale.reject(new Error('old request failed'))
  await Promise.all([first, next])
  expect(apply).toHaveBeenCalledWith(0)
})

test('signed-out mount makes no request and fresh signed-in mount reads canonical state', async () => {
  const read = jest.fn().mockResolvedValue({ total: 0 })
  const apply = jest.fn(async () => undefined)
  await createBadgeSynchronizer({ identity: () => null, read, apply }).sync()
  expect(read).not.toHaveBeenCalled()
  await createBadgeSynchronizer({ identity: () => 'demo:reviewer', read, apply }).sync()
  expect(apply).toHaveBeenCalledWith(0)
})

test('new provider and sign-out clearing wait for an already-running OS write', async () => {
  let oldIdentity: string | null = 'demo:reviewer'
  const osWrite = deferred()
  const applied: number[] = []
  const old = createBadgeSynchronizer({ identity: () => oldIdentity, read: async () => ({ total: 9 }),
    apply: async count => { await osWrite.promise; applied.push(count) },
  })
  const beforeSwitch = old.sync()
  // Allow the first provider to enter the asynchronous OS call.
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve()
  oldIdentity = null
  const clear = queueBadgeWrite(async () => { applied.push(0) })
  const next = createBadgeSynchronizer({ identity: () => 'member:new-user', read: async () => ({ total: 2 }),
    apply: async count => { applied.push(count) },
  }).sync()
  osWrite.resolve(undefined)
  await Promise.all([beforeSwitch, clear, next])
  expect(applied).toEqual([9, 0, 2])
})
