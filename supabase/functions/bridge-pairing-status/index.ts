import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type PairingStatusPayload = {
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
    const body = await readJson<PairingStatusPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const pairingCode = normalizeText(body?.pairingCode).toUpperCase()

    if (!deviceId || !pairingCode) {
      return badRequest('deviceId and pairingCode are required')
    }

    const supabase = getSupabaseAdmin()

    const { data: device, error: deviceError } = await supabase
      .from('bridge_devices')
      .select('id, status, paired_user_id, last_seen_at')
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

    if (codeRow.status === 'pending' && new Date(codeRow.expires_at).getTime() <= Date.now()) {
      await supabase
        .from('bridge_pairing_codes')
        .update({ status: 'expired' })
        .eq('id', codeRow.id)

      codeRow.status = 'expired'
    }

    const { data: pairing, error: pairingError } = await supabase
      .from('bridge_pairings')
      .select('id, user_id, status, paired_at, revoked_at')
      .eq('device_id', deviceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (pairingError) {
      throw pairingError
    }

    const { data: activeSession, error: sessionError } = await supabase
      .from('bridge_device_sessions')
      .select('id, status, issued_at, expires_at')
      .eq('device_id', deviceId)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      throw sessionError
    }

    const approved = pairing?.status === 'paired'
    const sessionExchangeReady = approved && codeRow.status === 'consumed'

    return json({
      deviceId,
      status: device.status,
      pairingCodeStatus: codeRow.status,
      approved,
      sessionExchangeReady,
      pairing: pairing
        ? {
            id: pairing.id,
            userId: pairing.user_id,
            status: pairing.status,
            pairedAt: pairing.paired_at,
            revokedAt: pairing.revoked_at,
          }
        : null,
      activeSession: activeSession
        ? {
            id: activeSession.id,
            status: activeSession.status,
            issuedAt: activeSession.issued_at,
            expiresAt: activeSession.expires_at,
          }
        : null,
      expiresAt: codeRow.expires_at,
      consumedAt: codeRow.consumed_at,
      pairedUserId: device.paired_user_id,
      lastSeenAt: device.last_seen_at,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
