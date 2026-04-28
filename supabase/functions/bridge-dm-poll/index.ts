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
  since?: string
  sinceMessageId?: string
  before?: string
  beforeMessageId?: string
  markRead?: boolean
}

const DM_MESSAGE_SELECT = `
  id,
  conversation_id,
  sender_id,
  content,
  created_at,
  sender:users!sender_id(
    display_name,
    full_name,
    username
  )
`

const getProfileLabel = (profile: any, fallbackId: string) =>
  profile?.display_name || profile?.full_name || profile?.username || fallbackId

const toBridgeMessage = (message: any) => {
  const senderLabel = getProfileLabel(message.sender, message.sender_id)
  return {
    id: message.id,
    conversation_id: message.conversation_id,
    sender_id: message.sender_id,
    content: message.content,
    created_at: message.created_at,
    senderLabel,
    sender: {
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
    const body = await readJson<BridgeDmPollPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const recipientUserReference = normalizeText(body?.recipientUserId)
    let conversationId = normalizeText(body?.conversationId)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))
    const limit = Math.min(Math.max(Number(body?.limit ?? 10) || 10, 1), 30)
    let since = normalizeText(body?.since)
    const sinceMessageId = normalizeText(body?.sinceMessageId)
    let before = normalizeText(body?.before)
    const beforeMessageId = normalizeText(body?.beforeMessageId)
    const markRead = body?.markRead !== false

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

    if ((since || sinceMessageId) && (before || beforeMessageId)) {
      return badRequest('Use either since/sinceMessageId or before/beforeMessageId, not both')
    }

    const resolveMessageCreatedAt = async (messageId: string, label: string) => {
      const { data: cursorMessage, error: cursorError } = await supabase
        .from('dm_messages')
        .select('created_at')
        .eq('id', messageId)
        .eq('conversation_id', conversationId)
        .maybeSingle()

      if (cursorError) {
        throw cursorError
      }

      if (!cursorMessage?.created_at) {
        return badRequest(`${label} is not valid for this DM conversation`)
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
      .from('dm_messages')
      .select(DM_MESSAGE_SELECT)
      .eq('conversation_id', conversationId)
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

    let markedReadCount = 0
    if (markRead) {
      const { data: count, error: markReadError } = await supabase
        .rpc('bridge_mark_dm_messages_read', {
          p_conversation_id: conversationId,
          p_reader_user_id: bridgeAuth.auth.userId,
        })

      if (markReadError) {
        throw markReadError
      }

      markedReadCount = Number(count ?? 0)
    }

    const orderedMessages = since ? (data ?? []) : [...(data ?? [])].reverse()

    return json({
      ok: true,
      deviceId,
      conversationId,
      recipient,
      markedReadCount,
      messages: orderedMessages.map(toBridgeMessage),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
