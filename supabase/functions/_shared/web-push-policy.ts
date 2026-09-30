/** Resolve lock-screen policy before handing a payload to the push provider. */
export type WebPushPresentationPreferences = {
  notification_preview_mode?: 'full' | 'sender_only' | 'private'
  notification_media_enabled?: boolean
}

export const resolveWebPushPayload = (
  payload: Record<string, unknown>,
  preferences: WebPushPresentationPreferences | null | undefined,
  eventId?: string,
) => {
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? { ...payload.data as Record<string, unknown> } : {}
  const resolved: Record<string, unknown> = { ...payload, data }
  const mode = preferences?.notification_preview_mode ?? 'private'
  if (eventId) data.eventId = eventId
  if (mode !== 'full') {
    resolved.body = 'Open ShadowChat to view it.'
    for (const key of ['body', 'title', 'content', 'preview', 'body_preview', 'actor', 'sender', 'profile', 'envelopeV2', 'notificationEnvelopeV2']) delete data[key]
    delete resolved.envelopeV2
    if (mode === 'private') {
      resolved.title = 'New ShadowChat notification'
      for (const key of ['senderId', 'actorId', 'sender_id', 'actor_id']) delete data[key]
    }
  }
  if (mode !== 'full' || preferences?.notification_media_enabled === false) {
    delete resolved.icon
    delete resolved.image
    for (const key of ['avatarUrl', 'thumbnailUrl', 'image', 'icon', 'media']) delete data[key]
  }
  // An unknown aggregate must not erase a previously confirmed launcher count.
  for (const record of [resolved, data]) {
    for (const key of ['badgeCount', 'unreadCount']) {
      if (record[key] === null || record[key] === undefined) delete record[key]
    }
  }
  return resolved
}

export const recoveryNotificationTag = (event: {
  type: string; entityId: string; conversationId?: string | null;
  messageId?: string | null; isDm?: boolean; moveCount?: number;
}) => {
  if (event.type === 'dm_message' && event.conversationId) return `dm:${event.conversationId}`
  if (event.type === 'reaction' && event.messageId) return `reaction:${event.isDm ? 'dm' : 'group'}:${event.messageId}`
  if (event.type === 'shadow_checkers_turn') return `shadow-checkers-turn:${event.entityId}:${event.moveCount}`
  return `notification:${event.type}:${event.entityId}`
}
