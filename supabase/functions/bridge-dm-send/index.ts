import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
  triggerPushDispatch,
} from '../_shared/bridge.ts'

type BridgeDmSendPayload = {
  deviceId?: string
  recipientUserId?: string
  content?: string
}

const DM_MESSAGE_SELECT = `
  id,
  conversation_id,
  sender_id,
  content,
  read_at,
  reactions,
  edited_at,
  created_at,
  message_type,
  audio_url,
  audio_duration,
  file_url,
  sender:users!sender_id(
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

const getOrCreateConversation = async (supabase: ReturnType<typeof getSupabaseAdmin>, userId: string, recipientUserId: string) => {
  const participants = [userId, recipientUserId].sort()

  const { data: existing, error: lookupError } = await supabase
    .from('dm_conversations')
    .select('id, participants')
    .contains('participants', participants)
    .limit(1)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  if (existing?.id) {
    return existing.id as string
  }

  const { data: created, error: createError } = await supabase
    .from('dm_conversations')
    .insert({ participants })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  return created.id as string
}

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeDmSendPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const recipientUserId = normalizeText(body?.recipientUserId)
    const content = normalizeText(body?.content)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))

    if (!recipientUserId || !content) {
      return badRequest('recipientUserId and content are required')
    }

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    if (recipientUserId === bridgeAuth.auth.userId) {
      return badRequest('recipientUserId must be different from the paired user')
    }

    const supabase = getSupabaseAdmin()
    const conversationId = await getOrCreateConversation(supabase, bridgeAuth.auth.userId, recipientUserId)

    const { data: message, error: insertError } = await supabase
      .from('dm_messages')
      .insert({
        conversation_id: conversationId,
        sender_id: bridgeAuth.auth.userId,
        content,
        message_type: 'text',
      })
      .select(DM_MESSAGE_SELECT)
      .single()

    if (insertError) {
      throw insertError
    }

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: bridgeAuth.auth.userId,
        event_type: 'dm_message_sent',
        event_payload: {
          bridge_session_id: bridgeAuth.auth.bridgeSessionId,
          conversation_id: conversationId,
          message_id: message.id,
          recipient_user_id: recipientUserId,
        },
      })

    await triggerPushDispatch('dm_message', message.id as string, bridgeAuth.auth.userId)

    return json({
      ok: true,
      deviceId,
      conversationId,
      message,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
