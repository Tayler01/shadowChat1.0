import assert from 'node:assert/strict'
import {
  classifyExpoTicket,
  createExpoTransport,
  decideExpoOutboxCompletion,
  getNotificationDeliveryEnvironment,
  handleNotificationDeliveryRequest,
  isNativeInstallationForeground,
  resolveNotificationSoundPreference,
  shouldAttemptExpoTarget,
  toExpoMessage,
  NATIVE_CANARY_LIMITS,
  isNativeCanaryEnabled,
  getNativeProviderTimeout,
  runNativeCanaryClaims,
} from './index.ts'

const canaryRuntime = {
  delivery_mode: 'active', worker_invocation_enabled: true,
  receipt_reconciliation_enabled: true, all_users_enabled: false,
  canary_user_ids: ['11111111-1111-4111-8111-111111111111'],
  enabled_categories: ['dm'], activation_watermark: new Date().toISOString(),
}

Deno.test('native canary gates fail closed for disabled, global and unscoped delivery', () => {
  assert.equal(isNativeCanaryEnabled(canaryRuntime, 'deliver'), true)
  assert.equal(isNativeCanaryEnabled(null, 'deliver'), false)
  assert.equal(isNativeCanaryEnabled({ ...canaryRuntime, delivery_mode: 'disabled' }, 'deliver'), false)
  assert.equal(isNativeCanaryEnabled({ ...canaryRuntime, all_users_enabled: true }, 'deliver'), false)
  assert.equal(isNativeCanaryEnabled({ ...canaryRuntime, canary_user_ids: [] }, 'deliver'), false)
  assert.equal(isNativeCanaryEnabled({ ...canaryRuntime, enabled_categories: [] }, 'deliver'), false)
  assert.equal(isNativeCanaryEnabled({ ...canaryRuntime, receipt_reconciliation_enabled: false }, 'receipts'), false)
})

Deno.test('provider budget reserves persistence within an eight-second invocation', () => {
  assert.equal(NATIVE_CANARY_LIMITS.runtimeMs, 8_000)
  assert.ok(NATIVE_CANARY_LIMITS.events * NATIVE_CANARY_LIMITS.installationsPerEvent <= 5)
  assert.equal(getNativeProviderTimeout(8_000, 0), 3_000)
  assert.equal(getNativeProviderTimeout(4_000, 1_000), 1_000)
  assert.equal(getNativeProviderTimeout(2_000, 1_000), 0)
})

Deno.test('one native claim round never starts more than two simultaneous events', async () => {
  let active = 0
  let peak = 0
  const output = await runNativeCanaryClaims([1, 2], async id => {
    active += 1
    peak = Math.max(peak, active)
    await new Promise(resolve => setTimeout(resolve, 1))
    active -= 1
    return { id }
  })
  assert.equal(peak, 2)
  assert.deepEqual(output, [{ id: 1 }, { id: 2 }])
  await assert.rejects(runNativeCanaryClaims([1, 2, 3], async () => ({})), /bound exceeded/)
})

const withWorkerMock = async (
  fetchMock: typeof fetch,
  run: () => Promise<void>,
) => {
  const previousFetch = globalThis.fetch
  const overrides = { NOTIFICATION_V2_WORKER_SECRET: 'native-canary-test-secret',
    NOTIFICATION_DELIVERY_ENVIRONMENT: 'preview', SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role' }
  const previous = Object.fromEntries(Object.keys(overrides).map(key => [key, Deno.env.get(key)]))
  for (const [key, value] of Object.entries(overrides)) Deno.env.set(key, value)
  globalThis.fetch = fetchMock
  try { await run() } finally {
    globalThis.fetch = previousFetch
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) Deno.env.delete(key)
      else Deno.env.set(key, value)
    }
  }
}
const canaryRequest = (action = 'bounded_canary', task = 'deliver') => new Request('https://worker.test', {
  method: 'POST', headers: { 'x-shadowchat-worker-secret': 'native-canary-test-secret' },
  body: JSON.stringify({ action, task }),
})

Deno.test('legacy delivery and receipt actions cannot wake database or Expo work', async () => {
  let calls = 0
  await withWorkerMock(() => { calls += 1; throw new Error('Unexpected network') }, async () => {
    for (const action of ['deliver', 'receipts']) {
      assert.equal((await handleNotificationDeliveryRequest(canaryRequest(action))).status, 400)
    }
  })
  assert.equal(calls, 0)
})

