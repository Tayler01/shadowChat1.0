import assert from 'node:assert/strict'
import { AgentDispatchClient } from 'npm:livekit-server-sdk@2.17.0'
import { createLiveKitClients } from '../supabase/functions/_shared/shado-live.ts'
import { createLiveKitCleanupPlan } from '../scripts/livekit-cleanup-isolation.mjs'

Deno.test('pinned production SDK preserves explicit inert dispatch and revocation cutoff on the wire', async () => {
  const originalFetch = globalThis.fetch
  const names = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET']
  const originalEnvironment = names.map(name => Deno.env.get(name))
  Deno.env.set(names[0], 'wss://synthetic-livekit.invalid')
  Deno.env.set(names[1], 'fixture-key')
  Deno.env.set(names[2], 'fixture-secret-for-offline-signing')
  const plan = createLiveKitCleanupPlan()
  const requests = []
  globalThis.fetch = async (url, options) => {
    const target = new URL(url)
    assert.equal(target.origin, 'https://synthetic-livekit.invalid')
    const body = JSON.parse(options.body)
    requests.push({ method: target.pathname.split('/').at(-1), body })
    const response = target.pathname.endsWith('/CreateRoom')
      ? { sid: 'RM_Synthetic123', name: plan.roomName, metadata: plan.metadata }
      : target.pathname.endsWith('/ListDispatch')
        ? { agentDispatches: [{ id: 'AD_fixture', room: plan.roomName, agentName: plan.agentName, state: { jobs: [] } }] }
        : {}
    return new Response(JSON.stringify(response), { status: 200, headers: { 'Content-Type': 'application/json' } })
  }
  try {
    const clients = createLiveKitClients()
    await clients.rooms.createRoom({ name: plan.roomName, metadata: plan.metadata, emptyTimeout: 120,
      departureTimeout: 5, maxParticipants: 1, agents: [{ agentName: plan.agentName }] })
    const dispatches = new AgentDispatchClient(clients.serviceUrl, clients.apiKey, clients.apiSecret)
    const found = await dispatches.listDispatch(plan.roomName)
    assert.equal(found[0].agentName, plan.agentName)
    const cutoff = BigInt(Math.floor(Date.now() / 1000))
    await clients.rooms.removeParticipant(plan.roomName, plan.participantIdentity, { revokeTokenTs: cutoff })
    await clients.rooms.deleteRoom(plan.roomName)
    assert.deepEqual(requests, [
      { method: 'CreateRoom', body: { name: plan.roomName, metadata: plan.metadata, emptyTimeout: 120,
        departureTimeout: 5, maxParticipants: 1, agents: [{ agentName: plan.agentName }] } },
      { method: 'ListDispatch', body: { room: plan.roomName } },
      { method: 'RemoveParticipant', body: { room: plan.roomName, identity: plan.participantIdentity, revokeTokenTs: cutoff.toString() } },
      { method: 'DeleteRoom', body: { room: plan.roomName } },
    ])
  } finally {
    globalThis.fetch = originalFetch
    names.forEach((name, index) => originalEnvironment[index] === undefined ? Deno.env.delete(name) : Deno.env.set(name, originalEnvironment[index]))
  }
})
