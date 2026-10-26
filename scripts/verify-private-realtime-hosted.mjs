/**
 * Synthetic hosted Realtime acceptance. Default/--plan and --self-test are offline.
 * Execution requires the common fresh bootstrap receipt plus the exact disposable
 * branch and a completed exclusive scheduler window. No production fallback.
 * Protocol: https://supabase.com/docs/guides/realtime/protocol (JSON v1.0.0).
 */
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createClient } from '@supabase/supabase-js'
import { loadHostedTestTarget } from './hosted-test-target.mjs'

export const hostedRealtimeTarget = {
  project: 'jwldrnmhrmwsyrfhmrkg',
  branchId: '28082276-7003-40e5-b6cf-478fc8b76336',
}

export function assertRealtimeTarget(target) {
  assert.equal(target.project, hostedRealtimeTarget.project, 'Only the reviewed disposable project is permitted')
  assert.equal(target.branchId, hostedRealtimeTarget.branchId, 'Only the reviewed disposable branch is permitted')
  assert.equal(target.url, `https://${hostedRealtimeTarget.project}.supabase.co`, 'Unexpected Realtime origin')
}

export function parseRealtimeFrame(text) {
  const frame = JSON.parse(text)
  assert(frame && !Array.isArray(frame) && typeof frame === 'object', 'Expected a JSON protocol v1 frame')
  assert(typeof frame.event === 'string' && typeof frame.topic === 'string', 'Invalid Realtime event envelope')
  assert(frame.payload && typeof frame.payload === 'object', 'Invalid Realtime event payload')
  return frame
}

export function assertDeniedJoin(reply) {
  assert.equal(reply.status, 'error', 'An explicit failed join is required; timeouts are not denial evidence')
  const reason = String(reply.response?.reason ?? reply.response?.error ?? '')
  assert(/private|unauthori[sz]ed|permissions|not allowed|access denied/i.test(reason), 'Join failed without an authorization reason')
  assert(!/database|connection|rate.?limit|initializ|timeout/i.test(reason), 'Infrastructure failure is not authorization evidence')
}

export function assertDeniedWrite(reply, kind) {
  assert.equal(reply.status, 'error', 'An explicit rejected write is required; timeouts are not denial evidence')
  const reason = String(reply.response?.reason ?? reply.response?.error ?? '')
  // Current Presence protocol returns a bare error; Broadcast with ack supplies
  // an unauthorized code. The same connection is tested with live controls.
  if (kind === 'broadcast' || reason) assert(/unauthori[sz]ed|permissions|not allowed|access denied/i.test(reason), 'Write failed without an authorization reason')
}

class RealtimeProbe {
  constructor(target, topic, token) {
    assertRealtimeTarget(target)
    this.topic = `realtime:${topic}`
    this.token = token
    this.events = []
    this.pending = new Map()
    this.watchers = new Set()
    this.sequence = 0
    this.joinRef = null
    this.closed = false
    const address = new URL(`${target.url.replace('https:', 'wss:')}/realtime/v1/websocket`)
    address.searchParams.set('apikey', target.anonKey)
    address.searchParams.set('vsn', '1.0.0')
    this.socket = new WebSocket(address)
    this.socket.addEventListener('message', event => {
      try {
        const frame = parseRealtimeFrame(event.data)
        if (frame.event === 'phx_reply' && this.pending.has(frame.ref)) {
          this.pending.get(frame.ref).resolve(frame.payload)
        } else {
          this.events.push(frame)
          assert(this.events.length <= 200, 'Unexpected event volume in the exact synthetic subscription')
          for (const watcher of [...this.watchers]) watcher(frame)
        }
      } catch {
        this.fail(new Error('Invalid or excessive Realtime protocol response'))
      }
    })
    this.socket.addEventListener('error', () => this.fail(new Error('Realtime transport failed')))
    this.socket.addEventListener('close', () => {
      this.closed = true
      clearInterval(this.heartbeat)
      this.fail(new Error('Realtime transport closed before the expected result'))
    })
  }

  fail(error) {
    for (const waiting of [...this.pending.values()]) waiting.reject(error)
    for (const watcher of [...this.watchers]) watcher(null, error)
  }

