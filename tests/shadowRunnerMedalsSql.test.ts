import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260615183000_shadow_runner_medals.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()

describe('Shadow Runner medals migration contract', () => {
  it('adds public medal flags and a private completion source of truth', () => {
    expect(compactSql).toContain('add column if not exists shadow_runner_sprint_medal boolean not null default false')
    expect(compactSql).toContain('add column if not exists shadow_runner_knight_medal boolean not null default false')
    expect(compactSql).toContain('create table if not exists public.shadow_runner_level_catalog')
    expect(compactSql).toContain('create table if not exists public.shadow_runner_level_completions')
    expect(compactSql).toContain('primary key (user_id, level_id)')
    expect(compactSql).toContain('alter table public.shadow_runner_level_completions enable row level security')
  })

  it('seeds Bell Tower as the current hardest available route', () => {
    expect(compactSql).toContain("('tutorial', 0, 'tutorial run', 0, true, true, false)")
    expect(compactSql).toContain("('level-4', 4, 'bell tower archives', 4, false, true, true)")
    expect(compactSql).toContain("('level-5', 5, 'candle fair ruins', 5, false, false, true)")
  })

  it('recalculates medals when completions or level availability change', () => {
    expect(compactSql).toContain('create or replace function private.refresh_shadow_runner_medals_for_user')
    expect(compactSql).toContain('create or replace function private.refresh_shadow_runner_medals()')
    expect(compactSql).toContain('create trigger shadow_runner_sync_medals_on_completion')
    expect(compactSql).toContain('create trigger shadow_runner_sync_medals_on_catalog')
    expect(compactSql).toContain('after insert or update of medal_rank, is_tutorial, is_available, is_medal_candidate or delete')
  })

  it('records authenticated completions only for available known levels', () => {
    expect(compactSql).toContain('create or replace function public.record_shadow_runner_level_completion')
    expect(compactSql).toContain('current_user_id uuid := auth.uid()')
    expect(compactSql).toContain("raise exception 'unknown shadow runner level: %'")
    expect(compactSql).toContain("raise exception 'shadow runner level is not available yet: %'")
    expect(compactSql).toContain('grant execute on function public.record_shadow_runner_level_completion')
  })

  it('extends user search results with Shadow Runner medal fields', () => {
    expect(compactSql).toContain('shadow_runner_sprint_medal boolean')
    expect(compactSql).toContain('shadow_runner_knight_medal boolean')
    expect(compactSql).toContain('shadow_runner_knight_level_id text')
    expect(compactSql).toContain('users.shadow_runner_sprint_medal')
    expect(compactSql).toContain('users.shadow_runner_knight_medal')
  })
})
