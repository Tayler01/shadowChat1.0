import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createBridgeAuthHoldQueryArgs,
  loadFunctionManifest,
  validateFunctionManifest,
  verifyBridgeAuthHoldQueryResult,
  verifyRemoteFunctionInventory,
} from '../scripts/deploy-supabase-functions.mjs'

test('bridge Auth hold query requests machine-readable Supabase output', () => {
  assert.deepEqual(createBridgeAuthHoldQueryArgs('select 1;'), [
    'db', 'query', '--linked', '--output', 'json', 'select 1;',
  ])
})

test('every local Edge Function has one explicit production disposition', () => {
  const manifest = validateFunctionManifest(loadFunctionManifest())
  assert.equal(manifest.active.length, 13)
  assert.equal(
    manifest.active.find(entry => entry.name === 'deliver-notifications-v2')?.verifyJwt,
    false,
  )
  assert.deepEqual(
    manifest.active
      .map(entry => entry.name)
      .filter(name => name.startsWith('shado-live-'))
      .sort(),
    ['shado-live-command', 'shado-live-provider-webhook', 'shado-live-reconcile', 'shado-live-session'],
  )
  assert.equal(manifest.pausedDeny.length, 15)
  assert.deepEqual(manifest.pausedRemove.map(entry => entry.name), ['art-board-import-image'])
})

test('bridge Auth hold verification requires zero remaining sessions', () => {
  assert.doesNotThrow(() => verifyBridgeAuthHoldQueryResult({
    rows: [{ active_sessions: 0 }],
  }))
  assert.doesNotThrow(() => verifyBridgeAuthHoldQueryResult([
    { active_sessions: 0 },
  ]))
  assert.throws(
    () => verifyBridgeAuthHoldQueryResult({ rows: [{ active_sessions: 1 }] }),
    /hold incomplete/
  )
  assert.throws(
    () => verifyBridgeAuthHoldQueryResult({ rows: [] }),
    /invalid result/
  )
  assert.throws(
    () => verifyBridgeAuthHoldQueryResult([]),
    /invalid result/
  )
})

test('remote verification rejects missing, extra, inactive, and JWT-drifted functions', () => {
  const manifest = validateFunctionManifest(loadFunctionManifest())
  const expected = [...manifest.active, ...manifest.pausedDeny]
    .map(entry => ({
      name: entry.name,
      status: 'ACTIVE',
      verify_jwt: entry.verifyJwt,
    }))

  assert.doesNotThrow(() => verifyRemoteFunctionInventory(manifest, expected))
  assert.throws(
    () => verifyRemoteFunctionInventory(manifest, expected.slice(1)),
    /Remote function drift/
  )
  assert.throws(
    () => verifyRemoteFunctionInventory(manifest, [
      ...expected,
      { name: 'stale-function', status: 'ACTIVE', verify_jwt: true },
    ]),
    /stale-function/
  )
  assert.throws(
    () => verifyRemoteFunctionInventory(manifest, expected.map((entry, index) => (
      index === 0 ? { ...entry, verify_jwt: !entry.verify_jwt } : entry
    ))),
    /verify_jwt drift/
  )
})
