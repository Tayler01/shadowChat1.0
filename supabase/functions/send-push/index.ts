import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
  buildPushPayload,
  type PushMessage,
  type PushSubscription,
  type VapidKeys,
} from 'npm:@block65/webcrypto-web-push@1.0.2'
import {
  assertPublicUrl,
  normalizePublicHttpUrl,
  safeFetch,
} from '../_shared/safe-fetch.ts'
import {
  authenticateEdgeUser,
  claimEdgeRequest,
  completeEdgeRequestClaim,
  consumeEdgeRateLimit,
  EdgeAuthenticationError,
  EdgeRateLimitError,
  failEdgeRequestClaim,
  getBearerToken,
  waitForEdgeRequestClaim,
} from '../_shared/edge-guard.ts'
import { embedPublicProfile } from '../_shared/public-profile.ts'
import {
  extractMentionUsernames,
  getNotificationSuppressionReason,
  selectGroupNotificationKind,
  type GroupNotificationKind,
} from '../_shared/notification-delivery.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type PushEventType =
  | 'dm_message'
  | 'group_message'
  | 'hype_event'
  | 'reaction'
  | 'shadow_pin_post'
  | 'shadow_pin_comment'
  | 'presence_active'

type SendPushRequestBody = {
  type?: PushEventType
  messageId?: string
  eventId?: string
  activationId?: string
  emoji?: string
  isDm?: boolean
  senderUserId?: string
  origin?: 'app' | 'bridge'
  bridgeDeviceId?: string
}

type NotificationPrefs = {
  user_id: string
  notifications_enabled: boolean
  dm_enabled?: boolean
  mention_enabled?: boolean
  reply_enabled?: boolean
  reaction_enabled?: boolean
  group_enabled?: boolean
  hype_enabled?: boolean
  shadow_pin_new_post_enabled?: boolean
  shadow_pin_comment_enabled?: boolean
  shadow_pin_reply_enabled?: boolean
  presence_push_enabled?: boolean
  presence_in_app_enabled?: boolean
  general_chat_muted: boolean
  quiet_hours_start: string | null
  quiet_hours_end: string | null
  quiet_hours_timezone: string
  mute_until: string | null
}

type StoredSubscription = {
  id: string
  endpoint: string
  p256dh: string
  auth: string
  foreground_until: string | null
}

type PresenceActivationRecord = {
  id: string
  actor_id: string
  expires_at: string
  dispatched_at: string | null
}

type PresenceRecipientClaim = {
  recipient_id: string
  event_id: string
  push_enabled: boolean
  in_app_enabled: boolean
}

type NotificationEventRow = {
  id: string
  sent_at: string | null
}
const DEFAULT_PUSH_REQUESTS_PER_MINUTE = 120
const PUSH_CLAIM_SCOPE = 'send-push'
const SAFE_PUSH_ENDPOINT_OPTIONS = {
  credentialMessage: 'Push endpoint credentials are not allowed.',
  invalidSchemeMessage: 'Only https push endpoints are supported.',
  tooLongMessage: 'A valid push endpoint is required.',
  unsafeHostMessage: 'Private or local push endpoints cannot be used.',
}

type DmMessageRecord = {
  id: string
  conversation_id: string
  sender_id: string
  content: string | null
  message_type: string | null
  created_at: string
  reply_to: string | null
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
  reply_to: string | null
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

type HypeEventRecord = {
  id: string
  actor_id: string | null
  event_type: 'bell' | 'message'
  message_id: string | null
  message_author_id: string | null
  metadata: Record<string, unknown> | null
  created_at: string
}

type ShadowPinPostRecord = {
  id: string
  category_id: string | null
  creator_id: string | null
  title: string
  image_url: string | null
  thumbnail_url: string | null
  medium_url: string | null
  deleted_at: string | null
  creator:
    | { id: string; username: string | null; display_name: string | null }
    | Array<{ id: string; username: string | null; display_name: string | null }>
    | null
}

type ShadowPinCommentPushRecord = {
  id: string
  image_id: string
  author_id: string
  parent_comment_id: string | null
  body: string
  author:
    | { id: string; username: string | null; display_name: string | null }
    | Array<{ id: string; username: string | null; display_name: string | null }>
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
const ensureResponse = (response: Response | undefined) =>
  response ?? json({ error: 'Push action did not return a response.' }, 500)

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

const getPushOrigin = (body: SendPushRequestBody) =>
  body.origin === 'bridge' ? 'bridge' : 'app'

const NOTIFICATION_PREFERENCE_SELECT = [
  'user_id',
  'notifications_enabled',
  'dm_enabled',
  'mention_enabled',
  'reply_enabled',
  'reaction_enabled',
  'group_enabled',
  'hype_enabled',
  'shadow_pin_new_post_enabled',
  'shadow_pin_comment_enabled',
  'shadow_pin_reply_enabled',
  'presence_push_enabled',
  'presence_in_app_enabled',
  'general_chat_muted',
  'quiet_hours_start',
  'quiet_hours_end',
  'quiet_hours_timezone',
  'mute_until',
].join(', ')

const authenticateRequest = async (req: Request, body: SendPushRequestBody) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Supabase environment variables are not configured')
  }

  let token: string
  try {
    token = getBearerToken(req)
  } catch (error) {
    if (error instanceof EdgeAuthenticationError) {
      return { error: unauthorized(error.message) }
    }
    throw error
  }

  if (serviceRoleKey && token === serviceRoleKey) {
    const senderUserId = typeof body?.senderUserId === 'string' ? body.senderUserId : ''
    if (!senderUserId) {
      return { error: unauthorized('senderUserId is required for service-role push dispatch') }
    }

    return { userId: senderUserId }
  }

  try {
    const user = await authenticateEdgeUser(req)
    return { userId: user.id }
  } catch (error) {
    if (error instanceof EdgeAuthenticationError) {
      return { error: unauthorized(error.message) }
    }
    throw error
  }
}

type ReactionRecord = {
  id: string
  user_id: string
  emoji: string
  message_id: string | null
  dm_message_id: string | null
}

type ReactionTargetRecord = {
  id: string
  user_id?: string
  sender_id?: string
  conversation_id?: string
  content: string | null
  message_type: string | null
}

const resolvePushRequestsPerMinute = () => {
  const configured = Number(Deno.env.get('PUSH_REQUESTS_PER_MINUTE') ?? '')
  if (!Number.isFinite(configured) || configured <= 0) {
    return DEFAULT_PUSH_REQUESTS_PER_MINUTE
  }
  return Math.min(Math.floor(configured), 600)
}

const responseBodyForClaim = async (response: Response) => {
  try {
    return await response.clone().json()
  } catch {
    return { error: 'Push action returned a non-JSON response.' }
  }
}

