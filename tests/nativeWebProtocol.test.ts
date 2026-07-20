import { parseNativeWebMessage } from '../apps/mobile/src/lib/nativeWebProtocol'

const requestId = '11111111-1111-4111-8111-111111111111'
const ticket = `${requestId}.${'a'.repeat(64)}`
const userId = '22222222-2222-4222-8222-222222222222'

describe('native web protocol compatibility', () => {
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
