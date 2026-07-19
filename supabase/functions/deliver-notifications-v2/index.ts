import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4'
import {
  buildNotificationDeliveryEnvelopeV2,
  type NotificationActorV2,
  type NotificationEnvelopeV2Row,
  type NotificationMediaV2,
  type NotificationPreviewMode,
} from '../_shared/notification-envelope-v2.ts'
import { getNotificationSuppressionReason } from '../_shared/notification-delivery.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

type OutboxClaim = {
  outbox_id: string
  lease_token: string
  event_id: string
  user_id: string
  expires_at: string
}

type NativeTokenRow = {
  id: string
  installation_id: string
  provider: 'expo' | 'apns' | 'fcm'
  token: string
  environment: string
}

type InstallationRow = {
  id: string
  platform: 'ios' | 'android' | 'web'
  environment: string
  foreground_until: string | null
  channel_schema_version: number
}

type ExpoTicket = {
  status: 'ok' | 'error'
  id?: string
  message?: string
  details?: { error?: string }
}

type DeliveryTargetStatus =
  | 'pending'
  | 'accepted'
  | 'delivered'
  | 'cancelled'
  | 'failed'
  | 'invalid'

type DeliveryTargetRow = {
  id: string
  installation_id: string
  status: DeliveryTargetStatus
  attempt_count: number
}

type ExpoTicketDecision = {
  status: Extract<DeliveryTargetStatus, 'pending' | 'accepted' | 'failed' | 'invalid'>
  retryable: boolean
  invalid: boolean
  providerMessageId: string | null
  error: string | null
}

type ExpoTransport = {
  send: (messages: Record<string, unknown>[], signal: AbortSignal) => Promise<Response>
  getReceipts: (ids: string[]) => Promise<Response>
}

const notificationEnvironments = new Set(['development', 'preview', 'production'])
const permanentlyRejectedExpoErrors = new Set([
  'DeviceNotRegistered',
  'InvalidCredentials',
  'MessageTooBig',
  'MismatchSenderId',
])

export const getNotificationDeliveryEnvironment = (
  configured = Deno.env.get('NOTIFICATION_DELIVERY_ENVIRONMENT') ||
    Deno.env.get('APP_ENVIRONMENT') ||
    'production',
) => {
  const environment = configured.trim().toLowerCase()
  if (!notificationEnvironments.has(environment)) {
    throw new Error('Invalid notification delivery environment')
  }
  return environment
}

export const classifyExpoTicket = (
  ticket: ExpoTicket | undefined,
): ExpoTicketDecision => {
  if (ticket?.status === 'ok' && ticket.id) {
    return {
      status: 'accepted',
      retryable: false,
      invalid: false,
      providerMessageId: ticket.id,
      error: null,
    }
  }

  const errorCode = ticket?.details?.error
  const invalid = errorCode === 'DeviceNotRegistered'
  const permanentlyRejected = Boolean(errorCode && permanentlyRejectedExpoErrors.has(errorCode))
  return {
    status: invalid ? 'invalid' : permanentlyRejected ? 'failed' : 'pending',
    retryable: !permanentlyRejected,
    invalid,
    providerMessageId: null,
    error: ticket?.message?.slice(0, 500) ||
      (ticket ? 'Expo did not accept the notification' : 'Expo did not return a ticket'),
  }
}

export const shouldAttemptExpoTarget = (status: DeliveryTargetStatus) => status === 'pending'

export const decideExpoOutboxCompletion = (
  statuses: DeliveryTargetStatus[],
  canRetry: boolean,
) => {
  const pending = statuses.filter(status => status === 'pending').length
  const failed = statuses.filter(status => status === 'failed' || status === 'cancelled').length
  const accepted = statuses.filter(status => (
    status === 'accepted' || status === 'delivered'
  )).length
  const invalid = statuses.filter(status => status === 'invalid').length

  if (pending > 0 && canRetry) {
    return {
      status: 'pending' as const,
      delivered: false,
      retryable: true,
      error: `${pending} native notification target${pending === 1 ? '' : 's'} await retry`,
    }
  }
  if (pending > 0 || failed > 0) {
    return {
      status: 'failed' as const,
      delivered: false,
      retryable: false,
      error: `${pending + failed} native notification target${pending + failed === 1 ? '' : 's'} failed`,
    }
  }
  if (accepted > 0) {
    return {
      status: 'delivered' as const,
      delivered: true,
      retryable: false,
      error: null,
    }
  }
  return {
    status: 'failed' as const,
    delivered: false,
    retryable: false,
    error: invalid > 0
      ? 'All native notification targets are invalid'
      : 'No native provider accepted the notification',
  }
}

