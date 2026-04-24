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

const sanitizePushDispatchBody = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sanitizePushDispatchBody)
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        key === 'endpoint' ? '(redacted)' : sanitizePushDispatchBody(entry),
      ]),
    )
  }

  return value
}

export const triggerPushDispatch = async (
  type: 'dm_message' | 'group_message',
  messageId: string,
  senderUserId: string,
  options: { origin?: 'bridge'; bridgeDeviceId?: string } = {},
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
        origin: options.origin,
        bridgeDeviceId: options.bridgeDeviceId,
      }),
    })

    const responseText = await response.text().catch(() => '')
    let body: unknown = responseText
    if (responseText) {
      try {
        body = sanitizePushDispatchBody(JSON.parse(responseText))
      } catch {
        body = responseText
      }
    }

    if (!response.ok) {
      console.error('Bridge push dispatch failed', {
        type,
        messageId,
        status: response.status,
        body,
      })
    }

    return {
      ok: response.ok,
      status: response.status,
      body,
    }
  } catch (error) {
    console.error('Bridge push dispatch failed', error)
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown push dispatch error',
    }
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
  ownerUserId: string | null
}

type BridgeDeviceIdentity = {
  id: string
  device_serial: string
  bridge_user_id?: string | null
}

const getBridgeAccountSlug = (value: string) => {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32)

  return slug || 'device'
}

const getBridgeAccountEmail = (deviceId: string) =>
  `bridge-${deviceId.replace(/-/g, '')}@devices.shadowchat.local`

const getBridgeAccountUsername = (device: BridgeDeviceIdentity) =>
  `esp_${getBridgeAccountSlug(device.device_serial || device.id)}`

const getBridgeAccountDisplayName = (device: BridgeDeviceIdentity) =>
  `ESP Bridge ${device.device_serial ? device.device_serial.slice(-6).toUpperCase() : device.id.slice(0, 8)}`

export const ensureBridgeUserForDevice = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  device: BridgeDeviceIdentity,
) => {
  const email = getBridgeAccountEmail(device.id)
  const username = getBridgeAccountUsername(device)
  const displayName = getBridgeAccountDisplayName(device)
  let bridgeUserId = device.bridge_user_id ?? null

  if (!bridgeUserId) {
    const { data: existingProfile, error: existingProfileError } = await supabase
      .from('users')
      .select('id')
      .eq('email', email)
      .maybeSingle()

    if (existingProfileError) {
      throw existingProfileError
    }

    bridgeUserId = existingProfile?.id ?? null
  }

  if (!bridgeUserId) {
    const initialPassword = generateOpaqueToken('bpwd', 48)
    const { data: createdUser, error: createUserError } = await supabase.auth.admin.createUser({
      email,
      password: initialPassword,
      email_confirm: true,
      user_metadata: {
        username,
        display_name: displayName,
        full_name: displayName,
        account_type: 'esp_bridge',
        bridge_device_id: device.id,
      },
    })

    if (createUserError) {
      throw createUserError
    }

    bridgeUserId = createdUser.user?.id ?? null
  }

  if (!bridgeUserId) {
    throw new Error('Unable to create bridge user account')
  }

  const { error: profileError } = await supabase
    .from('users')
    .upsert({
      id: bridgeUserId,
      email,
      username,
      display_name: displayName,
      full_name: displayName,
      color: '#D4AF37',
      chat_color: '#D4AF37',
      status: 'online',
      status_message: 'ESP bridge device',
      last_active: new Date().toISOString(),
    }, { onConflict: 'id' })

  if (profileError) {
    throw profileError
  }

  const { error: deviceUpdateError } = await supabase
    .from('bridge_devices')
    .update({ bridge_user_id: bridgeUserId })
    .eq('id', device.id)

  if (deviceUpdateError) {
    throw deviceUpdateError
  }

  return {
    bridgeUserId,
    email,
    username,
    displayName,
  }
}

export const issueBridgeSupabaseSession = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  account: { bridgeUserId: string; email: string },
) => {
  const password = generateOpaqueToken('bpwd', 48)
  const { error: passwordError } = await supabase.auth.admin.updateUserById(
    account.bridgeUserId,
    { password },
  )

  if (passwordError) {
    throw passwordError
  }

  const { supabaseUrl, supabaseAnonKey } = getEnv()
  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await authClient.auth.signInWithPassword({
    email: account.email,
    password,
  })

  if (error || !data.session) {
    throw error ?? new Error('Unable to issue bridge auth session')
  }

  return {
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    expiresAt: data.session.expires_at
      ? new Date(data.session.expires_at * 1000).toISOString()
      : null,
    userId: data.session.user.id,
  }
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
    .select('id, device_id, user_id, owner_user_id, status, expires_at')
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

  let pairingQuery = supabase
    .from('bridge_pairings')
    .select('id')
    .eq('device_id', deviceId)
    .eq('status', 'paired')

  if (session.owner_user_id) {
    pairingQuery = pairingQuery
      .eq('user_id', session.owner_user_id)
      .eq('bridge_user_id', session.user_id)
  } else {
    pairingQuery = pairingQuery.eq('user_id', session.user_id)
  }

  const { data: pairing, error: pairingError } = await pairingQuery
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
      ownerUserId: session.owner_user_id as string | null,
    } satisfies BridgeSessionAuth,
  }
}
