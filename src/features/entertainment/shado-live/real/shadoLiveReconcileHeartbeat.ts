export const SHADO_LIVE_RECONCILE_INTERVAL_MS = 20_000

export interface ShadoLiveReconcileRunner {
  tick: () => Promise<void>
  isRunning: () => boolean
}

export const createShadoLiveReconcileRunner = ({
  run,
  canRun,
}: {
  run: () => Promise<unknown>
  canRun: () => boolean
}): ShadoLiveReconcileRunner => {
  let running = false

  return {
    isRunning: () => running,
    tick: async () => {
      if (running || !canRun()) return
      running = true
      try {
        await run()
      } catch {
        // Reconciliation is a best-effort outbox drain. Canonical room reads
        // and provider reconnect states remain the user-visible authority.
      } finally {
        running = false
      }
    },
  }
}
