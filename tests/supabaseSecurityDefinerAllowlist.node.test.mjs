import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const contract = JSON.parse(readFileSync(
  new URL('../supabase/security-definer-allowlist.json', import.meta.url),
  'utf8',
))

test('SECURITY DEFINER allowlist is explicit, categorized, and duplicate-free', () => {
  assert.match(contract.reviewed_on, /^\d{4}-\d{2}-\d{2}$/)
  assert.equal(contract.expected_total_security_definers, 99)
  assert.deepEqual(contract.anon_signatures, ['is_username_available(text)'])

  const signatures = []
  for (const domain of contract.domains) {
    assert.match(domain.domain, /^[a-z0-9_]+$/)
    assert.ok(domain.justification.length >= 40, `${domain.domain} needs a concrete justification`)
    assert.ok(domain.signatures.length > 0, `${domain.domain} must list signatures`)
    signatures.push(...domain.signatures)
  }

  assert.equal(signatures.length, 71)
  assert.equal(new Set(signatures).size, signatures.length)
  assert.ok(signatures.every(signature => /^[a-z0-9_]+\(.*\)$/.test(signature)))

  for (const pausedPrefix of ['bridge_', 'create_art_board_', 'delete_art_board_', 'toggle_board_', 'toggle_news_']) {
    assert.equal(
      signatures.some(signature => signature.startsWith(pausedPrefix)),
      false,
      `paused function leaked into authenticated allowlist: ${pausedPrefix}`,
    )
  }
})