export const createExpoTransport = (
  fetchImpl: typeof fetch = fetch,
  accessToken = Deno.env.get('EXPO_PUSH_ACCESS_TOKEN'),
): ExpoTransport => {
  const headers = {
    'Accept': 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
    ...(accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {}),
  }
  return {
    send: (messages, signal) => fetchImpl('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers,
      body: JSON.stringify(messages),
      signal,
    }),
    getReceipts: ids => fetchImpl('https://exp.host/--/api/v2/push/getReceipts', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ids }),
    }),
  }
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const getAdminClient = () => {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceRole = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceRole) throw new Error('Supabase service credentials are not configured')
  return createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

const requireServiceRole = (request: Request) => {
  const expected = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  const authorization = request.headers.get('authorization') ?? ''
  if (!expected || authorization !== `Bearer ${expected}`) {
    throw new Error('Service role required')
  }
}

const isForeground = (installation: InstallationRow) => {
  if (!installation.foreground_until) return false
  const expires = Date.parse(installation.foreground_until)
  return Number.isFinite(expires) && expires > Date.now()
}

const categoryEnabled = (
  eventType: string,
  preferences: Record<string, unknown>,
) => {
  if (eventType === 'dm_message') return preferences.dm_enabled !== false
  if (eventType === 'group_message') {
    return preferences.group_enabled !== false && preferences.general_chat_muted !== true
  }
  if (eventType === 'mention') return preferences.mention_enabled !== false
  if (eventType === 'reply') return preferences.reply_enabled !== false
  if (eventType === 'reaction') return preferences.reaction_enabled !== false
  if (eventType === 'hype_event') return preferences.hype_enabled !== false
  if (eventType === 'shadow_pin_post') return preferences.shadow_pin_new_post_enabled !== false
  if (eventType === 'shadow_pin_comment') return preferences.shadow_pin_comment_enabled !== false
  if (eventType === 'shadow_pin_reply') return preferences.shadow_pin_reply_enabled !== false
  if (eventType === 'shadow_checkers_turn') return preferences.checkers_turn_enabled !== false
  if (eventType.startsWith('connection_')) {
    return preferences.connection_notifications_enabled !== false
  }
  if (eventType === 'presence_active') return preferences.presence_push_enabled !== false
  if (eventType.startsWith('shado_live_')) return preferences.shado_live_in_app_enabled !== false
  return false
}

const getActor = async (
  supabase: ReturnType<typeof getAdminClient>,
  actorId: string | null,
): Promise<NotificationActorV2> => {
  if (!actorId) return null
  const { data, error } = await supabase
    .from('users')
    .select('id, username, display_name, avatar_thumbnail_url, avatar_url')
    .eq('id', actorId)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  return {
    id: data.id,
    label: data.display_name || data.username || 'ShadowChat member',
    avatarUrl: data.avatar_thumbnail_url || data.avatar_url || null,
  }
}

const getMedia = async (
  supabase: ReturnType<typeof getAdminClient>,
  mediaRef: Record<string, unknown> | null,
): Promise<NotificationMediaV2> => {
  if (mediaRef?.kind !== 'shadow_pin' || typeof mediaRef.image_id !== 'string') return null
  const { data, error } = await supabase
    .from('shadow_pin_images')
    .select('title, thumbnail_url, medium_url, image_url, image_content_type')
    .eq('id', mediaRef.image_id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) throw error
  if (!data) return null
  const thumbnailUrl = data.thumbnail_url || data.medium_url || data.image_url
  if (typeof thumbnailUrl !== 'string' || !thumbnailUrl.startsWith('https://')) return null
  return {
    kind: typeof data.image_content_type === 'string' && data.image_content_type.startsWith('video/')
      ? 'video'
      : 'image',
    thumbnailUrl,
    alt: data.title || 'ShadowPin',
  }
}

const getBadgeCount = async (
  supabase: ReturnType<typeof getAdminClient>,
  userId: string,
) => {
  const { data } = await supabase.rpc('get_app_badge_state_v2', {
    target_user_id: userId,
  })
  const value = data && typeof data === 'object' && !Array.isArray(data)
    ? Number((data as Record<string, unknown>).total)
    : 0
  return Number.isFinite(value) ? Math.max(0, Math.min(99, Math.floor(value))) : 0
}

