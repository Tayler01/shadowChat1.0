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
  before?: string
  beforeMessageId?: string
}

const MESSAGE_SELECT = `
  id,
  user_id,
  content,
  created_at,
  user:users!user_id(
    display_name,
    full_name,
    username
  )
`

const getProfileLabel = (profile: any, fallbackId: string) =>
  profile?.display_name || profile?.full_name || profile?.username || fallbackId

const toBridgeMessage = (message: any) => {
  const senderLabel = getProfileLabel(message.user, message.user_id)
  return {
    id: message.id,
    user_id: message.user_id,
    content: message.content,
    created_at: message.created_at,
    senderLabel,
    user: {
      display_name: senderLabel,
    },
  }
}

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
    const limit = Math.min(Math.max(Number(body?.limit ?? 10) || 10, 1), 30)
    let since = normalizeText(body?.since)
    const sinceMessageId = normalizeText(body?.sinceMessageId)
    let before = normalizeText(body?.before)
    const beforeMessageId = normalizeText(body?.beforeMessageId)

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    const supabase = getSupabaseAdmin()
    if ((since || sinceMessageId) && (before || beforeMessageId)) {
      return badRequest('Use either since/sinceMessageId or before/beforeMessageId, not both')
    }

    const resolveMessageCreatedAt = async (messageId: string, label: string) => {
      const { data: cursorMessage, error: cursorError } = await supabase
        .from('messages')
        .select('created_at')
        .eq('id', messageId)
        .maybeSingle()

      if (cursorError) {
        throw cursorError
      }

      if (!cursorMessage?.created_at) {
        return badRequest(`${label} is not a valid group message`)
      }

      return cursorMessage.created_at as string
    }

    if (sinceMessageId) {
      const resolved = await resolveMessageCreatedAt(sinceMessageId, 'sinceMessageId')
      if (typeof resolved !== 'string') {
        return resolved
      }
      since = resolved
    }

    if (beforeMessageId) {
      const resolved = await resolveMessageCreatedAt(beforeMessageId, 'beforeMessageId')
      if (typeof resolved !== 'string') {
        return resolved
      }
      before = resolved
    }

    let query = supabase
      .from('messages')
      .select(MESSAGE_SELECT)
      .limit(limit)

    if (since) {
      query = query
        .gt('created_at', since)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
    } else if (before) {
      query = query
        .lt('created_at', before)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    } else {
      query = query
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
    }

    const { data, error } = await query

    if (error) {
      throw error
    }

    const orderedMessages = since ? (data ?? []) : [...(data ?? [])].reverse()

    return json({
      ok: true,
      deviceId,
      messages: orderedMessages.map(toBridgeMessage),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
