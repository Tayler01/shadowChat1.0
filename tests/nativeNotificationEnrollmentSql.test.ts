import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const migration = readFileSync(
  join(
    process.cwd(),
    'supabase',
    'migrations',
    '20260720152414_native_notification_enrollment_ticket.sql',
  ),
  'utf8',
)

const restorationMigration = readFileSync(
  join(process.cwd(), 'supabase', 'migrations', '20260930215452_restore_native_notification_enrollment.sql'),
  'utf8',
)

describe('native notification enrollment ticket SQL', () => {
  it('creates short-lived single-use tickets for authenticated callers', () => {
    expect(migration).toMatch(/create table if not exists private\.notification_native_enrollment_tickets/i)
    expect(migration).toMatch(/resolved_expires_at timestamptz := now\(\) \+ interval '5 minutes'/i)
    expect(migration).toMatch(/tickets\.consumed_at is null/i)
    expect(migration).toMatch(/for update;/i)
    expect(migration).toMatch(
      /grant execute on function public\.create_my_native_notification_enrollment_ticket_v2\(\s*text, uuid, text, text\s*\)\s+to authenticated/i,
    )
    expect(migration).toMatch(/unique \(user_id\)/i)
    expect(migration).toMatch(/notification_installations_native_key_active_idx/i)
    expect(migration).toMatch(/caller_id uuid := auth\.uid\(\)/i)
    expect(migration).toMatch(/if caller_id is null then\s+raise exception 'Authentication required'/i)
  })

  it('allows anonymous redemption only with the bound opaque ticket', () => {
    expect(migration).toMatch(/tickets\.request_id = target_request_id/i)
    expect(migration).toMatch(/tickets\.installation_key = target_installation_key/i)
    expect(migration).toMatch(
      /tickets\.challenge_hash = pg_catalog\.encode\(\s*extensions\.digest\(target_verifier, 'sha256'\)/i,
    )
    expect(migration).toMatch(
      /tickets\.installation_credential_hash = pg_catalog\.encode\(\s*extensions\.digest\(target_installation_credential, 'sha256'\)/i,
    )
    expect(migration).toMatch(/tickets\.expires_at > now\(\)/i)
    expect(migration).toMatch(/extensions\.digest\(ticket_secret, 'sha256'\)/i)
    expect(migration).toMatch(/set\s+consumed_at = now\(\)/i)
    expect(migration).toMatch(
      /grant execute on function public\.redeem_native_notification_enrollment_ticket_v2\([\s\S]*?\) to anon;/i,
    )
  })

  it('atomically binds both the installation and provider token to the ticket owner', () => {
    expect(migration).toMatch(/private\.register_notification_installation_for_user_v2\(/i)
    expect(migration).toMatch(/private\.register_native_notification_token_for_user_v2\(/i)
    expect(migration).toMatch(/target_user_id,\s+target_installation_key/i)
    expect(migration).toMatch(/notification token belongs to another installation/i)
    expect(migration).toMatch(/'user_id', resolved_user_id/i)
    expect(migration).toMatch(/installation_credential_hash/i)
    expect(migration).toMatch(/register_native_notification_token_by_credential_v2/i)
    expect(migration).toMatch(/set_notification_installation_foreground_by_credential_v2/i)
    expect(migration).toMatch(/revoke_notification_installation_by_credential_v2/i)
  })

  it('keeps lifecycle updates bound to a live installation and hashed credential', () => {
    expect(migration).toMatch(/credentials\.user_id = installations\.user_id/i)
    expect(migration).toMatch(/installations\.revoked_at is null/i)
    expect(migration).toMatch(/credentials\.revoked_at is null/i)
    expect(migration).toMatch(/credentials\.credential_hash = pg_catalog\.encode\(\s*extensions\.digest\(target_credential, 'sha256'\)/i)
    expect(migration).toMatch(/least\(target_foreground_until, now\(\) \+ interval '2 minutes'\)/i)
    expect(migration).toMatch(/disabled_reason = 'Installation revoked'/i)
  })

  it('restores only the complete secure enrollment and lifecycle grant set', () => {
    const grants = [...restorationMigration.matchAll(
      /grant execute on function public\.([a-z0-9_]+)\(([^)]*)\)\s+to ([a-z_]+);/gi,
    )].map(([, name, args, role]) => [name, args.replace(/\s+/g, ''), role])
    expect(grants).toEqual([
      ['create_my_native_notification_enrollment_ticket_v2', 'text,uuid,text,text', 'authenticated'],
      ['redeem_native_notification_enrollment_ticket_v2', 'text,text,uuid,text,text,text,text,text,text,text,integer,text', 'anon'],
      ['register_native_notification_token_by_credential_v2', 'uuid,text,text', 'anon'],
      ['set_notification_installation_foreground_by_credential_v2', 'uuid,text,timestamptz', 'anon'],
      ['revoke_notification_installation_by_credential_v2', 'uuid,text', 'anon'],
    ])
    expect([...restorationMigration.matchAll(/from public, anon, authenticated, service_role;/gi)]).toHaveLength(5)

    // The enrollment fix must not reactivate the historical delivery machinery,
    // expose private tables/helpers or bypass the original guarded functions.
    const statements = restorationMigration.replace(/--[^\n]*/g, '')
    expect(statements).not.toMatch(/cron\.|net\.|notification_v2_runtime_config|configure_notification|collect_notification|register_my_native_notification_token_v2/i)
    expect(statements).not.toMatch(/\b(create|alter|insert|update|delete)\b|\bgrant\b[^;]*\b(private|table|schema)\b/i)
  })
})
