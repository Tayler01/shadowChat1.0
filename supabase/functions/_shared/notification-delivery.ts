export type NotificationDeliveryPreferences = {
  notifications_enabled?: boolean
  mute_until?: string | null
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  quiet_hours_timezone?: string | null
}

export type GroupNotificationKind = 'mention' | 'reply' | 'group_message'

const parseTimeMinutes = (value: string | null | undefined) => {
  if (!value) return null
  const match = value.match(/^(\d{1,2}):(\d{2})/)
  if (!match) return null

  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours > 23 || minutes > 59) {
    return null
  }

  return (hours * 60) + minutes
}

const getMinutesInTimeZone = (now: Date, timeZone: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(now)
    const hours = Number(parts.find(part => part.type === 'hour')?.value)
    const minutes = Number(parts.find(part => part.type === 'minute')?.value)
    if (Number.isInteger(hours) && Number.isInteger(minutes)) {
      return (hours * 60) + minutes
    }
  } catch {
    // Invalid legacy zones fail closed to UTC instead of bypassing quiet hours.
  }

  return (now.getUTCHours() * 60) + now.getUTCMinutes()
}

export const isQuietHoursActive = (
  preferences: NotificationDeliveryPreferences,
  now = new Date()
) => {
  const start = parseTimeMinutes(preferences.quiet_hours_start)
  const end = parseTimeMinutes(preferences.quiet_hours_end)
  if (start === null || end === null || start === end) return false

  const current = getMinutesInTimeZone(
    now,
    preferences.quiet_hours_timezone || 'UTC'
  )

  return start < end
    ? current >= start && current < end
    : current >= start || current < end
}

export const getNotificationSuppressionReason = (
  preferences: NotificationDeliveryPreferences | null | undefined,
  now = new Date()
) => {
  if (!preferences) return 'Notification preferences are unavailable'
  if (preferences.notifications_enabled === false) return 'All notifications are muted'

  if (preferences.mute_until) {
    const muteUntil = new Date(preferences.mute_until).getTime()
    if (Number.isFinite(muteUntil) && muteUntil > now.getTime()) {
      return 'Notifications are snoozed'
    }
  }

  if (isQuietHoursActive(preferences, now)) return 'Quiet hours are active'
  return null
}

export const extractMentionUsernames = (content: string | null | undefined) => {
  if (!content) return []

  const usernames = new Set<string>()
  const pattern = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_]{1,40})\b/g
  let match: RegExpExecArray | null

  while ((match = pattern.exec(content)) !== null && usernames.size < 20) {
    usernames.add(match[2].toLowerCase())
  }

  return Array.from(usernames)
}

export const selectGroupNotificationKind = ({
  isMentioned,
  isReplyTarget,
  mentionEnabled,
  replyEnabled,
  groupEnabled,
}: {
  isMentioned: boolean
  isReplyTarget: boolean
  mentionEnabled: boolean
  replyEnabled: boolean
  groupEnabled: boolean
}): GroupNotificationKind | null => {
  if (isMentioned && mentionEnabled) return 'mention'
  if (isReplyTarget && replyEnabled) return 'reply'
  if (groupEnabled) return 'group_message'
  return null
}
