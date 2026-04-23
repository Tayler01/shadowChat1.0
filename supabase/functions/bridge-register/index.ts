import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type RegisterPayload = {
  deviceSerial?: string
  hardwareModel?: string
  firmwareVersion?: string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<RegisterPayload>(req)
    const deviceSerial = normalizeText(body?.deviceSerial)
    const hardwareModel = normalizeText(body?.hardwareModel)
    const firmwareVersion = normalizeText(body?.firmwareVersion)

    if (!deviceSerial || !hardwareModel || !firmwareVersion) {
      return badRequest('deviceSerial, hardwareModel, and firmwareVersion are required')
    }

    const supabase = getSupabaseAdmin()

    const { data: existing, error: lookupError } = await supabase
      .from('bridge_devices')
      .select('id, status, paired_user_id')
      .eq('device_serial', deviceSerial)
      .maybeSingle()

    if (lookupError) {
      throw lookupError
    }

    const timestamp = new Date().toISOString()

    if (existing) {
      const { data: updated, error: updateError } = await supabase
        .from('bridge_devices')
        .update({
          hardware_model: hardwareModel,
          firmware_version: firmwareVersion,
          last_seen_at: timestamp,
        })
        .eq('id', existing.id)
        .select('id, status, paired_user_id, last_seen_at')
        .single()

      if (updateError) {
        throw updateError
      }

      await supabase.from('bridge_audit_events').insert({
        device_id: updated.id,
        event_type: 'device_registered',
        event_payload: {
          hardware_model: hardwareModel,
          firmware_version: firmwareVersion,
          existing: true,
        },
      })

      return json({
        deviceId: updated.id,
        status: updated.status,
        pairedUserId: updated.paired_user_id,
        lastSeenAt: updated.last_seen_at,
      })
    }

    const { data: created, error: createError } = await supabase
      .from('bridge_devices')
      .insert({
        device_serial: deviceSerial,
        hardware_model: hardwareModel,
        firmware_version: firmwareVersion,
        status: 'unpaired',
        last_seen_at: timestamp,
      })
      .select('id, status, paired_user_id, last_seen_at')
      .single()

    if (createError) {
      throw createError
    }

    await supabase.from('bridge_audit_events').insert({
      device_id: created.id,
      event_type: 'device_registered',
      event_payload: {
        hardware_model: hardwareModel,
        firmware_version: firmwareVersion,
        existing: false,
      },
    })

    return json({
      deviceId: created.id,
      status: created.status,
      pairedUserId: created.paired_user_id,
      lastSeenAt: created.last_seen_at,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
