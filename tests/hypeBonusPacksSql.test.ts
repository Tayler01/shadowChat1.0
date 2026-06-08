import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260608200000_bonus_hype_packs.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('bonus Hype packs migration contract', () => {
  it('adds an expiring per-user bonus grant ledger', () => {
    expect(compactSql).toContain('create table if not exists public.hype_bonus_grants')
    expect(compactSql).toContain('user_id uuid not null references public.users(id) on delete cascade')
    expect(compactSql).toContain('amount integer not null check (amount > 0)')
    expect(compactSql).toContain('used_count integer not null default 0 check (used_count >= 0)')
    expect(compactSql).toContain('expires_at timestamptz not null')
    expect(compactSql).toContain('constraint hype_bonus_grants_used_not_over_amount check (used_count <= amount)')
    expect(compactSql).toContain('alter table public.hype_bonus_grants enable row level security')
  })

  it('reports bonus availability alongside the normal daily allowance', () => {
    expect(compactSql).toContain('create or replace function public.hype_bonus_available(target_user_id uuid default auth.uid())')
    expect(compactSql).toContain('grants.expires_at > now()')
    expect(compactSql).toContain('grants.used_count < grants.amount')
    expect(compactSql).toContain('greatest(0, 2 - public.hype_uses_today(auth.uid())) + public.hype_bonus_available(auth.uid()) as remaining')
    expect(compactSql).toContain('2 as limit_per_day')
  })

  it('allows Hype when daily allowance is spent only if a bonus credit exists', () => {
    expect(compactSql).toContain('create or replace function public.ensure_can_use_hype(current_user_id uuid)')
    expect(compactSql).toContain('public.hype_uses_today(current_user_id) >= 2')
    expect(compactSql).toContain('and public.hype_bonus_available(current_user_id) <= 0')
    expect(compactSql).toContain("raise exception 'you have used both hype actions for today. hype resets at midnight et.'")
  })

  it('consumes a bonus credit only after the daily allowance has been used', () => {
    expect(compactSql).toContain('create or replace function public.consume_hype_bonus(current_user_id uuid)')
    expect(compactSql).toContain('for update skip locked')
    expect(compactSql).toContain('used_count = used_count + 1')
    expect(compactSql).toContain('should_consume_bonus := public.hype_uses_today(current_user_id) >= 2')
    expect(compactSql).toContain('if should_consume_bonus and not public.consume_hype_bonus(current_user_id) then')
    expect(compactSql).toContain("'credit_source', case when should_consume_bonus then 'bonus' else 'daily' end")
  })
})
