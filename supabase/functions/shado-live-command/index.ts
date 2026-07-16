import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateEdgeUser,
  claimEdgeRequest,
  completeEdgeRequestClaim,
  consumeEdgeRateLimit,
  createEdgeAdminClient,
  failEdgeRequestClaim,
  waitForEdgeRequestClaim,
} from '../_shared/edge-guard.ts'
import {
  SHADO_LIVE_COMMAND_ACTIONS,
  SHADO_LIVE_CORS_HEADERS,
  SHADO_LIVE_PREPARE_COMMAND_RPC,
  ShadoLiveProviderError,
  ShadoLiveRequestError,
  callShadoLiveRpc,
  completeProviderOperation,
  errorResponse,
  executeProviderOperation,
  jsonResponse,
  normalizeIdempotencyKey,
  normalizeUuid,
  optionalUuid,
  parseJsonObject,
  parseOperationReceipt,
  type ShadoLiveCommandAction,
} from '../_shared/shado-live.ts'

const COMMAND_CLAIM_SCOPE = 'shado-live-command'
const DEFAULT_COMMAND_REQUESTS_PER_MINUTE = 60
const TARGETED_COMMANDS = new Set<ShadoLiveCommandAction>(['promote', 'demote', 'mute', 'remove'])
const REVISION_REQUIRED_COMMANDS = new Set<ShadoLiveCommandAction>(['start', 'promote', 'demote', 'mute', 'remove', 'end'])

type CommandRequest = {
  action: ShadoLiveCommandAction
  roomId: string
  targetUserId: string | null
  expectedVersion: number | null
  idempotencyKey: string
  request: Record<string, unknown>
}

const parseExpectedVersion = (value: unknown) => {
  if (value == null || value === '') return null
  const numeric = Number(value)
  if (!Number.isSafeInteger(numeric) || numeric <= 0) {
    throw new ShadoLiveRequestError('A valid room version is required.', 409, 'stale_room')
  }
  return numeric
}

const parseMessageBody = (value: unknown) => {
  if (typeof value !== 'string') {
    throw new ShadoLiveRequestError('Write a message before sending.', 400, 'invalid_message')
  }
  const normalized = value.trim().replace(/\s+/gu, ' ')
  if (!normalized || normalized.length > 500) {
    throw new ShadoLiveRequestError('Messages must be between 1 and 500 characters.', 400, 'invalid_message')
  }
  return normalized
}

const parseCommandRequest = async (req: Request): Promise<CommandRequest> => {
  const body = await parseJsonObject(req)
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  if (!SHADO_LIVE_COMMAND_ACTIONS.includes(action as ShadoLiveCommandAction)) {
    throw new ShadoLiveRequestError('Unsupported Shado Live command.', 400, 'unsupported_action')
  }
  const command = action as ShadoLiveCommandAction
  const roomId = normalizeUuid(body.roomId ?? body.room_id, 'room id')
  const targetUserId = optionalUuid(body.targetUserId ?? body.target_user_id, 'target user id')
  if (TARGETED_COMMANDS.has(command) && !targetUserId) {
    throw new ShadoLiveRequestError('A target user is required.', 400, 'invalid_target_user_id')
  }
  if (!TARGETED_COMMANDS.has(command) && targetUserId) {
    throw new ShadoLiveRequestError('This command does not accept a target user.', 400, 'invalid_target_user_id')
  }

  const expectedVersion = parseExpectedVersion(body.expectedVersion ?? body.expected_version)
  if (REVISION_REQUIRED_COMMANDS.has(command) && !expectedVersion) {
    throw new ShadoLiveRequestError('Refresh the room before retrying this command.', 409, 'stale_room')
  }
  const idempotencyKey = normalizeIdempotencyKey(
    req.headers.get('Idempotency-Key')
      ?? body.idempotencyKey
      ?? body.idempotency_key
      ?? body.requestId
      ?? body.request_id,
  )
  const request = command === 'send_message'
    ? { body: parseMessageBody(body.body ?? body.message) }
    : {}
  return { action: command, roomId, targetUserId, expectedVersion, idempotencyKey, request }
}

const resolveCommandRateLimit = () => {
  const configured = Number(Deno.env.get('SHADO_LIVE_COMMAND_REQUESTS_PER_MINUTE') ?? '')
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_COMMAND_REQUESTS_PER_MINUTE
  return Math.min(180, Math.floor(configured))
}

