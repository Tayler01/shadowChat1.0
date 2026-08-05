import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(
  path.join(root, 'netlify', 'functions', 'notification-recovery.mjs'),
  'utf8'
)
const netlifyConfig = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8')

test('production Web Push recovery is scheduled, bounded, server-authenticated, and kill-switchable', () => {
  assert.match(source, /schedule:\s*'\* \* \* \* \*'/)
  assert.match(
    netlifyConfig,
    /\[functions\."notification-recovery"\]\s*schedule\s*=\s*"\* \* \* \* \*"/,
  )
  assert.match(source, /WEB_PUSH_RECOVERY_ENABLED/)
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/)
  assert.match(source, /Authorization:\s*`Bearer \$\{serviceRoleKey\}`/)
  assert.match(source, /apikey:\s*serviceRoleKey/)
  assert.match(source, /missingEnvironment\.join/)
  assert.match(source, /AbortSignal\.timeout\(25_000\)/)
  assert.doesNotMatch(source, /WEB_PUSH_RECOVERY_SECRET/)
})
