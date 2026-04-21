import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from 'npm:@block65/webcrypto-web-push@1.0.2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushEventType = 'dm_message' | 'group_message'

type NotificationPrefs = {
  user_id: string
  dm_enabled?: boolean
  group_enabled?: boolean
  mute_until: string | null
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
}

type NotificationEventRow = {
  id: string
  sent_at: string | null
}

type DmMessageRecord = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  message_type: string | null
  created_at: string
  sender:
    | {
        id: string
        username: string | null
        display_name: string | null
      }
    | Array<{
        id: string
        username: string | null
        display_name: string | null
      }>
    | null
}

type GroupMessageRecord = {
  id: string
  user_id: string
  content: string | null
  message_type: string | null
  created_at: string
  user:
    | {
        id: string
        username: string | null
        display_name: string | null
      }
    | Array<{
        id: string
        username: string | null
        display_name: string | null
      }>
    | null
}

const unauthorized = (message: string) =>
  new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const truncate = (value: string, maxLength: number) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

const getMessagePreview = (message: {
  content: string | null
  message_type: string | null
}) => {
  const type = message.message_type ?? 'text'
  const content = (message.content ?? '').trim()

  if (type === 'image') return 'Sent an image'
  if (type === 'file') return 'Sent a file'
  if (type === 'audio') return 'Sent a voice message'
  if (type === 'command') return truncate(content || 'Sent a message', 120)
  return truncate(content || 'Sent a message', 120)
}

const getActor = <T extends { username: string | null; display_name: string | null }>(
  actor: T | T[] | null
) => (Array.isArray(actor) ? actor[0] : actor)

const getActorLabel = (actor: { username: string | null; display_name: string | null } | null) =>
  actor?.display_name || actor?.username || 'New message'

const isMuted = (prefs: { mute_until: string | null }) => {
  if (!prefs.mute_until) return false
  return new Date(prefs.mute_until).getTime() > Date.now()
}

const authenticateRequest = async (req: Request) => {
  const authorization = req.headers.get('Authorization') ?? ''
  if (!authorization.startsWith('Bearer ')) {
    return { error: unauthorized('Authentication required') }
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  const token = authorization.replace(/^Bearer\s+/i, '')
  const authResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: supabaseAnonKey,
    },
  })

  if (!authResponse.ok) {
    return { error: unauthorized('Invalid or expired session') }
  }

  const user = await authResponse.json()
  if (!user?.id) {
    return { error: unauthorized('Invalid or expired session') }
  }

  return { userId: user.id as string }
}

const getSupabaseAdmin = () => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase service role credentials are not configured')
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const getVapidKeys = (): VapidKeys => {
  const publicKey = Deno.env.get('WEB_PUSH_PUBLIC_KEY')
  const privateKey = Deno.env.get('WEB_PUSH_PRIVATE_KEY')
  const subject = Deno.env.get('WEB_PUSH_SUBJECT')

  if (!publicKey || !privateKey || !subject) {
    throw new Error('Web Push secrets are not configured')
  }

  return {
    subject,
    publicKey,
    privateKey,
  }
}

const getActiveSubscriptions = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) => {
  const { data, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    throw error
  }

  return (data ?? []) as StoredSubscription[]
}

const upsertNotificationEvent = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  values: Record<string, unknown>,
  dedupeKey: string
) => {
  const { data, error } = await supabase
    .from('notification_events')
    .upsert(
      {
        ...values,
        dedupe_key: dedupeKey,
      },
      { onConflict: 'dedupe_key' }
    )
    .select('id, sent_at')
    .single()

  if (error) {
    throw error
  }

  return data as NotificationEventRow
}

