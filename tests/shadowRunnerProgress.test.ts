import { createShadowRunnerProgressStore, shadowRunnerProgressKey, SHADOW_RUNNER_LEGACY_PROGRESS_KEY, type ShadowRunnerLedgerCompletion, type ShadowRunnerProgressApi, type ShadowRunnerRun } from '../src/features/games/shadow-runner/progress'

const run: ShadowRunnerRun = { score: 200, coinsCollected: 3, totalCoins: 5, enemiesDefeated: 2, totalEnemies: 4, fullClear: false, perfectRoute: false }
const ledger = (ownerId = 'alice'): ShadowRunnerLedgerCompletion => ({ ownerId, levelId: 'level-3', completedAt: '2026-09-08T10:00:00.000Z', score: 800, coinsCollected: 5, totalCoins: 5, enemiesDefeated: 4, totalEnemies: 4 })
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}
const drain = async () => { for (let i = 0; i < 24; i += 1) await Promise.resolve() }

describe('Shadow Runner account progress', () => {
  const stores: ReturnType<typeof createShadowRunnerProgressStore>[] = []
  const api = (): jest.Mocked<ShadowRunnerProgressApi> => ({ read: jest.fn().mockResolvedValue([]), record: jest.fn().mockResolvedValue(undefined) })
  const make = (ownerId: string | null, remote = api(), options: Parameters<typeof createShadowRunnerProgressStore>[2] = {}) => {
    let revision = 0
    const store = createShadowRunnerProgressStore(ownerId, remote, { now: () => '2026-09-08T12:00:00.000Z', revision: () => String(++revision), ...options })
    stores.push(store)
    return store
  }
  beforeEach(() => localStorage.clear())
  afterEach(() => { stores.forEach(store => store.stop()); stores.length = 0; jest.useRealTimers() })

  it('keeps the untouched v1 archive guest-only, including after a new sign-in', async () => {
    const raw = JSON.stringify({ completedLevels: ['tutorial', 'level-1', 'level-2', 'level-99'] })
    localStorage.setItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY, raw)
    const guestApi = api()
    const guest = make(null, guestApi)
    guest.start()
    expect(guest.getSnapshot().completedLevels).toEqual(['tutorial', 'level-1', 'level-2'])
    guest.complete('level-3', run)
    guest.stop()
    const remote = api()
    const account = make('alice', remote)
    account.start()
    await account.retry()
    expect(account.getSnapshot().completedLevels).toEqual([])
    expect(account.getSnapshot().hasLegacyArchive).toBe(true)
    expect(guestApi.record).not.toHaveBeenCalled()
    expect(remote.record).not.toHaveBeenCalled()
    expect(localStorage.getItem(SHADOW_RUNNER_LEGACY_PROGRESS_KEY)).toBe(raw)
  })

  it('restores caller ledger completions on a new device without uploading or inventing mastery', async () => {
    const remote = api()
    remote.read.mockResolvedValue([ledger(), { ...ledger('bob'), levelId: 'level-7' }])
    const store = make('alice', remote)
    store.start()
    await store.retry()
    expect(store.getSnapshot().completedLevels).toEqual(['level-3'])
    const result = store.getSnapshot().progress.levels['level-3']!
    expect(result.serverBest?.score).toBe(800)
    expect(result.bestRun).toBeUndefined()
    expect(result.fullClearAchieved).toBeUndefined()
    expect(result.perfectRouteAchieved).toBeUndefined()
    expect(remote.record).not.toHaveBeenCalled()
    expect(make('bob').getSnapshot().completedLevels).toEqual([])
  })

  it('retains pending completions across reload, retries once, and does not re-submit acknowledged levels on mount', async () => {
    const offline = api()
    offline.record.mockRejectedValue(new Error('offline'))
    const first = make('alice', offline)
    first.start()
    await first.retry()
    first.complete('level-1', run)
    await drain()
    expect(first.getSnapshot().status).toBe('error')
    expect(first.getSnapshot().pendingCount).toBe(2)
    first.stop()
    const online = api()
    const second = make('alice', online)
    second.start()
    await second.retry()
    expect(online.record.mock.calls.map(call => call[1])).toEqual(['level-1', 'tutorial'])
    expect(second.getSnapshot().pendingCount).toBe(0)
    second.stop()
    const thirdApi = api()
    const third = make('alice', thirdApi)
    third.start()
    await third.retry()
    expect(thirdApi.record).not.toHaveBeenCalled()
  })

  it('coalesces retry and completion pathways into one in-flight write', async () => {
    const remote = api()
    const write = deferred<void>()
    remote.record.mockReturnValue(write.promise)
    const store = make('alice', remote)
    store.start()
    await store.retry()
    store.complete('tutorial', run)
    store.complete('tutorial', run)
    const first = store.retry()
    const second = store.retry()
    await drain()
    expect(first).toBe(second)
    expect(remote.record).toHaveBeenCalledTimes(1)
    write.resolve()
    await first
    expect(store.getSnapshot().pendingCount).toBe(0)
  })

  it('does not acknowledge a newer replay with an older response; queued maxima and actual best run stay separate', async () => {
    const remote = api()
    const write = deferred<void>()
    remote.record.mockReturnValueOnce(write.promise)
    const store = make('alice', remote)
    store.start()
    await store.retry()
    store.complete('tutorial', { ...run, score: 900 })
    await drain()
    store.complete('tutorial', { ...run, score: 400, coinsCollected: 5, fullClear: true, perfectRoute: true, masteryItems: 2, totalMasteryItems: 3, objectiveItems: 1, totalObjectiveItems: 1 })
    write.resolve()
    await store.retry()
    expect(remote.record).toHaveBeenCalledTimes(2)
    expect(remote.record.mock.calls[1][2]).toMatchObject({ score: 900, coinsCollected: 5 })
    const record = store.getSnapshot().progress.levels.tutorial!
    expect(record.bestRun).toMatchObject({ score: 900, coinsCollected: 3, fullClear: false })
    expect(record.lastRun).toMatchObject({ score: 400, masteryItems: 2, totalMasteryItems: 3, objectiveItems: 1, totalObjectiveItems: 1 })
    expect(record.fullClearAchieved).toBe(true)
    expect(record.perfectRouteAchieved).toBe(true)
    expect(store.getSnapshot().pendingCount).toBe(0)
  })

  it('merges a delayed hydration without overwriting an earned local run', async () => {
    const read = deferred<ShadowRunnerLedgerCompletion[]>()
    const remote = api()
    remote.read.mockReturnValue(read.promise)
    const store = make('alice', remote)
    store.start()
    await drain()
    store.complete('level-3', run)
    read.resolve([ledger()])
    await store.retry()
    expect(store.getSnapshot().progress.levels['level-3']?.bestRun?.score).toBe(200)
    expect(store.getSnapshot().progress.levels['level-3']?.serverBest?.score).toBe(800)
    expect(remote.record).toHaveBeenCalledTimes(2)
  })

  it('ignores old hydration and completion callbacks after an account generation ends', async () => {
    const read = deferred<ShadowRunnerLedgerCompletion[]>()
    const remote = api()
    remote.read.mockReturnValue(read.promise)
    const alice = make('alice', remote)
    alice.start()
    await drain()
    const signal = remote.read.mock.calls[0][1]
    alice.stop()
    const bob = make('bob')
    bob.start()
    alice.complete('level-5', run)
    read.resolve([ledger()])
    await drain()
    expect(signal.aborted).toBe(true)
    expect(alice.getSnapshot().completedLevels).toEqual([])
    expect(bob.getSnapshot().completedLevels).toEqual([])
    expect(remote.record).not.toHaveBeenCalled()
  })

  it('leaves the old owner queue pending after a late write resolves following stop', async () => {
    const write = deferred<void>()
    const remote = api()
    remote.record.mockReturnValue(write.promise)
    const store = make('alice', remote)
    store.start()
    await store.retry()
    store.complete('tutorial', run)
    await drain()
    store.stop()
    write.resolve()
    await drain()
    expect(store.getSnapshot().pendingCount).toBe(1)
    expect(remote.record.mock.calls[0][3].aborted).toBe(true)
    expect(make('bob').getSnapshot().pendingCount).toBe(0)
  })

  it('keeps play usable under denied storage and full storage with truthful errors', async () => {
    const remote = api()
    remote.record.mockRejectedValue(new Error('offline'))
    const store = make('alice', remote, { storage: () => { throw new Error('SecurityError') } })
    expect(store.getSnapshot().storageError).toBeTruthy()
    store.start()
    await store.retry()
    expect(() => store.complete('tutorial', run)).not.toThrow()
    await drain()
    expect(store.getSnapshot()).toMatchObject({ completedLevels: ['tutorial'], pendingCount: 1, status: 'error' })
    expect(store.getSnapshot().storageError).toContain('Unsynced results may be lost')
    const full = make(null, api(), { storage: () => ({ length: 0, key: () => null, removeItem: () => undefined, getItem: () => null, setItem: () => { throw new Error('QuotaExceededError') } }) })
    full.start()
    full.complete('level-1', run)
    expect(full.getSnapshot().storageError).toBeTruthy()
  })

  it.each(['not json', JSON.stringify({ version: 2, ownerId: 'bob', levels: { tutorial: { completedAt: '2026-09-08' } }, pending: {} })])('does not credit malformed or differently owned storage: %s', raw => {
    localStorage.setItem(shadowRunnerProgressKey('alice'), raw)
    expect(make('alice').getSnapshot().completedLevels).toEqual([])
  })

  it('bounds unresponsive requests and supports a manual retry', async () => {
    jest.useFakeTimers()
    const remote = api()
    remote.read.mockImplementationOnce(() => new Promise(() => undefined))
    const store = make('alice', remote, { requestTimeoutMs: 50 })
    store.start()
    await drain()
    await jest.advanceTimersByTimeAsync(51)
    expect(store.getSnapshot().status).toBe('error')
    expect(remote.read.mock.calls[0][1].aborted).toBe(true)
    await store.retry()
    expect(store.getSnapshot().status).toBe('synced')
  })

  it('survives StrictMode start-stop-start without applying the old generation', async () => {
    const read = deferred<ShadowRunnerLedgerCompletion[]>()
    const remote = api()
    remote.read.mockReturnValueOnce(read.promise).mockResolvedValueOnce([])
    const store = make('alice', remote)
    store.start()
    await drain()
    store.stop()
    store.start()
    await store.retry()
    read.resolve([ledger()])
    await drain()
    expect(store.getSnapshot().status).toBe('synced')
    expect(store.getSnapshot().completedLevels).toEqual([])
  })

  it('preserves two offline sessions, local mastery and both pending queues through reload', async () => {
    const firstApi = api()
    const secondApi = api()
    firstApi.record.mockRejectedValue(new Error('offline'))
    secondApi.record.mockRejectedValue(new Error('offline'))
    const first = make('alice', firstApi)
    const second = make('alice', secondApi)
    first.start()
    second.start()
    await Promise.all([first.retry(), second.retry()])
    first.complete('level-1', { ...run, fullClear: true, perfectRoute: true })
    await first.retry()
    second.complete('level-2', { ...run, score: 400 })
    await second.retry()
    first.stop()
    second.stop()
    const reloaded = make('alice')
    expect(reloaded.getSnapshot().completedLevels).toEqual(expect.arrayContaining(['level-1', 'level-2', 'tutorial']))
    expect(reloaded.getSnapshot().pendingCount).toBe(3)
    expect(reloaded.getSnapshot().progress.levels['level-1']).toMatchObject({ perfectRouteAchieved: true, bestRun: { score: 200 } })
    expect(reloaded.getSnapshot().progress.levels['level-2']?.bestRun?.score).toBe(400)
    expect(make('bob').getSnapshot().completedLevels).toEqual([])
    expect(make(null).getSnapshot().completedLevels).toEqual([])
  })

  it('an old cross-context ACK cannot clear a newer replay, even with concurrent clocks', async () => {
    const firstApi = api()
    const oldWrite = deferred<void>()
    firstApi.record.mockReturnValueOnce(oldWrite.promise).mockRejectedValue(new Error('offline'))
    const secondApi = api()
    secondApi.record.mockRejectedValue(new Error('offline'))
    const first = make('alice', firstApi)
    const second = make('alice', secondApi)
    first.start()
    second.start()
    await Promise.all([first.retry(), second.retry()])
    first.complete('tutorial', { ...run, score: 900 })
    await drain()
    const submitted = firstApi.record.mock.calls[0][2]
    second.complete('tutorial', { ...run, score: 400, coinsCollected: 5, perfectRoute: true })
    await second.retry()
    // Independently writing contexts can choose the same Lamport clock.
    const keys = Object.keys(localStorage).filter(key => key.includes(':journal:'))
    const completions = keys.map(key => ({ key, value: JSON.parse(localStorage.getItem(key)!) })).filter(entry => entry.value.type === 'complete')
    const latest = completions.find(entry => entry.value.run.score === 400)!
    latest.value.clock = completions.find(entry => entry.value.run.score === 900)!.value.clock
    localStorage.setItem(latest.key, JSON.stringify(latest.value))
    oldWrite.resolve()
    await first.retry()
    const reloaded = make('alice')
    const pending = reloaded.getSnapshot().progress.pending.tutorial!
    expect(pending).toMatchObject({ score: 900, coinsCollected: 5 })
    expect(pending.revision).not.toBe(submitted.revision)
    expect(reloaded.getSnapshot().pendingCount).toBe(1)
    expect(reloaded.getSnapshot().progress.levels.tutorial?.perfectRouteAchieved).toBe(true)
    const online = api()
    const final = make('alice', online)
    final.start()
    await final.retry()
    expect(online.record).toHaveBeenCalledTimes(1)
    expect(make('alice').getSnapshot().pendingCount).toBe(0)
    await second.retry()
    expect(make('alice').getSnapshot().pendingCount).toBe(0)
  })

  it('a stale session retry does not resurrect an acknowledged queue', async () => {
    const offline = api()
    offline.record.mockRejectedValue(new Error('offline'))
    const stale = make('alice', offline)
    stale.start()
    await stale.retry()
    stale.complete('tutorial', run)
    await stale.retry()
    const online = api()
    const other = make('alice', online)
    other.start()
    await other.retry()
    await stale.retry()
    expect(offline.record).toHaveBeenCalledTimes(1)
    expect(stale.getSnapshot().pendingCount).toBe(0)
    expect(make('alice').getSnapshot().pendingCount).toBe(0)
  })

  it('replays receipts safely after interrupted compaction and serializes compaction by owner', async () => {
    const original = Object.getOwnPropertyDescriptor(navigator, 'locks')
    let tail = Promise.resolve()
    const request = jest.fn((_name: string, callback: () => void) => {
      const task = tail.then(callback)
      tail = task.catch(() => undefined)
      return task
    })
    const remove = jest.spyOn(Storage.prototype, 'removeItem')
    try {
      const firstApi = api()
      firstApi.record.mockRejectedValue(new Error('offline'))
      const first = make('alice', firstApi)
      first.start()
      await first.retry()
      first.complete('tutorial', run)
      await first.retry()
      Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } })
      remove.mockImplementation(() => { throw new Error('interrupted') })
      await tail
      await drain()
      const other = make('alice')
      other.start()
      await other.retry()
      await tail
      await drain()
      expect(make('alice').getSnapshot()).toMatchObject({ completedLevels: ['tutorial'], pendingCount: 0 })
      expect(request.mock.calls.every(call => call[0] === shadowRunnerProgressKey('alice'))).toBe(true)
      expect(Object.keys(localStorage).filter(key => key.includes(':journal:')).length).toBeGreaterThan(0)
      const reloadedApi = api()
      const reloaded = make('alice', reloadedApi)
      reloaded.start()
      await reloaded.retry()
      expect(reloadedApi.record).not.toHaveBeenCalled()
      remove.mockRestore()
      await tail
      await drain()
      await other.retry()
      await tail
      await drain()
      expect(Object.keys(localStorage).filter(key => key.includes(':journal:'))).toEqual([])
    } finally {
      remove.mockRestore()
      if (original) Object.defineProperty(navigator, 'locks', original)
      else Reflect.deleteProperty(navigator, 'locks')
    }
  })

  it('reacts only to this owner storage events and removes its listener on stop', async () => {
    const remote = api()
    remote.record.mockRejectedValue(new Error('offline'))
    const first = make('alice', remote)
    const second = make('alice', remote)
    first.start()
    second.start()
    await Promise.all([first.retry(), second.retry()])
    second.complete('tutorial', run)
    await second.retry()
    const notify = jest.fn()
    first.subscribe(notify)
    window.dispatchEvent(new StorageEvent('storage', { key: shadowRunnerProgressKey('bob') }))
    expect(notify).not.toHaveBeenCalled()
    window.dispatchEvent(new StorageEvent('storage', { key: shadowRunnerProgressKey('alice') }))
    expect(first.getSnapshot().pendingCount).toBe(1)
    first.stop()
    notify.mockClear()
    window.dispatchEvent(new StorageEvent('storage', { key: shadowRunnerProgressKey('alice') }))
    expect(notify).not.toHaveBeenCalled()
  })

  it('re-reads the base if another context compacts during journal enumeration', async () => {
    const remote = api()
    remote.record.mockRejectedValue(new Error('offline'))
    const first = make('alice', remote)
    first.start()
    await first.retry()
    first.complete('tutorial', run)
    await first.retry()
    const checkpoint = first.getSnapshot().progress
    let compacted = false
    const reader = make('alice', api(), { storage: () => ({
      get length() { return localStorage.length },
      getItem: key => localStorage.getItem(key),
      setItem: (key, value) => localStorage.setItem(key, value),
      removeItem: key => localStorage.removeItem(key),
      key: index => {
        if (!compacted) {
          compacted = true
          localStorage.setItem(shadowRunnerProgressKey('alice'), JSON.stringify(checkpoint))
          for (const id of checkpoint.appliedOperations ?? []) localStorage.removeItem(`${shadowRunnerProgressKey('alice')}:journal:${id}`)
        }
        return localStorage.key(index)
      },
    }) })
    expect(reader.getSnapshot()).toMatchObject({ completedLevels: ['tutorial'], pendingCount: 1, storageError: null })
  })

  it('retains both guest sessions without creating an account submission queue', () => {
    const first = make(null)
    const second = make(null)
    first.start()
    second.start()
    first.complete('level-1', run)
    second.complete('level-2', { ...run })
    const result = make(null).getSnapshot()
    expect(result.completedLevels).toEqual(expect.arrayContaining(['tutorial', 'level-1', 'level-2']))
    expect(result.pendingCount).toBe(0)
    expect(make('alice').getSnapshot().completedLevels).toEqual([])
  })

  it.each(['all', 'length', 'key'] as const)('keeps earned progress in memory and never overwrites an archive when %s enumeration support is absent', async missing => {
    const raw = JSON.stringify({ version: 2, ownerId: 'alice', levels: { 'level-1': { completedAt: '2026-09-08' } }, pending: {} })
    const remote = api()
    remote.record.mockRejectedValue(new Error('offline'))
    const setItem = jest.fn()
    const adapter = {
      getItem: (key: string) => key === shadowRunnerProgressKey('alice') ? raw : null,
      setItem,
      ...(missing !== 'all' && missing !== 'length' ? { length: 0 } : {}),
      ...(missing !== 'all' && missing !== 'key' ? { key: (index: number) => localStorage.key(index) } : {}),
    }
    const store = make('alice', remote, { storage: () => adapter })
    store.start()
    await store.retry()
    store.complete('level-2', run)
    await store.retry()
    expect(store.getSnapshot().completedLevels).toEqual(expect.arrayContaining(['level-1', 'level-2']))
    expect(store.getSnapshot().pendingCount).toBeGreaterThan(0)
    expect(store.getSnapshot().storageError).toContain('Unsynced results may be lost')
    expect(setItem).not.toHaveBeenCalled()
    store.stop()
    await store.resume()
    expect(setItem).not.toHaveBeenCalled()
  })

  it('saves and reloads the journal without removeItem; compaction is optional', () => {
    const saved = new Map<string, string>()
    const storage = () => ({
      get length() { return saved.size }, key: (index: number) => [...saved.keys()][index] ?? null,
      getItem: (key: string) => saved.get(key) ?? null,
      setItem: (key: string, value: string) => { saved.set(key, value) },
    })
    const first = make(null, api(), { storage })
    first.start()
    first.complete('tutorial', run)
    expect(first.getSnapshot().storageError).toBeNull()
    expect(make(null, api(), { storage }).getSnapshot().completedLevels).toEqual(['tutorial'])
  })
})