  async open() {
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer)
        this.socket.removeEventListener('open', onOpen)
        this.socket.removeEventListener('error', onError)
        this.socket.removeEventListener('close', onError)
        if (error) reject(error); else resolve()
      }
      const onOpen = () => finish()
      const onError = () => finish(new Error('Realtime connection did not open'))
      const timer = setTimeout(() => finish(new Error('Realtime connection timed out')), 15_000)
      this.socket.addEventListener('open', onOpen, { once: true })
      this.socket.addEventListener('error', onError, { once: true })
      this.socket.addEventListener('close', onError, { once: true })
      if (this.socket.readyState === WebSocket.OPEN) finish()
    })
    this.heartbeat = setInterval(() => {
      if (this.socket.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: `heartbeat-${++this.sequence}`, join_ref: null }))
      }
    }, 10_000)
    this.heartbeat.unref()
    return this
  }

  request(event, payload, timeout = 15_000) {
    assert.equal(this.socket.readyState, WebSocket.OPEN, 'Realtime transport must be open')
    const ref = String(++this.sequence)
    if (event === 'phx_join') this.joinRef = ref
    return new Promise((resolve, reject) => {
      const finish = (action, result) => {
        clearTimeout(timer)
        this.pending.delete(ref)
        action(result)
      }
      const timer = setTimeout(() => finish(reject, new Error(`Realtime ${event} reply timed out; no authorization conclusion`)), timeout)
      this.pending.set(ref, { resolve: value => finish(resolve, value), reject: error => finish(reject, error) })
      this.socket.send(JSON.stringify({ topic: this.topic, event, payload, ref, join_ref: this.joinRef }))
    })
  }

  join({ privateChannel = true, messageId } = {}) {
    return this.request('phx_join', {
      config: {
        private: privateChannel,
        broadcast: { ack: true, self: true },
        presence: { enabled: false },
        postgres_changes: messageId ? [{ event: 'UPDATE', schema: 'public', table: 'messages', filter: `id=eq.${messageId}` }] : [],
      },
      ...(this.token ? { access_token: this.token } : {}),
    })
  }

  waitFor(predicate, after = 0, timeout = 15_000) {
    const existing = this.events.slice(after).find(predicate)
    if (existing) return Promise.resolve(existing)
    return new Promise((resolve, reject) => {
      const finish = (action, result) => { clearTimeout(timer); this.watchers.delete(watcher); action(result) }
      const watcher = (frame, error) => {
        if (error) finish(reject, error)
        else if (predicate(frame)) finish(resolve, frame)
      }
      const timer = setTimeout(() => finish(reject, new Error('Expected synthetic Realtime event was not delivered')), timeout)
      this.watchers.add(watcher)
    })
  }

  async close() {
    clearInterval(this.heartbeat)
    if (this.socket.readyState === WebSocket.CLOSED) { this.closed = true; return }
    await new Promise((resolve, reject) => {
      const finish = error => {
        clearTimeout(timer)
        this.socket.removeEventListener('close', onClose)
        if (error) reject(error); else resolve()
      }
      const onClose = () => finish()
      const timer = setTimeout(() => finish(new Error('Synthetic Realtime socket closure was not verified')), 5_000)
      this.socket.addEventListener('close', onClose, { once: true })
      this.socket.close(1000, 'synthetic acceptance finished')
    })
  }
}

