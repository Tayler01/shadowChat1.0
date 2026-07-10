import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const read = relativePath => readFileSync(path.join(root, relativePath), 'utf8')
const compact = source => source.replace(/\s+/g, ' ').toLowerCase()
const migrationName = readdirSync(path.join(root, 'supabase/migrations'))
  .find(name => name.endsWith('_edge_request_limits_and_ai_ledger.sql'))

test('edge request SQL uses conditional updates and lease-owned completion', () => {
  assert.ok(migrationName, 'Supabase CLI migration is missing')
  const source = compact(read(`supabase/migrations/${migrationName}`))

  assert.match(source, /buckets\.request_count <= request_limit - request_cost/)
  assert.match(source, /buckets\.window_started_at < bucket_started_at/)
  assert.match(source, /on conflict on constraint edge_request_claims_pkey do update/)
  assert.match(source, /and claims\.claim_token = complete_edge_request_claim\.claim_token/)
  assert.match(source, /and claims\.claim_status = 'processing'/)
  assert.match(source, /revoke all on table private\.edge_request_claims from public, anon, authenticated, service_role/)
})

test('manual JWT dispositions remain explicit and unchanged for mixed-auth functions', () => {
  const config = compact(read('supabase/config.toml'))
  for (const functionName of ['openai-chat', 'link-preview', 'shadow-pin-video', 'send-push', 'delete-account']) {
    assert.match(
      config,
      new RegExp(`\\[functions\\.${functionName}\\] verify_jwt = false`),
      `${functionName} lost its explicit manual-token-validation contract`,
    )
  }
})

test('delete-account remains exempt and Bridge gates remain before side effects', () => {
  const deleteAccount = compact(read('supabase/functions/delete-account/index.ts'))
  assert.doesNotMatch(deleteAccount, /edge-guard|consumeedgeratelimit|claimedgerequest/)

  const functionRoot = path.join(root, 'supabase/functions')
  const bridgeFunctions = readdirSync(functionRoot, { withFileTypes: true })
    .filter(entry => entry.isDirectory() && entry.name.startsWith('bridge-'))
    .map(entry => entry.name)

  for (const functionName of bridgeFunctions) {
    const source = compact(read(`supabase/functions/${functionName}/index.ts`))
    const handler = source.slice(source.indexOf('serve(async req =>'))
    const gate = handler.indexOf('requirebridgeapienabled()')
    const sideEffects = [
      handler.indexOf('await readjson'),
      handler.indexOf('authenticaterequest('),
      handler.indexOf('authenticatebridgeaccesstoken('),
      handler.indexOf('getsupabaseadmin('),
      handler.indexOf('await fetch('),
      handler.indexOf(".from('") ,
      handler.indexOf('.rpc('),
    ].filter(index => index >= 0)

    assert.ok(gate >= 0, `${functionName} is missing the pause gate`)
    assert.ok(sideEffects.length > 0, `${functionName} has no contract side-effect marker`)
    assert.ok(gate < Math.min(...sideEffects), `${functionName} performs work before the pause gate`)
  }
})
