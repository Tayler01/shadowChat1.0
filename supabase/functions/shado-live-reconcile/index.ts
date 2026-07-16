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
  SHADO_LIVE_CLAIM_PROVIDER_OPERATIONS_RPC,
  SHADO_LIVE_CORS_HEADERS,
  SHADO_LIVE_PROVIDER_OPERATIONS,
  SHADO_LIVE_ROLES,
  ShadoLiveProviderError,
  ShadoLiveRequestError,
  callShadoLiveRpc,
  completeProviderOperation,
  errorResponse,
  executeProviderOperation,
  jsonResponse,
  normalizeIdempotencyKey,
  normalizeUuid,
  parseJsonObject,
  type ShadoLiveOperationReceipt,
  type ShadoLiveProviderOperation,
  type ShadoLiveRole,
} from '../_shared/shado-live.ts'

const RECONCILE_CLAIM_SCOPE = 'shado-live-reconcile'
const DEFAULT_RECONCILE_REQUESTS_PER_MINUTE = 10
const DEFAULT_RECONCILE_BATCH_SIZE = 8
const ALLOWED_REQUEST_KEYS = new Set(['requestId', 'request_id', 'idempotencyKey', 'idempotency_key'])

const asRecord = (value: unknown): Record<string, unknown> | null => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
)

const asPositiveInteger = (value: unknown) => {
  const numeric = Number(value)
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : null
}

const boundedPositiveInteger = (value: unknown, fallback: number, min: number, max: number) => (
  Math.min(max, Math.max(min, asPositiveInteger(value) ?? fallback))
)

const parseReconcileRequest = async (req: Request) => {
  const body = await parseJsonObject(req, 4_096)
  if (Object.keys(body).some(key => !ALLOWED_REQUEST_KEYS.has(key))) {
    throw new ShadoLiveRequestError(
      'Reconcile accepts only a stable request id.',
      400,
      'invalid_reconcile_request',
    )
  }
  return normalizeIdempotencyKey(
    req.headers.get('Idempotency-Key')
      ?? body.idempotencyKey
      ?? body.idempotency_key
      ?? body.requestId
      ?? body.request_id,
  )
}

const resolveRateLimit = () => boundedPositiveInteger(
  Deno.env.get('SHADO_LIVE_RECONCILE_REQUESTS_PER_MINUTE'),
  DEFAULT_RECONCILE_REQUESTS_PER_MINUTE,
  1,
  30,
)

const resolveBatchSize = () => boundedPositiveInteger(
  Deno.env.get('SHADO_LIVE_RECONCILE_BATCH_SIZE'),
  DEFAULT_RECONCILE_BATCH_SIZE,
  1,
  20,
)

const parseProviderOperation = (value: unknown): ShadoLiveProviderOperation => {
  if (
    typeof value !== 'string'
    || value === 'none'
    || !SHADO_LIVE_PROVIDER_OPERATIONS.includes(value as ShadoLiveProviderOperation)
  ) {
    throw new ShadoLiveRequestError(
      'The provider outbox returned an unsupported operation.',
      503,
      'invalid_provider_receipt',
      true,
    )
  }
  return value as ShadoLiveProviderOperation
}

const parseRole = (value: unknown) => (
  SHADO_LIVE_ROLES.includes(value as ShadoLiveRole) ? value as ShadoLiveRole : null
)

const parseClaimedOperation = (value: unknown): ShadoLiveOperationReceipt => {
  const row = asRecord(value)
  if (!row) {
    throw new ShadoLiveRequestError('The provider outbox returned an invalid receipt.', 503, 'invalid_provider_receipt', true)
  }
  const operationId = normalizeUuid(row.operation_id ?? row.operationId, 'operation id')
  const roomId = normalizeUuid(row.room_id ?? row.roomId, 'room id')
  const roomVersion = asPositiveInteger(row.room_version ?? row.roomVersion)
  const providerOperation = parseProviderOperation(row.provider_operation ?? row.providerOperation)
  const targetUserIdValue = row.target_user_id ?? row.targetUserId
  const targetUserId = targetUserIdValue == null || targetUserIdValue === ''
    ? null
    : normalizeUuid(targetUserIdValue, 'target user id')
  const targetRole = parseRole(row.target_role ?? row.targetRole)
  const tokenVersionValue = row.token_version ?? row.tokenVersion
  const tokenVersion = tokenVersionValue == null ? null : asPositiveInteger(tokenVersionValue)
  const providerCanPublishValue = row.provider_can_publish ?? row.providerCanPublish
  const providerCanPublish = typeof providerCanPublishValue === 'boolean' ? providerCanPublishValue : null
  const requestPayload = asRecord(row.request_payload ?? row.requestPayload) ?? {}

  if (!roomVersion) {
    throw new ShadoLiveRequestError('The provider outbox returned an invalid room version.', 503, 'invalid_provider_receipt', true)
  }
  if (['update_participant', 'remove_participant'].includes(providerOperation) && !targetUserId) {
    throw new ShadoLiveRequestError('The provider outbox omitted its target.', 503, 'invalid_provider_receipt', true)
  }
  if (providerOperation === 'update_participant' && (!targetRole || !tokenVersion || providerCanPublish == null)) {
    throw new ShadoLiveRequestError('The provider outbox omitted participant authority.', 503, 'invalid_provider_receipt', true)
  }

  return {
    operationId,
    roomId,
    roomVersion,
    roomState: 'reconciling',
    participantId: null,
    participantUserId: null,
    participantRole: null,
    tokenVersion,
    providerOperation,
    targetUserId,
    targetRole,
    providerCanPublish,
    displayName: null,
    roomTitle: null,
    roomDescription: null,
    maxParticipants: boundedPositiveInteger(
      requestPayload.maxParticipants ?? requestPayload.max_participants,
      64,
      4,
      250,
    ),
    emptyTimeoutSeconds: boundedPositiveInteger(
      requestPayload.emptyTimeoutSeconds ?? requestPayload.empty_timeout_seconds,
      120,
      60,
      600,
    ),
    response: {},
  }
}