const toExpoMessage = (
  token: NativeTokenRow,
  installation: InstallationRow,
  envelope: ReturnType<typeof buildNotificationDeliveryEnvelopeV2>,
  eventType: string,
  entityId: string,
  badge: number,
) => {
  const channelId = installation.channel_schema_version >= 2
    ? `shadowchat_sound_${envelope.soundId}_v2`
    : `shadowchat_${envelope.androidChannelKey}`
  const sound = envelope.soundId === 'silent'
    ? null
    : envelope.soundId === 'system_default'
      ? 'default'
      : `${envelope.soundId}.wav`
  const categoryId = envelope.category === 'dm' ||
      envelope.category === 'general_chat' ||
      envelope.category === 'mentions_replies'
    ? 'shadowchat_message'
    : envelope.category === 'shadow_checkers' || envelope.category === 'shadow_war'
      ? 'shadowchat_game_turn'
      : envelope.category === 'shadow_pin' ||
          envelope.category === 'connections' ||
          envelope.category === 'presence' ||
          envelope.category === 'reactions_hype'
        ? 'shadowchat_social'
        : 'shadowchat_open'

  const deliveryEnvelope = {
    ...envelope,
    type: eventType,
    entityId,
  }
  const message: Record<string, unknown> = {
    to: token.token,
    title: envelope.content.title,
    subtitle: envelope.content.eyebrow,
    body: envelope.content.body || undefined,
    data: {
      envelopeV2: deliveryEnvelope,
    },
    sound,
    badge,
    priority: envelope.priority === 'high' || envelope.priority === 'urgent'
      ? 'high'
      : 'default',
    interruptionLevel: envelope.priority === 'urgent'
      ? 'time-sensitive'
      : envelope.priority === 'ambient'
        ? 'passive'
        : 'active',
    ttl: Math.max(1, Math.min(90, Math.floor(
      (Date.parse(envelope.expiresAt) - Date.now()) / 1000,
    ))),
    channelId: installation.platform === 'android' ? channelId : undefined,
    categoryId,
    collapseId: envelope.groupKey.slice(0, 64),
    tag: envelope.groupKey.slice(0, 128),
    mutableContent: Boolean(envelope.media),
    richContent: envelope.media
      ? { image: envelope.media.thumbnailUrl }
      : undefined,
  }

  const payloadBytes = () =>
    new TextEncoder().encode(JSON.stringify(message)).byteLength
  if (payloadBytes() > 3_800) {
    delete message.richContent
    deliveryEnvelope.media = null
    if (deliveryEnvelope.actor) {
      deliveryEnvelope.actor = {
        ...deliveryEnvelope.actor,
        avatarUrl: null,
      }
    }
  }
  if (payloadBytes() > 3_800) {
    message.body = undefined
    deliveryEnvelope.content = {
      ...deliveryEnvelope.content,
      body: null,
    }
  }
  return message
}

const completeOutbox = async (
  supabase: ReturnType<typeof getAdminClient>,
  claim: OutboxClaim,
  status: 'pending' | 'delivered' | 'cancelled' | 'failed',
  error: string | null = null,
  retryAfterSeconds: number | null = null,
) => {
  const {
    data: completed,
    error: completionError,
  } = await supabase.rpc('complete_notification_outbox_v2', {
    target_outbox_id: claim.outbox_id,
    target_lease_token: claim.lease_token,
    target_status: status,
    target_error: error,
    retry_after_seconds: retryAfterSeconds,
  })
  if (completionError) throw completionError
  if (completed !== true) throw new Error('Notification outbox lease is no longer owned')
}

