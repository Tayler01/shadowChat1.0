import assert from 'node:assert/strict'
import test from 'node:test'

import {
  loadFunctionManifest,
  validateFunctionManifest,
  verifyBridgeAuthHoldQueryResult,
  verifyRemoteFunctionInventory,
} from '../scripts/deploy-supabase-functions.mjs'

test('every local Edge Function has one explicit production disposition', () => {
  const manifest = validateFunctionManifest(loadFunctionManifest())
  assert.equal(manifest.active.length, 8)
  assert.equal(manifest.pausedDeny.length, 15)
  assert.deepEqual(manifest.pausedRemove.map(entry => entry.name), ['art-board-import-image'])
})

test('bridge Auth hold verification requires zero remaining sessions', () => {
  assert.doesNotThrow(() => verifyBridgeAuthHoldQueryResult({
    rows: [{ active_sessions: 0 }],
  }))
  assert.throws(
    () => verifyBridgeAuthHoldQueryResult({ rows: [{ active_sessions: 1 }] }),
    /hold incomplete/
  )
  assert.throws(
    () => verifyBridgeAuthHoldQueryResult({ rows: [] }),
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
