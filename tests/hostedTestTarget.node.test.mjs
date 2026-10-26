import test from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import {
  SHADOWCHAT_PRODUCTION_PROJECT,
  parseHostedTestTarget,
  validateDisposableBranch,
  validateHostedTestKeys,
  validateBootstrapReceipt,
  loadHostedTestTarget,
} from '../scripts/hosted-test-target.mjs'
import { createStagedFixture, stagedBrowserPaths } from '../scripts/streamlined-staged-fixture.mjs'

const project = 'abcdefghijklmnopqrst'
const branchId = '28082276-7003-40e5-b6cf-478fc8b76336'
const args = ['--execute', `--project-ref=${project}`, `--parent-project-ref=${SHADOWCHAT_PRODUCTION_PROJECT}`, `--branch-id=${branchId}`, '--bootstrap-receipt=fixture.json']
const target = parseHostedTestTarget(args)
const branch = { id: branchId, project_ref: project, parent_project_ref: SHADOWCHAT_PRODUCTION_PROJECT,
  name: 'synthetic-test', is_default: false, with_data: false, persistent: false, status: 'FUNCTIONS_DEPLOYED' }
const key = (ref, role) => `fixture.${Buffer.from(JSON.stringify({ ref, role })).toString('base64url')}.not-a-real-key`
const keys = ['anon', 'service_role'].map(role => ({ name: role, api_key: key(project, role) }))
const migrations = { 'supabase/migrations/20261023001140_fixture.sql': 'a'.repeat(64) }
const receipt = {
  schemaVersion: 1, purpose: 'streamlined-staged-acceptance', projectRef: project,
  parentProjectRef: SHADOWCHAT_PRODUCTION_PROJECT, branchId, ready: true,
  verifiedAt: new Date().toISOString(), isolation: { dispatchersDisabled: true, cronDisabled: true, noProductionData: true },
  migrations: Object.entries(migrations).map(([file, sha256]) => ({ file, sha256 })),
  functions: ['delete-account', 'moderation-media', 'shadow-pin-video'].map(name => ({ name, version: 1, status: 'ACTIVE' })),
}

test('requires explicit execution, project, parent and branch; never uses linked/env defaults', () => {
  for (let index = 0; index < args.length; index += 1) {
    assert.throws(() => parseHostedTestTarget(args.filter((_value, position) => position !== index)))
  }
  assert.throws(() => parseHostedTestTarget([...args, `--project-ref=${project}`]), /Exactly one/)
  assert.throws(() => parseHostedTestTarget(args.map(value => value.startsWith('--project-ref=') ? `--project-ref=${SHADOWCHAT_PRODUCTION_PROJECT}` : value)), /Production/)
  assert.throws(() => parseHostedTestTarget(args.map(value => value.startsWith('--parent-project-ref=') ? `--parent-project-ref=${project}` : value)), /parent/)
  assert.throws(() => parseHostedTestTarget(args.map(value => value.startsWith('--branch-id=') ? '--branch-id=main' : value)), /branch ID/)
})

test('accepts only an existing exact no-data ephemeral branch after bootstrap', () => {
  assert.deepEqual(validateDisposableBranch(target, [branch]), { id: branchId, name: 'synthetic-test', parentProject: SHADOWCHAT_PRODUCTION_PROJECT })
  assert.throws(() => validateDisposableBranch(target, []), /still exist/)
  assert.throws(() => validateDisposableBranch(target, [branch, branch]), /still exist/)
  for (const invalid of [
    { project_ref: SHADOWCHAT_PRODUCTION_PROJECT }, { parent_project_ref: project },
    { is_default: true }, { with_data: true }, { with_data: undefined },
    { persistent: true }, { persistent: undefined },
  ]) assert.throws(() => validateDisposableBranch(target, [{ ...branch, ...invalid }]))
  assert.doesNotThrow(() => validateDisposableBranch(target, [{ ...branch, status: 'MIGRATIONS_FAILED' }]))
})

test('readiness requires a fresh exact source-bound staged receipt, independently of historical branch status', () => {
  assert.equal(validateBootstrapReceipt(target, receipt, migrations).migrationCount, 1)
  for (const invalid of [
    { purpose: 'baseline-bootstrap' }, { ready: false }, { projectRef: SHADOWCHAT_PRODUCTION_PROJECT },
    { branchId: 'another-branch' }, { parentProjectRef: project }, { verifiedAt: 'invalid' },
    { verifiedAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() },
    { verifiedAt: new Date(Date.now() + 60_000).toISOString() },
    { isolation: { ...receipt.isolation, cronDisabled: false } }, { migrations: [] },
    { migrations: [{ ...receipt.migrations[0], sha256: 'b'.repeat(64) }] },
    { functions: receipt.functions.slice(1) }, { functions: receipt.functions.map(entry => ({ ...entry, version: 0 })) },
  ]) assert.throws(() => validateBootstrapReceipt(target, { ...receipt, ...invalid }, migrations))
})

