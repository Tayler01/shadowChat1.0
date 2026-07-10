import type { RealtimeChannel } from '@supabase/supabase-js'

export type RealtimeStatus = 'CHANNEL_ERROR' | 'TIMED_OUT' | 'CLOSED' | 'SUBSCRIBED' | string

export type RealtimeClientLike = {
  removeChannel?: (channel: RealtimeChannel) => unknown
}

export type ManagedRealtimeSubscription = {
  channel: RealtimeChannel | null
  client?: RealtimeClientLike | null
}

export type RealtimeSubscribeFactory = () => Promise<ManagedRealtimeSubscription | RealtimeChannel | null>

export const isRecoverableRealtimeStatus = (status: RealtimeStatus | null | undefined) => (
  status === 'CHANNEL_ERROR' || status === 'TIMED_OUT'
)

export const removeRealtimeChannel = async (
  client: RealtimeClientLike | null | undefined,
  channel: RealtimeChannel | null | undefined
) => {
  if (!channel || typeof client?.removeChannel !== 'function') return false

  try {
    await client.removeChannel(channel)
    return true
  } catch {
    return false
  }
}

type RealtimeSubscriptionManagerOptions = {
  getFallbackClient?: () => RealtimeClientLike | null | undefined
}

const normalizeSubscriptionResult = (
  result: ManagedRealtimeSubscription | RealtimeChannel | null,
  fallbackClient: RealtimeClientLike | null | undefined
): ManagedRealtimeSubscription => {
  if (!result) {
    return { channel: null, client: fallbackClient }
  }

  if ('channel' in result) {
    return {
      channel: result.channel,
      client: result.client ?? fallbackClient,
    }
  }

  return {
    channel: result,
    client: fallbackClient,
  }
}

export function createRealtimeSubscriptionManager(
  options: RealtimeSubscriptionManagerOptions = {}
) {
  let activeChannel: RealtimeChannel | null = null
  let activeClient: RealtimeClientLike | null | undefined = null
  let subscribeFactory: RealtimeSubscribeFactory | null = null
  let stopped = true
  let generation = 0
  let scheduledResubscribe: ReturnType<typeof setTimeout> | null = null
  let resubscribePromise: Promise<RealtimeChannel | null> | null = null

  const getFallbackClient = () => options.getFallbackClient?.() ?? null

  const removeActiveChannel = async () => {
    const channel = activeChannel
    const client = activeClient ?? getFallbackClient()
    activeChannel = null
    activeClient = null
    return removeRealtimeChannel(client, channel)
  }

  const cancelScheduledResubscribe = () => {
    if (scheduledResubscribe === null) return false
    clearTimeout(scheduledResubscribe)
    scheduledResubscribe = null
    return true
  }

  const start = async (
    nextSubscribeFactory: RealtimeSubscribeFactory | null = subscribeFactory
  ): Promise<RealtimeChannel | null> => {
    if (!nextSubscribeFactory) return null

    subscribeFactory = nextSubscribeFactory
    stopped = false
    const currentGeneration = ++generation
    const result = normalizeSubscriptionResult(
      await nextSubscribeFactory(),
      getFallbackClient()
    )

    if (stopped || currentGeneration !== generation) {
      await removeRealtimeChannel(result.client ?? getFallbackClient(), result.channel)
      return null
    }

    activeChannel = result.channel
    activeClient = result.client ?? getFallbackClient()
    return activeChannel
  }

  const resubscribe = async (): Promise<RealtimeChannel | null> => {
    if (stopped || !subscribeFactory) return null
    if (resubscribePromise) return resubscribePromise

    cancelScheduledResubscribe()
    const currentSubscribeFactory = subscribeFactory
    resubscribePromise = (async () => {
      await removeActiveChannel()
      if (stopped) return null
      return start(currentSubscribeFactory)
    })().finally(() => {
      resubscribePromise = null
    })

    return resubscribePromise
  }

  const scheduleResubscribe = (delayMs: number) => {
    if (stopped || !subscribeFactory || scheduledResubscribe !== null) return false

    scheduledResubscribe = setTimeout(() => {
      scheduledResubscribe = null
      if (stopped) return
      void resubscribe()
    }, Math.max(0, delayMs))

    return true
  }

  const stop = async () => {
    stopped = true
    generation += 1
    cancelScheduledResubscribe()
    return removeActiveChannel()
  }

  const clearSubscribe = (targetSubscribeFactory?: RealtimeSubscribeFactory) => {
    if (!targetSubscribeFactory || subscribeFactory === targetSubscribeFactory) {
      subscribeFactory = null
    }
  }

  return {
    setSubscribe(nextSubscribeFactory: RealtimeSubscribeFactory | null) {
      subscribeFactory = nextSubscribeFactory
    },
    clearSubscribe,
    start,
    resubscribe,
    scheduleResubscribe,
    cancelScheduledResubscribe,
    stop,
    getActiveChannel: () => activeChannel,
  }
}