const processClaim = async (
  supabase: ReturnType<typeof getAdminClient>,
  claim: OutboxClaim,
  expoTransport: ExpoTransport,
  deliveryEnvironment: string,
) => {
  const [
    envelopeResult,
    eventResult,
    preferencesResult,
    installationsResult,
    outboxResult,
  ] = await Promise.all([
    supabase
      .from('notification_envelopes_v2')
      .select('*')
      .eq('event_id', claim.event_id)
      .eq('user_id', claim.user_id)
      .maybeSingle(),
    supabase
      .from('notification_events')
      .select('id, type, entity_id, actor_id, read_at, resolved_at')
      .eq('id', claim.event_id)
      .eq('user_id', claim.user_id)
      .maybeSingle(),
    supabase
      .from('notification_preferences')
      .select('*')
      .eq('user_id', claim.user_id)
      .maybeSingle(),
    supabase
      .from('notification_installations')
      .select('id, platform, environment, foreground_until, channel_schema_version')
      .eq('user_id', claim.user_id)
      .eq('environment', deliveryEnvironment)
      .is('revoked_at', null),
    supabase
      .from('notification_outbox_v2')
      .select('attempt_count, max_attempts')
      .eq('id', claim.outbox_id)
      .eq('event_id', claim.event_id)
      .eq('user_id', claim.user_id)
      .maybeSingle(),
  ])
  if (envelopeResult.error) throw envelopeResult.error
  if (eventResult.error) throw eventResult.error
  if (preferencesResult.error) throw preferencesResult.error
  if (installationsResult.error) throw installationsResult.error
  if (outboxResult.error) throw outboxResult.error
  if (!outboxResult.data) throw new Error('Claimed notification outbox row is unavailable')
  if (!envelopeResult.data || !eventResult.data) {
    await completeOutbox(supabase, claim, 'cancelled', 'Envelope or event is unavailable')
    return { delivered: false, cancelled: true }
  }
  const event = eventResult.data
  if (event.read_at || event.resolved_at) {
    await completeOutbox(supabase, claim, 'cancelled', 'Canonical event is no longer unread')
    return { delivered: false, cancelled: true }
  }

  const preferences = (preferencesResult.data ?? {}) as Record<string, unknown>
  const suppression = getNotificationSuppressionReason(preferences)
  if (
    suppression ||
    !categoryEnabled(event.type, preferences)
  ) {
    await completeOutbox(
      supabase,
      claim,
      'cancelled',
      suppression || 'Notification category is disabled',
    )
    return { delivered: false, cancelled: true }
  }

  if (event.actor_id) {
    const { data: blocks, error: blocksError } = await supabase
      .from('user_blocks')
      .select('blocker_id, blocked_id')
      .or(
        `and(blocker_id.eq.${claim.user_id},blocked_id.eq.${event.actor_id}),` +
        `and(blocker_id.eq.${event.actor_id},blocked_id.eq.${claim.user_id})`,
      )
      .limit(1)
    if (blocksError) throw blocksError
    if ((blocks ?? []).length > 0) {
      await completeOutbox(supabase, claim, 'cancelled', 'Blocked relationship')
      return { delivered: false, cancelled: true }
    }
  }

  const installations = (installationsResult.data ?? []) as InstallationRow[]
  const eligibleInstallations = installations.filter(installation => (
    installation.platform !== 'web' && !isForeground(installation)
  ))
  if (eligibleInstallations.length === 0) {
    await completeOutbox(supabase, claim, 'cancelled', 'No background native installation')
    return { delivered: false, cancelled: true }
  }

  const installationIds = eligibleInstallations.map(item => item.id)
  const { data: existingTargetData, error: existingTargetError } = await supabase
    .from('notification_delivery_targets_v2')
    .select('id, installation_id, status, attempt_count')
    .eq('event_id', claim.event_id)
    .eq('transport', 'expo')
    .in('installation_id', installationIds)
  if (existingTargetError) throw existingTargetError

  const { data: tokenData, error: tokenError } = await supabase
    .schema('private')
    .from('notification_native_tokens')
    .select('id, installation_id, provider, token, environment')
    .eq('user_id', claim.user_id)
    .eq('enabled', true)
    .eq('environment', deliveryEnvironment)
    .in('installation_id', installationIds)
  if (tokenError) throw tokenError
  const tokens = ((tokenData ?? []) as NativeTokenRow[])
    .filter(token => (
      token.provider === 'expo' &&
      token.environment === deliveryEnvironment
    ))
  if (tokens.length === 0) {
    const existingStatuses = ((existingTargetData ?? []) as DeliveryTargetRow[])
      .map(target => target.status)
    const existingCompletion = decideExpoOutboxCompletion(existingStatuses, false)
    if (existingCompletion.delivered) {
      await completeOutbox(supabase, claim, 'delivered')
      return { delivered: true, accepted: existingStatuses.length }
    }
    await completeOutbox(
      supabase,
      claim,
      existingStatuses.length > 0 ? 'failed' : 'cancelled',
      existingStatuses.length > 0
        ? existingCompletion.error
        : `No active Expo Push Token for ${deliveryEnvironment}`,
    )
    return existingStatuses.length > 0
      ? { delivered: false, failed: true }
      : { delivered: false, cancelled: true }
  }

  const envelope = envelopeResult.data as NotificationEnvelopeV2Row
  const [actor, media, soundPreference, badge] = await Promise.all([
    getActor(supabase, event.actor_id),
    getMedia(supabase, envelope.media_ref),
    supabase
      .from('notification_category_presentation_preferences')
      .select('sound_id')
      .eq('user_id', claim.user_id)
      .eq('category_key', envelope.category_key)
      .maybeSingle(),
    getBadgeCount(supabase, claim.user_id),
  ])
  if (soundPreference.error) throw soundPreference.error

  const previewMode = (
    preferences.notification_preview_mode === 'sender_only' ||
    preferences.notification_preview_mode === 'private'
  )
    ? preferences.notification_preview_mode as NotificationPreviewMode
    : 'full'
  const deliveryEnvelope = buildNotificationDeliveryEnvelopeV2(envelope, {
    previewMode,
    actor,
    media: preferences.notification_media_enabled === false ? null : media,
    soundId: typeof soundPreference.data?.sound_id === 'string'
      ? soundPreference.data.sound_id
      : null,
  })
  const installationById = new Map(eligibleInstallations.map(item => [item.id, item]))
  const initialTargetByInstallation = new Map(
    ((existingTargetData ?? []) as DeliveryTargetRow[])
      .map(target => [target.installation_id, target]),
  )
  const missingTargets = tokens.filter(token => (
    !initialTargetByInstallation.has(token.installation_id)
  ))
  if (missingTargets.length > 0) {
    const { error: targetInsertError } = await supabase
      .from('notification_delivery_targets_v2')
      .upsert(missingTargets.map(token => ({
      outbox_id: claim.outbox_id,
      event_id: claim.event_id,
      installation_id: token.installation_id,
      transport: 'expo',
      status: 'pending',
      attempt_count: 0,
      updated_at: new Date().toISOString(),
      })), {
        onConflict: 'event_id,installation_id,transport',
        ignoreDuplicates: true,
      })
    if (targetInsertError) throw targetInsertError
  }

  const { data: currentTargetData, error: currentTargetError } = await supabase
    .from('notification_delivery_targets_v2')
    .select('id, installation_id, status, attempt_count')
    .eq('event_id', claim.event_id)
    .eq('transport', 'expo')
    .in('installation_id', tokens.map(token => token.installation_id))
  if (currentTargetError) throw currentTargetError

  const targetByInstallation = new Map(
    ((currentTargetData ?? []) as DeliveryTargetRow[])
      .map(target => [target.installation_id, target]),
  )
  const attemptTokens = tokens.filter(token => {
    const target = targetByInstallation.get(token.installation_id)
    if (!target) {
      throw new Error('Native delivery target was not created')
    }
    return shouldAttemptExpoTarget(target.status)
  })
  const outboxAttempt = Number(outboxResult.data?.attempt_count ?? 0)
  const outboxMaxAttempts = Number(outboxResult.data?.max_attempts ?? 0)
  const retryAfterSeconds = 20
  const canRetry = (
    outboxAttempt > 0 &&
    outboxAttempt < outboxMaxAttempts &&
    Date.now() + retryAfterSeconds * 1_000 < Date.parse(claim.expires_at)
  )

  const completeFromCurrentTargets = async () => {
    const statuses = tokens.map(token => (
      targetByInstallation.get(token.installation_id)!.status
    ))
    const completion = decideExpoOutboxCompletion(statuses, canRetry)
    if (completion.status === 'failed') {
      const now = new Date().toISOString()
      for (const target of targetByInstallation.values()) {
        if (target.status !== 'pending') continue
        const { error: targetFailureError } = await supabase
          .from('notification_delivery_targets_v2')
          .update({
            status: 'failed',
            last_error: 'Native delivery retry budget exhausted',
            completed_at: now,
            updated_at: now,
          })
          .eq('id', target.id)
          .eq('status', 'pending')
        if (targetFailureError) throw targetFailureError
        target.status = 'failed'
      }
    }
    await completeOutbox(
      supabase,
      claim,
      completion.status,
      completion.error,
      completion.status === 'pending' ? retryAfterSeconds : null,
    )
    return {
      delivered: completion.delivered,
      retryable: completion.retryable,
      failed: completion.status === 'failed',
      accepted: statuses.filter(status => (
        status === 'accepted' || status === 'delivered'
      )).length,
    }
  }

  if (attemptTokens.length === 0) {
    return completeFromCurrentTargets()
  }

  const attemptStartedAt = new Date().toISOString()
  for (const token of attemptTokens) {
    const target = targetByInstallation.get(token.installation_id)!
    const { error: targetAttemptError } = await supabase
      .from('notification_delivery_targets_v2')
      .update({
        attempt_count: target.attempt_count + 1,
        last_error: null,
        completed_at: null,
        updated_at: attemptStartedAt,
      })
      .eq('id', target.id)
      .eq('status', 'pending')
    if (targetAttemptError) throw targetAttemptError
    target.attempt_count += 1
  }

  const messages = attemptTokens.map(token => {
    const installation = installationById.get(token.installation_id)!
    return toExpoMessage(
      token,
      installation,
      deliveryEnvelope,
      event.type,
      event.entity_id,
      badge,
    )
  })
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)
  let response: Response
  try {
    response = await expoTransport.send(messages, controller.signal)
  } catch (caught) {
    const message = caught instanceof Error
      ? caught.message.slice(0, 500)
      : 'Expo provider request failed'
    for (const token of attemptTokens) {
      const target = targetByInstallation.get(token.installation_id)!
      const { error: targetError } = await supabase
        .from('notification_delivery_targets_v2')
        .update({
          last_error: message,
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .eq('status', 'pending')
      if (targetError) throw targetError
    }
    return completeFromCurrentTargets()
  } finally {
    clearTimeout(timeout)
  }

  if (response.status === 429 || response.status >= 500) {
    for (const token of attemptTokens) {
      const target = targetByInstallation.get(token.installation_id)!
      const { error: targetError } = await supabase
        .from('notification_delivery_targets_v2')
        .update({
          last_status_code: response.status,
          last_error: 'Expo provider is temporarily unavailable',
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .eq('status', 'pending')
      if (targetError) throw targetError
    }
    return completeFromCurrentTargets()
  }
  if (!response.ok) {
    const now = new Date().toISOString()
    for (const token of attemptTokens) {
      const target = targetByInstallation.get(token.installation_id)!
      const { error: targetError } = await supabase
        .from('notification_delivery_targets_v2')
        .update({
          status: 'failed',
          last_status_code: response.status,
          last_error: `Expo provider rejected delivery (${response.status})`,
          completed_at: now,
          updated_at: now,
        })
        .eq('id', target.id)
        .eq('status', 'pending')
      if (targetError) throw targetError
      target.status = 'failed'
    }
    return completeFromCurrentTargets()
  }

  let responseJson: { data?: ExpoTicket | ExpoTicket[] }
  try {
    responseJson = await response.json()
  } catch {
    for (const token of attemptTokens) {
      const target = targetByInstallation.get(token.installation_id)!
      const { error: targetError } = await supabase
        .from('notification_delivery_targets_v2')
        .update({
          last_status_code: response.status,
          last_error: 'Expo provider returned an invalid ticket response',
          updated_at: new Date().toISOString(),
        })
        .eq('id', target.id)
        .eq('status', 'pending')
      if (targetError) throw targetError
    }
    return completeFromCurrentTargets()
  }
  const tickets = (
    Array.isArray(responseJson.data) ? responseJson.data : [responseJson.data]
  ) as ExpoTicket[]
  for (let index = 0; index < attemptTokens.length; index += 1) {
    const token = attemptTokens[index]
    const ticket = tickets[index]
    const decision = classifyExpoTicket(ticket)
    const target = targetByInstallation.get(token.installation_id)!
    const now = new Date().toISOString()

    const { error: targetUpdateError } = await supabase
      .from('notification_delivery_targets_v2')
      .update({
        status: decision.status,
        provider_message_id: decision.providerMessageId,
        next_receipt_check_at: decision.providerMessageId
          ? new Date(Date.now() + 15 * 60_000).toISOString()
          : null,
        last_status_code: response.status,
        last_error: decision.error,
        completed_at: decision.status === 'accepted' || decision.status === 'pending'
          ? null
          : now,
        updated_at: now,
      })
      .eq('id', target.id)
      .eq('status', 'pending')
    if (targetUpdateError) throw targetUpdateError
    target.status = decision.status

    if (decision.invalid) {
      const { error: disableError } = await supabase
        .schema('private')
        .from('notification_native_tokens')
        .update({
          enabled: false,
          disabled_at: now,
          disabled_reason: 'DeviceNotRegistered',
          updated_at: now,
        })
        .eq('id', token.id)
        .eq('environment', deliveryEnvironment)
      if (disableError) throw disableError
    }
  }

  return completeFromCurrentTargets()
}

const checkExpoReceipts = async (
  supabase: ReturnType<typeof getAdminClient>,
  expoTransport: ExpoTransport,
  deliveryEnvironment: string,
) => {
  const now = new Date().toISOString()
  const { data, error } = await supabase
    .from('notification_delivery_targets_v2')
    .select(
      'id, installation_id, provider_message_id, notification_installations!inner(environment)',
    )
    .eq('transport', 'expo')
    .eq('status', 'accepted')
    .eq('notification_installations.environment', deliveryEnvironment)
    .not('provider_message_id', 'is', null)
    .lte('next_receipt_check_at', now)
    .limit(100)
  if (error) throw error
  if (!data?.length) return { checked: 0, delivered: 0, invalid: 0 }

  const ids = data.map(item => item.provider_message_id)
  const response = await expoTransport.getReceipts(ids)
  if (!response.ok) throw new Error(`Expo receipt lookup failed (${response.status})`)
  const payload = await response.json()
  const receipts = payload.data as Record<string, ExpoTicket> | undefined
  let delivered = 0
  let invalid = 0

  for (const target of data) {
    const receipt = receipts?.[target.provider_message_id]
    if (!receipt) {
      await supabase
        .from('notification_delivery_targets_v2')
        .update({
          next_receipt_check_at: new Date(Date.now() + 15 * 60_000).toISOString(),
          updated_at: now,
        })
        .eq('id', target.id)
      continue
    }
    const deviceInvalid = receipt.status === 'error' &&
      receipt.details?.error === 'DeviceNotRegistered'
    const status = receipt.status === 'ok'
      ? 'delivered'
      : deviceInvalid
        ? 'invalid'
        : 'failed'
    if (status === 'delivered') delivered += 1
    if (status === 'invalid') invalid += 1
    await supabase
      .from('notification_delivery_targets_v2')
      .update({
        status,
        last_error: receipt.message?.slice(0, 500) ?? null,
        completed_at: now,
        next_receipt_check_at: null,
        updated_at: now,
      })
      .eq('id', target.id)
    if (deviceInvalid) {
      await supabase
        .schema('private')
        .from('notification_native_tokens')
        .update({
          enabled: false,
          disabled_at: now,
          disabled_reason: 'DeviceNotRegistered',
          updated_at: now,
        })
        .eq('installation_id', target.installation_id)
        .eq('provider', 'expo')
        .eq('environment', deliveryEnvironment)
    }
  }
  return { checked: data.length, delivered, invalid }
}

export const handleNotificationDeliveryRequest = async (request: Request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  try {
    requireServiceRole(request)
    const body = await request.json().catch(() => ({}))
    const supabase = getAdminClient()
    const deliveryEnvironment = getNotificationDeliveryEnvironment()
    const expoTransport = createExpoTransport()
    if (body.action === 'receipts') {
      return json(await checkExpoReceipts(
        supabase,
        expoTransport,
        deliveryEnvironment,
      ))
    }

    const { data, error } = await supabase.rpc('claim_notification_outbox_v2', {
      batch_size: 20,
      lease_seconds: 45,
    })
    if (error) throw error
    const claims = (data ?? []) as OutboxClaim[]
    const results = []
    for (const claim of claims) {
      try {
        results.push(await processClaim(
          supabase,
          claim,
          expoTransport,
          deliveryEnvironment,
        ))
      } catch (caught) {
        await completeOutbox(
          supabase,
          claim,
          'pending',
          caught instanceof Error ? caught.message : 'Native delivery failed',
          20,
        ).catch(() => undefined)
        results.push({ delivered: false, retryable: true })
      }
    }
    return json({
      claimed: claims.length,
      delivered: results.filter(result => result.delivered).length,
      retryable: results.filter(result => (
        'retryable' in result && result.retryable
      )).length,
    })
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'Notification delivery failed'
    return json({ error: message }, message === 'Service role required' ? 401 : 500)
  }
}

if (import.meta.main) {
  serve(handleNotificationDeliveryRequest)
}
