import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260608183000_automation_approval_queue.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('automation approval queue migration contract', () => {
  it('creates queue packet and append-only event tables', () => {
    expect(compactSql).toContain('create table if not exists public.automation_approval_packets')
    expect(compactSql).toContain('create table if not exists public.automation_approval_packet_events')
    expect(compactSql).toContain("packet_type in ('scan', 'build', 'docs', 'batch_review')")
    expect(compactSql).toContain("status in ('pending', 'approved', 'rejected', 'archived', 'ready_for_review')")
    expect(compactSql).toContain('source_key text unique')
    expect(compactSql).toContain('redacted_logs jsonb not null default')
  })

  it('limits table access to full-admin read policies and no direct browser writes', () => {
    expect(compactSql).toContain('alter table public.automation_approval_packets enable row level security')
    expect(compactSql).toContain('alter table public.automation_approval_packet_events enable row level security')
    expect(compactSql).toContain('create policy "full admins can read automation approval packets"')
    expect(compactSql).toContain('create policy "full admins can read automation approval packet events"')
    expect(compactSql).toContain('using (public.is_app_admin((select auth.uid())))')
    expect(compactSql).toContain('revoke all on table public.automation_approval_packets from anon, authenticated')
    expect(compactSql).toContain('revoke all on table public.automation_approval_packet_events from anon, authenticated')
    expect(compactSql).toContain('grant select on table public.automation_approval_packets to authenticated')
    expect(compactSql).toContain('grant select on table public.automation_approval_packet_events to authenticated')
    expect(compactSql).not.toContain('for insert')
    expect(compactSql).not.toContain('for delete')
  })

  it('requires full admins for every transition rpc', () => {
    expect(compactSql).toContain('create or replace function public.approve_automation_approval_packet(p_packet_id uuid)')
    expect(compactSql).toContain('create or replace function public.reject_automation_approval_packet(')
    expect(compactSql).toContain('create or replace function public.archive_automation_approval_packet(p_packet_id uuid)')
    expect(compactSql).toContain('security definer')
    expect(compactSql).toContain('set search_path = public')
    expect(compactSql).toContain('actor_user_id uuid := auth.uid()')
    expect(compactSql).toContain('actor_user_id is null or not public.is_app_admin(actor_user_id)')
    expect(compactSql).toContain('for update')
  })

  it('records audit events and avoids executor behavior in v1', () => {
    expect(compactSql).toContain("values (target_packet.id, 'approved'")
    expect(compactSql).toContain("values ( target_packet.id, 'rejected'")
    expect(compactSql).toContain("values (target_packet.id, 'archived'")
    expect(compactSql).not.toContain('pg_notify')
    expect(compactSql).not.toContain('net.http_post')
    expect(compactSql).not.toContain('cron.schedule')
  })

  it('resets broad rpc grants before assigning authenticated execute access', () => {
    expect(compactSql).toContain('revoke all on function public.approve_automation_approval_packet(uuid) from public')
    expect(compactSql).toContain('revoke all on function public.reject_automation_approval_packet(uuid, text) from public')
    expect(compactSql).toContain('revoke all on function public.archive_automation_approval_packet(uuid) from public')
    expect(compactSql).toContain('grant execute on function public.approve_automation_approval_packet(uuid) to authenticated')
    expect(compactSql).toContain('grant execute on function public.reject_automation_approval_packet(uuid, text) to authenticated')
    expect(compactSql).toContain('grant execute on function public.archive_automation_approval_packet(uuid) to authenticated')
  })
})
