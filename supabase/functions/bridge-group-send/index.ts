import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import {
  buildGroupAIRequest,
  ensureShadoAIProfile,
  extractAiMentionQuestion,
  getAIAnswer,
  insertShadoAIMessage,
  requestAICompletion,
} from '../_shared/ai.ts'
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

type BridgeGroupSendPayload = {
  deviceId?: string
  content?: string
  model?: string
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
    const body = await readJson<BridgeGroupSendPayload>(req)
    const deviceId = normalizeText(body?.deviceId)
    const content = normalizeText(body?.content)
    const requestedModel = normalizeText(body?.model)
    const accessToken = normalizeText(req.headers.get('X-Bridge-Access-Token'))

    if (!content) {
      return badRequest('content is required')
    }

    const bridgeAuth = await authenticateBridgeAccessToken(deviceId, accessToken)
    if ('error' in bridgeAuth) {
      return bridgeAuth.error
    }

    const supabase = getSupabaseAdmin()

    const { data: message, error: insertError } = await supabase
      .from('messages')
      .insert({
        user_id: bridgeAuth.auth.userId,
        content,
        message_type: 'text',
      })
      .select(MESSAGE_SELECT)
      .single()

    if (insertError) {
      throw insertError
    }

    await supabase
      .from('bridge_audit_events')
      .insert({
        device_id: deviceId,
        user_id: bridgeAuth.auth.userId,
        event_type: 'group_message_sent',
        event_payload: {
          bridge_session_id: bridgeAuth.auth.bridgeSessionId,
          message_id: message.id,
        },
      })

    const pushDispatch = await triggerPushDispatch('group_message', message.id as string, bridgeAuth.auth.userId, {
      origin: 'bridge',
      bridgeDeviceId: deviceId,
    })
    const aiQuestion = extractAiMentionQuestion(content)
    let aiDispatch: unknown = null

    if (aiQuestion) {
      try {
        const aiData = await requestAICompletion(
          buildGroupAIRequest(aiQuestion),
          requestedModel || undefined,
        )
        const answer = getAIAnswer(aiData)

        if (answer) {
          const shadoProfile = await ensureShadoAIProfile(supabase)
          const shadoMessage = await insertShadoAIMessage(supabase, shadoProfile.id, answer)
          aiDispatch = {
            ok: true,
            shadoMessage,
          }
        } else {
          aiDispatch = {
            ok: false,
            error: 'AI returned an empty response',
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown AI error'
        console.error('Bridge @ai dispatch failed', {
          deviceId,
          messageId: message.id,
          error: errorMessage,
        })
        aiDispatch = {
          ok: false,
          error: errorMessage,
        }
      }
    }

    return json({
      ok: true,
      deviceId,
      message,
      pushDispatch,
      aiDispatch,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