Deno.test('disabled runtime checks only its singleton row and never claims or calls a provider', async () => {
  const paths: string[] = []
  await withWorkerMock(input => {
    paths.push(new URL(String(input)).pathname)
    return Promise.resolve(Response.json([{ ...canaryRuntime, delivery_mode: 'disabled' }]))
  }, async () => {
    const result = await handleNotificationDeliveryRequest(canaryRequest())
    assert.equal(result.status, 200)
    assert.equal((await result.json()).claimed, 0)
  })
  assert.deepEqual(paths, ['/rest/v1/notification_v2_runtime_config'])
})

const createDeliveryFaultBackend = (provider: () => Promise<Response>, receipt = false, overrides: {
  installation?: Record<string, unknown>
  token?: Record<string, unknown>
  event?: Record<string, unknown>
  preferences?: Record<string, unknown>
  claim?: Record<string, unknown>
  blocks?: unknown[]
} = {}) => {
  const userId = canaryRuntime.canary_user_ids[0]
  const eventId = '22222222-2222-4222-8222-222222222222'
  const installationId = '33333333-3333-4333-8333-333333333333'
  const target: Record<string, unknown> = { id: 'target', outbox_id: 'outbox', installation_id: installationId,
    status: receipt ? 'accepted' : 'pending', attempt_count: 0,
    provider_message_id: receipt ? 'ticket-one' : null,
    receipt_attempt_count: receipt ? 2 : 0, receipt_expires_at: new Date(Date.now() + 60_000).toISOString() }
  let providerCalls = 0
  const providerMessages: Record<string, unknown>[][] = []
  let installationSelect = ''
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input))
    if (url.host === 'exp.host') {
      providerCalls += 1
      providerMessages.push(JSON.parse(String(init?.body)))
      return await provider()
    }
    const name = url.pathname.split('/').at(-1)
    if (name === 'notification_v2_runtime_config') return Response.json([canaryRuntime])
    if (name === 'acquire_native_notification_worker_v2') return Response.json('worker-lease')
    if (name === 'release_native_notification_worker_v2' || name === 'validate_notification_outbox_v2_lease' || name === 'complete_notification_outbox_v2') return Response.json(true)
    if (name === 'claim_notification_outbox_v2') return Response.json([{ outbox_id: 'outbox', lease_token: 'lease', event_id: eventId, user_id: userId, expires_at: new Date(Date.now() + 90_000).toISOString(), ...overrides.claim }])
    if (name === 'notification_outbox_v2') return Response.json([{ attempt_count: 1, max_attempts: 3 }])
    if (name === 'notification_events') return Response.json([{ id: eventId, type: 'dm_message', entity_id: eventId, actor_id: null, conversation_id: null, read_at: null, resolved_at: null, ...overrides.event }])
    if (name === 'notification_envelopes_v2') return Response.json([{ event_id: eventId, user_id: userId, category_key: 'dm', title: 'Message', body: 'Canary', private_title: 'Notification', private_body: null, actor_id: null, route: '/?view=dms', group_key: `dm:${eventId}`, priority: 'high', action_keys: ['open'], sound_id: 'system_default', android_channel_key: 'messages_v1', badge_category: 'dm', media_ref: null, created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 90_000).toISOString() }])
    if (name === 'notification_preferences') return Response.json([{ notifications_enabled: true, ...overrides.preferences }])
    if (name === 'notification_installations') {
      installationSelect = url.searchParams.get('select') || ''
      assert.equal(url.searchParams.get('user_id'), `eq.${userId}`)
      assert.equal(url.searchParams.get('revoked_at'), 'is.null')
      return Response.json([{ id: installationId, platform: 'ios', environment: 'preview', foreground_until: null, channel_schema_version: 2, ...overrides.installation }])
    }
    if (name === 'user_blocks') return Response.json(overrides.blocks || [])
    if (name === 'list_notification_native_delivery_tokens_v2') return Response.json([{ id: 'token', installation_id: installationId, provider: 'expo', environment: 'preview', token: 'ExponentPushToken[test]', ...overrides.token }])
    if (name === 'notification_delivery_targets_v2') {
      if (receipt && url.searchParams.get('receipt_expires_at')?.startsWith('lte.')) return Response.json([])
      if (init?.method === 'PATCH') Object.assign(target, JSON.parse(String(init.body)))
      return Response.json([target])
    }
    if (name === 'get_app_badge_state_v2') return Response.json({ total: 0 })
    if (name === 'notification_event_presentation_preferences' || name === 'notification_category_presentation_preferences') return Response.json([])
    throw new Error(`Unexpected test backend call: ${name}`)
  }
  return { fetchMock, target, providerMessages, installationSelect: () => installationSelect, calls: () => providerCalls }
}

