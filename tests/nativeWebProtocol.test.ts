import {
  parseNativeNotificationControlUrl,
  parseNativeWebMessage,
} from '../apps/mobile/src/lib/nativeWebProtocol'

const session = {
  accessToken: 'access-token-value-long-enough-for-native-bridge',
  refreshToken: 'refresh-token-value-long-enough-for-native-bridge',
  expiresAt: 1_900_000_000,
  userId: '11111111-1111-4111-8111-111111111111',
}

describe('native web protocol compatibility', () => {
  it('accepts a current notification enable command with its session', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
      requestId: 'current-request',
      session,
    }))).toEqual({
      version: 1,
      type: 'notifications_enable',
      requestId: 'current-request',
      session,
    })
  })

  it('accepts a legacy cached notification enable command without signing out', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
    }))).toEqual({
      version: 1,
      type: 'notifications_enable',
      requestId: null,
    })
  })

  it('still rejects a malformed supplied session', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
      requestId: 'bad-session',
      session: { accessToken: 'short' },
    }))).toBeNull()
  })

  it('accepts only the same-origin notification fallback control route', () => {
    expect(parseNativeNotificationControlUrl(
      'https://shadochat.online/?nativeApp=1&nativeControl=notifications_enable&requestId=fallback-1',
      'https://shadochat.online'
    )).toEqual({
      version: 1,
      type: 'notifications_enable',
      requestId: 'fallback-1',
    })

    expect(parseNativeNotificationControlUrl(
      'https://example.com/?nativeApp=1&nativeControl=notifications_enable&requestId=fallback-1',
      'https://shadochat.online'
    )).toBeNull()
  })
})
