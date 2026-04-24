import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  forbidden,
  generatePairingCode,
  getSupabaseAdmin,
  json,
  normalizeText,
  notFound,
  readJson,
} from '../_shared/bridge.ts'

type PairingBeginPayload = {
  deviceId?: string
}

const PAIRING_CODE_TTL_MINUTES = 10

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<PairingBeginPayload>(req)
    const deviceId = normalizeText(body?.deviceId)

    if (!deviceId) {
      return badRequest('deviceId is required')
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

    if (device.status === 'revoked' || device.status === 'disabled') {
      return forbidden('Bridge device is not eligible for pairing')
    }

    const { data: activePairing, error: pairingLookupError } = await supabase
      .from('bridge_pairings')
      .select('id')
      .eq('device_id', deviceId)
      .eq('status', 'paired')
      .maybeSingle()

    if (pairingLookupError) {
      throw pairingLookupError
    }

    await supabase
      .from('bridge_pairing_codes')
      .update({ status: 'revoked' })
      .eq('device_id', deviceId)
      .eq('status', 'pending')

    let pairingCode = ''
    let pairingRequestId = ''
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000).toISOString()

    for (let attempt = 0; attempt < 5; attempt += 1) {
      pairingCode = generatePairingCode()
      const { data, error } = await supabase
        .from('bridge_pairing_codes')
        .insert({
          device_id: deviceId,
          code: pairingCode,
          status: 'pending',
          expires_at: expiresAt,
        })
        .select('id')
        .single()

      if (!error && data?.id) {
        pairingRequestId = data.id
        break
      }

      if (error && error.code !== '23505') {
        throw error
      }
    }

    if (!pairingRequestId) {
      throw new Error('Unable to generate unique pairing code')
    }

    await supabase
      .from('bridge_devices')
      .update({ status: 'pairing_pending' })
      .eq('id', deviceId)

    await supabase.from('bridge_audit_events').insert({
      device_id: deviceId,
      event_type: 'pairing_started',
      event_payload: {
        expires_at: expiresAt,
        pairing_request_id: pairingRequestId,
      },
    })

    return json({
      deviceId,
      pairingCode,
      expiresAt,
      pairingRequestId,
      status: 'pairing_pending',
      wasAlreadyPaired: Boolean(activePairing),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
