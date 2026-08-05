import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const migration = fs.readFileSync(
  path.join(
    root,
    'supabase',
    'migrations',
    '20260805135200_enable_bounded_web_push_recovery_cron.sql'
  ),
  'utf8'
)
const netlifyConfig = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8')

test('production Web Push recovery uses one bounded Vault-authenticated Supabase cron', () => {
  assert.doesNotMatch(netlifyConfig, /notification-recovery/)
  assert.match(migration, /create or replace function private\.request_web_push_recovery\(\)/)
  assert.match(migration, /shadowchat_web_push_recovery_url/)
  assert.match(migration, /shadowchat_web_push_recovery_secret/)
  assert.match(migration, /'x-shadowchat-recovery-secret', recovery_secret/)
  assert.match(migration, /'type', 'notification_delivery_recovery'/)
  assert.match(migration, /timeout_milliseconds := 25000/)
  assert.match(migration, /'shadowchat-web-push-recovery'/)
  assert.match(migration, /'\* \* \* \* \*'/)
  assert.doesNotMatch(migration, /(from|join)\s+net\._http_response/i)
  assert.doesNotMatch(migration, /collect_notification/)
})
