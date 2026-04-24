import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  badRequest,
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
  sinceMessageId?: string
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
    let since = normalizeText(body?.since)
    const sinceMessageId = normalizeText(body?.sinceMessageId)

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    const supabase = getSupabaseAdmin()
    if (sinceMessageId) {
      const { data: cursorMessage, error: cursorError } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', sinceMessageId)
        .maybeSingle()

      if (cursorError) {
        throw cursorError
      }

      if (!cursorMessage?.created_at) {
        return badRequest('sinceMessageId is not a valid group message')
      }

      since = cursorMessage.created_at
    }

    let query = supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .limit(limit)

    if (since) {
      query = query
        .gt('created_at', since)
        .order('created_at', { ascending: true })
    } else {
      query = query.order('created_at', { ascending: false })
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    return json({
      ok: true,
      deviceId,
      messages: since ? (data ?? []) : [...(data ?? [])].reverse(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
