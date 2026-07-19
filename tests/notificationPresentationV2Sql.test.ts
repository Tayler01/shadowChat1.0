import { readFileSync } from 'node:fs'
import path from 'node:path'

const sql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260718210000_notification_presentation_v2_foundation.sql',
  ),
  'utf8',
)
const compact = sql.replace(/\s+/g, ' ').toLowerCase()

describe('notification presentation v2 database contract', () => {
  test('ships dormant with a forward-only activation watermark', () => {
    expect(compact).toContain("delivery_mode text not null default 'disabled'")
    expect(compact).toContain("check (delivery_mode in ('disabled', 'shadow', 'active'))")
    expect(compact).toContain("values ( true, 'disabled', now() )")
    expect(compact).toContain('new.created_at >= runtime_watermark')
    expect(compact).toContain("case when runtime_mode = 'shadow' then 'shadow' else 'pending' end")
    expect(compact).toContain("if coalesce(runtime_mode, 'disabled') = 'disabled' then return new")
    expect(compact).toContain("runtime.delivery_mode in ('shadow', 'active')")
    expect(compact).toContain("'web_push', 'shadow'")
    expect(compact).toContain("tokens.provider, 'shadow'")
    expect(compact).toContain('historical outbox rows are')
    expect(compact).toContain('intentionally never created')
  })

  test('keeps the canonical event ledger authoritative', () => {
    expect(compact).toContain(
      'foreign key (event_id, user_id) references public.notification_events(id, user_id) on delete cascade',
    )
    expect(compact).toContain('and events.read_at is null')
    expect(compact).toContain('and events.resolved_at is null')
    expect(compact).toContain('and events.presentation_expires_at > now()')
    expect(compact).not.toMatch(
      /create table if not exists public\.notification_(?:envelopes|presentation_receipts)_v2[^;]+read_at/,
    )
  })

  test('keeps device tokens private and exposes only owner-scoped RPCs', () => {
    expect(compact).toContain('create table if not exists private.notification_native_tokens')
    expect(compact).toContain(
      'revoke all on table private.notification_native_tokens from public, anon, authenticated',
    )
    expect(compact).toContain(
      'create or replace function public.register_my_native_notification_token_v2(',
    )
    expect(compact).toContain('caller_id uuid := auth.uid()')
    expect(compact).toContain('if caller_id is null then')
    expect(compact).toContain(
      'grant execute on function public.register_my_native_notification_token_v2(',
    )
    expect(compact).not.toContain(
      'grant select on table private.notification_native_tokens to authenticated',
    )
    expect(compact).toContain(
      "raise exception 'notification token belongs to another installation'",
    )
    expect(compact).toContain("disabled_reason = 'installation account changed'")
    expect(compact).toContain('delete from private.notification_native_tokens tokens')
  })

  test('uses owner RLS for preferences, installations, projections, and receipts', () => {
    for (const table of [
      'notification_category_presentation_preferences',
      'notification_envelopes_v2',
      'notification_installations',
      'notification_presentation_receipts_v2',
    ]) {
      expect(compact).toContain(`alter table public.${table} enable row level security`)
    }
    expect(compact).toContain('using (auth.uid() = user_id)')
    expect(compact).toContain('with check (auth.uid() = user_id)')
  })

  test('isolates the service worker and disables unowned future producers', () => {
    expect(compact).toContain(
      "if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then",
    )
    expect(compact).toContain('for update of outbox skip locked')
    expect(compact).toContain('outbox.attempt_count < outbox.max_attempts')
    expect(compact).toContain(
      "new.type not in ('shadow_war_turn', 'weather_alert', 'security_alert')",
    )
  })
})