test('API keys must be bound to the disposable project and their declared roles', () => {
  assert.deepEqual(validateHostedTestKeys(target, keys), { anonKey: keys[0].api_key, serviceKey: keys[1].api_key })
  assert.deepEqual(validateHostedTestKeys(target, { api_keys: keys }), { anonKey: keys[0].api_key, serviceKey: keys[1].api_key })
  for (const invalid of [
    [], [{ ...keys[0], api_key: 'not-a-jwt' }, keys[1]],
    [{ ...keys[0], api_key: key(SHADOWCHAT_PRODUCTION_PROJECT, 'anon') }, keys[1]],
    [{ ...keys[0], api_key: key(project, 'service_role') }, keys[1]],
    [keys[0], { ...keys[1], api_key: key(SHADOWCHAT_PRODUCTION_PROJECT, 'service_role') }],
  ]) assert.throws(() => validateHostedTestKeys(target, invalid))
})

test('lookup reads authoritative branch metadata before requesting any scoped API keys', () => {
  const calls = []
  const loaded = loadHostedTestTarget(args, (_command, parameters, options) => {
    calls.push(parameters)
    assert.deepEqual(options.stdio, ['ignore', 'pipe', 'pipe'])
    assert.equal(options.timeout, 30_000)
    return JSON.stringify(calls.length === 1 ? [branch] : keys)
  }, { receipt, migrations })
  assert.equal(loaded.project, project)
  assert.deepEqual(calls, [
    ['branches', 'list', '--project-ref', SHADOWCHAT_PRODUCTION_PROJECT, '--output', 'json'],
    ['projects', 'api-keys', '--project-ref', project, '--output', 'json'],
  ])
})

test('a deleted branch stops before key lookup and CLI errors cannot print captured secrets', () => {
  let calls = 0
  assert.throws(() => loadHostedTestTarget(args, () => { calls += 1; return '[]' }), /still exist/)
  assert.equal(calls, 1)
  assert.throws(() => loadHostedTestTarget(args, () => { throw new Error('sensitive stdout: service-key') }), error => {
    assert(!error.message.includes('service-key'))
    assert.equal(error.cause, undefined)
    return true
  })
})

test('staged UI requires an independent loopback preview and artifact directory', () => {
  const valid = ['--base-url=http://127.0.0.1:4185', '--build-root=output/privacy/staged-ui/build']
  assert.deepEqual(stagedBrowserPaths(valid), { baseUrl: 'http://127.0.0.1:4185', buildRoot: path.resolve('output/privacy/staged-ui/build') })
  for (const origin of ['http://127.0.0.1:4175', 'https://shadochat.online', 'http://localhost:4185', 'http://127.0.0.1:4185/?unexpected=true']) {
    assert.throws(() => stagedBrowserPaths([`--base-url=${origin}`, valid[1]]))
  }
  for (const build of ['dist', 'apps/streamlined/dist', 'apps/streamlined/dist-local-preview', 'output/privacy/../../dist']) {
    assert.throws(() => stagedBrowserPaths([valid[0], `--build-root=${build}`]))
  }
  assert.throws(() => stagedBrowserPaths([...valid, '--local-preview']), /real membership gate/)
})

test('uncertain Auth creation never reports verified fixture cleanup', async () => {
  const fixture = createStagedFixture({ ...target, serviceKey: 'fixture', anonKey: 'fixture-public' }, {
    clientFactory: () => ({ auth: { admin: { createUser: async () => { throw new TypeError('Network outcome unknown') } } } }),
  })
  await assert.rejects(fixture.prepare(), /outcome unknown/)
  const cleanup = await fixture.cleanup()
  assert.equal(cleanup.verified, false)
  assert.equal(fixture.state.pendingAuthCreations.length, 1)
  assert.equal(cleanup.failures.length, 1)
  assert.match(cleanup.failures[0], /branch removal is required/)
})

test('partial fixture cleanup removes only exact acknowledged synthetic users and retains uncertainty', async () => {
  let creations = 0
  const deleted = []
  const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'
  const admin = {
    from: () => ({ upsert: async () => ({ data: null, error: null }) }),
    auth: { admin: {
      createUser: async () => {
        if (++creations === 2) throw new TypeError('Network outcome unknown')
        return { data: { user: { id } }, error: null }
      },
      deleteUser: async value => { deleted.push(value); return { data: {}, error: null } },
      getUserById: async () => ({ data: { user: null }, error: new Error('not found') }),
    } },
  }
  const member = { auth: {
    signInWithPassword: async () => ({ data: { user: { id }, session: { access_token: 'fixture-token', refresh_token: 'fixture-refresh' } }, error: null }),
    signOut: async () => ({}),
  } }
  const fixture = createStagedFixture({ ...target, serviceKey: 'fixture-admin', anonKey: 'fixture-public' }, {
    clientFactory: (_url, key) => key === 'fixture-admin' ? admin : member,
  })
  await assert.rejects(fixture.prepare(), /outcome unknown/)
  const cleanup = await fixture.cleanup()
  assert.deepEqual(deleted, [id])
  assert.equal(cleanup.verified, false)
})
