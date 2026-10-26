import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { cleanupAccountProviders } from '../supabase/functions/_shared/account-deletion-providers.ts'

export const LIVEKIT_QA_PROJECT = {
  name: 'shadow', id: 'p_2wev9daulo1', url: 'wss://shadow-pgcs0hub.livekit.cloud',
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const QA_PREFIX = 'shadowchat-qa-empty-delete-'

export function createLiveKitCleanupPlan() {
  const operationId = randomUUID()
  const nonce = randomUUID()
  return {
    version: 1, project: { ...LIVEKIT_QA_PROJECT }, operationId,
    roomName: `${QA_PREFIX}${operationId}`,
    agentName: `shadowchat-qa-no-agent-${randomUUID()}`,
    participantIdentity: randomUUID(),
    metadata: JSON.stringify({ purpose: 'shadowchat-empty-provider-cleanup-proof', operationId, nonce }),
    emptyTimeout: 120, departureTimeout: 5, maxParticipants: 1,
    createdAt: new Date().toISOString(),
  }
}

export function validateLiveKitCleanupPlan(plan) {
  assert.equal(plan.version, 1)
  assert.deepEqual(plan.project, LIVEKIT_QA_PROJECT, 'Only the reviewed LiveKit project is allowed')
  assert.match(plan.operationId, UUID)
  assert.equal(plan.roomName, `${QA_PREFIX}${plan.operationId}`, 'Existing application rooms are not valid test targets')
  assert.match(plan.agentName, /^shadowchat-qa-no-agent-[0-9a-f-]{36}$/)
  assert.match(plan.agentName.slice('shadowchat-qa-no-agent-'.length), UUID)
  assert.match(plan.participantIdentity, UUID)
  const metadata = JSON.parse(plan.metadata)
  assert.deepEqual(Object.keys(metadata).sort(), ['nonce', 'operationId', 'purpose'])
  assert.equal(metadata.operationId, plan.operationId)
  assert.equal(metadata.purpose, 'shadowchat-empty-provider-cleanup-proof')
  assert.match(metadata.nonce, UUID)
  assert.equal(plan.emptyTimeout, 120)
  assert.equal(plan.departureTimeout, 5)
  assert.equal(plan.maxParticipants, 1)
  return plan
}

export function validateLiveKitIsolationReview(review, now = Date.now()) {
  assert.equal(review.version, 2, 'A current read-only isolation review is required')
  assert.deepEqual(review.project, LIVEKIT_QA_PROJECT)
  const age = now - Date.parse(review.verifiedAt)
  assert(Number.isFinite(age) && age >= -60_000 && age <= 6 * 60 * 60_000, 'Recheck project callbacks and agents within six hours before execution')
  assert.deepEqual(review.webhookUrls, ['https://shsqqouecvdoifzufkqm.supabase.co/functions/v1/shado-live-provider-webhook'])
  assert.equal(review.allProjectWebhookDestinationsVerified, true)
  assert.equal(review.noncanonicalRoomRejectedBeforeAdminClient, true)
  assert.equal(review.visibleCloudAndSelfHostedAgents, 0)
  assert.equal(review.agentIsolationStrategy, 'explicit-random-nonexistent-name')
}

// Every provider call is scoped to the generated room; this function cannot
// enumerate, join, record, change settings, or delete an application room.
export async function runLiveKitCleanupProof({ rooms, dispatches, plan, save = async () => {} }) {
  validateLiveKitCleanupPlan(plan)
  const evidence = {
    version: 1, operationId: plan.operationId, project: plan.project, roomName: plan.roomName,
    agentName: plan.agentName, startedAt: new Date().toISOString(), returnedSid: null,
    created: false, createAttempted: false, directAppWrites: 0, joinedParticipants: 0,
    publishedTracks: 0, providerSettingChanges: 0, checks: [], cleanup: { verified: false }, error: null,
  }
  let claimed = false
  const safeError = error => `${error?.name ?? 'Error'}: ${String(error?.message ?? error).replace(/eyJ[A-Za-z0-9_.-]{20,}/g, '[redacted-token]').slice(0, 600)}`
  const record = async (name, action) => {
    try { const detail = await action(); evidence.checks.push({ name, passed: true, ...(detail ? { detail } : {}) }) }
    catch (error) { evidence.checks.push({ name, passed: false, error: safeError(error) }); throw error }
    finally { await save(evidence) }
  }
  const readOwnedRoom = async () => {
    const found = await rooms.listRooms([plan.roomName])
    assert(Array.isArray(found) && found.length <= 1, 'Exact room lookup returned an unexpected result')
    if (!found.length) return null
    const room = found[0]
    assert.equal(room.name, plan.roomName)
    assert.equal(room.metadata, plan.metadata, 'Room marker does not match this run; no cleanup is allowed')
    assert.match(room.sid, /^RM_[A-Za-z0-9]+$/)
    if (evidence.returnedSid) assert.equal(room.sid, evidence.returnedSid, 'Room identity changed; no cleanup is allowed')
    assert.equal(room.numParticipants, 0, 'Room is no longer empty; no cleanup is allowed')
    assert.equal(room.numPublishers ?? 0, 0, 'Room has media publishers; no cleanup is allowed')
    assert.equal(room.activeRecording, false, 'Room recording is active; no cleanup is allowed')
    assert.deepEqual(await rooms.listParticipants(plan.roomName), [], 'Unexpected participant; no cleanup is allowed')
    if (!evidence.returnedSid) {
      // A lost response is recoverable only after the unique marker is actually
      // observed. An empty lookup alone cannot rule out late provider creation.
      evidence.returnedSid = room.sid
      evidence.created = true
      await save(evidence)
    }
    return room
  }
  const verifyDispatch = async () => {
    const found = await dispatches.listDispatch(plan.roomName)
    assert.equal(found.length, 1, 'The room must have only its explicit inert dispatch')
    assert.equal(found[0].agentName, plan.agentName, 'Unexpected automatic agent dispatch')
    assert.deepEqual(found[0].state?.jobs ?? [], [], 'An agent job ran in the QA room')
    return { dispatches: 1, jobs: 0 }
  }
  const exactCleanup = async () => {
    assert(claimed, 'Cleanup requires an attempted creation of this synthetic room')
    const room = await readOwnedRoom()
    assert(room || evidence.returnedSid, 'Creation outcome is unknown; an empty lookup cannot confirm cleanup')
    if (room) await verifyDispatch()
    await cleanupAccountProviders({
      deleteBunnyVideo: async () => { throw new Error('This test cannot access Bunny') },
      removeLiveParticipant: async (name, identity) => {
        assert.equal(name, plan.roomName); assert.equal(identity, plan.participantIdentity)
        await rooms.removeParticipant(name, identity, { revokeTokenTs: BigInt(Math.floor(Date.now() / 1000)) })
      },
      deleteLiveRoom: async name => {
        assert.equal(name, plan.roomName)
        // Recheck after token revocation as a final boundary before deletion.
        if (room) await readOwnedRoom()
        await rooms.deleteRoom(name)
      },
    }, { version: 1, storage: [], bunny_assets: [], unsupported_provider_assets: [],
      live_rooms: [plan.roomName], live_memberships: [plan.roomName] }, plan.participantIdentity)
  }
  const verifyAbsent = async () => {
    assert.deepEqual(await rooms.listRooms([plan.roomName]), [], 'Exact room lookup must confirm removal')
    evidence.cleanup.verified = true
  }
  await save(evidence)
  try {
    await record('exact synthetic name is absent before creation', async () => {
      assert.deepEqual(await rooms.listRooms([plan.roomName]), [], 'Room already exists; no mutation is allowed')
    })
    await record('create one empty room with explicit inert agent name', async () => {
      evidence.createAttempted = true
      await save(evidence) // Durable marker precedes the one creation request.
      claimed = true
      const room = await rooms.createRoom({
        name: plan.roomName, metadata: plan.metadata, emptyTimeout: plan.emptyTimeout,
        departureTimeout: plan.departureTimeout, maxParticipants: plan.maxParticipants,
        agents: [{ agentName: plan.agentName }],
      })
      assert.equal(room.name, plan.roomName)
      assert.equal(room.metadata, plan.metadata)
      assert.match(room.sid, /^RM_[A-Za-z0-9]+$/)
      evidence.returnedSid = room.sid
      evidence.created = true
    })
    await record('read back owned room with no participants or recording', async () => {
      assert(await readOwnedRoom(), 'The created room is missing before cleanup')
      return { participants: 0, publishers: 0, recording: false }
    })
    await record('only the inert dispatch exists and has no agent jobs', verifyDispatch)
    await record('shared account cleanup removes the exact provider room', exactCleanup)
    await record('exact room lookup confirms removal', verifyAbsent)
    await record('shared cleanup accepts already absent room and participant', exactCleanup)
    await record('final exact room lookup still confirms removal', verifyAbsent)
  } catch (error) {
    evidence.error = safeError(error)
  } finally {
    if (claimed && !evidence.cleanup.verified) {
      try { await exactCleanup(); await verifyAbsent() }
      catch (error) { evidence.cleanup.error = safeError(error) }
    }
    evidence.finishedAt = new Date().toISOString()
    await save(evidence)
  }
  return evidence
}