const deliverPushToSubscriptions = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  subscriptions: StoredSubscription[],
  message: PushMessage
) => {
  const results = await Promise.all(
    subscriptions.map(async (subscriptionRow) => {
      const subscription: PushSubscription = {
        endpoint: subscriptionRow.endpoint,
        expirationTime: null,
        keys: {
          p256dh: subscriptionRow.p256dh,
          auth: subscriptionRow.auth,
        },
      }

      const payload = await buildPushPayload(message, subscription, vapid)
      const response = await fetch(subscription.endpoint, payload)

      return {
        id: subscriptionRow.id,
        endpoint: subscriptionRow.endpoint,
        status: response.status,
        ok: response.ok,
      }
    })
  )

  const expiredSubscriptionIds = results
    .filter((result) => result.status === 404 || result.status === 410)
    .map((result) => result.id)

  if (expiredSubscriptionIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', expiredSubscriptionIds)
  }

  return {
    deliveredCount: results.filter((result) => result.ok).length,
    removedSubscriptions: expiredSubscriptionIds.length,
    results,
  }
}

const sendDmPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  messageId: string
) => {
  const { data: message, error: messageError } = await supabase
    .from('dm_messages')
    .select(
      `
        id,
        conversation_id,
        sender_id,
        content,
        message_type,
        created_at,
        sender:users!sender_id(
          id,
          username,
          display_name
        )
      `
    )
    .eq('id', messageId)
    .single()

  if (messageError || !message) {
    return json({ error: 'DM message not found' }, 404)
  }

  const dmMessage = message as unknown as DmMessageRecord

  if (dmMessage.sender_id !== authUserId) {
    return unauthorized('You can only send notifications for your own messages')
  }

  const { data: conversation, error: conversationError } = await supabase
    .from('dm_conversations')
    .select('id, participants')
    .eq('id', dmMessage.conversation_id)
    .single()

  if (conversationError || !conversation) {
    return json({ error: 'Conversation not found' }, 404)
  }

  const recipientId = (conversation.participants as string[]).find(
    (participantId) => participantId !== authUserId
  )

  if (!recipientId) {
    return json({ skipped: true, reason: 'No recipient found' })
  }

  const { data: preferences } = await supabase
    .from('notification_preferences')
    .select('user_id, dm_enabled, mute_until')
    .eq('user_id', recipientId)
    .maybeSingle()

  if (!preferences?.dm_enabled || isMuted(preferences)) {
    return json({ skipped: true, reason: 'Recipient preferences disable DM push' })
  }

  const subscriptions = await getActiveSubscriptions(supabase, recipientId)
  if (!subscriptions.length) {
    return json({ skipped: true, reason: 'Recipient has no active push subscriptions' })
  }

  const sender = getActor(dmMessage.sender)
  const senderLabel = getActorLabel(sender)
  const preview = getMessagePreview(dmMessage)
  const route = `/?view=dms&conversation=${dmMessage.conversation_id}`
  const dedupeKey = `dm:${dmMessage.id}:${recipientId}`

  const eventRecord = await upsertNotificationEvent(supabase, {
    user_id: recipientId,
    type: 'dm_message',
    entity_id: dmMessage.id,
    conversation_id: dmMessage.conversation_id,
    dm_message_id: dmMessage.id,
    payload: {
      title: senderLabel,
      body: preview,
      route,
      sender_id: authUserId,
    },
  }, dedupeKey)

  if (eventRecord.sent_at) {
    return json({ skipped: true, reason: 'Notification already sent' })
  }

  const pushMessage: PushMessage = {
    data: JSON.stringify({
      title: senderLabel,
      body: preview,
      tag: `dm:${dmMessage.conversation_id}`,
      data: {
        url: route,
        route,
        type: 'dm_message',
        conversationId: dmMessage.conversation_id,
        messageId: dmMessage.id,
        senderId: authUserId,
      },
    }),
    options: {
      ttl: 300,
      urgency: 'high',
    },
  }

  const delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, pushMessage)

  if (delivery.deliveredCount > 0) {
    await supabase
      .from('notification_events')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', eventRecord.id)
  }

  return json(delivery)
}

const sendGroupPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  messageId: string
) => {
  const { data: message, error: messageError } = await supabase
    .from('messages')
    .select(
      `
        id,
        user_id,
        content,
        message_type,
        created_at,
        user:users!user_id(
          id,
          username,
          display_name
        )
      `
    )
    .eq('id', messageId)
    .single()

  if (messageError || !message) {
    return json({ error: 'Group message not found' }, 404)
  }

  const groupMessage = message as unknown as GroupMessageRecord

  if (groupMessage.user_id !== authUserId) {
    return unauthorized('You can only send notifications for your own messages')
  }

  const { data: recipientPreferences, error: prefsError } = await supabase
    .from('notification_preferences')
    .select('user_id, group_enabled, mute_until')
    .eq('group_enabled', true)
    .neq('user_id', authUserId)

  if (prefsError) {
    throw prefsError
  }

  const eligibleRecipients = ((recipientPreferences ?? []) as NotificationPrefs[]).filter(
    (prefs) => !isMuted(prefs)
  )

  if (!eligibleRecipients.length) {
    return json({ skipped: true, reason: 'No recipients have group push enabled' })
  }

  const sender = getActor(groupMessage.user)
  const senderLabel = getActorLabel(sender)
  const preview = getMessagePreview(groupMessage)
  const route = '/?view=chat'

  const perRecipientResults = await Promise.all(
    eligibleRecipients.map(async (prefs) => {
      const subscriptions = await getActiveSubscriptions(supabase, prefs.user_id)
      if (!subscriptions.length) {
        return {
          userId: prefs.user_id,
          skipped: true,
          reason: 'No active push subscriptions',
          delivered: 0,
          removedSubscriptions: 0,
          results: [],
        }
      }

      const dedupeKey = `group:${groupMessage.id}:${prefs.user_id}`
      const eventRecord = await upsertNotificationEvent(
        supabase,
        {
          user_id: prefs.user_id,
          type: 'group_message',
          entity_id: groupMessage.id,
          message_id: groupMessage.id,
          payload: {
            title: `${senderLabel} in General Chat`,
            body: preview,
            route,
            sender_id: authUserId,
          },
        },
        dedupeKey
      )

      if (eventRecord.sent_at) {
        return {
          userId: prefs.user_id,
          skipped: true,
          reason: 'Notification already sent',
          delivered: 0,
          removedSubscriptions: 0,
          results: [],
        }
      }

      const pushMessage: PushMessage = {
        data: JSON.stringify({
          title: `${senderLabel} in General Chat`,
          body: preview,
          tag: `group:${groupMessage.id}`,
          data: {
            url: route,
            route,
            type: 'group_message',
            messageId: groupMessage.id,
            senderId: authUserId,
          },
        }),
        options: {
          ttl: 300,
          urgency: 'high',
        },
      }

      const delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, pushMessage)

      if (delivery.deliveredCount > 0) {
        await supabase
          .from('notification_events')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', eventRecord.id)
      }

      return {
        userId: prefs.user_id,
        skipped: false,
        ...delivery,
      }
    })
  )

  const deliveredRecipients = perRecipientResults.filter((result) => result.delivered > 0).length
  const deliveredSubscriptions = perRecipientResults.reduce(
    (sum, result) => sum + result.delivered,
    0
  )
  const removedSubscriptions = perRecipientResults.reduce(
    (sum, result) => sum + result.removedSubscriptions,
    0
  )

  return json({
    deliveredRecipients,
    deliveredSubscriptions,
    removedSubscriptions,
    results: perRecipientResults,
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const auth = await authenticateRequest(req)
    if ('error' in auth) {
      return auth.error
    }

    const body = await req.json()
    const type = body?.type as PushEventType | undefined
    const messageId = typeof body?.messageId === 'string' ? body.messageId : ''

    if (!messageId || (type !== 'dm_message' && type !== 'group_message')) {
      return json({ error: 'Unsupported notification payload' }, 400)
    }

    const supabase = getSupabaseAdmin()
    const vapid = getVapidKeys()

    if (type === 'dm_message') {
      return await sendDmPush(supabase, vapid, auth.userId, messageId)
    }

    return await sendGroupPush(supabase, vapid, auth.userId, messageId)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
