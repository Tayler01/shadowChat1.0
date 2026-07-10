import {
  extractMentionUsernames,
  getNotificationSuppressionReason,
  isQuietHoursActive,
  selectGroupNotificationKind,
} from '../supabase/functions/_shared/notification-delivery'

describe('notification delivery preferences', () => {
  test('enforces overnight quiet hours in the saved time zone', () => {
    const preferences = {
      notifications_enabled: true,
      quiet_hours_start: '22:00:00',
      quiet_hours_end: '07:00:00',
      quiet_hours_timezone: 'America/New_York',
      mute_until: null,
    }

    expect(isQuietHoursActive(preferences, new Date('2026-07-10T03:30:00.000Z'))).toBe(true)
    expect(isQuietHoursActive(preferences, new Date('2026-07-10T16:00:00.000Z'))).toBe(false)
  })

  test('global mute and snooze suppress every category before delivery', () => {
    expect(getNotificationSuppressionReason({
      notifications_enabled: false,
      mute_until: null,
    })).toBe('All notifications are muted')

    expect(getNotificationSuppressionReason({
      notifications_enabled: true,
      mute_until: '2026-07-10T12:00:00.000Z',
    }, new Date('2026-07-10T11:00:00.000Z'))).toBe('Notifications are snoozed')
  })

  test('extracts bounded, case-normalized mentions without email false positives', () => {
    expect(extractMentionUsernames('Hi @Caleb and @shadow_ai; email me at a@b.com. @Caleb'))
      .toEqual(['caleb', 'shadow_ai'])
  })

  test('selects one targeted category per recipient to avoid duplicate delivery', () => {
    expect(selectGroupNotificationKind({
      isMentioned: true,
      isReplyTarget: true,
      mentionEnabled: true,
      replyEnabled: true,
      groupEnabled: true,
    })).toBe('mention')

    expect(selectGroupNotificationKind({
      isMentioned: true,
      isReplyTarget: true,
      mentionEnabled: false,
      replyEnabled: true,
      groupEnabled: false,
    })).toBe('reply')

    expect(selectGroupNotificationKind({
      isMentioned: false,
      isReplyTarget: false,
      mentionEnabled: true,
      replyEnabled: true,
      groupEnabled: false,
    })).toBeNull()
  })
})
