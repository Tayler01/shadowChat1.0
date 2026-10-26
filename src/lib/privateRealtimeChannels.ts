import type { RealtimeChannel, RealtimeChannelOptions } from '@supabase/supabase-js'

export const DATABASE_REALTIME_PREFIX = 'shadowchat:db:'
export const RELEASE_REALTIME_TOPIC = 'app-release-updates'

type ChannelClient = {
  channel: (topic: string, options?: RealtimeChannelOptions) => RealtimeChannel
}

const configuredClients = new WeakSet<object>()

export const privateRealtimeTopic = (topic: string) =>
  topic === RELEASE_REALTIME_TOPIC || topic.startsWith(DATABASE_REALTIME_PREFIX)
    ? topic
    : `${DATABASE_REALTIME_PREFIX}${topic}`

/** Prepare every browser channel, including fresh recovery clients, for private-only Realtime. */
export const configurePrivateRealtimeChannels = <T extends ChannelClient>(client: T, enabled: boolean): T => {
  if (!enabled || configuredClients.has(client)) return client
  const createChannel = client.channel.bind(client)
  client.channel = (topic, options) => createChannel(privateRealtimeTopic(topic), {
    ...options,
    config: { ...options?.config, private: true },
  })
  configuredClients.add(client)
  return client
}