const scopedInstallation = {
  user_id: canaryRuntime.canary_user_ids[0],
  installation_key: '44444444-4444-4444-8444-444444444444',
  build_number: '22',
  community_scope_version: 1,
}
const accepted = () => Promise.resolve(Response.json({ data: [{ status: 'ok', id: 'ticket-one' }] }))

Deno.test('actual scoped Expo iOS and Android dispatch bind trusted scope outside envelope and use generic OS fallback', async () => {
  for (const platform of ['ios', 'android']) {
    const backend = createDeliveryFaultBackend(accepted, false, {
      installation: { ...scopedInstallation, platform },
    })
    await withWorkerMock(backend.fetchMock, async () => {
      Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
      const request = canaryRequest()
      const body = await request.json()
      const forged = new Request(request.url, { method: 'POST', headers: request.headers,
        body: JSON.stringify({ ...body, communityScope: { version: 1, userId: 'forged', projectRef: 'forged', installationKey: 'forged' } }) })
      assert.equal((await handleNotificationDeliveryRequest(forged)).status, 200)
    })
    assert.equal(backend.calls(), 1)
    assert.match(backend.installationSelect(), /user_id,installation_key,build_number,community_scope_version/)
    const message = backend.providerMessages[0][0]
    const data = message.data as Record<string, unknown>
    assert.deepEqual(data.communityScope, {
      version: 1, projectRef: 'abcdefghijklmnopqrst', userId: scopedInstallation.user_id,
      installationKey: scopedInstallation.installation_key,
    })
    const envelope = data.envelopeV2 as Record<string, unknown>
    assert.equal(envelope.communityScope, undefined)
    assert.equal(envelope.actor, null)
    assert.equal(envelope.media, null)
    assert.equal(message.richContent, undefined)
    if (platform === 'ios') {
      assert.equal(message.title, 'ShadowChat')
      assert.equal(message.subtitle, undefined)
      assert.equal(message.body, 'Open ShadowChat to view your notification.')
      assert.equal(message.mutableContent, false)
    } else {
      assert.equal(message.title, undefined)
      assert.equal(message.body, undefined)
      assert.equal(data.badgeCount, 0)
    }
    assert.ok(new TextEncoder().encode(JSON.stringify(message)).byteLength <= 3_800)
  }
})

Deno.test('actual dispatch preserves build21 and future full builds without explicit capability', async () => {
  for (const build_number of ['21', '22', '100']) {
    const backend = createDeliveryFaultBackend(accepted, false, { installation: { build_number } })
    await withWorkerMock(backend.fetchMock, async () => {
      await handleNotificationDeliveryRequest(canaryRequest())
    })
    assert.equal(backend.calls(), 1)
    const message = backend.providerMessages[0][0]
    assert.equal(message.title, 'Message')
    assert.equal(message.body, 'Canary')
    assert.equal((message.data as Record<string, unknown>).communityScope, undefined)
  }
})

Deno.test('actual scoped and legacy dispatch preserve private and sender-only envelope redaction', async () => {
  for (const capability of [null, 1]) {
    for (const notification_preview_mode of ['private', 'sender_only']) {
      const backend = createDeliveryFaultBackend(accepted, false, {
        installation: { ...scopedInstallation, community_scope_version: capability },
        preferences: { notification_preview_mode },
      })
      await withWorkerMock(backend.fetchMock, async () => {
        Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
        await handleNotificationDeliveryRequest(canaryRequest())
      })
      assert.equal(backend.calls(), 1)
      const message = backend.providerMessages[0][0]
      const envelope = (message.data as Record<string, unknown>).envelopeV2 as {
        privacy: string; content: { title: string; body: string | null }; actor: unknown; media: unknown
      }
      assert.equal(envelope.privacy, notification_preview_mode)
      assert.equal(envelope.content.body, notification_preview_mode === 'private' ? null : 'Open ShadowChat to view it.')
      assert.equal(envelope.media, null)
      assert.equal(envelope.actor, null)
      assert.equal(message.title, capability === 1 ? 'ShadowChat' : notification_preview_mode === 'private' ? 'Notification' : 'Message')
      assert.notEqual(message.body, 'Canary')
    }
  }
})

