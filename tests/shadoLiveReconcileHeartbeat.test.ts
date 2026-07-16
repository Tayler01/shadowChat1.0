import {
  createShadoLiveReconcileRunner,
  SHADO_LIVE_RECONCILE_INTERVAL_MS,
} from '../src/features/entertainment/shado-live/real/shadoLiveReconcileHeartbeat'

test('uses a cadence below the reconcile Edge Function rate limit', () => {
  expect(SHADO_LIVE_RECONCILE_INTERVAL_MS).toBeGreaterThanOrEqual(20_000)
})

test('runs only when visible and online and never overlaps', async () => {
  let allowed = false
  let resolveRun: () => void = () => undefined
  const run = jest.fn(() => new Promise<void>(resolve => { resolveRun = resolve }))
  const runner = createShadoLiveReconcileRunner({ run, canRun: () => allowed })

  await runner.tick()
  expect(run).not.toHaveBeenCalled()

  allowed = true
  const first = runner.tick()
  void runner.tick()
  expect(run).toHaveBeenCalledTimes(1)
  expect(runner.isRunning()).toBe(true)

  resolveRun()
  await first
  expect(runner.isRunning()).toBe(false)
  const second = runner.tick()
  expect(run).toHaveBeenCalledTimes(2)
  resolveRun()
  await second
})

test('releases the lock after a failed background drain', async () => {
  const run = jest.fn()
    .mockRejectedValueOnce(new Error('offline'))
    .mockResolvedValueOnce(undefined)
  const runner = createShadoLiveReconcileRunner({ run, canRun: () => true })

  await expect(runner.tick()).resolves.toBeUndefined()
  await expect(runner.tick()).resolves.toBeUndefined()
  expect(run).toHaveBeenCalledTimes(2)
})
