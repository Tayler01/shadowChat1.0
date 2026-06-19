import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260619115100_restore_shadow_pin_gold_pin_eligibility.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('Shadow Pin gold pin eligibility migration contract', () => {
  it('keeps the media-aware score refresh and excludes the full admin from the rotating winner', () => {
    expect(compactSql).toContain('create or replace function private.refresh_shadow_pin_scores()')
    expect(compactSql).toContain("images.media_type = 'image' or images.processing_status = 'ready'")
    expect(compactSql).toContain('join public.users users on users.id = scores.user_id and users.admin_role is distinct from')
    expect(compactSql).toContain("'admin'")
    expect(compactSql).toContain('set shadow_pin_gold_pin = (champion_id is not null and users.id = champion_id)')
  })

  it('refreshes the current badge assignment when the migration runs', () => {
    expect(compactSql).toContain('select private.refresh_shadow_pin_scores()')
  })
})