const replayClaim = (claim: { response_status: number | null; response_body: unknown }) => jsonResponse(
  claim.response_body,
  claim.response_status ?? 200,
  { 'X-Idempotent-Replay': 'true' },
)

const responseBody = async (response: Response) => {
  try {
    return await response.clone().json()
  } catch {
    return { error: 'Shado Live returned a non-JSON response.', code: 'invalid_response' }
  }
}

serve(async (req): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: SHADO_LIVE_CORS_HEADERS })
  if (req.method !== 'POST') return jsonResponse({ error: 'Method not allowed.', code: 'method_not_allowed' }, 405)

  let claimToken: string | null = null
  let claimUserId: string | null = null
  let claimKey: string | null = null
  let admin: ReturnType<typeof createEdgeAdminClient> | null = null

  try {
    const user = await authenticateEdgeUser(req)
    const request = await parseCommandRequest(req)
    admin = createEdgeAdminClient()
    claimUserId = user.id
    // The key deliberately excludes message content. The caller's stable request
    // id is the idempotency boundary; chat text belongs only in the bounded RPC payload.
    claimKey = `${request.action}:${request.roomId}:${request.idempotencyKey}`

    let claim = await claimEdgeRequest(admin, {
      userId: user.id,
      scope: COMMAND_CLAIM_SCOPE,
      key: claimKey,
      leaseSeconds: 45,
      retentionSeconds: 86_400,
    })
    if (!claim.acquired && claim.status === 'processing') {
      claim = await waitForEdgeRequestClaim(admin, {
        userId: user.id,
        scope: COMMAND_CLAIM_SCOPE,
        key: claimKey,
        timeoutMs: 10_000,
      }) ?? claim
    }
    if (!claim.acquired) {
      if (claim.status === 'completed') return replayClaim(claim)
      throw new ShadoLiveRequestError('This command is already processing.', 409, 'request_in_progress', true)
    }
    if (!claim.claim_token) {
      throw new ShadoLiveRequestError('Shado Live could not claim this request.', 503, 'claim_unavailable', true)
    }
    claimToken = claim.claim_token

    await consumeEdgeRateLimit(admin, {
      userId: user.id,
      scope: `${COMMAND_CLAIM_SCOPE}:${request.action}:minute`,
      windowSeconds: 60,
      limit: resolveCommandRateLimit(),
      message: 'Too many Shado Live commands. Wait a moment and try again.',
    })

    const rawReceipt = await callShadoLiveRpc(admin, SHADO_LIVE_PREPARE_COMMAND_RPC, {
      p_actor_user_id: user.id,
      p_action: request.action,
      p_room_id: request.roomId,
      p_target_user_id: request.targetUserId,
      p_expected_version: request.expectedVersion,
      p_idempotency_key: request.idempotencyKey,
      p_request: request.request,
    })
    const receipt = parseOperationReceipt(rawReceipt)

    let providerResult
    try {
      providerResult = await executeProviderOperation(receipt)
    } catch (error) {
      if (receipt.operationId) {
        await completeProviderOperation(admin, {
          operationId: receipt.operationId,
          status: 'retryable',
          errorCode: 'provider_unavailable',
          errorMessage: 'LiveKit could not complete the requested participant operation.',
        })
      }
      throw error instanceof ShadoLiveProviderError ? error : new ShadoLiveProviderError()
    }

    const completion: Record<string, unknown> = receipt.operationId
      ? await completeProviderOperation(admin, {
          operationId: receipt.operationId,
          status: 'succeeded',
          result: providerResult,
        })
      : {}
    const responseRecord = receipt.response
    const room = completion.room ?? responseRecord.room ?? responseRecord
    const response = jsonResponse({
      ...responseRecord,
      ...completion,
      ok: true,
      action: request.action,
      roomId: receipt.roomId,
      roomVersion: receipt.roomVersion,
      roomState: receipt.roomState,
      room,
    })
    await completeEdgeRequestClaim(admin, {
      userId: user.id,
      scope: COMMAND_CLAIM_SCOPE,
      key: claimKey,
      claimToken,
      responseStatus: response.status,
      responseBody: await responseBody(response),
    })
    claimToken = null
    return response
  } catch (error) {
    if (admin && claimToken && claimUserId && claimKey) {
      await failEdgeRequestClaim(admin, {
        userId: claimUserId,
        scope: COMMAND_CLAIM_SCOPE,
        key: claimKey,
        claimToken,
        errorMessage: 'Shado Live command failed.',
      }).catch(() => undefined)
    }
    return errorResponse(error)
  }
})
