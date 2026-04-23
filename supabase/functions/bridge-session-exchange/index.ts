import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  createBridgeSessionMaterial,
  getFutureIso,
  getSupabaseAdmin,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type SessionExchangePayload = {
  deviceId?: string
  pairingCode?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<SessionExchangePayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const pairingCode = normalizeText(body?.pairingCode).toUpperCase()

    if (!deviceId || !pairingCode) {
      return badRequest('deviceId and pairingCode are required')
    }

    const supabase = getSupabaseAdmin()

    const { data: device, error: deviceError } = await supabase
      .from('bridge_devices')
      .select('id, status, paired_user_id')
      .eq('id', deviceId)
      .maybeSingle()

    if (deviceError) {
      throw deviceError
    }

    if (!device) {
      return notFound('Bridge device not found')
    }

    const { data: codeRow, error: codeError } = await supabase
      .from('bridge_pairing_codes')
      .select('id, status, expires_at, consumed_at')
      .eq('device_id', deviceId)
      .eq('code', pairingCode)
      .maybeSingle()

    if (codeError) {
      throw codeError
    }

    if (!codeRow) {
      return notFound('Pairing code not found')
    }

    if (codeRow.status !== 'consumed') {
      return json({ error: 'Pairing is not ready for session exchange' }, 409)
    }

    const { data: pairing, error: pairingError } = await supabase
      .from('bridge_pairings')
      .select('id, user_id, status, paired_at')
      .eq('device_id', deviceId)
      .eq('status', 'paired')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pairingError) {
      throw pairingError
    }

    if (!pairing) {
      return json({ error: 'Approved pairing not found' }, 409)
    }

    const timestamp = new Date().toISOString()
    const expiresAt = getFutureIso(60)
    const sessionMaterial = await createBridgeSessionMaterial()

    await supabase
      .from('bridge_device_sessions')
      .update({
        status: 'revoked',
        revoked_at: timestamp,
      })
      .eq('device_id', deviceId)
      .in('status', ['active', 'rotating'])

    const { data: session, error: sessionError } = await supabase
      .from('bridge_device_sessions')
      .insert({
        device_id: deviceId,
        user_id: pairing.user_id,
        status: 'active',
        issued_at: timestamp,
        last_refresh_at: timestamp,
        last_rotated_at: timestamp,
        expires_at: expiresAt,
        access_token_hash: sessionMaterial.accessTokenHash,
        refresh_token_hash: sessionMaterial.refreshTokenHash,
      })
      .select('id')
      .single()

    if (sessionError) {
      throw sessionError
    }

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: pairing.user_id,
        event_type: 'session_issued',
        event_payload: {
          pairing_id: pairing.id,
          bridge_session_id: session.id,
          control_plane_only: true,
          pairing_code_id: codeRow.id,
        },
      })

    return json({
      deviceId,
      pairingId: pairing.id,
      bridgeSessionId: session.id,
      accessToken: sessionMaterial.accessToken,
      refreshToken: sessionMaterial.refreshToken,
      expiresAt,
      sessionMetadata: {
        userId: pairing.user_id,
        sessionType: 'bridge_control',
        provisioningStatus: 'control_plane_only',
        dataPlaneReady: false,
        notes: [
          'Control-plane session issued successfully.',
          'Supabase user-scoped data-plane session minting is still a separate proof step.',
        ],
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
