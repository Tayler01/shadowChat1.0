import type { RealtimeChannel } from '@supabase/supabase-js'
import {
  createRealtimeSubscriptionManager,
  isRecoverableRealtimeStatus,
  removeRealtimeChannel,
} from '../src/lib/realtimeSubscription'

const makeChannel = (id: string) => ({ id }) as unknown as RealtimeChannel

describe('realtime subscription helper', () => {
  it('detects recoverable realtime statuses', () => {
    expect(isRecoverableRealtimeStatus('CHANNEL_ERROR')).toBe(true)
    expect(isRecoverableRealtimeStatus('TIMED_OUT')).toBe(true)
    expect(isRecoverableRealtimeStatus('SUBSCRIBED')).toBe(false)
    expect(isRecoverableRealtimeStatus('CLOSED')).toBe(false)
    expect(isRecoverableRealtimeStatus(null)).toBe(false)
  })

  it('removes channels safely and swallows cleanup failures', async () => {
    const channel = makeChannel('channel-1')
    const client = { removeChannel: jest.fn() }

    await expect(removeRealtimeChannel(client, channel)).resolves.toBe(true)
    expect(client.removeChannel).toHaveBeenCalledWith(channel)

    client.removeChannel.mockImplementationOnce(() => {
      throw new Error('already closed')
    })
    await expect(removeRealtimeChannel(client, channel)).resolves.toBe(false)
  })

  it('removes a stale channel when stopped before async subscribe resolves', async () => {
    const channel = makeChannel('slow-channel')
    const client = { removeChannel: jest.fn() }
    let resolveSubscribe!: (value: { channel: RealtimeChannel; client: typeof client }) => void
    const manager = createRealtimeSubscriptionManager()

    const startPromise = manager.start(() => new Promise(resolve => {
      resolveSubscribe = resolve
    }))
    await manager.stop()

    resolveSubscribe({ channel, client })
    await expect(startPromise).resolves.toBeNull()

    expect(client.removeChannel).toHaveBeenCalledWith(channel)
    expect(manager.getActiveChannel()).toBeNull()
  })

  it('keeps the latest subscription when older async subscribe resolves late', async () => {
    const slowChannel = makeChannel('slow-channel')
    const fastChannel = makeChannel('fast-channel')
    const client = { removeChannel: jest.fn() }
    let resolveSlow!: (value: { channel: RealtimeChannel; client: typeof client }) => void
    const manager = createRealtimeSubscriptionManager()

    const slowStart = manager.start(() => new Promise(resolve => {
      resolveSlow = resolve
    }))
    const fastStart = manager.start(async () => ({ channel: fastChannel, client }))

    await expect(fastStart).resolves.toBe(fastChannel)
    expect(manager.getActiveChannel()).toBe(fastChannel)

    resolveSlow({ channel: slowChannel, client })
    await expect(slowStart).resolves.toBeNull()

    expect(client.removeChannel).toHaveBeenCalledWith(slowChannel)
    expect(client.removeChannel).not.toHaveBeenCalledWith(fastChannel)
    expect(manager.getActiveChannel()).toBe(fastChannel)
  })

  it('resubscribes by removing the active channel and starting the current factory', async () => {
    const client = { removeChannel: jest.fn() }
    const firstChannel = makeChannel('first-channel')
    const secondChannel = makeChannel('second-channel')
    const factories = [firstChannel, secondChannel]
    const manager = createRealtimeSubscriptionManager()

    manager.setSubscribe(async () => ({
      channel: factories.shift() ?? makeChannel('extra-channel'),
      client,
    }))

    await expect(manager.start()).resolves.toBe(firstChannel)
    await expect(manager.resubscribe()).resolves.toBe(secondChannel)

    expect(client.removeChannel).toHaveBeenCalledWith(firstChannel)
    expect(client.removeChannel).not.toHaveBeenCalledWith(secondChannel)
    expect(manager.getActiveChannel()).toBe(secondChannel)
  })

  it('stops idempotently', async () => {
    const channel = makeChannel('active-channel')
    const client = { removeChannel: jest.fn() }
    const manager = createRealtimeSubscriptionManager()

    await manager.start(async () => ({ channel, client }))
    await manager.stop()
    await manager.stop()

    expect(client.removeChannel).toHaveBeenCalledTimes(1)
    expect(manager.getActiveChannel()).toBeNull()
  })
})