Deno.test('actual scoped dispatch fails closed on unsupported build/capability, recipient, key and server project', async () => {
  for (const installation of [
    { build_number: '21' }, { build_number: '22.0' }, { build_number: '022' },
    { build_number: null }, { community_scope_version: 2 }, { user_id: 'forged' },
    { installation_key: 'malformed' },
  ]) {
    const backend = createDeliveryFaultBackend(accepted, false, {
      installation: { ...scopedInstallation, ...installation },
    })
    await withWorkerMock(backend.fetchMock, async () => {
      Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
      await handleNotificationDeliveryRequest(canaryRequest())
    })
    assert.equal(backend.calls(), 0, JSON.stringify(installation))
  }
  for (const projectUrl of ['', 'http://abcdefghijklmnopqrst.supabase.co',
    'https://evil.test', 'https://abcdefghijklmnopqrst.supabase.co/path',
    'https://other@abcdefghijklmnopqrst.supabase.co']) {
    const backend = createDeliveryFaultBackend(accepted, false, { installation: scopedInstallation })
    await withWorkerMock(backend.fetchMock, async () => {
      Deno.env.set('SUPABASE_URL', projectUrl || 'https://invalid.test')
      await handleNotificationDeliveryRequest(canaryRequest())
    })
    assert.equal(backend.calls(), 0, projectUrl)
  }
})

Deno.test('actual scoped send retains auth, unread, expiry, preferences, block and foreground suppression; direct providers stay disabled', async () => {
  for (const overrides of [
    { event: { read_at: new Date().toISOString() } },
    { event: { resolved_at: new Date().toISOString() } },
    { event: { actor_id: '55555555-5555-4555-8555-555555555555' }, blocks: [{}] },
    { preferences: { notifications_enabled: false } },
    { claim: { expires_at: new Date(Date.now() - 1_000).toISOString() } },
    { installation: { foreground_until: new Date(Date.now() + 60_000).toISOString() } },
    { installation: { platform: 'web' } },
    { token: { provider: 'apns' } }, { token: { provider: 'fcm' } },
    { token: { environment: 'production' } }, { token: { installation_id: 'unrelated' } },
  ]) {
    const backend = createDeliveryFaultBackend(accepted, false, {
      ...overrides, installation: { ...scopedInstallation, ...overrides.installation },
    })
    await withWorkerMock(backend.fetchMock, async () => {
      Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
      await handleNotificationDeliveryRequest(canaryRequest())
    })
    assert.equal(backend.calls(), 0, JSON.stringify(overrides))
  }
})

Deno.test('lost provider response stays terminal and is never resubmitted on recovery', async () => {
  const backend = createDeliveryFaultBackend(() => Promise.reject(new Error('Connection lost')))
  await withWorkerMock(backend.fetchMock, async () => {
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
    assert.equal(backend.target.status, 'failed')
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
  })
  assert.equal(backend.calls(), 1)
})

Deno.test('accepted Expo targets are excluded from a subsequent claim', async () => {
  const backend = createDeliveryFaultBackend(() => Promise.resolve(Response.json({ data: [{ status: 'ok', id: 'ticket-one' }] })))
  await withWorkerMock(backend.fetchMock, async () => {
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
    assert.equal(backend.target.status, 'accepted')
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
  })
  assert.equal(backend.calls(), 1)
})

