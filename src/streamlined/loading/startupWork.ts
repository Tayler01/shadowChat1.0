export type StartupStep = 'runtime' | 'auth' | 'membership' | 'modules' | 'data' | 'view'
const weights: Record<StartupStep, number> = { runtime: 10, auth: 20, membership: 15, modules: 30, data: 20, view: 5 }
export function createStartupWork() {
  let generation = 1
  let completed = new Set<StartupStep>()
  let imports = 0, resolvedImports = 0, failed = false
  const listeners = new Set<() => void>()
  let snapshot = { generation, progress: 0, complete: false, failed: false }
  const publish = () => {
    const modules = completed.has('modules') ? weights.modules
      : weights.modules * resolvedImports / (imports + 1)
    const raw = Object.entries(weights).reduce((sum, [step, weight]) =>
      sum + (step !== 'modules' && completed.has(step as StartupStep) ? weight : 0), modules) / 100
    const complete = !failed && completed.size === Object.keys(weights).length && resolvedImports === imports
    snapshot = { generation, progress: complete ? 1 : Math.max(snapshot.progress, Math.min(raw, .99)), complete, failed }
    void Promise.resolve().then(() => listeners.forEach(listener => listener()))
  }
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
    getSnapshot: () => snapshot,
    beginRecovery(cached: StartupStep[] = ['runtime'], force = false) {
      if (!force && !snapshot.complete && !snapshot.failed) return
      generation++; completed = new Set(cached); imports = 0; resolvedImports = 0; failed = false
      snapshot = { generation, progress: 0, complete: false, failed: false }; publish()
    },
    finish(step: StartupStep) { if (!completed.has(step)) { completed.add(step); publish() } },
    fail() { failed = true; publish() },
    async module<T>(load: () => Promise<T>): Promise<T> {
      if (snapshot.complete) return load()
      const ownGeneration = generation; imports++; publish()
      try { const value = await load(); if (generation === ownGeneration) { resolvedImports++; publish() }; return value }
      catch (error) { if (generation === ownGeneration) { failed = true; publish() }; throw error }
    },
  }
}
export const startupWork = createStartupWork()
