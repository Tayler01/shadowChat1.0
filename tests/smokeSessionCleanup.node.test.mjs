import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createOwnedSmokeProfile, createSmokeSessionCleanup, redactSmokeAccounts, removeOwnedSmokeProfile } from '../scripts/smoke-session-cleanup.mjs'

const origin = 'https://fixture.supabase.co'
const email = 'owned@example.invalid'
const id = 'user-owned'
const token = (sid, sub = id, version = '') => `x.${Buffer.from(JSON.stringify({ session_id: sid, sub, role: 'authenticated', version })).toString('base64url')}.x`

function response({ sid = 'session-own', url = `${origin}/auth/v1/token?grant_type=password`, mail = email, user = id, status = 200, apikey = 'sb_publishable_fixture', version = '', wait } = {}) {
  return {
    url: () => url,
    status: () => status,
    json: async () => {
      if (wait) await wait
      return { access_token: token(sid, user, version), user: { id: user, email: mail } }
    },
    request: () => ({ allHeaders: async () => ({ apikey }) }),
  }
}

function setup({ badUser = false, failLogout = false } = {}) {
  const calls = []
  const cleanup = createSmokeSessionCleanup({
    supabaseUrl: origin,
    fetchImpl: async (url, options) => {
      calls.push({ url, options })
      return { ok: !(failLogout && url.includes('logout')), json: async () => ({ id: badUser ? 'wrong' : id }) }
    },
  })
  const context = new EventEmitter()
  cleanup.trackContext(context, { email, id })
  return { cleanup, context, calls }
}

test('revokes freshly owned sessions locally and allowlists account metadata', async () => {
  const { cleanup, context, calls } = setup()
  context.emit('response', response())
  const report = await cleanup.cleanup()
  assert.deepEqual(report, { capturedSessions: 1, revokedSessions: 1, captureErrors: 0, failures: 0, scope: 'local', verified: true })
  assert.equal(calls[1].url, `${origin}/auth/v1/logout?scope=local`)
  assert.equal(calls[1].options.method, 'POST')
  assert.deepEqual(redactSmokeAccounts([{ id, email, password: 'secret', inviteCode: 'invite', refresh_token: 'token', nested: { secret: 'secret' } }]), [{ id, email }])
  assert.equal(JSON.stringify(report).includes('accessToken'), false)
})

for (const [label, args] of Object.entries({
  external: { url: 'https://evil.invalid/auth/v1/token?grant_type=password' },
  otherUser: { mail: 'other@example.invalid' },
  wrongId: { user: 'other' },
  failedLogin: { status: 400 },
  unownedRefresh: { url: `${origin}/auth/v1/token?grant_type=refresh_token` },
})) {
  test(`ignores ${label}`, async () => {
    const { cleanup, context, calls } = setup()
    context.emit('response', response(args))
    assert.equal((await cleanup.cleanup()).capturedSessions, 0)
    assert.equal(calls.length, 0)
  })
}

test('processes a refresh after a delayed initial grant and uses its newest token', async () => {
  const { cleanup, context, calls } = setup()
  let release
  const wait = new Promise(resolve => { release = resolve })
  context.emit('response', response({ wait }))
  context.emit('response', response({ url: `${origin}/auth/v1/token?grant_type=refresh_token`, version: 'new' }))
  context.emit('response', response({ sid: 'unowned', url: `${origin}/auth/v1/token?grant_type=refresh_token` }))
  release()
  assert.equal((await cleanup.cleanup()).revokedSessions, 1)
  assert.equal(calls.length, 2)
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${token('session-own', id, 'new')}`)
})

for (const flag of ['badUser', 'failLogout']) {
  test(`fails closed on ${flag}`, async () => {
    const { cleanup, context, calls } = setup({ [flag]: true })
    context.emit('response', response())
    const report = await cleanup.cleanup()
    assert.equal(report.verified, false)
    assert.equal(report.failures, 1)
    assert.equal(calls.some(call => call.url.includes('global')), false)
    if (flag === 'badUser') assert.equal(calls.length, 1)
  })
}

test('rejects a secret API key without sending it', async () => {
  const { cleanup, context, calls } = setup()
  context.emit('response', response({ apikey: 'sb_secret_fixture' }))
  const report = await cleanup.cleanup()
  assert.equal(report.verified, false)
  assert.equal(report.captureErrors, 1)
  assert.equal(calls.length, 0)
})

test('profiles are unique to a run and cleanup preserves unrelated profiles', async () => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'smoke-profile-test-'))
  try {
    const artifacts = path.join(workspace, 'artifacts')
    await mkdir(artifacts)
    const first = await createOwnedSmokeProfile(workspace, artifacts)
    const second = await createOwnedSmokeProfile(workspace, artifacts)
    assert.notEqual(first.directory, second.directory)
    await writeFile(path.join(second.directory, 'keep.txt'), 'keep')
    await removeOwnedSmokeProfile(first)
    assert.equal(await readFile(path.join(second.directory, 'keep.txt'), 'utf8'), 'keep')
    await assert.rejects(removeOwnedSmokeProfile({ ...second, root: path.join(workspace, 'other') }), /containment/)
    await removeOwnedSmokeProfile(second)
  } finally {
    await rm(workspace, { recursive: true, force: true })
  }
})
