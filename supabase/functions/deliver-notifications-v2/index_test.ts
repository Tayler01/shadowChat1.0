import assert from 'node:assert/strict'
import {
  classifyExpoTicket,
  createExpoTransport,
  decideExpoOutboxCompletion,
  getNotificationDeliveryEnvironment,
  shouldAttemptExpoTarget,
} from './index.ts'

Deno.test('partial Expo success keeps the outbox retryable and does not resend accepted targets', () => {
  const accepted = classifyExpoTicket({ status: 'ok', id: 'ticket-one' })
  const throttled = classifyExpoTicket({
    status: 'error',
    message: 'Device rate exceeded',
    details: { error: 'MessageRateExceeded' },
  })

  assert.equal(accepted.status, 'accepted')
  assert.equal(throttled.status, 'pending')
  assert.equal(throttled.retryable, true)
  assert.equal(shouldAttemptExpoTarget(accepted.status), false)
  assert.equal(shouldAttemptExpoTarget(throttled.status), true)

  const firstAttempt = decideExpoOutboxCompletion(
    [accepted.status, throttled.status],
    true,
  )
  assert.equal(firstAttempt.status, 'pending')
  assert.equal(firstAttempt.delivered, false)
  assert.equal(firstAttempt.retryable, true)

  const retryAccepted = classifyExpoTicket({ status: 'ok', id: 'ticket-two' })
  const secondAttempt = decideExpoOutboxCompletion(
    [accepted.status, retryAccepted.status],
    false,
  )
  assert.equal(secondAttempt.status, 'delivered')
  assert.equal(secondAttempt.delivered, true)
})

Deno.test('permanent sibling failure cannot be hidden by one accepted Expo target', () => {
  const completion = decideExpoOutboxCompletion(
    ['accepted', 'failed'],
    false,
  )
  assert.equal(completion.status, 'failed')
  assert.equal(completion.delivered, false)
})

Deno.test('DeviceNotRegistered is terminal while an accepted sibling remains delivered', () => {
  const invalid = classifyExpoTicket({
    status: 'error',
    message: 'The device is no longer registered',
    details: { error: 'DeviceNotRegistered' },
  })
  assert.equal(invalid.status, 'invalid')
  assert.equal(invalid.invalid, true)
  assert.equal(invalid.retryable, false)

  const completion = decideExpoOutboxCompletion(
    ['accepted', invalid.status],
    false,
  )
  assert.equal(completion.status, 'delivered')
  assert.equal(completion.delivered, true)
})

Deno.test('delivery environment is explicit and fails closed', () => {
  assert.equal(getNotificationDeliveryEnvironment('preview'), 'preview')
  assert.equal(getNotificationDeliveryEnvironment(' PRODUCTION '), 'production')
  assert.throws(
    () => getNotificationDeliveryEnvironment('staging'),
    /Invalid notification delivery environment/,
  )
})

Deno.test('Expo transport is injectable and preserves auth and request bodies', async () => {
  const calls: Array<{
    url: string
    authorization: string | null
    body: unknown
  }> = []
  const fetchMock = (async (
    input: string | URL | Request,
    init?: RequestInit,
  ) => {
    calls.push({
      url: String(input),
      authorization: new Headers(init?.headers).get('authorization'),
      body: JSON.parse(String(init?.body)),
    })
    return new Response(JSON.stringify({ data: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }) as typeof fetch
  const transport = createExpoTransport(fetchMock, 'expo-secret')

  await transport.send(
    [{ to: 'ExponentPushToken[test]' }],
    new AbortController().signal,
  )
  await transport.getReceipts(['ticket-one'])

  assert.deepEqual(calls, [
    {
      url: 'https://exp.host/--/api/v2/push/send',
      authorization: 'Bearer expo-secret',
      body: [{ to: 'ExponentPushToken[test]' }],
    },
    {
      url: 'https://exp.host/--/api/v2/push/getReceipts',
      authorization: 'Bearer expo-secret',
      body: { ids: ['ticket-one'] },
    },
  ])
})