Deno.test('explicit provider throttling permits a bounded retry', async () => {
  let first = true
  const backend = createDeliveryFaultBackend(() => {
    if (first) { first = false; return Promise.resolve(new Response('', { status: 429 })) }
    return Promise.resolve(Response.json({ data: [{ status: 'ok', id: 'ticket-two' }] }))
  })
  await withWorkerMock(backend.fetchMock, async () => {
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
    assert.equal(backend.target.status, 'pending')
    assert.equal((await handleNotificationDeliveryRequest(canaryRequest())).status, 200)
    assert.equal(backend.target.status, 'accepted')
  })
  assert.equal(backend.calls(), 2)
})

Deno.test('a stalled database request aborts within the invocation deadline', async () => {
  let observedAbort = false
  await withWorkerMock((_input, init) => new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      observedAbort = true
      reject(new DOMException('Aborted', 'AbortError'))
    }, { once: true })
  }), async () => {
    const start = Date.now()
    const response = await handleNotificationDeliveryRequest(canaryRequest())
    assert.equal(response.status, 500)
    assert.ok(Date.now() - start < NATIVE_CANARY_LIMITS.runtimeMs + 1_000)
  })
  assert.equal(observedAbort, true)
})

Deno.test('a failed final receipt HTTP attempt exhausts the reserved retry budget', async () => {
  const backend = createDeliveryFaultBackend(() => Promise.reject(new Error('Receipt transport lost')), true)
  await withWorkerMock(backend.fetchMock, async () => {
    const response = await handleNotificationDeliveryRequest(canaryRequest('bounded_canary', 'receipts'))
    assert.equal(response.status, 200)
    assert.equal(backend.target.receipt_attempt_count, 3)
    assert.equal(backend.target.status, 'failed')
    assert.equal((await response.json()).failed, 1)
  })
  assert.equal(backend.calls(), 1)
})

Deno.test('a returned success receipt completes even the final reserved attempt', async () => {
  const backend = createDeliveryFaultBackend(() => Promise.resolve(Response.json({ data: { 'ticket-one': { status: 'ok' } } })), true)
  await withWorkerMock(backend.fetchMock, async () => {
    const response = await handleNotificationDeliveryRequest(canaryRequest('bounded_canary', 'receipts'))
    assert.equal(response.status, 200)
    assert.equal(backend.target.receipt_attempt_count, 3)
    assert.equal(backend.target.status, 'delivered')
    assert.equal((await response.json()).delivered, 1)
  })
  assert.equal(backend.calls(), 1)
})

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

Deno.test('native foreground leases suppress only the active device', () => {
  const now = Date.parse('2026-07-20T16:30:00.000Z')
  assert.equal(isNativeInstallationForeground({
    platform: 'ios',
    foreground_until: '2026-07-20T16:31:00.000Z',
  }, now), true)
  assert.equal(isNativeInstallationForeground({
    platform: 'android',
    foreground_until: '2026-07-20T16:29:59.999Z',
  }, now), false)
  assert.equal(isNativeInstallationForeground({
    platform: 'ios',
    foreground_until: null,
  }, now), false)
  assert.equal(isNativeInstallationForeground({
    platform: 'web',
    foreground_until: '2026-07-20T16:31:00.000Z',
  }, now), false)
})

Deno.test('an invalid foreground lease cannot suppress native delivery forever', () => {
  assert.equal(isNativeInstallationForeground({
    platform: 'ios',
    foreground_until: 'not-a-timestamp',
  }), false)
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
  assert.equal(ios.richContent, undefined)
  assert.equal(ios.threadId, envelope.groupKey)
  assert.equal(ios.collapseId, envelope.eventId)
})

