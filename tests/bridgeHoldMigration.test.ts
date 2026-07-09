import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(
    process.cwd(),
    'supabase/migrations/20260709215718_bridge_hold_and_session_revocation.sql',
  ),
  'utf8',
)

const compactMigration = migration.replace(/\s+/g, ' ').toLowerCase()

describe('ESP Bridge hold migration', () => {
  it('revokes live custom sessions and invalidates their token hashes', () => {
    expect(compactMigration).toContain('update public.bridge_device_sessions')
    expect(compactMigration).toContain("status = 'revoked'")
    expect(compactMigration).toContain('access_token_hash = null')
    expect(compactMigration).toContain('refresh_token_hash = null')
    expect(compactMigration).toContain("where status in ('active', 'rotating')")
  })

  it('revokes pending pairing codes and disables active device states', () => {
    expect(compactMigration).toContain('update public.bridge_pairing_codes')
    expect(compactMigration).toContain("where status = 'pending'")
    expect(compactMigration).toContain('update public.bridge_devices')
    expect(compactMigration).toContain("status = 'disabled'")
    expect(compactMigration).toContain('recovery_token_hash = null')
    expect(compactMigration).toContain("where status in ('unpaired', 'pairing_pending', 'paired')")
  })

  it('preserves lifecycle rows and avoids unsupported auth-schema writes', () => {
    expect(compactMigration).toContain("event_type, event_payload ) select affected_devices.id, affected_devices.paired_user_id, 'feature_paused'")
    expect(compactMigration).not.toMatch(/\bdelete\s+from\b/)
    expect(compactMigration).not.toMatch(/\btruncate\b/)
    expect(compactMigration).not.toContain('auth.sessions')
    expect(compactMigration).not.toContain('auth.refresh_tokens')
    expect(compactMigration).not.toContain('auth.users')
  })
})
