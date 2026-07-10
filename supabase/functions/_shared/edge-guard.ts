import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export type AuthenticatedEdgeUser = {
  id: string
  email?: string | null
}

export class EdgeAuthenticationError extends Error {
  status = 401
}

export class EdgeRateLimitError extends Error {
  status = 429
  retryAfterSeconds: number

  constructor(message: string, retryAfterSeconds: number) {
    super(message)
    this.retryAfterSeconds = Math.max(1, Math.ceil(retryAfterSeconds || 1))
  }
}

export type EdgeRateLimitResult = {
  allowed: boolean
  limit: number
  used: number
  remaining: number
  reset_at: string
  retry_after_seconds: number
}

export type EdgeRequestClaim = {
  acquired: boolean
  claim_token: string | null
  status: 'processing' | 'completed' | 'failed'
  response_status: number | null
  response_body: unknown
  error_message: string | null
  attempt_count: number
  lease_expires_at: string
  expires_at: string
}

type EdgeRpcResult = {
  data: unknown
  error: { message?: string } | null
}

type EdgeRpcClient = {
  rpc: (
    functionName: string,
    args: Record<string, unknown>,
  ) => PromiseLike<EdgeRpcResult>
}

const callEdgeRpc = (
  supabase: unknown,
  functionName: string,
  args: Record<string, unknown>,
) => (supabase as EdgeRpcClient).rpc(functionName, args)

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name)?.trim()
  if (!value) {
    throw new Error(`${name} is not configured`)
  }
  return value
}

export const getEdgeSupabaseEnv = () => ({
  supabaseUrl: getRequiredEnv('SUPABASE_URL'),
  supabaseAnonKey: getRequiredEnv('SUPABASE_ANON_KEY'),
  serviceRoleKey: getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY'),
})

export const createEdgeAdminClient = () => {
  const { supabaseUrl, serviceRoleKey } = getEdgeSupabaseEnv()
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const getBearerToken = (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    throw new EdgeAuthenticationError('Authentication required')
  }

  const token = authorization.replace(/^Bearer\s+/i, '').trim()
  if (!token) {
    throw new EdgeAuthenticationError('Authentication required')
  }
  return token
}

export const authenticateEdgeUser = async (req: Request): Promise<AuthenticatedEdgeUser> => {
  const token = getBearerToken(req)
  const { supabaseUrl, supabaseAnonKey } = getEdgeSupabaseEnv()
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    throw new EdgeAuthenticationError('Invalid or expired session')
  }

  const user = await authResponse.json() as { id?: unknown; email?: unknown }
  if (typeof user.id !== 'string' || !user.id) {
    throw new EdgeAuthenticationError('Invalid or expired session')
  }

  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : null,
  }
}

const asRateLimitResult = (value: unknown): EdgeRateLimitResult => {
  const result = value as Partial<EdgeRateLimitResult> | null
  if (!result || typeof result.allowed !== 'boolean') {
    throw new Error('Edge request budget returned an invalid response')
  }
  return {
    allowed: result.allowed,
    limit: Number(result.limit ?? 0),
    used: Number(result.used ?? 0),
    remaining: Number(result.remaining ?? 0),
    reset_at: String(result.reset_at ?? ''),
    retry_after_seconds: Number(result.retry_after_seconds ?? 0),
  }
}

export const consumeEdgeRateLimit = async (
  supabase: unknown,
  options: {
    userId: string
    scope: string
    windowSeconds: number
    limit: number
    cost?: number
    message: string
  },
) => {
  const { data, error } = await callEdgeRpc(supabase, 'consume_edge_request_bucket', {
    target_subject_id: options.userId,
    request_scope: options.scope,
    window_seconds: options.windowSeconds,
    request_limit: options.limit,
    request_cost: options.cost ?? 1,
  })
  if (error) throw error

  const result = asRateLimitResult(data)
  if (!result.allowed) {
    throw new EdgeRateLimitError(options.message, result.retry_after_seconds)
  }
  return result
}

