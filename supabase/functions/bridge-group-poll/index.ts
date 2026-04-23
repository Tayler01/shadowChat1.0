import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
} from '../_shared/bridge.ts'

type BridgeGroupPollPayload = {
  deviceId?: string
  limit?: number
  since?: string
}

const MESSAGE_SELECT = `
  id,
  user_id,
  content,
  message_type,
  edited_at,
  pinned,
  pinned_by,
  pinned_at,
  reply_to,
  reactions,
  created_at,
  updated_at,
  audio_url,
  audio_duration,
  file_url,
  user:users!user_id(
    id,
    username,
    display_name,
    full_name,
    avatar_url,
    color,
    chat_color,
    status,
    status_message
  )
`

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeGroupPollPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const limit = Math.min(Math.max(Number(body?.limit ?? 10) || 10, 1), 50)
    const since = normalizeText(body?.since)

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    const supabase = getSupabaseAdmin()
    let query = supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (since) {
      query = query.gt('created_at', since)
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return json({
      ok: true,
      deviceId,
      messages: [...(data ?? [])].reverse(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