const parseClaimRows = (value: unknown) => {
  if (value == null) return []
  if (!Array.isArray(value)) {
    throw new ShadoLiveRequestError('The provider outbox returned an invalid batch.', 503, 'invalid_provider_batch', true)
  }
  return value
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
    const requestId = await parseReconcileRequest(req)
    admin = createEdgeAdminClient()
    claimUserId = user.id
    claimKey = requestId

    let claim = await claimEdgeRequest(admin, {
      userId: user.id,
      scope: RECONCILE_CLAIM_SCOPE,
      key: claimKey,
      leaseSeconds: 55,
      retentionSeconds: 3_600,
    })
    if (!claim.acquired && claim.status === 'processing') {
      claim = await waitForEdgeRequestClaim(admin, {
        userId: user.id,
        scope: RECONCILE_CLAIM_SCOPE,
        key: claimKey,
        timeoutMs: 10_000,
      }) ?? claim
    }
    if (!claim.acquired) {
      if (claim.status === 'completed') return replayClaim(claim)
      throw new ShadoLiveRequestError('Reconcile is already processing.', 409, 'request_in_progress', true)
    }
    if (!claim.claim_token) {
      throw new ShadoLiveRequestError('Shado Live could not claim reconcile.', 503, 'claim_unavailable', true)
    }
    claimToken = claim.claim_token

    await consumeEdgeRateLimit(admin, {
      userId: user.id,
      scope: `${RECONCILE_CLAIM_SCOPE}:minute`,
      windowSeconds: 60,
      limit: resolveRateLimit(),
      message: 'Shado Live is already reconciling. Wait a moment and try again.',
    })

    const rawBatch = await callShadoLiveRpc(admin, SHADO_LIVE_CLAIM_PROVIDER_OPERATIONS_RPC, {
      p_actor_user_id: user.id,
      p_limit: resolveBatchSize(),
    })
    const rows = parseClaimRows(rawBatch)
    const counts = { claimed: rows.length, succeeded: 0, retryable: 0, failed: 0 }

    for (const row of rows) {
      let receipt: ShadoLiveOperationReceipt | null = null
      try {
        receipt = parseClaimedOperation(row)
        const result = await executeProviderOperation(receipt)
        await completeProviderOperation(admin, {
          operationId: receipt.operationId as string,
          status: 'succeeded',
          result,
        })
        counts.succeeded += 1
      } catch (error) {
        const operationId = receipt?.operationId
          ?? (() => {
            try {
              const candidate = asRecord(row)
              return candidate ? normalizeUuid(candidate.operation_id ?? candidate.operationId, 'operation id') : null
            } catch {
              return null
            }
          })()
        const retryable = error instanceof ShadoLiveProviderError
        if (operationId) {
          try {
            await completeProviderOperation(admin, {
              operationId,
              status: retryable ? 'retryable' : 'failed',
              errorCode: retryable ? 'provider_unavailable' : 'invalid_provider_receipt',
              errorMessage: retryable
                ? 'LiveKit could not complete the queued operation.'
                : 'The queued provider operation was invalid.',
            })
          } catch {
            counts.failed += 1
            continue
          }
        }
        if (retryable) counts.retryable += 1
        else counts.failed += 1
      }
    }

    const response = jsonResponse({ ok: true, ...counts })
    await completeEdgeRequestClaim(admin, {
      userId: user.id,
      scope: RECONCILE_CLAIM_SCOPE,
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
        scope: RECONCILE_CLAIM_SCOPE,
        key: claimKey,
        claimToken,
        errorMessage: 'Shado Live reconcile failed.',
      }).catch(() => undefined)
    }
    return errorResponse(error)
  }
})
