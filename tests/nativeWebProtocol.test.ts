import { parseNativeWebMessage } from '../apps/mobile/src/lib/nativeWebProtocol'

const requestId = '11111111-1111-4111-8111-111111111111'
const ticket = `${requestId}.${'a'.repeat(64)}`
const userId = '22222222-2222-4222-8222-222222222222'

describe('native web protocol compatibility', () => {
  it('accepts bounded opaque refresh tokens without assuming their entropy from length', () => {
    for (const refreshToken of ['abcdefghijkl', 'x', 'a'.repeat(4096)]) {
      const session = { accessToken: 'access-token-validated-by-native-controller', refreshToken, userId, expiresAt: null }
      expect(parseNativeWebMessage(JSON.stringify({ version: 1, type: 'auth_session', session }))).toEqual({ version: 1, type: 'auth_session', session })
    }
    for (const refreshToken of ['', null, 12, 'a'.repeat(4097)]) {
      const session = { accessToken: 'access-token-validated-by-native-controller', refreshToken, userId, expiresAt: null }
      expect(parseNativeWebMessage(JSON.stringify({ version: 1, type: 'auth_session', session }))).toBeNull()
    }
  })

  it('badge hints carry no web-supplied badge count into the native API', () => {
    expect(parseNativeWebMessage('{"version":1,"type":"notifications_badge_refresh","count":0}')).toEqual({ version: 1, type: 'notifications_badge_refresh' })
  })
  it('accepts only the current version of the explicit community chooser command', () => {
    expect(parseNativeWebMessage('{"version":1,"type":"community_choose"}')).toEqual({ version: 1, type: 'community_choose' })
    expect(parseNativeWebMessage('{"version":2,"type":"community_choose"}')).toBeNull()
  })
  it('accepts a current notification enable command with a single-use ticket', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
      requestId,
      ticket,
      userId,
    }))).toEqual({
      version: 1,
      type: 'notifications_enable',
      requestId,
      ticket,
      userId,
    })
  })

  it('rejects legacy sessionless notification enable commands', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
    }))).toBeNull()
  })

  it('rejects a malformed or missing enrollment ticket', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enable',
      requestId,
      ticket: 'short',
      userId,
    }))).toBeNull()
  })

  it('accepts a bridge-only enrollment preparation command', () => {
    expect(parseNativeWebMessage(JSON.stringify({
      version: 1,
      type: 'notifications_enrollment_prepare',
      requestId,
    }))).toEqual({
      version: 1,
      type: 'notifications_enrollment_prepare',
      requestId,
    })
  })
})
