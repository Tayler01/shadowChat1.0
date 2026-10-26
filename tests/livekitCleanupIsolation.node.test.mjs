import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createLiveKitCleanupPlan, LIVEKIT_QA_PROJECT, runLiveKitCleanupProof, validateLiveKitIsolationReview } from '../scripts/livekit-cleanup-isolation.mjs'

function fixture() {
  const plan = createLiveKitCleanupPlan()
  const state = { room: null, calls: [], participants: [], dispatches: [{ agentName: plan.agentName, state: { jobs: [] } }] }
  const rooms = {
    listRooms: async names => { state.calls.push(['list', names]); assert.deepEqual(names, [plan.roomName]); return state.room ? [state.room] : [] },
    createRoom: async options => {
      state.calls.push(['create', options])
      assert.deepEqual(options.agents, [{ agentName: plan.agentName }])
      assert.equal(options.egress, undefined); assert.equal(options.roomPreset, undefined)
      state.room = { sid: 'RM_Synthetic123', name: options.name, metadata: options.metadata, numParticipants: 0, numPublishers: 0, activeRecording: false }
      return state.room
    },
    listParticipants: async room => { assert.equal(room, plan.roomName); return state.participants },
    removeParticipant: async (room, identity, options) => {
      assert.equal(room, plan.roomName); assert.equal(identity, plan.participantIdentity)
      assert.equal(typeof options.revokeTokenTs, 'bigint')
      state.calls.push(['revoke', room])
      if (!state.room) throw Object.assign(new Error('already absent'), { code: 'not_found' })
    },
    deleteRoom: async room => {
      assert.equal(room, plan.roomName); state.calls.push(['delete', room])
      if (!state.room) throw Object.assign(new Error('already absent'), { code: 'not_found' })
      state.room = null
    },
  }
  const dispatches = { listDispatch: async room => { assert.equal(room, plan.roomName); return state.dispatches } }
  return { plan, rooms, dispatches, state }
}

test('one exact empty room uses shared cleanup, revocation cutoff and absence verification twice', async () => {
  const fx = fixture()
  const evidence = await runLiveKitCleanupProof(fx)
  assert.equal(evidence.error, null)
  assert.equal(evidence.cleanup.verified, true)
  assert.equal(evidence.checks.length, 8)
  assert.equal(fx.state.calls.filter(item => item[0] === 'create').length, 1)
  assert.equal(fx.state.calls.filter(item => item[0] === 'delete').length, 2)
  assert.equal(fx.state.calls.filter(item => item[0] === 'revoke').length, 2)
})

test('application room or different project is rejected before even provider reads', async () => {
  for (const patch of [{ roomName: 'shado-live-00000000-0000-4000-8000-000000000001' }, { project: { ...LIVEKIT_QA_PROJECT, name: 'other' } }]) {
    const fx = fixture(); Object.assign(fx.plan, patch)
    await assert.rejects(runLiveKitCleanupProof(fx))
    assert.deepEqual(fx.state.calls, [])
  }
})

test('name collision never overwrites or removes the pre-existing room', async () => {
  const fx = fixture(); fx.state.room = { name: fx.plan.roomName, metadata: 'someone else' }
  const evidence = await runLiveKitCleanupProof(fx)
  assert.match(evidence.error, /already exists/)
  assert.equal(evidence.createAttempted, false)
  assert.deepEqual(fx.state.calls.map(item => item[0]), ['list'])
})

test('lost create response recovers only the exact independently marked empty room', async () => {
  const fx = fixture(); const create = fx.rooms.createRoom
  fx.rooms.createRoom = async options => { await create(options); throw new Error('response lost') }
  const evidence = await runLiveKitCleanupProof(fx)
  assert.match(evidence.error, /response lost/)
  assert.equal(evidence.cleanup.verified, true)
  assert.equal(fx.state.room, null)
})

test('unknown create response with empty lookup is not falsely labeled clean', async () => {
  const fx = fixture()
  fx.rooms.createRoom = async () => { throw new Error('creation outcome unknown') }
  const evidence = await runLiveKitCleanupProof(fx)
  assert.match(evidence.error, /outcome unknown/)
  assert.equal(evidence.cleanup.verified, false)
  assert.match(evidence.cleanup.error, /empty lookup cannot confirm cleanup/)
  assert.equal(fx.state.calls.some(item => item[0] === 'delete' || item[0] === 'revoke'), false)
})

test('provider failures remain failures even if final cleanup is successful', async () => {
  const fx = fixture(); let removes = 0; const remove = fx.rooms.deleteRoom
  fx.rooms.deleteRoom = async room => { if (++removes === 1) throw Object.assign(new Error('unavailable'), { status: 503 }); await remove(room) }
  const evidence = await runLiveKitCleanupProof(fx)
  assert.match(evidence.error, /unavailable/)
  assert.equal(evidence.cleanup.verified, true)
})

test('foreign marker, active participant, recording or unexpected dispatch prevents destructive cleanup', async () => {
  for (const mode of ['marker', 'participant', 'recording', 'dispatch', 'job']) {
    const fx = fixture(); const create = fx.rooms.createRoom
    fx.rooms.createRoom = async options => {
      const room = await create(options)
      if (mode === 'marker') room.metadata = 'foreign marker'
      if (mode === 'participant') { room.numParticipants = 1; fx.state.participants.push({ identity: 'unrelated' }) }
      if (mode === 'recording') room.activeRecording = true
      if (mode === 'dispatch') fx.state.dispatches[0].agentName = ''
      if (mode === 'job') fx.state.dispatches[0].state.jobs.push({ id: 'unexpected' })
      return room
    }
    const evidence = await runLiveKitCleanupProof(fx)
    assert(evidence.error, mode)
    assert.equal(evidence.cleanup.verified, false, mode)
    assert.equal(fx.state.calls.some(item => item[0] === 'delete' || item[0] === 'revoke'), false, mode)
  }
})

test('isolation review fails closed on stale, missing callback and agent evidence', () => {
  const current = {
    version: 2, project: LIVEKIT_QA_PROJECT, verifiedAt: new Date().toISOString(),
    webhookUrls: ['https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/shado-live-provider-webhook'],
    allProjectWebhookDestinationsVerified: true, noncanonicalRoomRejectedBeforeAdminClient: true,
    visibleCloudAndSelfHostedAgents: 0, agentIsolationStrategy: 'explicit-random-nonexistent-name',
  }
  validateLiveKitIsolationReview(current)
  for (const patch of [{ verifiedAt: '2020-01-01' }, { webhookUrls: [] }, { allProjectWebhookDestinationsVerified: false },
    { visibleCloudAndSelfHostedAgents: 1 }, { agentIsolationStrategy: 'empty-array' }]) {
    assert.throws(() => validateLiveKitIsolationReview({ ...current, ...patch }))
  }
})
