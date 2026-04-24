import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  authenticateBridgeAccessToken,
  badRequest,
  corsHeaders,
  getSupabaseAdmin,
  json,
  normalizeText,
  readJson,
  resolveBridgeUserReference,
} from '../_shared/bridge.ts'

type BridgeDmPollPayload = {
  deviceId?: string
  recipientUserId?: string
  conversationId?: string
  limit?: number
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

serve(async req => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405)
  }

  try {
    const body = await readJson<BridgeDmPollPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const recipientUserReference = normalizeText(body?.recipientUserId)
    let conversationId = normalizeText(body?.conversationId)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const limit = Math.min(Math.max(Number(body?.limit ?? 10) || 10, 1), 50)

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    if (!conversationId && !recipientUserReference) {
      return badRequest('conversationId or recipientUserId is required')
    }

    const supabase = getSupabaseAdmin()
    let recipient = null

    if (!conversationId) {
      const resolvedRecipient = await resolveBridgeUserReference(supabase, recipientUserReference)
      if ('error' in resolvedRecipient) {
        return resolvedRecipient.error
      }

      recipient = resolvedRecipient.user
      const participants = [bridgeAuth.auth.userId, resolvedRecipient.user.id].sort()
      const { data: conversation, error: conversationError } = await supabase
        .from('dm_conversations')
        .select('id')
        .contains('participants', participants)
        .limit(1)
        .maybeSingle()

      if (conversationError) {
        throw conversationError
      }

      conversationId = conversation?.id ?? ''
    }

    if (!conversationId) {
      return json({
        ok: true,
        deviceId,
        conversationId: null,
        recipient,
        messages: [],
      })
    }

    const { data: conversation, error: accessError } = await supabase
      .from('dm_conversations')
      .select('id, participants')
      .eq('id', conversationId)
      .contains('participants', [bridgeAuth.auth.userId])
      .maybeSingle()

    if (accessError) {
      throw accessError
    }

    if (!conversation) {
      return badRequest('Conversation is not available to this bridge')
    }

    const { data, error } = await supabase
      .from('dm_messages')
      .select(DM_MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      throw error
    }

    return json({
      ok: true,
      deviceId,
      conversationId,
      recipient,
      messages: [...(data ?? [])].reverse(),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
