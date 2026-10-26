import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { removeClaimedBunnyMedia } from './bunny-media-removal.ts'

const identity = { libraryId: '123', assetId: 'asset', ownerId: 'owner', sourceType: 'shadow_pin_image', sourceId: 'pin' }

Deno.test('provider deletion is called only after a durable exact-identity claim and before completion', async () => {
  const calls: string[] = []
  const result = await removeClaimedBunnyMedia(identity, {
    claim: async actual => { assertEquals(actual, identity); calls.push('claim'); return 'claim-id' },
    remove: async () => { calls.push('provider'); return { success: true } },
    finish: async id => { assertEquals(id, 'claim-id'); calls.push('finish') },
  })
  assertEquals(result, { success: true })
  assertEquals(calls, ['claim', 'provider', 'finish'])
})

Deno.test('held or forged source rejection cannot reach the provider', async () => {
  const calls: string[] = []
  await assertRejects(() => removeClaimedBunnyMedia(identity, {
    claim: () => Promise.reject(new Error('retained')),
    remove: async () => { calls.push('provider') },
    finish: async () => { calls.push('finish') },
  }), Error, 'retained')
  assertEquals(calls, [])
})

Deno.test('missing claim receipt cannot reach the provider', async () => {
  const calls: string[] = []
  await assertRejects(() => removeClaimedBunnyMedia(identity, {
    claim: () => Promise.resolve(''),
    remove: async () => { calls.push('provider') },
    finish: async () => { calls.push('finish') },
  }), Error, 'claim is unavailable')
  assertEquals(calls, [])
})

Deno.test('timeout or provider failure leaves intent pending rather than inventing success', async () => {
  const calls: string[] = []
  await assertRejects(() => removeClaimedBunnyMedia(identity, {
    claim: async () => { calls.push('claim'); return 'claim-id' },
    remove: () => Promise.reject(new Error('unknown provider response')),
    finish: async () => { calls.push('finish') },
  }), Error, 'unknown provider response')
  assertEquals(calls, ['claim'])
})

Deno.test('lost completion receipt is surfaced and the same claim can safely retry a provider 404', async () => {
  let finishes = 0
  let removals = 0
  const dependencies = {
    claim: () => Promise.resolve('same-durable-id'),
    remove: async () => { removals++; return { alreadyAbsent: removals > 1 } },
    finish: async () => { if (++finishes === 1) throw new Error('lost database response') },
  }
  await assertRejects(() => removeClaimedBunnyMedia(identity, dependencies), Error, 'lost database response')
  assertEquals(await removeClaimedBunnyMedia(identity, dependencies), { alreadyAbsent: true })
  assertEquals(removals, 2)
})
