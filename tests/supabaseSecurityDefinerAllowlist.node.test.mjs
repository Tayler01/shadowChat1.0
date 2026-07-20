import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { parseSupabaseQueryRows } from '../scripts/supabase-query-output.mjs'

const contract = JSON.parse(readFileSync(
  new URL('../supabase/security-definer-allowlist.json', import.meta.url),
  'utf8',
))
const linkedGrantCleanupSql = readFileSync(
  new URL('../supabase/migrations/20260710141315_revoke_unreviewed_active_table_grants.sql', import.meta.url),
  'utf8',
)

test('Supabase query rows support both CI and agent-safe JSON output', () => {
  const rows = [{ signature: 'example()' }]

  assert.deepEqual(parseSupabaseQueryRows(JSON.stringify(rows)), rows)
  assert.deepEqual(parseSupabaseQueryRows(JSON.stringify({
    boundary: 'test-boundary',
    rows,
    warning: 'untrusted database output',
  })), rows)
  assert.throws(
    () => parseSupabaseQueryRows(JSON.stringify({ result: rows })),
    /did not contain a row array/,
  )
})

test('linked active-table grant cleanup removes only reviewed historical extras', () => {
  assert.match(
    linkedGrantCleanupSql,
    /revoke delete on table public\.dm_conversations from authenticated/i,
  )
  assert.match(
    linkedGrantCleanupSql,
    /revoke delete on table public\.notification_preferences from authenticated/i,
  )
  assert.doesNotMatch(linkedGrantCleanupSql, /revoke\s+(select|insert|update)/i)
})

test('SECURITY DEFINER allowlist is explicit, categorized, and duplicate-free', () => {
  assert.match(contract.reviewed_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.deepEqual(contract.anon_signatures, [
    'is_username_available(text)',
    'redeem_native_notification_enrollment_ticket_v2(text,text,uuid,text,text,text,text,text,text,text,integer,text)',
    'register_native_notification_token_by_credential_v2(uuid,text,text)',
    'revoke_notification_installation_by_credential_v2(uuid,text)',
    'set_notification_installation_foreground_by_credential_v2(uuid,text,timestamp with time zone)',
  ])
  assert.equal(new Set(contract.internal_signatures).size, contract.internal_signatures.length)
  assert.ok(contract.internal_signatures.every(signature => /^[a-z0-9_]+\(.*\)$/.test(signature)))
  assert.equal(new Set(contract.private_security_definers).size, contract.private_security_definers.length)
  assert.ok(contract.private_security_definers.every(signature => /^[a-z0-9_]+\.[a-z0-9_]+\(.*\)$/.test(signature)))
  assert.equal(new Set(contract.unexposed_security_definers).size, contract.unexposed_security_definers.length)
  assert.ok(contract.unexposed_security_definers.every(signature => /^[a-z0-9_]+\.[a-z0-9_]+\(.*\)$/.test(signature)))

  const signatures = []
  for (const domain of contract.domains) {
    assert.match(domain.domain, /^[a-z0-9_]+$/)
    assert.ok(domain.justification.length >= 40, `${domain.domain} needs a concrete justification`)
    assert.ok(domain.signatures.length > 0, `${domain.domain} must list signatures`)
    signatures.push(...domain.signatures)
  }

  assert.equal(new Set(signatures).size, signatures.length)
  assert.ok(signatures.every(signature => /^[a-z0-9_]+\(.*\)$/.test(signature)))
  assert.equal(
    new Set([...signatures, ...contract.anon_signatures, ...contract.internal_signatures]).size,
    contract.expected_total_security_definers,
  )
  assert.equal(
    new Set(contract.required_active_table_privileges).size,
    contract.required_active_table_privileges.length,
  )
  assert.deepEqual(contract.authenticated_users_update_columns, [
    'avatar_thumbnail_path',
    'avatar_thumbnail_url',
    'avatar_url',
    'banner_thumbnail_path',
    'banner_thumbnail_url',
    'banner_url',
    'color',
    'display_name',
    'presence_visibility',
    'status',
    'status_message',
  ])

  for (const pausedPrefix of ['bridge_', 'create_art_board_', 'delete_art_board_', 'toggle_board_', 'toggle_news_']) {
    assert.equal(
      signatures.some(signature => signature.startsWith(pausedPrefix)),
      false,
      `paused function leaked into authenticated allowlist: ${pausedPrefix}`,
    )
  }
})
