import { chooseShadowCheckersAiMove } from './checkersAi'
import type { ShadowCheckersAiChoice, ShadowCheckersAiDifficulty } from './checkersAi'
import type { CheckersBoardState } from './types'

type WorkerRequest =
  | { type: 'choose'; id: number; state: CheckersBoardState; difficulty: ShadowCheckersAiDifficulty }
  | { type: 'cancel'; id: number }

type WorkerResponse =
  | { id: number; choice: ShadowCheckersAiChoice | null }
  | { id: number; error: { name: string; message: string } }

const scope = self as unknown as {
  onmessage: ((event: MessageEvent<WorkerRequest>) => void) | null
  postMessage(message: WorkerResponse): void
}
const controllers = new Map<number, AbortController>()

scope.onmessage = event => {
  const request = event.data
  if (request.type === 'cancel') {
    controllers.get(request.id)?.abort()
    return
  }

  const controller = new AbortController()
  controllers.set(request.id, controller)
  void chooseShadowCheckersAiMove(request.state, {
    difficulty: request.difficulty,
    signal: controller.signal,
  }).then(choice => {
    if (!controller.signal.aborted) scope.postMessage({ id: request.id, choice })
  }).catch(reason => {
    if (controller.signal.aborted) return
    const error = reason instanceof Error ? reason : new Error('Computer move search failed')
    scope.postMessage({ id: request.id, error: { name: error.name, message: error.message } })
  }).finally(() => {
    controllers.delete(request.id)
  })
}
