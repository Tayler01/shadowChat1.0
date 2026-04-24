import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  createBridgeSessionMaterial,
  getFutureIso,
  getSupabaseAdmin,
  hashToken,
  issueBridgeSupabaseSession,
  isExpiredIso,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type SessionRefreshPayload = {
  deviceId?: string
  refreshToken?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<SessionRefreshPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const refreshToken = normalizeText(body?.refreshToken)

    if (!deviceId || !refreshToken) {
      return badRequest('deviceId and refreshToken are required')
    }

    const supabase = getSupabaseAdmin()
    const refreshTokenHash = await hashToken(refreshToken)

    const { data: session, error: sessionError } = await supabase
      .from('bridge_device_sessions')
      .select('id, device_id, user_id, owner_user_id, status, refresh_token_hash, expires_at')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .eq('refresh_token_hash', refreshTokenHash)
      .maybeSingle()

    if (sessionError) {
      throw sessionError
    }

    if (!session) {
      return json({ error: 'Invalid bridge refresh token' }, 401)
    }

    if (isExpiredIso(session.expires_at)) {
      const timestamp = new Date().toISOString()

      await supabase
        .from('bridge_device_sessions')
        .update({
          status: 'expired',
        })
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

      return json({ error: 'Bridge refresh token has expired' }, 401)
    }

    let pairingQuery = supabase
      .from('bridge_pairings')
      .select('id, user_id, bridge_user_id, status')
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
      return json({ error: 'Bridge pairing is no longer active' }, 403)
    }

    const timestamp = new Date().toISOString()
    const expiresAt = getFutureIso(60)
    const nextSessionMaterial = await createBridgeSessionMaterial()

    const { data: bridgeProfile, error: bridgeProfileError } = await supabase
      .from('users')
      .select('id, email')
      .eq('id', session.user_id)
      .maybeSingle()

    if (bridgeProfileError) {
      throw bridgeProfileError
    }

    if (!bridgeProfile?.email) {
      return json({ error: 'Bridge user profile is missing auth email' }, 409)
    }

    const supabaseAuth = await issueBridgeSupabaseSession(supabase, {
      bridgeUserId: session.user_id,
      email: bridgeProfile.email,
    })

    const { error: updateError } = await supabase
      .from('bridge_device_sessions')
      .update({
        status: 'active',
        last_refresh_at: timestamp,
        last_rotated_at: timestamp,
        expires_at: expiresAt,
        access_token_hash: nextSessionMaterial.accessTokenHash,
        refresh_token_hash: nextSessionMaterial.refreshTokenHash,
      })
      .eq('id', session.id)

    if (updateError) {
      throw updateError
    }

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: session.owner_user_id ?? session.user_id,
        event_type: 'session_refreshed',
        event_payload: {
          bridge_session_id: session.id,
          pairing_id: pairing.id,
          bridge_user_id: session.user_id,
          control_plane_only: true,
        },
      })

    return json({
      deviceId,
      bridgeSessionId: session.id,
      accessToken: nextSessionMaterial.accessToken,
      refreshToken: nextSessionMaterial.refreshToken,
      expiresAt,
      supabaseAuth,
      sessionMetadata: {
        userId: session.user_id,
        ownerUserId: session.owner_user_id,
        sessionType: 'bridge_control',
        provisioningStatus: 'bridge_user_refreshed',
        dataPlaneReady: true,
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
