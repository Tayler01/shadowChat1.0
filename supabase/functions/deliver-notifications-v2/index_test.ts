import assert from 'node:assert/strict'
import {
  classifyExpoTicket,
  createExpoTransport,
  decideExpoOutboxCompletion,
  getNotificationDeliveryEnvironment,
  handleNotificationDeliveryRequest,
  shouldAttemptExpoTarget,
  toExpoMessage,
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
  assert.equal(secondAttempt.status, 'accepted')
  assert.equal(secondAttempt.delivered, false)
})

Deno.test('an accepted Expo ticket remains pending receipt despite a failed sibling', () => {
  const completion = decideExpoOutboxCompletion(
    ['accepted', 'failed'],
    false,
  )
  assert.equal(completion.status, 'accepted')
  assert.equal(completion.delivered, false)
})

Deno.test('DeviceNotRegistered is terminal while an accepted sibling awaits receipt', () => {
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
  assert.equal(completion.status, 'accepted')
  assert.equal(completion.delivered, false)
})

Deno.test('delivery environment is explicit and fails closed', () => {
  assert.equal(getNotificationDeliveryEnvironment('preview'), 'preview')
  assert.equal(getNotificationDeliveryEnvironment(' PRODUCTION '), 'production')
  assert.throws(
    () => getNotificationDeliveryEnvironment('staging'),
    /Invalid notification delivery environment/,
  )
  assert.throws(
    () => getNotificationDeliveryEnvironment(''),
    /not configured/,
  )
})

Deno.test('the delivery worker rejects requests without its dedicated secret', async () => {
  const previous = Deno.env.get('NOTIFICATION_V2_WORKER_SECRET')
  Deno.env.set('NOTIFICATION_V2_WORKER_SECRET', 'test-worker-secret')
  try {
    const response = await handleNotificationDeliveryRequest(new Request(
      'https://example.test/deliver-notifications-v2',
      {
        method: 'POST',
        headers: { 'x-shadowchat-worker-secret': 'wrong-secret' },
        body: '{}',
      },
    ))
    assert.equal(response.status, 401)
    assert.deepEqual(await response.json(), {
      error: 'Notification worker authorization required',
    })
  } finally {
    if (previous === undefined) {
      Deno.env.delete('NOTIFICATION_V2_WORKER_SECRET')
    } else {
      Deno.env.set('NOTIFICATION_V2_WORKER_SECRET', previous)
    }
  }
})

Deno.test('Android delivery is data-only while iOS invokes the rich notification extension', () => {
  const envelope = {
    schemaVersion: 2 as const,
    eventId: '11111111-1111-4111-8111-111111111111',
    eventIds: ['11111111-1111-4111-8111-111111111111'],
    type: 'dm_message',
    category: 'dm',
    entityId: '22222222-2222-4222-8222-222222222222',
    route: '/?view=dms',
    groupKey: 'dm:22222222-2222-4222-8222-222222222222',
    priority: 'high' as const,
    privacy: 'full' as const,
    actor: {
      id: '33333333-3333-4333-8333-333333333333',
      label: 'JJ',
      avatarUrl: 'https://shadochat.online/avatar.jpg',
    },
    content: {
      eyebrow: 'Direct message',
      title: 'JJ',
      body: 'Test message',
      privateTitle: 'New ShadowChat notification',
      privateBody: 'Open ShadowChat to view it.',
    },
    media: null,
    actions: ['open', 'mark_read'],
    soundId: 'shadow_whisper',
    androidChannelKey: 'messages_v1',
    badgeCategory: 'dm',
    autoRead: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const token = {
    id: 'token',
    installation_id: 'installation',
    provider: 'expo' as const,
    token: 'ExponentPushToken[test]',
    environment: 'preview',
  }
  const baseInstallation = {
    id: 'installation',
    environment: 'preview',
    foreground_until: null,
    channel_schema_version: 2,
  }
  const android = toExpoMessage(
    token,
    { ...baseInstallation, platform: 'android' },
    envelope,
    'dm_message',
    envelope.entityId,
    3,
  )
  assert.equal(android.title, undefined)
  assert.equal(android.body, undefined)
  assert.deepEqual(android.data, {
    envelopeV2: { ...envelope, type: 'dm_message', entityId: envelope.entityId },
    badgeCount: 3,
  })

  const ios = toExpoMessage(
    token,
    { ...baseInstallation, platform: 'ios' },
    envelope,
    'dm_message',
    envelope.entityId,
    3,
  )
  assert.equal(ios.mutableContent, true)
  assert.equal(ios.threadId, envelope.groupKey)
  assert.equal(ios.collapseId, envelope.eventId)
})

Deno.test('oversized Android data is trimmed below the provider payload limit', () => {
  const longText = 'x'.repeat(6_000)
  const envelope = {
    schemaVersion: 2 as const,
    eventId: '11111111-1111-4111-8111-111111111111',
    eventIds: Array.from({ length: 40 }, (_, index) =>
      `11111111-1111-4111-8111-${String(index).padStart(12, '0')}`),
    type: 'shadow_pin_posted',
    category: 'shadow_pin',
    entityId: '22222222-2222-4222-8222-222222222222',
    route: '/?view=shadow-pin',
    groupKey: 'shadow-pin:discover',
    priority: 'normal' as const,
    privacy: 'full' as const,
    actor: {
      id: '33333333-3333-4333-8333-333333333333',
      label: longText,
      avatarUrl: `https://shadochat.online/${longText}`,
    },
    content: {
      eyebrow: longText,
      title: longText,
      body: longText,
      privateTitle: longText,
      privateBody: longText,
    },
    media: {
      kind: 'image' as const,
      thumbnailUrl: `https://shadochat.online/${longText}`,
      alt: longText,
    },
    actions: ['open', 'mark_read'],
    soundId: 'shadow_whisper',
    androidChannelKey: 'social_v1',
    badgeCategory: 'shadow_pin',
    autoRead: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const message = toExpoMessage(
    {
      id: 'token',
      installation_id: 'installation',
      provider: 'expo',
      token: 'ExponentPushToken[test]',
      environment: 'preview',
    },
    {
      id: 'installation',
      platform: 'android',
      environment: 'preview',
      foreground_until: null,
      channel_schema_version: 2,
    },
    envelope,
    envelope.type,
    envelope.entityId,
    99,
  )
  assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength <= 3_800)
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
