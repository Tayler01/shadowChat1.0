/** Kept behind a dynamic import so CommonJS Jest suites never parse Vite's worker URL. */
export function createShadowCheckersAiWorker(): Worker {
  return new Worker(new URL('./checkersAi.worker.ts', import.meta.url), { type: 'module' })
}