Deno.test('iOS ShadowPin delivery carries legacy rich content while scoped transports strip actor/media', async () => {
  const envelope = {
    schemaVersion: 2 as const,
    eventId: '11111111-1111-4111-8111-111111111111',
    eventIds: ['11111111-1111-4111-8111-111111111111'],
    type: 'shadow_pin_post',
    category: 'shadow_pin',
    entityId: '22222222-2222-4222-8222-222222222222',
    route: '/?view=pins&pin=22222222-2222-4222-8222-222222222222',
    groupKey: 'pin:22222222-2222-4222-8222-222222222222',
    priority: 'normal' as const,
    privacy: 'full' as const,
    actor: {
      id: '33333333-3333-4333-8333-333333333333',
      label: 'JJ',
      avatarUrl: 'https://shadochat.online/avatar.jpg',
    },
    content: {
      eyebrow: 'ShadowPin',
      title: 'New ShadowPin from JJ',
      body: 'Midnight flight',
      privateTitle: 'New ShadowChat notification',
      privateBody: 'Open ShadowChat to view it.',
    },
    media: {
      kind: 'image' as const,
      thumbnailUrl: 'https://shadochat.online/pin.jpg',
      alt: 'Midnight flight',
    },
    actions: ['open', 'mark_read'],
    soundId: 'pin_shutter',
    androidChannelKey: 'social_v1',
    badgeCategory: 'shadow_pin',
    autoRead: false,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  }
  const ios = toExpoMessage(
    {
      id: 'token',
      installation_id: 'installation',
      provider: 'expo',
      token: 'ExponentPushToken[test]',
      environment: 'preview',
    },
    {
      id: 'installation',
      platform: 'ios',
      environment: 'preview',
      foreground_until: null,
      channel_schema_version: 2,
    },
    envelope,
    envelope.type,
    envelope.entityId,
    4,
  )

  assert.equal(ios.mutableContent, true)
  assert.deepEqual(ios.richContent, { image: envelope.media.thumbnailUrl })
  assert.deepEqual(
    (ios.data as Record<string, unknown>).envelopeV2,
    envelope,
  )
  await withWorkerMock(() => { throw new Error('No network expected') }, async () => {
    Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
    for (const platform of ['ios', 'android'] as const) {
      const scoped = toExpoMessage(
        { id: 'token', installation_id: 'installation', provider: 'expo',
          token: 'ExponentPushToken[test]', environment: 'preview' },
        { ...scopedInstallation, id: 'installation', platform, environment: 'preview',
          foreground_until: null, channel_schema_version: 2 },
        envelope, envelope.type, envelope.entityId, 4, scopedInstallation.user_id,
      )
      const scopedEnvelope = (scoped.data as Record<string, unknown>).envelopeV2 as Record<string, unknown>
      assert.equal(scopedEnvelope.actor, null)
      assert.equal(scopedEnvelope.media, null)
      assert.equal(scoped.richContent, undefined)
      assert.notEqual(scoped.mutableContent, true)
    }
  })
  assert.equal(envelope.actor.label, 'JJ', 'Scoped delivery cannot mutate sibling legacy payloads')
  assert.equal(envelope.media.thumbnailUrl, 'https://shadochat.online/pin.jpg')
})

Deno.test('event sound overrides category sound and category remains the fallback', () => {
  assert.equal(
    resolveNotificationSoundPreference('gold_signal', 'low_glass'),
    'gold_signal',
  )
  assert.equal(
    resolveNotificationSoundPreference(null, 'low_glass'),
    'low_glass',
  )
  assert.equal(resolveNotificationSoundPreference(null, null), null)
})

Deno.test('oversized legacy and scoped Android data remain within payload cap without trimming scope', async () => {
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
  await withWorkerMock(() => { throw new Error('No network expected') }, async () => {
    Deno.env.set('SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co')
    const scoped = toExpoMessage(
      { id: 'token', installation_id: 'installation', provider: 'expo',
        token: 'ExponentPushToken[test]', environment: 'preview' },
      { ...scopedInstallation, id: 'installation', platform: 'android', environment: 'preview',
        foreground_until: null, channel_schema_version: 2 },
      envelope, envelope.type, envelope.entityId, 99, scopedInstallation.user_id,
    )
    assert.ok(new TextEncoder().encode(JSON.stringify(scoped)).byteLength <= 3_800)
    assert.deepEqual((scoped.data as Record<string, unknown>).communityScope, {
      version: 1, projectRef: 'abcdefghijklmnopqrst', userId: scopedInstallation.user_id,
      installationKey: scopedInstallation.installation_key,
    })
    await assert.rejects(async () => toExpoMessage(
      { id: 'token', installation_id: 'installation', provider: 'expo',
        token: 'ExponentPushToken[test]', environment: 'preview' },
      { ...scopedInstallation, id: 'installation', platform: 'android', environment: 'preview',
        foreground_until: null, channel_schema_version: 2 },
      { ...envelope, route: 'x'.repeat(5_000) }, envelope.type, envelope.entityId, 99,
      scopedInstallation.user_id,
    ), /provider payload limit/)
  })
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