const replayClaimResponse = (claim: {
  response_status: number | null
  response_body: unknown
}) => new Response(JSON.stringify(claim.response_body), {
  status: claim.response_status ?? 200,
  headers: {
    ...corsHeaders,
    'Content-Type': 'application/json',
    'X-Idempotent-Replay': 'true',
  },
})

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
    .select('id, endpoint, p256dh, auth, foreground_until')
    .eq('user_id', userId)
    .eq('enabled', true)

  if (error) {
    throw error
  }

  return (data ?? []) as StoredSubscription[]
}

const getNotificationPreferences = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) => {
  const { data, error } = await supabase
    .from('notification_preferences')
    .select(NOTIFICATION_PREFERENCE_SELECT)
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return data as NotificationPrefs | null
}

const getDeliverySuppressionReason = (
  preferences: NotificationPrefs | null | undefined,
  options: { generalChat?: boolean } = {}
) => {
  const reason = getNotificationSuppressionReason(preferences)
  if (reason) return reason
  if (options.generalChat && preferences?.general_chat_muted) return 'General Chat is muted'
  return null
}

const isConversationMuted = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string,
  conversationId: string
) => {
  const { data, error } = await supabase
    .from('notification_conversation_mutes')
    .select('muted_until')
    .eq('user_id', userId)
    .eq('conversation_id', conversationId)
    .maybeSingle()

  if (error) throw error
  if (!data) return false
  if (!data.muted_until) return true
  return new Date(data.muted_until).getTime() > Date.now()
}

const getBlockedCounterpartIds = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) => {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocker_id, blocked_id')
    .or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)

  if (error) throw error

  return new Set((data ?? []).map(row => (
    row.blocker_id === userId ? row.blocked_id : row.blocker_id
  )).filter((value): value is string => typeof value === 'string'))
}

const getUnreadBadgeCount = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  userId: string
) => {
  const { data, error } = await supabase.rpc('get_app_badge_state', {
    target_user_id: userId,
  })

  if (error) {
    console.error('Failed to load unread badge count', error)
    return 0
  }

  const badgeState = data && typeof data === 'object' && !Array.isArray(data)
    ? data as { total?: unknown }
    : null
  const count = Number(badgeState?.total ?? 0)
  return Number.isFinite(count) ? Math.min(99, Math.max(0, Math.floor(count))) : 0
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

const normalizePushEndpoint = async (value: string) => {
  const endpoint = normalizePublicHttpUrl(value, SAFE_PUSH_ENDPOINT_OPTIONS)
  if (endpoint.protocol !== 'https:') {
    throw new Error('Only https push endpoints are supported.')
  }
  await assertPublicUrl(endpoint, SAFE_PUSH_ENDPOINT_OPTIONS)
  return endpoint
}

const toPushRequestInit = (payload: Awaited<ReturnType<typeof buildPushPayload>>): RequestInit => {
  const bodyBytes = new Uint8Array(payload.body)
  const body = bodyBytes.buffer as ArrayBuffer

  return {
    ...payload,
    body,
  }
}

const deliverPushToSubscriptions = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  subscriptions: StoredSubscription[],
  message: PushMessage,
  options: { retryAttempts?: number } = {}
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

      let endpoint: URL
      try {
        endpoint = await normalizePushEndpoint(subscriptionRow.endpoint)
      } catch (error) {
        return {
          id: subscriptionRow.id,
          status: 400,
          ok: false,
          invalid: true,
          retryable: false,
          error: error instanceof Error ? error.message : 'Invalid push endpoint',
        }
      }

      let payload: Awaited<ReturnType<typeof buildPushPayload>>
      try {
        payload = await buildPushPayload(message, subscription, vapid)
      } catch (error) {
        return {
          id: subscriptionRow.id,
          status: 400,
          ok: false,
          invalid: true,
          retryable: false,
          error: error instanceof Error ? error.message : 'Invalid push subscription',
        }
      }

      try {
        const response = await safeFetch(endpoint, toPushRequestInit(payload), SAFE_PUSH_ENDPOINT_OPTIONS)
        return {
          id: subscriptionRow.id,
          status: response.status,
          ok: response.ok,
          invalid: [400, 401, 403, 404, 410].includes(response.status),
          retryable: response.status === 408 || response.status === 429 || response.status >= 500,
        }
      } catch (error) {
        return {
          id: subscriptionRow.id,
          status: 503,
          ok: false,
          invalid: false,
          retryable: true,
          error: error instanceof Error ? error.message : 'Push provider request failed',
        }
      }
    })
  )

  const invalidSubscriptionIds = results
    .filter((result) => result.invalid)
    .map((result) => result.id)

  if (invalidSubscriptionIds.length) {
    await supabase.from('push_subscriptions').delete().in('id', invalidSubscriptionIds)
  }

  const retryableSubscriptionIds = new Set(
    results
      .filter((result) => result.retryable)
      .map((result) => result.id)
  )
  const retryAttempts = Math.max(0, options.retryAttempts ?? 0)
  if (retryableSubscriptionIds.size && retryAttempts > 0) {
    const retrySubscriptions = subscriptions.filter(subscription =>
      retryableSubscriptionIds.has(subscription.id)
    )
    const retryDelivery = await deliverPushToSubscriptions(
      supabase,
      vapid,
      retrySubscriptions,
      message,
      { retryAttempts: retryAttempts - 1 }
    )

    return {
      deliveredCount: results.filter((result) => result.ok).length + retryDelivery.deliveredCount,
      removedSubscriptions: invalidSubscriptionIds.length + retryDelivery.removedSubscriptions,
      attemptedCount: results.length + retryDelivery.attemptedCount,
      retryableFailures: retryDelivery.retryableFailures,
    }
  }

  return {
    deliveredCount: results.filter((result) => result.ok).length,
    removedSubscriptions: invalidSubscriptionIds.length,
    attemptedCount: results.length,
    retryableFailures: results.filter((result) => result.retryable).length,
  }
}

const getRetryableFailureCount = (delivery: Record<string, unknown>) =>
  Number(delivery.retryableFailures ?? 0)

const deliveryResponse = (delivery: Record<string, unknown>) =>
  json(delivery, getRetryableFailureCount(delivery) > 0 ? 503 : 200)

const sendDmPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  messageId: string,
  origin: 'app' | 'bridge',
  bridgeDeviceId?: string
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
        reply_to,
        ${embedPublicProfile('sender', 'users!sender_id')}
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

  const sender = getActor(dmMessage.sender)
  const senderLabel = getActorLabel(sender)
  const preview = getMessagePreview(dmMessage)
  const route = `/?view=dms&conversation=${dmMessage.conversation_id}&message=${dmMessage.id}`
  let delivery: Record<string, unknown>

  const preferences = await getNotificationPreferences(supabase, recipientId)
  const suppressionReason = getDeliverySuppressionReason(preferences)
  const blockedRelationship = (await getBlockedCounterpartIds(supabase, authUserId)).has(recipientId)
  const conversationMuted = await isConversationMuted(
    supabase,
    recipientId,
    dmMessage.conversation_id
  )

  if (blockedRelationship || !preferences?.dm_enabled || suppressionReason || conversationMuted) {
    delivery = {
      skipped: true,
      reason: blockedRelationship
        ? 'Blocked relationship suppresses notification'
        : !preferences?.dm_enabled
        ? 'Recipient disabled direct message notifications'
        : suppressionReason || 'Recipient muted this conversation',
    }
  } else {
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
      delivery = { skipped: true, reason: 'Notification already sent' }
    } else {
      const badgeCount = await getUnreadBadgeCount(supabase, recipientId)
      const subscriptions = await getActiveSubscriptions(supabase, recipientId)
      if (!subscriptions.length) {
        delivery = { skipped: true, reason: 'Recipient has no active push subscriptions' }
      } else {
        const pushMessage: PushMessage = {
          data: JSON.stringify({
            title: senderLabel,
            body: preview,
            tag: `dm:${dmMessage.conversation_id}`,
            badgeCount,
            unreadCount: badgeCount,
            data: {
              url: route,
              route,
              type: 'dm_message',
              conversationId: dmMessage.conversation_id,
              messageId: dmMessage.id,
              senderId: authUserId,
              badgeCount,
              unreadCount: badgeCount,
            },
          }),
          options: {
            ttl: 300,
            urgency: 'high',
          },
        }

        delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, pushMessage)

        if (Number(delivery.deliveredCount ?? 0) > 0) {
          await supabase
            .from('notification_events')
            .update({ sent_at: new Date().toISOString() })
            .eq('id', eventRecord.id)
        }
      }
    }
  }

  if (origin !== 'bridge') {
    return deliveryResponse(delivery)
  }

  const senderPreferences = await getNotificationPreferences(supabase, authUserId)
  const senderSuppressionReason = getDeliverySuppressionReason(senderPreferences)
  const senderConversationMuted = await isConversationMuted(
    supabase,
    authUserId,
    dmMessage.conversation_id
  )

  if (senderSuppressionReason || senderConversationMuted) {
    return deliveryResponse({
      ...delivery,
      bridgeSender: {
        skipped: true,
        reason: senderSuppressionReason || 'Sender muted this conversation',
      },
    })
  }

  const bridgeSenderDedupeKey = `dm:${dmMessage.id}:${authUserId}:bridge-sender`
  const bridgeSenderEvent = await upsertNotificationEvent(supabase, {
    user_id: authUserId,
    type: 'dm_message',
    entity_id: dmMessage.id,
    conversation_id: dmMessage.conversation_id,
    dm_message_id: dmMessage.id,
    payload: {
      title: 'ShadowChat Bridge',
      body: `Sent DM: ${preview}`,
      route,
      sender_id: authUserId,
      origin: 'bridge',
      bridge_device_id: bridgeDeviceId,
    },
  }, bridgeSenderDedupeKey)

  if (bridgeSenderEvent.sent_at) {
    return deliveryResponse({
      ...delivery,
      bridgeSender: { skipped: true, reason: 'Notification already sent' },
    })
  }

  const senderBadgeCount = await getUnreadBadgeCount(supabase, authUserId)
  const senderSubscriptions = await getActiveSubscriptions(supabase, authUserId)
  if (!senderSubscriptions.length) {
    return deliveryResponse({
      ...delivery,
      bridgeSender: { skipped: true, reason: 'Sender has no active push subscriptions' },
    })
  }

  const bridgeSenderPushMessage: PushMessage = {
    data: JSON.stringify({
      title: 'ShadowChat Bridge',
      body: `Sent DM: ${preview}`,
      tag: `bridge-dm:${dmMessage.conversation_id}`,
      badgeCount: senderBadgeCount,
      unreadCount: senderBadgeCount,
      data: {
        url: route,
        route,
        type: 'dm_message',
        conversationId: dmMessage.conversation_id,
        messageId: dmMessage.id,
        senderId: authUserId,
        badgeCount: senderBadgeCount,
        unreadCount: senderBadgeCount,
        origin: 'bridge',
        bridgeDeviceId,
      },
    }),
    options: {
      ttl: 300,
      urgency: 'high',
    },
  }

  const bridgeSenderDelivery = await deliverPushToSubscriptions(
    supabase,
    vapid,
    senderSubscriptions,
    bridgeSenderPushMessage
  )

  if (bridgeSenderDelivery.deliveredCount > 0) {
    await supabase
      .from('notification_events')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', bridgeSenderEvent.id)
  }

  const combinedDelivery = {
    ...delivery,
    bridgeSender: bridgeSenderDelivery,
    retryableFailures:
      getRetryableFailureCount(delivery) + bridgeSenderDelivery.retryableFailures,
  }
  return deliveryResponse(combinedDelivery)
}

const resolveMentionedUserIds = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  content: string | null
) => {
  const usernames = extractMentionUsernames(content)
  if (!usernames.length) return new Set<string>()

  const { data, error } = await supabase
    .from('users')
    .select('id, username')
    .in('username', usernames)

  if (error) throw error
  const normalized = new Set(usernames)
  return new Set((data ?? [])
    .filter(user => user.username && normalized.has(user.username.toLowerCase()))
    .map(user => user.id as string))
}

const resolveReplyAuthorId = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  replyTo: string | null
) => {
  if (!replyTo) return null

  const { data, error } = await supabase
    .from('messages')
    .select('user_id')
    .eq('id', replyTo)
    .maybeSingle()

  if (error) throw error
  return typeof data?.user_id === 'string' ? data.user_id : null
}

const getGroupNotificationCopy = (
  kind: GroupNotificationKind,
  senderLabel: string,
  preview: string
) => {
  if (kind === 'mention') {
    return { title: `${senderLabel} mentioned you`, body: preview }
  }
  if (kind === 'reply') {
    return { title: `${senderLabel} replied to you`, body: preview }
  }
  return { title: `${senderLabel} in General Chat`, body: preview }
}

const getCurrentReaction = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  actorId: string,
  messageId: string,
  emoji: string,
  isDm: boolean
) => {
  let query = supabase
    .from('message_reactions')
    .select('id, user_id, emoji, message_id, dm_message_id')
    .eq('user_id', actorId)
    .eq('emoji', emoji)

  query = isDm
    ? query.eq('dm_message_id', messageId)
    : query.eq('message_id', messageId)

  const { data, error } = await query.maybeSingle()
  if (error) throw error
  return data as ReactionRecord | null
}

const sendReactionPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  reaction: ReactionRecord,
  isDm: boolean
) => {
  const targetMessageId = isDm ? reaction.dm_message_id : reaction.message_id
  if (!targetMessageId) {
    return json({ skipped: true, reason: 'Reaction target is unavailable' })
  }

  const targetQuery = isDm
    ? supabase
        .from('dm_messages')
        .select('id, sender_id, conversation_id, content, message_type')
        .eq('id', targetMessageId)
    : supabase
        .from('messages')
        .select('id, user_id, content, message_type')
        .eq('id', targetMessageId)

  const { data: targetMessage, error: targetError } = await targetQuery.maybeSingle()
  if (targetError) throw targetError
  if (!targetMessage) return json({ skipped: true, reason: 'Reaction target is unavailable' })

  const reactionTarget = targetMessage as unknown as ReactionTargetRecord
  const recipientId = isDm
    ? reactionTarget.sender_id
    : reactionTarget.user_id
  if (!recipientId || recipientId === authUserId) {
    return json({ skipped: true, reason: 'Self reactions do not send notifications' })
  }

  if ((await getBlockedCounterpartIds(supabase, authUserId)).has(recipientId)) {
    return json({ skipped: true, reason: 'Blocked relationship suppresses notification' })
  }

  const preferences = await getNotificationPreferences(supabase, recipientId)
  const suppressionReason = getDeliverySuppressionReason(preferences, { generalChat: !isDm })
  const conversationId = isDm
    ? reactionTarget.conversation_id || null
    : null
  const conversationMuted = conversationId
    ? await isConversationMuted(supabase, recipientId, conversationId)
    : false

  if (!preferences?.reaction_enabled || suppressionReason || conversationMuted) {
    return json({
      skipped: true,
      reason: !preferences?.reaction_enabled
        ? 'Recipient disabled reaction notifications'
        : suppressionReason || 'Recipient muted this conversation',
    })
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('username, display_name')
    .eq('id', authUserId)
    .maybeSingle()
  if (actorError) throw actorError

  const actorLabel = getActorLabel(actor)
  const preview = getMessagePreview(reactionTarget)
  const title = `${actorLabel} reacted ${reaction.emoji}`
  const body = `To your ${isDm ? 'direct ' : ''}message: ${preview}`
  const route = isDm
    ? `/?view=dms&conversation=${conversationId}&message=${targetMessageId}`
    : `/?view=chat&message=${targetMessageId}`
  const dedupeKey = `reaction:${reaction.id}:${recipientId}`

  const eventRecord = await upsertNotificationEvent(supabase, {
    user_id: recipientId,
    type: 'reaction',
    entity_id: reaction.id,
    conversation_id: conversationId,
    message_id: isDm ? null : targetMessageId,
    dm_message_id: isDm ? targetMessageId : null,
    payload: {
      title,
      body,
      route,
      sender_id: authUserId,
      emoji: reaction.emoji,
      is_dm: isDm,
    },
  }, dedupeKey)

  if (eventRecord.sent_at) {
    return json({ skipped: true, reason: 'Notification already sent' })
  }

  const badgeCount = await getUnreadBadgeCount(supabase, recipientId)
  const subscriptions = await getActiveSubscriptions(supabase, recipientId)
  if (!subscriptions.length) {
    return json({ skipped: true, reason: 'Recipient has no active push subscriptions' })
  }

  const pushMessage: PushMessage = {
    data: JSON.stringify({
      title,
      body,
      tag: `reaction:${isDm ? 'dm' : 'group'}:${targetMessageId}`,
      badgeCount,
      unreadCount: badgeCount,
      data: {
        url: route,
        route,
        type: 'reaction',
        messageId: targetMessageId,
        conversationId,
        senderId: authUserId,
        emoji: reaction.emoji,
        isDm,
        badgeCount,
        unreadCount: badgeCount,
      },
    }),
    options: {
      ttl: 300,
      urgency: 'normal',
    },
  }

  const delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, pushMessage)
  if (delivery.deliveredCount > 0) {
    await supabase
      .from('notification_events')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', eventRecord.id)
  }

  return deliveryResponse(delivery)
}

const sendGroupPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  messageId: string,
  origin: 'app' | 'bridge',
  bridgeDeviceId?: string
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
        reply_to,
        ${embedPublicProfile('user', 'users!user_id')}
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
    .select(NOTIFICATION_PREFERENCE_SELECT)
    .neq('user_id', authUserId)

  if (prefsError) {
    throw prefsError
  }

  const [mentionedUserIds, replyAuthorId, blockedUserIds] = await Promise.all([
    resolveMentionedUserIds(supabase, groupMessage.content),
    resolveReplyAuthorId(supabase, groupMessage.reply_to),
    getBlockedCounterpartIds(supabase, authUserId),
  ])

  const eligibleRecipients = ((recipientPreferences ?? []) as unknown as NotificationPrefs[])
    .map(preferences => ({
      preferences,
      kind: selectGroupNotificationKind({
        isMentioned: mentionedUserIds.has(preferences.user_id),
        isReplyTarget: replyAuthorId === preferences.user_id,
        mentionEnabled: Boolean(preferences.mention_enabled),
        replyEnabled: Boolean(preferences.reply_enabled),
        groupEnabled: Boolean(preferences.group_enabled),
      }),
    }))
    .filter((recipient): recipient is { preferences: NotificationPrefs; kind: GroupNotificationKind } => (
      recipient.kind !== null &&
      !blockedUserIds.has(recipient.preferences.user_id) &&
      !getDeliverySuppressionReason(recipient.preferences, { generalChat: true })
    ))

  if (origin === 'bridge') {
    const senderPreferences = await getNotificationPreferences(supabase, authUserId)
    if (senderPreferences && !getDeliverySuppressionReason(senderPreferences, { generalChat: true })) {
      eligibleRecipients.push({
        preferences: senderPreferences,
        kind: 'group_message',
      })
    }
  }

  if (!eligibleRecipients.length) {
    return json({ skipped: true, reason: 'No recipients are eligible for this General Chat notification' })
  }

  const sender = getActor(groupMessage.user)
  const senderLabel = getActorLabel(sender)
  const preview = getMessagePreview(groupMessage)
  const { data: threadMapping } = await supabase
    .from('general_chat_thread_replies')
    .select('thread_id')
    .eq('message_id', groupMessage.id)
    .maybeSingle()
  const threadId = threadMapping?.thread_id ? String(threadMapping.thread_id) : null
  const route = threadId
    ? `/?view=chat&thread=${threadId}&message=${groupMessage.id}`
    : `/?view=chat&message=${groupMessage.id}`

  const perRecipientResults = await Promise.all(
    eligibleRecipients.map(async ({ preferences: prefs, kind }) => {
      const isBridgeSenderRecipient = origin === 'bridge' && prefs.user_id === authUserId
      const dedupeKey = `group:${groupMessage.id}:${prefs.user_id}`
      const copy = getGroupNotificationCopy(kind, senderLabel, preview)
      const title = isBridgeSenderRecipient ? 'ShadowChat Bridge' : copy.title
      const body = isBridgeSenderRecipient ? `Sent to General Chat: ${preview}` : copy.body
      const eventRecord = await upsertNotificationEvent(
        supabase,
        {
          user_id: prefs.user_id,
          type: kind,
          entity_id: groupMessage.id,
          message_id: groupMessage.id,
          payload: {
            title,
            body,
            route,
            sender_id: authUserId,
            notification_kind: kind,
            thread_id: threadId,
            origin: isBridgeSenderRecipient ? 'bridge' : undefined,
            bridge_device_id: isBridgeSenderRecipient ? bridgeDeviceId : undefined,
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
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const badgeCount = await getUnreadBadgeCount(supabase, prefs.user_id)
      const subscriptions = await getActiveSubscriptions(supabase, prefs.user_id)
      if (!subscriptions.length) {
        return {
          userId: prefs.user_id,
          skipped: true,
          reason: 'No active push subscriptions',
          delivered: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const pushMessage: PushMessage = {
        data: JSON.stringify({
          title,
          body,
          tag: isBridgeSenderRecipient ? `bridge-group:${groupMessage.id}` : `group:${groupMessage.id}`,
          badgeCount,
          unreadCount: badgeCount,
          data: {
            url: route,
            route,
            type: kind,
            messageId: groupMessage.id,
            senderId: authUserId,
            notificationKind: kind,
            threadId,
            origin: isBridgeSenderRecipient ? 'bridge' : undefined,
            bridgeDeviceId: isBridgeSenderRecipient ? bridgeDeviceId : undefined,
            badgeCount,
            unreadCount: badgeCount,
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

  const getDeliveredCount = (result: Record<string, unknown>) =>
    Number(result.deliveredCount ?? result.delivered ?? 0)

  const deliveredRecipients = perRecipientResults.filter((result) => getDeliveredCount(result) > 0).length
  const deliveredSubscriptions = perRecipientResults.reduce(
    (sum, result) => sum + getDeliveredCount(result),
    0
  )
  const removedSubscriptions = perRecipientResults.reduce(
    (sum, result) => sum + Number(result.removedSubscriptions ?? 0),
    0
  )
  const retryableFailures = perRecipientResults.reduce(
    (sum, result) => sum + Number(result.retryableFailures ?? 0),
    0
  )

  return json({
    deliveredRecipients,
    deliveredSubscriptions,
    removedSubscriptions,
    retryableFailures,
  }, retryableFailures > 0 ? 503 : 200)
}

const sendShadowPinPostPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  imageId: string
) => {
  const { data, error } = await supabase
    .from('shadow_pin_images')
    .select(`
      id,
      category_id,
      creator_id,
      title,
      image_url,
      thumbnail_url,
      medium_url,
      deleted_at,
      ${embedPublicProfile('creator', 'users!creator_id')}
    `)
    .eq('id', imageId)
    .maybeSingle()

  if (error) throw error
  if (!data) return json({ error: 'ShadowPin post not found' }, 404)

  const image = data as unknown as ShadowPinPostRecord
  if (image.deleted_at) return json({ error: 'ShadowPin post not found' }, 404)
  if (image.creator_id !== authUserId) {
    return unauthorized('You can only send notifications for your own ShadowPin posts')
  }

  const { data: recipientPreferences, error: preferencesError } = await supabase
    .from('notification_preferences')
    .select(NOTIFICATION_PREFERENCE_SELECT)
    .neq('user_id', authUserId)
  if (preferencesError) throw preferencesError

  const blockedUserIds = await getBlockedCounterpartIds(supabase, authUserId)
  const recipients = ((recipientPreferences ?? []) as unknown as NotificationPrefs[])
    .filter(preferences => (
      preferences.shadow_pin_new_post_enabled !== false &&
      !blockedUserIds.has(preferences.user_id) &&
      !getDeliverySuppressionReason(preferences)
    ))

  if (!recipients.length) {
    return json({ skipped: true, reason: 'No recipients are eligible for this ShadowPin notification' })
  }

  const creatorLabel = getActorLabel(getActor(image.creator))
  const title = 'New ShadowPin'
  const body = `${creatorLabel} posted ${truncate(image.title, 80)}`
  const route = '/?view=pins'
  const thumbnailUrl = image.thumbnail_url || image.medium_url || image.image_url

  const results = await Promise.all(recipients.map(async preferences => {
    const eventRecord = await upsertNotificationEvent(
      supabase,
      {
        user_id: preferences.user_id,
        type: 'shadow_pin_post',
        entity_id: image.id,
        payload: {
          image_id: image.id,
          category_id: image.category_id,
          image_title: image.title,
          thumbnail_url: thumbnailUrl,
          actor: image.creator,
          title,
          body,
          url: route,
        },
      },
      `shadow_pin_post:${image.id}:${preferences.user_id}`
    )

    if (eventRecord.sent_at) {
      return {
        userId: preferences.user_id,
        skipped: true,
        reason: 'Notification already sent',
        deliveredCount: 0,
        removedSubscriptions: 0,
        attemptedCount: 0,
        retryableFailures: 0,
      }
    }

    const badgeCount = await getUnreadBadgeCount(supabase, preferences.user_id)
    const subscriptions = await getActiveSubscriptions(supabase, preferences.user_id)
    if (!subscriptions.length) {
      return {
        userId: preferences.user_id,
        skipped: true,
        reason: 'No active push subscriptions',
        deliveredCount: 0,
        removedSubscriptions: 0,
        attemptedCount: 0,
        retryableFailures: 0,
      }
    }

    const pushMessage: PushMessage = {
      data: JSON.stringify({
        title,
        body,
        icon: thumbnailUrl || undefined,
        image: thumbnailUrl || undefined,
        tag: `shadow-pin-post:${image.id}`,
        badgeCount,
        unreadCount: badgeCount,
        data: {
          url: route,
          route,
          type: 'shadow_pin_post',
          imageId: image.id,
          categoryId: image.category_id,
          senderId: authUserId,
          badgeCount,
          unreadCount: badgeCount,
        },
      }),
      options: {
        ttl: 1800,
        urgency: 'normal',
      },
    }

    const delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, pushMessage)
    if (delivery.deliveredCount > 0) {
      await supabase
        .from('notification_events')
        .update({ sent_at: new Date().toISOString() })
        .eq('id', eventRecord.id)
    }

    return { userId: preferences.user_id, skipped: false, ...delivery }
  }))

  const retryableFailures = results.reduce(
    (sum, result) => sum + Number(result.retryableFailures ?? 0),
    0
  )
  return json({
    deliveredRecipients: results.filter(result => result.deliveredCount > 0).length,
    deliveredSubscriptions: results.reduce((sum, result) => sum + result.deliveredCount, 0),
    removedSubscriptions: results.reduce((sum, result) => sum + result.removedSubscriptions, 0),
    retryableFailures,
  }, retryableFailures > 0 ? 503 : 200)
}

const sendShadowPinCommentPush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  commentId: string
) => {
  const { data, error } = await supabase
    .from('shadow_pin_comments')
    .select(`
      id,
      image_id,
      author_id,
      parent_comment_id,
      body,
      ${embedPublicProfile('author', 'users!author_id')}
    `)
    .eq('id', commentId)
    .maybeSingle()
  if (error) throw error
  if (!data) return json({ error: 'ShadowPin comment not found' }, 404)

  const comment = data as unknown as ShadowPinCommentPushRecord
  if (comment.author_id !== authUserId) {
    return unauthorized('You can only send notifications for your own ShadowPin comments')
  }

  const { data: image, error: imageError } = await supabase
    .from('shadow_pin_images')
    .select('id, creator_id, title, deleted_at')
    .eq('id', comment.image_id)
    .maybeSingle()
  if (imageError) throw imageError
  if (!image || image.deleted_at) return json({ error: 'ShadowPin post not found' }, 404)

  let recipientId = image.creator_id as string | null
  let notificationType: 'shadow_pin_comment' | 'shadow_pin_reply' = 'shadow_pin_comment'
  if (comment.parent_comment_id) {
    const { data: parentComment, error: parentError } = await supabase
      .from('shadow_pin_comments')
      .select('author_id')
      .eq('id', comment.parent_comment_id)
      .maybeSingle()
    if (parentError) throw parentError
    recipientId = parentComment?.author_id ?? null
    notificationType = 'shadow_pin_reply'
  }

  if (!recipientId || recipientId === authUserId) {
    return json({ skipped: true, reason: 'Self comments do not send notifications' })
  }
  if ((await getBlockedCounterpartIds(supabase, authUserId)).has(recipientId)) {
    return json({ skipped: true, reason: 'Blocked relationship suppresses notification' })
  }

  const preferences = await getNotificationPreferences(supabase, recipientId)
  const preferenceEnabled = notificationType === 'shadow_pin_reply'
    ? preferences?.shadow_pin_reply_enabled
    : preferences?.shadow_pin_comment_enabled
  const suppressionReason = getDeliverySuppressionReason(preferences)
  if (preferenceEnabled === false || suppressionReason) {
    return json({
      skipped: true,
      reason: preferenceEnabled === false ? 'Recipient disabled ShadowPin notifications' : suppressionReason,
    })
  }

  const actorLabel = getActorLabel(getActor(comment.author))
  const title = notificationType === 'shadow_pin_reply'
    ? `${actorLabel} replied to you`
    : `${actorLabel} commented on your ShadowPin`
  const body = truncate(comment.body.trim() || `Open ${image.title}`, 120)
  const route = '/?view=pins'
  const eventRecord = await upsertNotificationEvent(
    supabase,
    {
      user_id: recipientId,
      type: notificationType,
      entity_id: comment.id,
      payload: {
        image_id: comment.image_id,
        comment_id: comment.id,
        parent_comment_id: comment.parent_comment_id,
        image_title: image.title,
        body_preview: body,
        actor: comment.author,
        title,
        body,
        url: route,
      },
    },
    `${notificationType}:${comment.id}:${recipientId}`
  )
  if (eventRecord.sent_at) {
    return json({ skipped: true, reason: 'Notification already sent' })
  }

  const badgeCount = await getUnreadBadgeCount(supabase, recipientId)
  const subscriptions = await getActiveSubscriptions(supabase, recipientId)
  if (!subscriptions.length) {
    return json({ skipped: true, reason: 'No active push subscriptions' })
  }

  const delivery = await deliverPushToSubscriptions(supabase, vapid, subscriptions, {
    data: JSON.stringify({
      title,
      body,
      tag: `${notificationType}:${comment.id}`,
      badgeCount,
      unreadCount: badgeCount,
      data: {
        url: route,
        route,
        type: notificationType,
        imageId: comment.image_id,
        commentId: comment.id,
        senderId: authUserId,
        badgeCount,
        unreadCount: badgeCount,
      },
    }),
    options: { ttl: 900, urgency: 'normal' },
  })
  if (delivery.deliveredCount > 0) {
    await supabase
      .from('notification_events')
      .update({ sent_at: new Date().toISOString() })
      .eq('id', eventRecord.id)
  }

  return deliveryResponse(delivery)
}

const getTextValue = (value: unknown) => (
  typeof value === 'string' && value.trim() ? value.trim() : ''
)

const sendHypePush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  eventId: string
) => {
  const { data: event, error: eventError } = await supabase
    .from('hype_events')
    .select('id, actor_id, event_type, message_id, message_author_id, metadata, created_at')
    .eq('id', eventId)
    .single()

  if (eventError || !event) {
    return json({ error: 'Hype event not found' }, 404)
  }

  const hypeEvent = event as HypeEventRecord
  if (hypeEvent.actor_id !== authUserId) {
    return unauthorized('You can only send notifications for your own Hype events')
  }

  const metadata = hypeEvent.metadata ?? {}
  const actorName = getTextValue(metadata.actor_display_name) || 'Someone'
  const authorName = getTextValue(metadata.message_author_display_name) || 'a message'
  const title = hypeEvent.event_type === 'message'
    ? `${actorName} Hyped ${authorName}`
    : `${actorName} rang Hype`
  const body = hypeEvent.event_type === 'message'
    ? 'A message is getting celebrated in ShadowChat.'
    : 'Hype is building in ShadowChat.'
  const route = hypeEvent.message_id
    ? `/?view=chat&message=${hypeEvent.message_id}`
    : '/?view=chat'

  const { data: recipientPreferences, error: prefsError } = await supabase
    .from('notification_preferences')
    .select(NOTIFICATION_PREFERENCE_SELECT)
    .eq('hype_enabled', true)
    .neq('user_id', authUserId)

  if (prefsError) {
    throw prefsError
  }

  const [blockedUserIds, blockedMessageAuthorIds] = await Promise.all([
    getBlockedCounterpartIds(supabase, authUserId),
    hypeEvent.message_author_id
      ? getBlockedCounterpartIds(supabase, hypeEvent.message_author_id)
      : Promise.resolve(new Set<string>()),
  ])
  const eligibleRecipients = ((recipientPreferences ?? []) as unknown as NotificationPrefs[]).filter(
    (prefs) => (
      !blockedUserIds.has(prefs.user_id) &&
      !blockedMessageAuthorIds.has(prefs.user_id) &&
      !getDeliverySuppressionReason(prefs, { generalChat: true })
    )
  )

  if (!eligibleRecipients.length) {
    return json({ skipped: true, reason: 'No recipients have Hype push enabled' })
  }

  const eventTime = new Date(hypeEvent.created_at).getTime()
  const stackBucket = Number.isFinite(eventTime)
    ? Math.floor(eventTime / 60000)
    : Math.floor(Date.now() / 60000)

  const perRecipientResults = await Promise.all(
    eligibleRecipients.map(async (prefs) => {
      const dedupeKey = `hype:${stackBucket}:${prefs.user_id}`
      const eventRecord = await upsertNotificationEvent(
        supabase,
        {
          user_id: prefs.user_id,
          type: 'hype_event',
          entity_id: hypeEvent.id,
          payload: {
            title,
            body,
            route,
            sender_id: authUserId,
            event_id: hypeEvent.id,
            event_type: hypeEvent.event_type,
            stack_bucket: stackBucket,
          },
        },
        dedupeKey
      )

      if (eventRecord.sent_at) {
        return {
          userId: prefs.user_id,
          skipped: true,
          reason: 'Collapsed into recent Hype notification',
          delivered: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const badgeCount = await getUnreadBadgeCount(supabase, prefs.user_id)
      const subscriptions = await getActiveSubscriptions(supabase, prefs.user_id)
      if (!subscriptions.length) {
        return {
          userId: prefs.user_id,
          skipped: true,
          reason: 'No active push subscriptions',
          delivered: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const pushMessage: PushMessage = {
        data: JSON.stringify({
          title,
          body,
          tag: `hype:${stackBucket}`,
          badgeCount,
          unreadCount: badgeCount,
          data: {
            url: route,
            route,
            type: 'hype_event',
            eventId: hypeEvent.id,
            eventType: hypeEvent.event_type,
            messageId: hypeEvent.message_id,
            senderId: authUserId,
            stackBucket,
            badgeCount,
            unreadCount: badgeCount,
          },
        }),
        options: {
          ttl: 300,
          urgency: 'normal',
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

  const getDeliveredCount = (result: Record<string, unknown>) =>
    Number(result.deliveredCount ?? result.delivered ?? 0)

  const retryableFailures = perRecipientResults.reduce(
    (sum, result) => sum + Number(result.retryableFailures ?? 0),
    0
  )
  return json({
    deliveredRecipients: perRecipientResults.filter((result) => getDeliveredCount(result) > 0).length,
    deliveredSubscriptions: perRecipientResults.reduce(
      (sum, result) => sum + getDeliveredCount(result),
      0
    ),
    removedSubscriptions: perRecipientResults.reduce(
      (sum, result) => sum + Number(result.removedSubscriptions ?? 0),
      0
    ),
    retryableFailures,
  }, retryableFailures > 0 ? 503 : 200)
}

const hasActiveForegroundLease = (
  subscription: Pick<StoredSubscription, 'foreground_until'>,
  now = Date.now()
) => {
  if (!subscription.foreground_until) return false
  const foregroundUntil = new Date(subscription.foreground_until).getTime()
  return Number.isFinite(foregroundUntil) && foregroundUntil > now
}

const sendPresenceActivePush = async (
  supabase: ReturnType<typeof getSupabaseAdmin>,
  vapid: VapidKeys,
  authUserId: string,
  activationId: string
) => {
  const { data: activationData, error: activationError } = await supabase
    .from('presence_activation_events')
    .select('id, actor_id, expires_at, dispatched_at')
    .eq('id', activationId)
    .maybeSingle()

  if (activationError) throw activationError
  if (!activationData) return json({ error: 'Presence activation was not found' }, 404)

  const activation = activationData as PresenceActivationRecord
  if (activation.actor_id !== authUserId) {
    return unauthorized('You can only send notifications for your own presence activation')
  }
  if (activation.dispatched_at) {
    return json({ skipped: true, reason: 'Presence activation was already dispatched' })
  }
  if (new Date(activation.expires_at).getTime() <= Date.now()) {
    return json({ skipped: true, reason: 'Presence activation expired' })
  }

  const { data: actor, error: actorError } = await supabase
    .from('users')
    .select('id, username, display_name, presence_visibility')
    .eq('id', authUserId)
    .maybeSingle()
  if (actorError) throw actorError
  if (!actor) return json({ error: 'Presence actor was not found' }, 404)

  const { data: claimData, error: claimError } = await supabase.rpc(
    'claim_presence_activation_recipients',
    {
      target_activation_id: activationId,
      target_actor_id: authUserId,
    }
  )
  if (claimError) throw claimError

  const claims = (claimData ?? []) as PresenceRecipientClaim[]
  const actorLabel = getActorLabel(actor)
  const title = `${actorLabel} is active now`
  const body = 'Open Active Users to connect and say hello.'
  const route = '/?view=active-users'

  let dispatchResponse: Response | undefined
  let dispatchError: unknown
  try {
    const results = await Promise.all(claims.map(async claim => {
      if (!claim.push_enabled) {
        return {
          userId: claim.recipient_id,
          skipped: true,
          reason: 'Recipient enabled in-app presence notifications only',
          deliveredCount: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const preferences = await getNotificationPreferences(supabase, claim.recipient_id)
      const suppressionReason = getDeliverySuppressionReason(preferences)
      if (!preferences?.presence_push_enabled || suppressionReason) {
        return {
          userId: claim.recipient_id,
          skipped: true,
          reason: !preferences?.presence_push_enabled
            ? 'Recipient disabled presence push notifications'
            : suppressionReason,
          deliveredCount: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const subscriptions = (await getActiveSubscriptions(supabase, claim.recipient_id))
        .filter(subscription => !hasActiveForegroundLease(subscription))
      if (!subscriptions.length) {
        return {
          userId: claim.recipient_id,
          skipped: true,
          reason: 'Recipient has no background push subscriptions',
          deliveredCount: 0,
          removedSubscriptions: 0,
          attemptedCount: 0,
          retryableFailures: 0,
        }
      }

      const delivery = await deliverPushToSubscriptions(
        supabase,
        vapid,
        subscriptions,
        {
          data: JSON.stringify({
            title,
            body,
            tag: `presence-active:${authUserId}`,
            data: {
              url: route,
              route,
              type: 'presence_active',
              activationId,
              actorId: authUserId,
            },
          }),
          options: { ttl: 300, urgency: 'normal' },
        },
        { retryAttempts: 1 }
      )

      if (delivery.deliveredCount > 0) {
        await supabase
          .from('notification_events')
          .update({ sent_at: new Date().toISOString() })
          .eq('id', claim.event_id)
      }

      return { userId: claim.recipient_id, skipped: false, ...delivery }
    }))

    dispatchResponse = json({
      claimedRecipients: claims.length,
      deliveredRecipients: results.filter(result => result.deliveredCount > 0).length,
      deliveredSubscriptions: results.reduce(
        (sum, result) => sum + Number(result.deliveredCount ?? 0),
        0
      ),
      removedSubscriptions: results.reduce(
        (sum, result) => sum + Number(result.removedSubscriptions ?? 0),
        0
      ),
      retryableFailures: results.reduce(
        (sum, result) => sum + Number(result.retryableFailures ?? 0),
        0
      ),
    })
  } catch (error) {
    dispatchError = error
  }

  const { error: finishError } = await supabase.rpc('finish_presence_activation_dispatch', {
    target_activation_id: activationId,
    target_actor_id: authUserId,
  })
  if (finishError) throw finishError
  if (dispatchError) throw dispatchError
  if (!dispatchResponse) throw new Error('Presence dispatch did not produce a response')
  return dispatchResponse
}

serve(async (req): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  let claimContext: {
    supabase: ReturnType<typeof getSupabaseAdmin>
    userId: string
    key: string
    token: string
  } | null = null

  try {
    const body = await req.json() as SendPushRequestBody
    const auth = await authenticateRequest(req, body)
    if ('error' in auth) {
      return ensureResponse(auth.error)
    }

    const type = body?.type as PushEventType | undefined
    const messageId = typeof body?.messageId === 'string' ? body.messageId : ''
    const eventId = typeof body?.eventId === 'string' ? body.eventId : ''
    const activationId = typeof body?.activationId === 'string' ? body.activationId : ''
    const emoji = typeof body?.emoji === 'string' ? body.emoji.trim() : ''
    const origin = getPushOrigin(body)
    const bridgeDeviceId = typeof body?.bridgeDeviceId === 'string' ? body.bridgeDeviceId : undefined

    if (
      (type !== 'hype_event' && type !== 'presence_active' && !messageId) ||
      (type === 'hype_event' && !eventId) ||
      (type === 'presence_active' && !activationId) ||
      (type === 'reaction' && (!emoji || emoji.length > 32 || typeof body?.isDm !== 'boolean')) ||
      (
        type !== 'dm_message' &&
        type !== 'group_message' &&
        type !== 'hype_event' &&
        type !== 'reaction' &&
        type !== 'shadow_pin_post' &&
        type !== 'shadow_pin_comment' &&
        type !== 'presence_active'
      )
    ) {
      return json({ error: 'Unsupported notification payload' }, 400)
    }

    const supabase = getSupabaseAdmin()
    const reaction = type === 'reaction'
      ? await getCurrentReaction(supabase, auth.userId, messageId, emoji, body.isDm === true)
      : null
    if (type === 'reaction' && !reaction) {
      return json({ skipped: true, reason: 'Reaction is no longer active' })
    }

    const entityId = type === 'hype_event'
      ? eventId
      : type === 'presence_active'
      ? activationId
      : reaction?.id || messageId
    const requestKey = `${type}:${entityId}`
    const claim = await claimEdgeRequest(supabase, {
      userId: auth.userId,
      scope: PUSH_CLAIM_SCOPE,
      key: requestKey,
      leaseSeconds: 300,
      retentionSeconds: 7 * 24 * 60 * 60,
    })

    if (!claim.acquired) {
      if (claim.status === 'completed') return replayClaimResponse(claim)
      const completedClaim = await waitForEdgeRequestClaim(supabase, {
        userId: auth.userId,
        scope: PUSH_CLAIM_SCOPE,
        key: requestKey,
        timeoutMs: 20_000,
        pollMs: 200,
      })
      if (completedClaim?.status === 'completed') {
        return replayClaimResponse(completedClaim)
      }
      return new Response(JSON.stringify({
        error: 'This notification delivery is already processing. Retry shortly.',
      }), {
        status: 409,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': '2',
        },
      })
    }

    if (!claim.claim_token) {
      throw new Error('Push delivery claim did not return an owner token')
    }
    claimContext = {
      supabase,
      userId: auth.userId,
      key: requestKey,
      token: claim.claim_token,
    }

    await consumeEdgeRateLimit(supabase, {
      userId: auth.userId,
      scope: 'send-push:minute',
      windowSeconds: 60,
      limit: resolvePushRequestsPerMinute(),
      message: 'Too many notification requests. Please wait a moment and try again.',
    })

    const vapid = getVapidKeys()
    let response: Response

    if (type === 'dm_message') {
      response = ensureResponse(await sendDmPush(supabase, vapid, auth.userId, messageId, origin, bridgeDeviceId))
    } else if (type === 'hype_event') {
      response = ensureResponse(await sendHypePush(supabase, vapid, auth.userId, eventId))
    } else if (type === 'reaction' && reaction) {
      response = ensureResponse(await sendReactionPush(supabase, vapid, auth.userId, reaction, body.isDm === true))
    } else if (type === 'shadow_pin_post') {
      response = ensureResponse(await sendShadowPinPostPush(supabase, vapid, auth.userId, messageId))
    } else if (type === 'shadow_pin_comment') {
      response = ensureResponse(await sendShadowPinCommentPush(supabase, vapid, auth.userId, messageId))
    } else if (type === 'presence_active') {
      response = ensureResponse(await sendPresenceActivePush(supabase, vapid, auth.userId, activationId))
    } else {
      response = ensureResponse(await sendGroupPush(supabase, vapid, auth.userId, messageId, origin, bridgeDeviceId))
    }

    if (response.status >= 500) {
      await failEdgeRequestClaim(supabase, {
        userId: auth.userId,
        scope: PUSH_CLAIM_SCOPE,
        key: requestKey,
        claimToken: claim.claim_token,
        errorMessage: 'Push provider delivery can be retried',
      })
      claimContext = null
      return response
    }

    await completeEdgeRequestClaim(supabase, {
      userId: auth.userId,
      scope: PUSH_CLAIM_SCOPE,
      key: requestKey,
      claimToken: claim.claim_token,
      responseStatus: response.status,
      responseBody: await responseBodyForClaim(response),
    })
    claimContext = null
    return response
  } catch (error) {
    if (claimContext) {
      await failEdgeRequestClaim(claimContext.supabase, {
        userId: claimContext.userId,
        scope: PUSH_CLAIM_SCOPE,
        key: claimContext.key,
        claimToken: claimContext.token,
        errorMessage: error instanceof Error ? error.message : 'Push request failed',
      }).catch(() => undefined)
    }
    if (error instanceof EdgeRateLimitError) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 429,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
          'Retry-After': String(error.retryAfterSeconds),
        },
      })
    }
    const message = error instanceof Error ? error.message : 'Unknown error'
    return json({ error: message }, 500)
  }
})
