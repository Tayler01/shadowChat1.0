import { chooseShadowCheckersAiMove, type ShadowCheckersAiChoice, type ShadowCheckersAiDifficulty } from './checkersAi'
import type { CheckersBoardState } from './types'

export interface ShadowCheckersAiClientOptions {
  difficulty?: ShadowCheckersAiDifficulty
  signal?: AbortSignal
}

export interface ShadowCheckersAiClient {
  chooseMove(state: CheckersBoardState, options?: ShadowCheckersAiClientOptions): Promise<ShadowCheckersAiChoice | null>
  dispose(): void
}

type WorkerResponse =
  | { id: number; choice: ShadowCheckersAiChoice | null }
  | { id: number; error: { name: string; message: string } }

interface PendingChoice {
  resolve: (choice: ShadowCheckersAiChoice | null) => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort: () => void
}

function abortError(): Error {
  const error = new Error('Shadow Checkers AI search cancelled')
  error.name = 'AbortError'
  return error
}

/** Runs the bounded search off the UI thread in Vite, with a direct fallback. */
export function createShadowCheckersAiClient(): ShadowCheckersAiClient {
  let worker: Worker | null = null
  let workerPromise: Promise<Worker | null> | null = null
  let disposed = false
  let nextId = 0
  const pending = new Map<number, PendingChoice>()

  const settle = (id: number, response: WorkerResponse) => {
    const request = pending.get(id)
    if (!request) return
    pending.delete(id)
    request.signal?.removeEventListener('abort', request.onAbort)
    if ('error' in response) {
      const error = new Error(response.error.message)
      error.name = response.error.name
      request.reject(error)
    } else {
      request.resolve(response.choice)
    }
  }

  const attachWorker = (nextWorker: Worker) => {
    worker = nextWorker
    nextWorker.onmessage = event => settle((event.data as WorkerResponse).id, event.data as WorkerResponse)
    nextWorker.onerror = () => {
      for (const [id, request] of pending) {
        request.signal?.removeEventListener('abort', request.onAbort)
        request.reject(new Error('Computer move worker stopped'))
        pending.delete(id)
      }
      nextWorker.terminate()
      if (worker === nextWorker) worker = null
      workerPromise = null
    }
    return nextWorker
  }

  const ensureWorker = async (): Promise<Worker | null> => {
    if (worker) return worker
    if (typeof Worker === 'undefined' || disposed) return null
    workerPromise ??= import('./checkersAiWorkerFactory')
      .then(({ createShadowCheckersAiWorker }) => attachWorker(createShadowCheckersAiWorker()))
      .catch(() => null)
    const created = await workerPromise
    if (disposed && created) {
      created.terminate()
      if (worker === created) worker = null
      return null
    }
    return created
  }

  return {
    async chooseMove(state, options = {}) {
      if (disposed) throw new Error('Computer move client is disposed')
      if (options.signal?.aborted) throw abortError()
      const activeWorker = await ensureWorker()
      if (disposed) throw new Error('Computer move client is disposed')
      if (options.signal?.aborted) throw abortError()
      if (!activeWorker) return chooseShadowCheckersAiMove(state, options)

      const id = ++nextId
      return new Promise<ShadowCheckersAiChoice | null>((resolve, reject) => {
        const onAbort = () => {
          const request = pending.get(id)
          if (!request) return
          pending.delete(id)
          options.signal?.removeEventListener('abort', onAbort)
          activeWorker.postMessage({ type: 'cancel', id })
          reject(abortError())
        }
        pending.set(id, { resolve, reject, signal: options.signal, onAbort })
        options.signal?.addEventListener('abort', onAbort, { once: true })
        if (options.signal?.aborted) {
          onAbort()
          return
        }
        try {
          activeWorker.postMessage({ type: 'choose', id, state, difficulty: options.difficulty ?? 'casual' })
        } catch (reason) {
          pending.delete(id)
          options.signal?.removeEventListener('abort', onAbort)
          reject(reason instanceof Error ? reason : new Error('Unable to start computer move'))
        }
      })
    },
    dispose() {
      if (disposed) return
      disposed = true
      for (const [id, request] of pending) {
        request.signal?.removeEventListener('abort', request.onAbort)
        request.reject(abortError())
        pending.delete(id)
      }
      worker?.terminate()
      worker = null
      workerPromise = null
    },
  }
}

let sharedClient: ShadowCheckersAiClient | null = null

/** Simple async entrypoint for the screen; lazily starts one worker when available. */
export function chooseShadowCheckersAiMoveAsync(
  state: CheckersBoardState,
  options?: ShadowCheckersAiClientOptions,
): Promise<ShadowCheckersAiChoice | null> {
  sharedClient ??= createShadowCheckersAiClient()
  return sharedClient.chooseMove(state, options)
}

/** Call when leaving Solo mode to cancel any outstanding search and release its Worker. */
export function disposeSharedShadowCheckersAiClient(): void {
  sharedClient?.dispose()
  sharedClient = null
}
