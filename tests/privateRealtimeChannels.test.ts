import type { RealtimeChannelOptions } from '@supabase/supabase-js'
import { configurePrivateRealtimeChannels } from '../src/lib/privateRealtimeChannels'

test('private mode preserves channel options and context while forbidding a public override', () => {
  const channel = { on: jest.fn() }
  const client = { channel: jest.fn(function (this: unknown) { expect(this).toBe(client); return channel }) }
  const original = client.channel
  const options: RealtimeChannelOptions = {
    config: { private: false, broadcast: { ack: true, self: false }, presence: { key: 'member' } },
  }
  configurePrivateRealtimeChannels(client as any, true)
  configurePrivateRealtimeChannels(client as any, true)
  expect((client.channel as any)('public:messages:u1', options)).toBe(channel)
  expect(original).toHaveBeenCalledTimes(1)
  expect(original).toHaveBeenCalledWith('shadowchat:db:public:messages:u1', {
    config: { private: true, broadcast: { ack: true, self: false }, presence: { key: 'member' } },
  })
  expect(options.config.private).toBe(false)
})

test('keeps the exact private release lane and does not duplicate database prefixes', () => {
  const client = { channel: jest.fn() }
  const original = client.channel
  configurePrivateRealtimeChannels(client as any, true)
  ;(client.channel as any)('app-release-updates')
  ;(client.channel as any)('shadowchat:db:typing:general')
  expect(original.mock.calls).toEqual([
    ['app-release-updates', { config: { private: true } }],
    ['shadowchat:db:typing:general', { config: { private: true } }],
  ])
})

test('default-off staging leaves the original client untouched and never downgrades an enabled client', () => {
  const client = { channel: jest.fn() }
  const original = client.channel
  expect(configurePrivateRealtimeChannels(client as any, false)).toBe(client)
  expect(client.channel).toBe(original)
  configurePrivateRealtimeChannels(client as any, true)
  const secured = client.channel
  configurePrivateRealtimeChannels(client as any, false)
  expect(client.channel).toBe(secured)
})

test('does not retry publicly after a private channel fails', () => {
  const client = { channel: jest.fn(() => { throw new Error('private access denied') }) }
  const original = client.channel
  configurePrivateRealtimeChannels(client as any, true)
  expect(() => (client.channel as any)('dm_messages:u1')).toThrow('private access denied')
  expect(original).toHaveBeenCalledTimes(1)
  expect(original).toHaveBeenCalledWith('shadowchat:db:dm_messages:u1', { config: { private: true } })
})

test('configures reused main and fresh recovery clients before returning them', async () => {
  jest.resetModules()
  jest.doMock('./mocks/env', () => ({
    VITE_SUPABASE_URL: 'https://example.supabase.co', VITE_SUPABASE_ANON_KEY: 'anon', VITE_PRIVATE_REALTIME_ENABLED: 'true',
  }))
  const main = { channel: jest.fn(), realtime: {} }
  const originalMain = main.channel
  ;(globalThis as any).__supabaseClient = main
  const { supabase, createFreshSupabaseClient } = await import('../apps/streamlined/src-overrides/lib/supabase')
  supabase.channel('main')
  expect(originalMain).toHaveBeenCalledWith('shadowchat:db:main', { config: { private: true } })
  const { createClient } = await import('@supabase/supabase-js')
  const originalFresh = jest.fn(() => ({ subscribe: jest.fn() }))
  ;(createClient as jest.Mock).mockReturnValue({ channel: originalFresh, realtime: {} })
  const fresh = createFreshSupabaseClient()
  fresh.channel('fresh')
  expect(originalFresh).toHaveBeenCalledWith('shadowchat:db:fresh', { config: { private: true } })
  delete (globalThis as any).__supabaseClient
  jest.dontMock('./mocks/env')
})