function selfTest() {
  let checks = 0
  const test = action => { action(); checks += 1 }
  test(() => assertRealtimeTarget({ ...hostedRealtimeTarget, url: `https://${hostedRealtimeTarget.project}.supabase.co` }))
  for (const changed of [{ project: 'shsqqouecvdoifzufkqm' }, { branchId: randomUUID() }, { url: 'https://example.com' }]) {
    test(() => assert.throws(() => assertRealtimeTarget({ ...hostedRealtimeTarget, url: `https://${hostedRealtimeTarget.project}.supabase.co`, ...changed })))
  }
  test(() => assert.equal(parseRealtimeFrame('{"event":"phx_reply","topic":"realtime:qa","payload":{"status":"error"}}').payload.status, 'error'))
  for (const invalid of ['null', '[]', '{"event":"phx_reply"}', 'not-json']) test(() => assert.throws(() => parseRealtimeFrame(invalid)))
  for (const reason of ['PrivateOnly: only private channels are allowed', 'You do not have permissions to read from this Channel topic']) {
    test(() => assertDeniedJoin({ status: 'error', response: { reason } }))
  }
  for (const reply of [{ status: 'ok' }, { status: 'timed out' }, { status: 'error', response: { reason: 'Database connection failed' } }]) {
    test(() => assert.throws(() => assertDeniedJoin(reply)))
  }
  test(() => assertDeniedWrite({ status: 'error', response: { error: 'unauthorized' } }, 'broadcast'))
  test(() => assertDeniedWrite({ status: 'error', response: {} }, 'presence'))
  for (const reply of [{ status: 'ok' }, { status: 'timeout' }, { status: 'error', response: { error: 'unable_to_connect_to_project' } }]) {
    test(() => assert.throws(() => assertDeniedWrite(reply, 'broadcast')))
  }
  console.log(JSON.stringify({ offlineChecks: checks, passed: true, remoteRequests: 0 }))
}

