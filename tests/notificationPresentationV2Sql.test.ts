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
const hardeningSql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260718233000_notification_v2_rollout_hardening.sql',
  ),
  'utf8',
)
const hardeningCompact = hardeningSql.replace(/\s+/g, ' ').toLowerCase()
const workerContractSql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260720230920_notification_v2_private_token_worker_contract.sql',
  ),
  'utf8',
)
const workerContractCompact = workerContractSql.replace(/\s+/g, ' ').toLowerCase()
const richPresentationSql = readFileSync(
  path.resolve(
    process.cwd(),
    'supabase/migrations/20260721011500_rich_notification_content_and_event_sounds.sql',
  ),
  'utf8',
)
const richPresentationCompact = richPresentationSql.replace(/\s+/g, ' ').toLowerCase()
const securityContract = JSON.parse(readFileSync(
  path.resolve(process.cwd(), 'supabase/security-definer-allowlist.json'),
  'utf8',
)) as {
  private_security_definers: string[]
  required_active_table_privileges: string[]
}

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

  test('gives the delivery worker narrow service-role access to private native tokens', () => {
    expect(workerContractCompact).toContain(
      'create or replace function public.list_notification_native_delivery_tokens_v2(',
    )
    expect(workerContractCompact).toContain(
      'create or replace function public.disable_notification_native_token_v2(',
    )
    expect(workerContractCompact).toContain(
      "if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then",
    )
    expect(workerContractCompact).toContain(
      'from private.notification_native_tokens tokens',
    )
    expect(workerContractCompact).toContain(
      'update private.notification_native_tokens tokens',
    )
    expect(workerContractCompact).toContain(
      'from public, anon, authenticated',
    )
    expect(workerContractCompact).toContain('to service_role')
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
    expect(compact).toContain('using ((select auth.uid()) = user_id)')
    expect(compact).toContain('with check ((select auth.uid()) = user_id)')
  })

  test('supports owner-private event sounds with category fallback preserved', () => {
    expect(richPresentationCompact).toContain(
      'create table if not exists public.notification_event_presentation_preferences',
    )
    expect(richPresentationCompact).toContain(
      'primary key (user_id, event_type)',
    )
    expect(richPresentationCompact).toContain(
      'alter table public.notification_event_presentation_preferences enable row level security',
    )
    expect(richPresentationCompact).toContain(
      'using ((select auth.uid()) = user_id)',
    )
    expect(richPresentationCompact).toContain(
      'with check ((select auth.uid()) = user_id)',
    )
    expect(richPresentationCompact).toContain("'shadow_pin_post'")
    expect(richPresentationCompact).toContain("'shado_live_participant_removed'")
    expect(securityContract.private_security_definers).toContain(
      'private.enrich_notification_v2_event()',
    )
    expect(securityContract.required_active_table_privileges).toEqual(
      expect.arrayContaining([
        'authenticated:notification_event_presentation_preferences:SELECT',
        'authenticated:notification_event_presentation_preferences:UPDATE',
        'service_role:notification_event_presentation_preferences:SELECT',
      ]),
    )
  })

  test('enriches canonical events before v2 materialization without backfilling pushes', () => {
    expect(richPresentationCompact).toContain(
      'create trigger enrich_notification_v2_event_insert before insert on public.notification_events',
    )
    expect(richPresentationCompact).toContain('new.actor_id := actor_id_text::uuid')
    expect(richPresentationCompact).toContain("nullif(event_payload ->> 'url', '')")
    expect(richPresentationCompact).toContain("'new shadowpin from ' || actor_label")
    expect(richPresentationCompact).not.toContain('insert into public.notification_outbox_v2')
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

  test('hard-stops disabled and out-of-canary delivery before provider work', () => {
    expect(hardeningCompact).toContain(
      'add column if not exists enabled_categories text[] not null',
    )
    expect(hardeningCompact).toContain(
      'add column if not exists canary_user_ids uuid[] not null',
    )
    expect(hardeningCompact).toContain(
      'or not runtime.worker_invocation_enabled then return',
    )
    expect(hardeningCompact).toContain(
      'not (envelopes.category_key = any(runtime.enabled_categories))',
    )
    expect(hardeningCompact).toContain(
      'not (outbox.user_id = any(runtime.canary_user_ids))',
    )
    expect(hardeningCompact).toContain(
      'create trigger guard_notification_outbox_v2_insert',
    )
  })

  test('invokes the worker through Vault, pg_net, and disabled-safe cron recovery', () => {
    expect(hardeningCompact).toContain(
      "where secrets.name = 'shadowchat_notification_v2_worker_secret'",
    )
    expect(hardeningCompact).toContain("'x-shadowchat-worker-secret'")
    expect(hardeningCompact).toContain('select net.http_post(')
    expect(hardeningCompact).toContain(
      "'shadowchat-notification-v2-delivery-recovery'",
    )
    expect(hardeningCompact).toContain(
      "'shadowchat-notification-v2-receipts'",
    )
    expect(hardeningCompact).toContain(
      "and runtime.delivery_mode = 'active' and runtime.worker_invocation_enabled",
    )
  })

  test('runtime mutation is service-role RPC only and validates its Vault dependency', () => {
    expect(hardeningCompact).toContain(
      'revoke insert, update, delete on table public.notification_v2_runtime_config from service_role',
    )
    expect(hardeningCompact).toContain(
      'create or replace function public.configure_notification_v2_runtime(',
    )
    expect(hardeningCompact).toContain(
      "raise exception 'the notification v2 worker secret is not configured in vault'",
    )
    expect(hardeningCompact).toContain(
      'grant execute on function public.configure_notification_v2_runtime(',
    )
  })
})
