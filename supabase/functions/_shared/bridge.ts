import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-bridge-access-token',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

export const badRequest = (message: string) => json({ error: message }, 400)
export const unauthorized = (message: string) => json({ error: message }, 401)
export const forbidden = (message: string) => json({ error: message }, 403)
export const notFound = (message: string) => json({ error: message }, 404)
export const conflict = (message: string) => json({ error: message }, 409)

const getEnv = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseAnonKey || !serviceRoleKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  return { supabaseUrl, supabaseAnonKey, serviceRoleKey }
}

export const getSupabaseAdmin = () => {
  const { supabaseUrl, serviceRoleKey } = getEnv()

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export const triggerPushDispatch = async (
  type: 'dm_message' | 'group_message',
  messageId: string,
  senderUserId: string,
) => {
  const { supabaseUrl, serviceRoleKey } = getEnv()

  try {
    const response = await fetch(`${supabaseUrl}/functions/v1/send-push`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type,
        messageId,
        senderUserId,
      }),
    })

    if (!response.ok) {
      console.error('Bridge push dispatch failed', {
        type,
        messageId,
        status: response.status,
        body: await response.text().catch(() => ''),
      })
    }
  } catch (error) {
    console.error('Bridge push dispatch failed', error)
  }
}

export const authenticateRequest = async (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { error: unauthorized('Authentication required') }
  }

  const { supabaseUrl, supabaseAnonKey } = getEnv()
  const token = authorization.replace(/^Bearer\s+/i, '')

  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return { error: unauthorized('Invalid or expired session') }
  }

  const user = await authResponse.json()
  if (!user?.id) {
    return { error: unauthorized('Invalid or expired session') }
  }

  return { userId: user.id as string }
}

export const readJson = async <T>(req: Request): Promise<T> => {
  return await req.json() as T
}

export const normalizeText = (value: unknown) =>
  typeof value === 'string' ? value.trim() : ''

export const generatePairingCode = (length = 8) => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  const random = crypto.getRandomValues(new Uint8Array(length))
  return Array.from(random, byte => alphabet[byte % alphabet.length]).join('')
}

const base64UrlEncode = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')

export const generateOpaqueToken = (prefix: string, byteLength = 32) => {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength))
  return `${prefix}_${base64UrlEncode(bytes)}`
}

const hexEncode = (bytes: Uint8Array) =>
  Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('')

export const hashToken = async (value: string) => {
  const encoded = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', encoded)
  return hexEncode(new Uint8Array(digest))
}

export const createBridgeSessionMaterial = async () => {
  const accessToken = generateOpaqueToken('bacc')
  const refreshToken = generateOpaqueToken('brfr')
  const [accessTokenHash, refreshTokenHash] = await Promise.all([
    hashToken(accessToken),
    hashToken(refreshToken),
  ])

  return {
    accessToken,
    refreshToken,
    accessTokenHash,
    refreshTokenHash,
  }
}

export const getFutureIso = (minutesFromNow: number) =>
  new Date(Date.now() + minutesFromNow * 60_000).toISOString()

export const isExpiredIso = (value: string | null | undefined, now = Date.now()) => {
  if (!value) {
    return false
  }

  const expiresAt = new Date(value).getTime()
  return Number.isFinite(expiresAt) && expiresAt <= now
}

export type BridgeSessionAuth = {
  bridgeSessionId: string
  deviceId: string
  userId: string
}

export const authenticateBridgeAccessToken = async (
  deviceId: string,
  accessToken: string,
) => {
  if (!deviceId || !accessToken) {
    return { error: badRequest('deviceId and accessToken are required') }
  }

  const supabase = getSupabaseAdmin()
  const accessTokenHash = await hashToken(accessToken)

  const { data: session, error: sessionError } = await supabase
    .from('bridge_device_sessions')
    .select('id, device_id, user_id, status, expires_at')
    .eq('device_id', deviceId)
    .eq('status', 'active')
    .eq('access_token_hash', accessTokenHash)
    .maybeSingle()

  if (sessionError) {
    throw sessionError
  }

  if (!session) {
    return { error: unauthorized('Invalid bridge access token') }
  }

  if (isExpiredIso(session.expires_at)) {
    await supabase
      .from('bridge_device_sessions')
      .update({ status: 'expired' })
      .eq('id', session.id)

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: session.user_id,
        event_type: 'session_expired',
        event_payload: {
          bridge_session_id: session.id,
          expired_at: session.expires_at,
        },
      })

    return { error: unauthorized('Bridge access token has expired') }
  }

  const { data: pairing, error: pairingError } = await supabase
    .from('bridge_pairings')
    .select('id')
    .eq('device_id', deviceId)
    .eq('user_id', session.user_id)
    .eq('status', 'paired')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (pairingError) {
    throw pairingError
  }

  if (!pairing) {
    return { error: forbidden('Bridge pairing is no longer active') }
  }

  return {
    auth: {
      bridgeSessionId: session.id as string,
      deviceId,
      userId: session.user_id as string,
    } satisfies BridgeSessionAuth,
  }
}
