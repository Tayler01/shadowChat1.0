import { getDefaultNotificationPreferences } from '../../lib/push'
import { requestAppBadgeRefresh } from '../../lib/appBadge'
import { getWorkingClient } from '../../lib/supabase'
import type {
  NotificationCoordinatorPreferences,
  NotificationEventRecord,
} from './notificationModel'

const EVENT_SELECT = [
  'id',
  'user_id',
  'type',
  'category',
  'entity_id',
  'conversation_id',
  'message_id',
  'dm_message_id',
  'actor_id',
  'route',
  'payload',
  'sent_at',
  'read_at',
  'presented_at',
  'resolved_at',
  'created_at',
  'presentation_expires_at',
].join(', ')

export const fetchNotificationCoordinatorPreferences = async (
  userId: string,
): Promise<NotificationCoordinatorPreferences> => {
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('notification_preferences')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) throw error
  return {
    ...getDefaultNotificationPreferences(userId),
    ...(data ?? {}),
  } as NotificationCoordinatorPreferences
}

export const fetchForegroundNotificationEvents = async (
  userId: string,
  visibleSinceMs: number,
): Promise<NotificationEventRecord[]> => {
  const client = await getWorkingClient()
  const { data, error } = await client
    .from('notification_events')
    .select(EVENT_SELECT)
    .eq('user_id', userId)
    .is('read_at', null)
    .is('presented_at', null)
    .is('resolved_at', null)
    .gte('created_at', new Date(visibleSinceMs).toISOString())
    .gt('presentation_expires_at', new Date().toISOString())
    .order('created_at', { ascending: true })
    .limit(20)

  if (error) throw error
  return (data ?? []) as unknown as NotificationEventRecord[]
}

export const claimNotificationEvent = async (eventId: string) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('claim_my_notification_event', {
    target_event_id: eventId,
  })
  if (error) throw error
  return data === true
}

export const markNotificationEventRead = async (eventId: string) => {
  const client = await getWorkingClient()
  const { data, error } = await client.rpc('mark_my_notification_event_read', {
    target_event_id: eventId,
  })
  if (error) throw error
  return data === true
}

export const clearNotificationEventFromSystemTray = async (message: {
  notificationType?: string
  eventId: string
  conversationId?: string | null
  messageId?: string | null
  imageId?: string | null
  commentId?: string | null
  matchId?: string | null
  roomId?: string | null
}) => {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  const payload = {
    type: 'SHADOWCHAT_NOTIFICATIONS_CLEAR',
    ...message,
  }
  navigator.serviceWorker.controller?.postMessage(payload)

  try {
    const registration = await navigator.serviceWorker.getRegistration?.()
    registration?.active?.postMessage(payload)
  } catch {
    // Clearing a system notification is best-effort and must not block routing.
  }
}

export const markNotificationDestinationRead = async (
  eventIds: string[],
  trayContext: {
    imageId?: string
    commentId?: string
    matchId?: string
    roomId?: string
  } = {},
) => {
  const uniqueEventIds = Array.from(new Set(eventIds.filter(Boolean)))
  if (uniqueEventIds.length === 0) return true

  const results = await Promise.allSettled(
    uniqueEventIds.map(async eventId => {
      const marked = await markNotificationEventRead(eventId)
      if (!marked) throw new Error('Notification could not be marked as read')
      await clearNotificationEventFromSystemTray({
        eventId,
        ...trayContext,
      })
    }),
  )
  requestAppBadgeRefresh()
  return results.every(result => result.status === 'fulfilled')
}
