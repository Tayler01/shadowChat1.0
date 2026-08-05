import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  createBuildHealthManifest,
  isConfiguredWebPushPublicKey,
} from '../scripts/write-build-health-manifest.mjs'
import {
  buildReleaseHealthSnapshot,
  getFunctionManifestDigest,
} from '../scripts/record-operations-health.mjs'
import { upsertOperationsHealthSnapshot } from '../scripts/operations-health-shared.mjs'
import {
  loadFunctionManifest,
  validateFunctionManifest,
} from '../scripts/deploy-supabase-functions.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const validPushKey = `B${'a'.repeat(86)}`

const getRemoteFunctions = manifest => [
  ...manifest.active,
  ...manifest.pausedDeny,
].map(entry => ({
  name: entry.name,
  status: 'ACTIVE',
  verify_jwt: entry.verifyJwt,
}))

test('build health manifest exposes release metadata and only push readiness', () => {
  assert.equal(isConfiguredWebPushPublicKey('your_web_push_public_key'), false)
  assert.equal(isConfiguredWebPushPublicKey(validPushKey), true)
  assert.deepEqual(createBuildHealthManifest({
    VITE_APP_BUILD_ID: 'build-1',
    VITE_APP_COMMIT_SHA: 'abcdef123456',
    VITE_APP_DEPLOY_CONTEXT: 'production',
    VITE_WEB_PUSH_PUBLIC_KEY: validPushKey,
  }), {
    schemaVersion: 1,
    buildId: 'build-1',
    commitSha: 'abcdef123456',
    deployContext: 'production',
    pushPublicKeyConfigured: true,
  })
})

test('release evidence requires exact function parity and reports sanitized push gaps', () => {
  const manifest = validateFunctionManifest(loadFunctionManifest())
  const base = {
    buildManifest: {
      schemaVersion: 1,
      buildId: 'abcdef123456',
      commitSha: 'abcdef123456',
      deployContext: 'production',
      pushPublicKeyConfigured: true,
    },
    commitSha: 'abcdef123456',
    functionManifest: manifest,
    functionManifestDigest: getFunctionManifestDigest(),
    latestMigrationVersion: '20260710040257',
    netlifyDeploy: {
      deploy_id: 'deploy-1',
      deploy_url: 'https://deploy.example.test',
    },
    remoteFunctions: getRemoteFunctions(manifest),
    secretEntries: [
      { name: 'WEB_PUSH_PUBLIC_KEY' },
      { name: 'WEB_PUSH_PRIVATE_KEY' },
      { name: 'WEB_PUSH_SUBJECT' },
      { name: 'WEB_PUSH_RECOVERY_SECRET' },
    ],
    workflowUrl: 'https://github.com/example/shadowchat/actions/runs/1',
    now: new Date('2026-07-10T04:10:00.000Z'),
  }

  const snapshot = buildReleaseHealthSnapshot(base)
  assert.equal(snapshot.frontend_sha, 'abcdef123456')
  assert.equal(snapshot.migrations_current, true)
  assert.equal(snapshot.functions_current, true)
  assert.equal(snapshot.active_function_count, manifest.active.length)
  assert.equal(snapshot.paused_function_count, manifest.pausedDeny.length)
  assert.equal(snapshot.push_ready, true)
  assert.deepEqual(snapshot.push_missing_requirements, [])
  assert.equal(snapshot.news_state, 'paused')
  assert.equal(snapshot.bridge_state, 'paused')

  const missingPush = buildReleaseHealthSnapshot({
    ...base,
    buildManifest: { ...base.buildManifest, pushPublicKeyConfigured: false },
    secretEntries: [{ name: 'WEB_PUSH_PUBLIC_KEY' }],
  })
  assert.equal(missingPush.push_ready, false)
  assert.deepEqual(missingPush.push_missing_requirements, [
    'VITE_WEB_PUSH_PUBLIC_KEY',
    'WEB_PUSH_PRIVATE_KEY',
    'WEB_PUSH_SUBJECT',
    'WEB_PUSH_RECOVERY_SECRET',
  ])

  assert.throws(
    () => buildReleaseHealthSnapshot({
      ...base,
      buildManifest: { ...base.buildManifest, commitSha: 'wrong-sha' },
    }),
    /does not match release SHA/
  )
  assert.throws(
    () => buildReleaseHealthSnapshot({
      ...base,
      remoteFunctions: base.remoteFunctions.slice(1),
    }),
    /Remote function drift/
  )
})

test('health snapshot writer uses service authority without logging or returning data', async () => {
  let captured
  await upsertOperationsHealthSnapshot({
    fetchImpl: async (url, init) => {
      captured = { url: url.toString(), init }
      return new Response(null, { status: 204 })
    },
    serviceRoleKey: 'sb_secret_test',
    snapshot: { environment: 'production', smoke_status: 'passed' },
    supabaseUrl: 'https://example.supabase.co',
  })

  assert.match(captured.url, /operations_health_snapshot\?on_conflict=environment/)
  assert.equal(captured.init.headers.apikey, 'sb_secret_test')
  assert.equal(captured.init.headers.Authorization, undefined)
  assert.equal(captured.init.headers.Prefer, 'resolution=merge-duplicates,return=minimal')
})

test('operations snapshot is RLS-protected and browser roles have read-only grants', () => {
  const migration = fs.readFileSync(
    path.join(root, 'supabase', 'migrations', '20260710040257_operations_health_center.sql'),
    'utf8'
  )
  assert.match(migration, /enable row level security/i)
  assert.match(migration, /private\.is_operations_health_operator\(\(select auth\.uid\(\)\)\)/i)
  assert.match(migration, /security definer[\s\S]*set search_path = ''/i)
  assert.match(migration, /revoke all on function private\.is_operations_health_operator\(uuid\) from public, anon/i)
  assert.match(migration, /revoke all on table public\.operations_health_snapshot from public, anon, authenticated/i)
  assert.match(migration, /grant select on table public\.operations_health_snapshot to authenticated/i)
  assert.doesNotMatch(migration, /grant (?:insert|update|delete|all).*to authenticated/i)
  assert.match(migration, /never credential values/i)
})

test('release workflow records health only after backend alignment and frontend deploy', () => {
  const workflow = fs.readFileSync(
    path.join(root, '.github', 'workflows', 'netlify-production.yml'),
    'utf8'
  )
  const netlify = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8')

  assert.ok(workflow.indexOf('Apply production migrations') < workflow.indexOf('Capture backend release evidence'))
  assert.ok(workflow.indexOf('Capture backend release evidence') < workflow.indexOf('Deploy to Netlify production'))
  assert.ok(workflow.indexOf('Deploy to Netlify production') < workflow.indexOf('Record sanitized operations release evidence'))
  assert.ok(workflow.indexOf('Record sanitized operations release evidence') < workflow.indexOf('Verify and record production health'))
  assert.match(workflow, /supabase-secrets\.json"/)
  assert.match(workflow, /\$RUNNER_TEMP\/supabase-secrets\.json/)
  assert.match(netlify, /\.well-known\/shadowchat-health\.json[\s\S]*Cache-Control = "no-store, max-age=0"/)
})