const asRequestClaim = (value: unknown): EdgeRequestClaim => {
  const claim = value as Partial<EdgeRequestClaim> | null
  if (!claim || !['processing', 'completed', 'failed'].includes(String(claim.status))) {
    throw new Error('Edge request claim returned an invalid response')
  }
  return {
    acquired: Boolean(claim.acquired),
    claim_token: typeof claim.claim_token === 'string' ? claim.claim_token : null,
    status: claim.status as EdgeRequestClaim['status'],
    response_status: claim.response_status == null ? null : Number(claim.response_status),
    response_body: claim.response_body,
    error_message: typeof claim.error_message === 'string' ? claim.error_message : null,
    attempt_count: Number(claim.attempt_count ?? 0),
    lease_expires_at: String(claim.lease_expires_at ?? ''),
    expires_at: String(claim.expires_at ?? ''),
  }
}

export const claimEdgeRequest = async (
  supabase: unknown,
  options: {
    userId: string
    scope: string
    key: string
    leaseSeconds?: number
    retentionSeconds?: number
  },
) => {
  const { data, error } = await callEdgeRpc(supabase, 'claim_edge_request', {
    target_subject_id: options.userId,
    request_scope: options.scope,
    request_key: options.key,
    lease_seconds: options.leaseSeconds ?? 30,
    retention_seconds: options.retentionSeconds ?? 86400,
  })
  if (error) throw error
  return asRequestClaim(data)
}

export const readEdgeRequestClaim = async (
  supabase: unknown,
  options: { userId: string; scope: string; key: string },
) => {
  const { data, error } = await callEdgeRpc(supabase, 'read_edge_request_claim', {
    target_subject_id: options.userId,
    request_scope: options.scope,
    request_key: options.key,
  })
  if (error) throw error
  return data == null ? null : asRequestClaim(data)
}

export const waitForEdgeRequestClaim = async (
  supabase: unknown,
  options: {
    userId: string
    scope: string
    key: string
    timeoutMs?: number
    pollMs?: number
  },
) => {
  const timeoutAt = Date.now() + (options.timeoutMs ?? 12_000)
  const pollMs = Math.max(75, options.pollMs ?? 150)

  while (Date.now() < timeoutAt) {
    const claim = await readEdgeRequestClaim(supabase, options)
    if (!claim || claim.status !== 'processing') return claim
    await new Promise(resolve => setTimeout(resolve, pollMs))
  }
  return null
}

export const completeEdgeRequestClaim = async (
  supabase: unknown,
  options: {
    userId: string
    scope: string
    key: string
    claimToken: string
    responseStatus: number
    responseBody: unknown
  },
) => {
  const { data, error } = await callEdgeRpc(supabase, 'complete_edge_request_claim', {
    target_subject_id: options.userId,
    request_scope: options.scope,
    request_key: options.key,
    claim_token: options.claimToken,
    response_status: options.responseStatus,
    response_body: options.responseBody,
  })
  if (error) throw error
  if (data !== true) {
    throw new Error('Edge request claim ownership was lost before completion')
  }
}

export const failEdgeRequestClaim = async (
  supabase: unknown,
  options: {
    userId: string
    scope: string
    key: string
    claimToken: string
    errorMessage?: string
  },
) => {
  const { error } = await callEdgeRpc(supabase, 'fail_edge_request_claim', {
    target_subject_id: options.userId,
    request_scope: options.scope,
    request_key: options.key,
    claim_token: options.claimToken,
    error_message: options.errorMessage ?? null,
  })
  if (error) throw error
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize)
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, canonicalize(entry)]),
    )
  }
  if (typeof value === 'number' && !Number.isFinite(value)) return null
  return value
}

export const deterministicRequestKey = async (value: unknown) => {
  const bytes = new TextEncoder().encode(JSON.stringify(canonicalize(value)))
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}