async function run(args) {
  if (args.includes('--self-test')) { selfTest(); return }
  if (!args.length || args.includes('--plan')) {
    console.log(JSON.stringify({ target: hostedRealtimeTarget, requires: ['fresh common bootstrap receipt', 'scheduler window complete', 'private-only dashboard setting saved'],
      checks: ['anonymous and approved public joins denied', 'anonymous and unapproved private joins denied', 'unknown private topic denied',
        'approved private Postgres Changes delivers a synthetic row update', 'member Broadcast and Presence writes rejected',
        'service-authorized private broadcast control delivered', 'member release-lane spoof denied'],
      cleanup: ['all raw WebSocket connections closed', 'exact synthetic messages removed', 'exact synthetic Auth identities and profiles removed'],
      createsProviderAssets: false, productionWrites: false, remoteRequests: 0 }, null, 2))
    return
  }
  assert(args.includes('--scheduler-window-complete'), 'Root must finish the exclusive scheduler window before this test')
  const target = loadHostedTestTarget(args)
  assertRealtimeTarget(target)
  const runId = randomUUID()
  const runName = `private-realtime-${runId}`
  const output = path.resolve('output/privacy', runName)
  await mkdir(output, { recursive: true })
  const secrets = [target.anonKey, target.serviceKey]
  const safeError = error => {
    let text = error?.message || 'Synthetic Realtime verification failed'
    for (const secret of secrets) if (secret) text = text.split(secret).join('[redacted]')
    return text.replace(/eyJ[A-Za-z0-9_.-]{30,}/g, '[redacted-token]').slice(0, 1000)
  }
  const summary = { version: 1, purpose: 'hosted-private-realtime-acceptance', project: target.project, branchId: target.branchId,
    runId, startedAt: new Date().toISOString(), checks: [], fixtures: { users: [], messages: [] },
    cleanup: { verified: false, socketsOpened: 0, socketsClosed: 0, errors: [] } }
  const save = () => writeFile(path.join(output, 'summary.json'), JSON.stringify(summary, null, 2))
  const clients = []
  const makeClient = key => {
    const client = createClient(target.url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: (input, init = {}) => {
        const address = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
        assert.equal(address.origin, target.url, 'Synthetic HTTP request escaped the selected project')
        return fetch(input, { ...init, redirect: 'error', signal: AbortSignal.any([AbortSignal.timeout(20_000), ...(init.signal ? [init.signal] : [])]) })
      } } })
    clients.push(client)
    return client
  }
  const admin = makeClient(target.serviceKey)
  const value = (result, label) => { if (result.error) throw new Error(`${label} failed`); return result.data }
  const check = async (name, action) => {
    try { const details = await action(); summary.checks.push({ name, passed: true, details }); console.log(`PASS ${name}`) }
    catch (error) { summary.checks.push({ name, passed: false, error: safeError(error) }); throw error }
    finally { await save() }
  }
  const probes = []
  const probe = async (topic, token) => {
    const instance = new RealtimeProbe(target, topic, token)
    probes.push(instance); summary.cleanup.socketsOpened += 1
    return instance.open()
  }
  const member = async label => {
    const fixture = { label, email: `qa.realtime.${runId}.${label}@example.invalid`, id: null, creationAttempted: true }
    summary.fixtures.users.push(fixture); await save()
    const password = `${randomBytes(32).toString('base64url')}Aa9!`
    secrets.push(password)
    const user = value(await admin.auth.admin.createUser({ email: fixture.email, password, email_confirm: true,
      user_metadata: { username: `qa_rt_${randomBytes(5).toString('hex')}`, qa_realtime_run: runId } }), 'Create synthetic Auth identity').user
    assert(user?.id, 'Synthetic identity response is missing')
    fixture.id = user.id; await save()
    value(await admin.from('users').upsert({ id: user.id, email: fixture.email, username: `qa_rt_${randomBytes(5).toString('hex')}`, display_name: 'Synthetic Realtime acceptance' }), 'Create synthetic profile')
    const client = makeClient(target.anonKey)
    const session = value(await client.auth.signInWithPassword({ email: fixture.email, password }), 'Sign in synthetic identity').session
    assert(session?.access_token, 'Synthetic sign-in did not return a session')
    secrets.push(session.access_token, session.refresh_token)
    return { id: user.id, client, token: session.access_token }
  }
  const denied = async (name, topic, token, privateChannel = true) => check(name, async () => {
    const socket = await probe(topic, token)
    try { assertDeniedJoin(await socket.join({ privateChannel })); return { explicitAuthorizationError: true } }
    finally { await socket.close() }
  })
  let failure
  try {
    const owner = await member('owner')
    const reader = await member('reader')
    const unapproved = await member('unapproved')
    value(await admin.from('users').delete().eq('id', unapproved.id), 'Remove only the unapproved synthetic profile')
    assert.equal(value(await admin.rpc('is_active_member_for_service', { target_user_id: unapproved.id }), 'Verify unapproved identity'), false)
    assert.equal(value(await admin.rpc('is_active_member_for_service', { target_user_id: reader.id }), 'Verify approved identity'), true)
    const topic = `shadowchat:db:public:messages:${runName}`
    await denied('anonymous public join is explicitly denied', topic, undefined, false)
    await denied('approved member public join is explicitly denied', topic, reader.token, false)
    await denied('anonymous private join is explicitly denied', topic)
    await denied('Auth identity without an approved profile cannot join private channels', topic, unapproved.token)
    await denied('approved member cannot join an unknown private topic', `qa-unauthorized:${runId}`, reader.token)
    const messageId = randomUUID()
    summary.fixtures.messages.push({ id: messageId, userId: owner.id }); await save()
    value(await owner.client.from('messages').insert({ id: messageId, user_id: owner.id, content: `${runName}:initial`, message_type: 'text' }), 'Insert exact synthetic message')
    const socket = await probe(topic, reader.token)
    await check('approved private database channel receives an actual authorized row update', async () => {
      const reply = await socket.join({ messageId })
      assert.equal(reply.status, 'ok', 'Approved private join was not accepted')
      assert.equal(reply.response?.postgres_changes?.length, 1, 'Exact Postgres Changes filter was not registered')
      // The join acknowledgement precedes CDC readiness on current hosted Realtime.
      await socket.waitFor(frame => frame.event === 'system' && frame.payload.extension === 'postgres_changes' && frame.payload.status === 'ok')
      const after = socket.events.length
      const content = `${runName}:updated`
      const changed = value(await owner.client.from('messages').update({ content }).eq('id', messageId).eq('user_id', owner.id).select('id'), 'Update own synthetic message')
      assert.equal(changed.length, 1, 'Exactly one synthetic message must change')
      const event = await socket.waitFor(frame => frame.event === 'postgres_changes' && frame.payload.data?.record?.id === messageId, after)
      assert.equal(event.payload.data?.type, 'UPDATE')
      assert.equal(event.payload.data?.record?.content, content)
      return { exactRow: true, liveUpdate: true, receiverIsDifferentApprovedMember: true }
    })
    await check('member Broadcast write is explicitly rejected', async () => {
      assertDeniedWrite(await socket.request('broadcast', { type: 'broadcast', event: 'qa-member-spoof', payload: { runId } }), 'broadcast')
      assert(!socket.events.some(frame => frame.event === 'broadcast' && frame.payload.event === 'qa-member-spoof'), 'Rejected member payload was delivered')
      return { explicitAuthorizationError: true }
    })
    await check('member Presence track is explicitly rejected', async () => {
      assertDeniedWrite(await socket.request('presence', { type: 'presence', event: 'track', payload: { qaRunId: runId, user_id: owner.id } }), 'presence')
      return { explicitWriteError: true }
    })
    await check('service-authorized private broadcast control reaches the same member connection', async () => {
      const after = socket.events.length
      const response = await fetch(`${target.url}/realtime/v1/api/broadcast`, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15_000),
        headers: { apikey: target.serviceKey, Authorization: `Bearer ${target.serviceKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ topic, private: true, event: 'qa-service-control', payload: { runId } }] }) })
      await response.body?.cancel()
      assert(response.ok, 'Service control broadcast was rejected')
      await socket.waitFor(frame => frame.event === 'broadcast' && frame.payload.event === 'qa-service-control' && frame.payload.payload?.runId === runId, after)
      assert(!socket.events.some(frame => frame.event === 'broadcast' && frame.payload.event === 'qa-member-spoof'), 'Rejected member payload was delivered later')
      return { memberReadPermissionVerified: true, controlDelivered: true }
    })
    await check('approved member can read the release lane but cannot spoof its publisher', async () => {
      const release = await probe('app-release-updates', reader.token)
      try {
        assert.equal((await release.join()).status, 'ok')
        assertDeniedWrite(await release.request('broadcast', { type: 'broadcast', event: 'qa-release-spoof', payload: { runId } }), 'broadcast')
        return { privateReadAllowed: true, publisherWriteRejected: true }
      } finally { await release.close() }
    })
  } catch (error) { failure = error; summary.error = safeError(error) }
  finally {
    const cleanup = async (label, action) => {
      try { await action() } catch (error) { summary.cleanup.errors.push({ label, error: safeError(error) }) }
    }
    for (const socket of probes) await cleanup('close synthetic WebSocket', () => socket.close())
    summary.cleanup.socketsClosed = probes.filter(socket => socket.closed).length
    for (const message of summary.fixtures.messages) await cleanup('remove exact synthetic message', async () => {
      value(await admin.from('messages').delete().eq('id', message.id).eq('user_id', message.userId).like('content', `${runName}:%`), 'Remove synthetic message')
      assert.equal(value(await admin.from('messages').select('id').eq('id', message.id), 'Verify message cleanup').length, 0)
    })
    for (const fixture of summary.fixtures.users) await cleanup(`remove synthetic ${fixture.label} identity`, async () => {
      assert(fixture.id, 'Auth creation outcome is unknown; exact email/run marker requires root recovery or disposable branch removal')
      const current = await admin.auth.admin.getUserById(fixture.id)
      if (current.data?.user) {
        assert.equal(current.data.user.email, fixture.email, 'Cleanup identity email differs')
        assert.equal(current.data.user.user_metadata.qa_realtime_run, runId, 'Cleanup identity run marker differs')
        value(await admin.auth.admin.deleteUser(fixture.id), 'Remove exact synthetic Auth identity')
      } else assert.equal(current.error?.status, 404, 'Only an explicit Auth404 confirms absence')
      assert.equal((await admin.auth.admin.getUserById(fixture.id)).error?.status, 404, 'Auth cleanup was not verified')
      assert.equal(value(await admin.from('users').select('id').eq('id', fixture.id), 'Verify profile cleanup').length, 0)
    })
    for (const client of clients) await cleanup('close synthetic SDK client', async () => {
      await client.auth.stopAutoRefresh()
      await client.realtime.disconnect()
    })
    summary.cleanup.verified = summary.cleanup.errors.length === 0 && summary.cleanup.socketsOpened === summary.cleanup.socketsClosed
    summary.completedAt = new Date().toISOString()
    summary.passed = !failure && summary.cleanup.verified
    await save()
    console.log(JSON.stringify({ passed: summary.passed, checks: summary.checks.length, cleanup: summary.cleanup, evidence: path.join(output, 'summary.json') }))
  }
  if (failure || !summary.cleanup.verified) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await run(process.argv.slice(2)) }
  catch { console.error('Hosted Realtime verification stopped before execution or evidence completion; no credentials are printed.'); process.exitCode = 1 }
}
