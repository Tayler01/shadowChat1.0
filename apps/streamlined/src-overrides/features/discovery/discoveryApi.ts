import { STREAMLINED_EDITION } from '../../config/featureFlags'
import { searchMessageLibrary } from '../../../../../src/lib/messageLibrary'
import { searchUsersStrict } from '../../lib/supabase'
import { searchShadowPinImages } from '../../../../../src/features/shadow-pin/api/shadowPinApi'
import {
  clampDiscoverySourceLimit,
  createEmptyDiscoveryGroups,
  getDiscoveryProvidersForScope,
  isDiscoveryQueryReady,
  normalizeDiscoveryQuery,
  type DiscoveryGroups,
  type DiscoveryProvider,
  type DiscoverySearchOptions,
  type DiscoverySearchResponse,
} from './discoveryModel'
import { searchPlayDiscovery } from '../../../../../src/features/discovery/playDiscoveryApi'

export { DISCOVERY_SCOPES } from './discoveryModel'
export type {
  DiscoveryProvider,
  DiscoveryScope,
  DiscoverySearchResponse,
  PlayDiscoveryItem,
} from './discoveryModel'

const PROVIDER_ERROR_MESSAGES: Record<DiscoveryProvider, string> = {
  messages: 'Message search is temporarily unavailable.',
  people: 'People search is temporarily unavailable.',
  pins: 'Pin search is temporarily unavailable.',
  play: 'Play search is temporarily unavailable.',
}

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `discover-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

const createAbortError = () => {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Discovery search was cancelled.', 'AbortError')
  }
  const error = new Error('Discovery search was cancelled.')
  error.name = 'AbortError'
  return error
}

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw createAbortError()
}

const withAbortSignal = <T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> => {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(createAbortError())

  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      cleanup()
      reject(createAbortError())
    }
    const cleanup = () => signal.removeEventListener('abort', onAbort)

    signal.addEventListener('abort', onAbort, { once: true })
    promise.then(
      value => {
        cleanup()
        resolve(value)
      },
      error => {
        cleanup()
        reject(error)
      }
    )
  })
}

const runProvider = (
  provider: DiscoveryProvider,
  query: string,
  limit: number,
  signal?: AbortSignal
): Promise<DiscoveryGroups[DiscoveryProvider]> => {
  if (provider === 'messages') {
    return withAbortSignal(searchMessageLibrary(query, { limit }), signal)
  }
  if (provider === 'people') {
    return withAbortSignal(
      searchUsersStrict(query, { signal }).then(users => users.slice(0, limit)),
      signal
    )
  }
  if (provider === 'pins') {
    return withAbortSignal(searchShadowPinImages(query, limit), signal)
  }
  if (STREAMLINED_EDITION) return Promise.resolve([])
  return withAbortSignal(searchPlayDiscovery(query, limit, signal), signal)
}

export async function searchUniversalDiscovery({
  query,
  scope = 'all',
  limitPerSource,
  signal,
  requestId = createRequestId(),
}: DiscoverySearchOptions): Promise<DiscoverySearchResponse> {
  const normalizedQuery = normalizeDiscoveryQuery(query)
  const groups = createEmptyDiscoveryGroups()
  const response: DiscoverySearchResponse = {
    requestId,
    query: normalizedQuery,
    groups,
    errors: {},
  }

  throwIfAborted(signal)
  if (!isDiscoveryQueryReady(normalizedQuery)) return response

  const providers = getDiscoveryProvidersForScope(scope)
  const limit = clampDiscoverySourceLimit(limitPerSource)
  const settled = await Promise.allSettled(
    providers.map(provider => runProvider(provider, normalizedQuery, limit, signal))
  )

  throwIfAborted(signal)
  settled.forEach((result, index) => {
    const provider = providers[index]
    if (result.status === 'fulfilled') {
      groups[provider] = result.value as never
      return
    }
    response.errors[provider] = {
      code: 'unavailable',
      message: PROVIDER_ERROR_MESSAGES[provider],
    }
  })

  return response
}
