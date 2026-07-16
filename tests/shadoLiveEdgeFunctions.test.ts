import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const read = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

const shared = read('supabase/functions/_shared/shado-live.ts')
const session = read('supabase/functions/shado-live-session/index.ts')
const command = read('supabase/functions/shado-live-command/index.ts')
const webhook = read('supabase/functions/shado-live-provider-webhook/index.ts')
const reconcile = read('supabase/functions/shado-live-reconcile/index.ts')

const indexInOrder = (source: string, fragments: string[]) => {
  let cursor = -1
  for (const fragment of fragments) {
    const next = source.indexOf(fragment, cursor + 1)
    expect(next).toBeGreaterThan(cursor)
    cursor = next
  }
}

describe('Shado Live Edge Function security contracts', () => {
  test('pins the LiveKit server SDK and keeps provider credentials server-only', () => {
    expect(shared).toContain("from 'npm:livekit-server-sdk@2.17.0'")
    expect(shared).toContain("requiredProviderEnv('LIVEKIT_API_KEY')")
    expect(shared).toContain("requiredProviderEnv('LIVEKIT_API_SECRET')")
    expect(shared).toContain("requiredProviderEnv('LIVEKIT_URL')")
    expect(`${session}\n${command}\n${webhook}`).not.toMatch(/VITE_LIVEKIT_(?:API_KEY|API_SECRET)/u)
  })

  test('issues short-lived, room-scoped, audio-only participant grants', () => {
    expect(shared).toContain('const DEFAULT_TOKEN_TTL_SECONDS = 300')
    expect(shared).toContain('const MAX_TOKEN_TTL_SECONDS = 600')
    expect(shared).toContain('identity: userId')
    expect(shared).toContain('tokenVersion: receipt.tokenVersion')
    expect(shared).toContain('room: liveKitRoomName(receipt.roomId)')
    expect(shared).toContain('canSubscribe: true')
    expect(shared).toContain('canPublishData: false')
    expect(shared).toContain('canUpdateOwnMetadata: false')
    expect(shared).toContain('roomAdmin: false')
    expect(shared).toContain('roomRecord: false')
    expect(shared).toContain('recorder: false')
    expect(shared).toContain('canPublish ? [MICROPHONE_TRACK_SOURCE]')
    expect(shared).toContain("const canRolePublish = (role: ShadoLiveRole) => role === 'host' || role === 'speaker'")
    expect(shared).not.toMatch(/canPublishSources:\s*\[[^\]]*(?:camera|screen_share)/iu)
  })

  test('supports the complete bounded provider operation set and token revocation', () => {
    expect(shared).toContain('await rooms.createRoom({')
    expect(shared).toContain('await rooms.deleteRoom(roomName)')
    expect(shared).toContain('await rooms.updateParticipant(roomName, targetIdentity, {')
    expect(shared).toContain('await rooms.removeParticipant(roomName, targetIdentity, {')
    expect(shared).toContain('revokeTokenTs: BigInt(Math.floor(Date.now() / 1000))')
    expect(shared).toContain("return { operation: 'create_room', roomName, alreadyExisted: true }")
    expect(shared).toContain('const canPublish = canRolePublish(role) && (canPublishOverride ?? true)')
    expect(shared).toContain("'Shado Live returned an unsupported provider operation.'")
    expect(shared).toContain("recording: false")
  })

  test('session requests authenticate, claim, rate-limit, authorize in SQL, then mutate provider state', () => {
    expect(shared).toContain("['create', 'join', 'resume', 'leave']")
    expect(shared).toContain("'A stable UUID request id is required.'")
    expect(session).toContain('body.request_id')
    expect(session).toContain('p_request: request.request')
    indexInOrder(session, [
      'authenticateEdgeUser(req)',
      'claimEdgeRequest(admin',
      'consumeEdgeRateLimit(admin',
      'callShadoLiveRpc(admin, SHADO_LIVE_PREPARE_SESSION_RPC',
      'executeProviderOperation(receipt)',
      'completeProviderOperation(admin',
    ])
  })

  test('maps the emergency disabled state to a deliberate public error', () => {
    expect(shared).toContain("error.code === '55000'")
    expect(shared).toContain("'Shado Live is temporarily unavailable.'")
    expect(shared).toContain("'live_unavailable'")
  })

  test('command requests implement the exact action surface with stale-room protection', () => {
    for (const action of [
      'start',
      'raise_hand',
      'lower_hand',
      'send_message',
      'promote',
      'demote',
      'mute',
      'remove',
      'end',
    ]) {
      expect(shared).toContain(`'${action}'`)
    }
    expect(command).toContain("REVISION_REQUIRED_COMMANDS = new Set<ShadoLiveCommandAction>(['start', 'promote', 'demote', 'mute', 'remove', 'end'])")
    expect(command).toContain("throw new ShadoLiveRequestError('Refresh the room before retrying this command.', 409, 'stale_room')")
    expect(command).toContain("? { body: parseMessageBody(body.body ?? body.message) }")
    expect(command).toContain('normalized.length > 500')
    expect(command).toContain('p_expected_version: request.expectedVersion')
    expect(command).toContain('p_request: request.request')
  })

  test('does not mix message content into the idempotency claim key', () => {
    const claimAssignment = command.match(/claimKey\s*=\s*`([^`]+)`/u)?.[1] ?? ''
    expect(claimAssignment).toContain('${request.idempotencyKey}')
    expect(claimAssignment).toContain('${request.roomId}')
    expect(claimAssignment).not.toMatch(/message|body|request\.request/iu)
  })

  test('command requests use the same fail-closed guard ordering as sessions', () => {
    indexInOrder(command, [
      'authenticateEdgeUser(req)',
      'claimEdgeRequest(admin',
      'consumeEdgeRateLimit(admin',
      'callShadoLiveRpc(admin, SHADO_LIVE_PREPARE_COMMAND_RPC',
      'executeProviderOperation(receipt)',
      'completeProviderOperation(admin',
    ])
  })

  test('verifies the LiveKit signature over the raw body before parsing JSON', () => {
    expect(shared).toContain('return await webhooks.receive(rawBody, authorization)')
    expect(webhook).toContain("req.headers.get('Authorization')")
    expect(webhook).toContain('const MAX_WEBHOOK_BYTES = 262_144')
    indexInOrder(webhook, [
      'const rawBody = await req.text()',
      'verifyLiveKitWebhook(',
      'JSON.parse(rawBody)',
      'callShadoLiveRpc<Record<string, unknown>>(',
    ])
  })

  test('ingests signed lifecycle, participant, and forbidden recording transport events', () => {
    for (const eventType of [
      'room_started',
      'room_finished',
      'participant_joined',
      'participant_left',
      'track_published',
      'track_unpublished',
      'egress_started',
      'egress_updated',
      'egress_ended',
      'ingress_started',
      'ingress_ended',
    ]) {
      expect(webhook).toContain(`'${eventType}'`)
    }
    expect(webhook).toContain('p_provider_payload: providerPayload')
    expect(webhook).toContain('ROOM_NAME_PATTERN')
  })

  test('keeps authorization and durable mutations inside service-role RPCs', () => {
    for (const source of [shared, session, command, webhook, reconcile]) {
      expect(source).not.toMatch(/\.from\s*\(/u)
    }
    expect(shared).toContain("export const SHADO_LIVE_PREPARE_SESSION_RPC = 'shado_live_prepare_session'")
    expect(shared).toContain("export const SHADO_LIVE_PREPARE_COMMAND_RPC = 'shado_live_prepare_command'")
    expect(shared).toContain("export const SHADO_LIVE_CLAIM_PROVIDER_OPERATIONS_RPC = 'shado_live_claim_provider_operations'")
    expect(shared).toContain("export const SHADO_LIVE_COMPLETE_PROVIDER_OPERATION_RPC = 'shado_live_complete_provider_operation'")
    expect(shared).toContain("export const SHADO_LIVE_INGEST_WEBHOOK_RPC = 'shado_live_ingest_provider_webhook'")
    expect(shared).toContain('p_operation_id: options.operationId')
    expect(shared).toContain('p_operation_status: options.status')
    expect(session).toContain("status: 'retryable'")
    expect(command).toContain("status: 'retryable'")
  })

  test('reconcile is authenticated, idempotent, rate-limited, and drains only server-claimed operations', () => {
    expect(reconcile).toContain("const ALLOWED_REQUEST_KEYS = new Set(['requestId', 'request_id', 'idempotencyKey', 'idempotency_key'])")
    expect(reconcile).toContain('p_actor_user_id: user.id')
    expect(reconcile).toContain('p_limit: resolveBatchSize()')
    expect(reconcile).not.toMatch(/body\.(?:room|target|operation|action|limit)/u)
    indexInOrder(reconcile, [
      'authenticateEdgeUser(req)',
      'claimEdgeRequest(admin',
      'consumeEdgeRateLimit(admin',
      'callShadoLiveRpc(admin, SHADO_LIVE_CLAIM_PROVIDER_OPERATIONS_RPC',
      'executeProviderOperation(receipt)',
      'completeProviderOperation(admin',
    ])
  })

  test('reconcile returns aggregate counts without echoing provider receipts or payloads', () => {
    expect(reconcile).toContain("const counts = { claimed: rows.length, succeeded: 0, retryable: 0, failed: 0 }")
    expect(reconcile).toContain('jsonResponse({ ok: true, ...counts })')
    expect(reconcile).not.toMatch(/jsonResponse\([^)]*(?:requestPayload|providerPayload|rows|receipt)/su)
    expect(reconcile).toContain("status: retryable ? 'retryable' : 'failed'")
  })
})
