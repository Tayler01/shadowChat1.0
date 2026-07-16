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
  SHADO_LIVE_CORS_HEADERS,
  SHADO_LIVE_PREPARE_SESSION_RPC,
  SHADO_LIVE_SESSION_ACTIONS,
  ShadoLiveProviderError,
  ShadoLiveRequestError,
  callShadoLiveRpc,
  completeProviderOperation,
  errorResponse,
  executeProviderOperation,
  issueShadoLiveToken,
  jsonResponse,
  normalizeIdempotencyKey,
  optionalUuid,
  parseJsonObject,
  parseOperationReceipt,
  type ShadoLiveSessionAction,
} from '../_shared/shado-live.ts'

const SESSION_CLAIM_SCOPE = 'shado-live-session'
const DEFAULT_SESSION_REQUESTS_PER_MINUTE = 30

type SessionRequest = {
  action: ShadoLiveSessionAction
  roomId: string | null
  idempotencyKey: string
  request: Record<string, unknown>
}

const boundedText = (
  value: unknown,
  options: { label: string; maxLength: number; required?: boolean },
) => {
  if (value == null || value === '') {
    if (options.required) {
      throw new ShadoLiveRequestError(`${options.label} is required.`, 400, `invalid_${options.label.toLowerCase()}`)
    }
    return null
  }
  if (typeof value !== 'string') {
    throw new ShadoLiveRequestError(`${options.label} is invalid.`, 400, `invalid_${options.label.toLowerCase()}`)
  }
  const normalized = value.trim()
  if ((options.required && !normalized) || normalized.length > options.maxLength) {
    throw new ShadoLiveRequestError(`${options.label} is invalid.`, 400, `invalid_${options.label.toLowerCase()}`)
  }
  return normalized || null
}

const parseSessionRequest = async (req: Request): Promise<SessionRequest> => {
  const body = await parseJsonObject(req)
  const action = typeof body.action === 'string' ? body.action.trim() : ''
  if (!SHADO_LIVE_SESSION_ACTIONS.includes(action as ShadoLiveSessionAction)) {
    throw new ShadoLiveRequestError('Unsupported Shado Live session action.', 400, 'unsupported_action')
  }
  const roomId = optionalUuid(body.roomId ?? body.room_id, 'room id')
  if (action !== 'create' && !roomId) {
    throw new ShadoLiveRequestError('A room id is required.', 400, 'invalid_room_id')
  }
  const idempotencyKey = normalizeIdempotencyKey(
    req.headers.get('Idempotency-Key')
      ?? body.idempotencyKey
      ?? body.idempotency_key
      ?? body.requestId
      ?? body.request_id,
  )
  const request = action === 'create'
    ? {
        title: boundedText(body.title, { label: 'Title', maxLength: 120, required: true }),
        description: boundedText(body.description, { label: 'Description', maxLength: 500 }),
      }
    : {}
  return { action: action as ShadoLiveSessionAction, roomId, idempotencyKey, request }
}

const resolveSessionRateLimit = () => {
  const configured = Number(Deno.env.get('SHADO_LIVE_SESSION_REQUESTS_PER_MINUTE') ?? '')
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_SESSION_REQUESTS_PER_MINUTE
  return Math.min(120, Math.floor(configured))
}

const replayClaim = (claim: { response_status: number | null; response_body: unknown }) => jsonResponse(
  claim.response_body,
  claim.response_status ?? 200,
  { 'X-Idempotent-Replay': 'true' },
)

const claimResponseBody = async (response: Response) => {
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
    const request = await parseSessionRequest(req)
    admin = createEdgeAdminClient()
    claimUserId = user.id
    claimKey = `${request.action}:${request.roomId ?? 'new'}:${request.idempotencyKey}`

    let claim = await claimEdgeRequest(admin, {
      userId: user.id,
      scope: SESSION_CLAIM_SCOPE,
      key: claimKey,
      leaseSeconds: 45,
      retentionSeconds: 86_400,
    })
    if (!claim.acquired && claim.status === 'processing') {
      claim = await waitForEdgeRequestClaim(admin, {
        userId: user.id,
        scope: SESSION_CLAIM_SCOPE,
        key: claimKey,
        timeoutMs: 10_000,
      }) ?? claim
    }
    if (!claim.acquired) {
      if (claim.status === 'completed') return replayClaim(claim)
      throw new ShadoLiveRequestError(
        'This Shado Live session action is already processing.',
        409,
        'request_in_progress',
        true,
      )
    }
    if (!claim.claim_token) {
      throw new ShadoLiveRequestError('Shado Live could not claim this request.', 503, 'claim_unavailable', true)
    }
    claimToken = claim.claim_token

    await consumeEdgeRateLimit(admin, {
      userId: user.id,
      scope: `${SESSION_CLAIM_SCOPE}:minute`,
      windowSeconds: 60,
      limit: resolveSessionRateLimit(),
      message: 'Too many Shado Live session requests. Wait a moment and try again.',
    })

    const rawReceipt = await callShadoLiveRpc(admin, SHADO_LIVE_PREPARE_SESSION_RPC, {
      p_actor_user_id: user.id,
      p_action: request.action,
      p_room_id: request.roomId,
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
          errorMessage: 'LiveKit could not complete the requested room operation.',
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
    const session = request.action !== 'leave'
      && receipt.participantUserId
      && ['green_room', 'live'].includes(receipt.roomState)
      ? await issueShadoLiveToken(receipt, user.id)
      : null

    const media = session
      ? {
          server_url: session.providerUrl,
          participant_token: session.token,
          expires_at: new Date(Date.now() + session.expiresInSeconds * 1000).toISOString(),
        }
      : null
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
      participantId: receipt.participantId,
      role: receipt.participantRole,
      session,
      room,
      media,
    })
    await completeEdgeRequestClaim(admin, {
      userId: user.id,
      scope: SESSION_CLAIM_SCOPE,
      key: claimKey,
      claimToken,
      responseStatus: response.status,
      responseBody: await claimResponseBody(response),
    })
    claimToken = null
    return response
  } catch (error) {
    if (admin && claimToken && claimUserId && claimKey) {
      await failEdgeRequestClaim(admin, {
        userId: claimUserId,
        scope: SESSION_CLAIM_SCOPE,
        key: claimKey,
        claimToken,
        errorMessage: 'Shado Live session request failed.',
      }).catch(() => undefined)
    }
    return errorResponse(error)
  }
})
