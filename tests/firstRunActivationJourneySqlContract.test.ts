import fs from 'node:fs'
import path from 'node:path'

const migrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713050948_first_run_activation_journey.sql'
)
const orderMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713054113_enforce_activation_step_order.sql'
)
const definerMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713055012_move_activation_mutation_to_unexposed_definer.sql'
)
const defaultAclMigrationPath = path.resolve(
  process.cwd(),
  'supabase/migrations/20260713055523_harden_function_default_execute_privileges.sql'
)
const typesPath = path.resolve(
  process.cwd(),
  'src/features/activation/activationTypes.ts'
)

const source = fs.readFileSync(migrationPath, 'utf8')
const sql = source.toLowerCase().replace(/\s+/g, ' ')
const orderSql = fs.readFileSync(orderMigrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ')
const definerSql = fs.readFileSync(definerMigrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ')
const defaultAclSql = fs.readFileSync(defaultAclMigrationPath, 'utf8').toLowerCase().replace(/\s+/g, ' ')
const types = fs.readFileSync(typesPath, 'utf8')

describe('first-run activation journey backend source contract', () => {
  test('enrolls future genuine invite signups without backfilling existing users', () => {
    expect(sql).toContain("values ('first_run_activation_v1', clock_timestamp())")
    expect(sql).toMatch(/after insert on public\.users[\s\S]*?enroll_invite_user_activation_journey/)
    expect(sql).toMatch(/auth_user\.created_at >= rollout_started_at/)
    expect(sql).toMatch(/redemption\.redeemed_at >= rollout_started_at/)
    expect(sql).toMatch(/join private\.signup_invite_redemptions/)
    expect(sql).not.toMatch(/insert into public\.user_activation_journeys[\s\S]*?select[\s\S]*?from public\.users/)
  })

  test('keeps journey rows owner-private and direct member writes closed', () => {
    expect(sql).toContain('alter table public.user_activation_journeys enable row level security')
    expect(sql).toContain('alter table public.user_activation_journeys force row level security')
    expect(sql).toMatch(/using \(\(select auth\.uid\(\)\) = user_id\)/)
    expect(sql).toMatch(/grant select on table public\.user_activation_journeys to authenticated/)
    expect(sql).not.toMatch(/grant (insert|update|delete|all)[^;]*user_activation_journeys[^;]*authenticated/)
  })

  test('uses a bounded revision-guarded member mutation surface', () => {
    expect(sql).toContain('function public.get_my_activation_journey()')
    expect(sql).toMatch(/function public\.update_my_activation_journey\( target_expected_revision integer, target_step text, target_choice text default null \)/)
    expect(sql).toContain('current_journey.revision is distinct from target_expected_revision')
    expect(sql).toContain("using errcode = '40001'")
    expect(sql).not.toContain('function public.complete_my_activation_journey')
    expect(sql).not.toMatch(/grant execute[^;]*activation_journey[^;]*to anon/)
  })

  test('keeps the exposed mutation wrapper invoker-only and the definer unexposed', () => {
    expect(definerSql).toContain('create schema if not exists activation_private')
    expect(definerSql).toMatch(/alter function public\.update_my_activation_journey\(integer, text, text\) set schema activation_private/)
    expect(definerSql).toMatch(/create or replace function public\.update_my_activation_journey[\s\S]*?security invoker/)
    expect(definerSql).toContain('revoke all on schema activation_private from public, anon, authenticated')
    expect(definerSql).toContain('grant usage on schema activation_private to authenticated')
    expect(definerSql).not.toMatch(/grant execute[^;]*activation_journey[^;]*to anon/)
  })

  test('makes future postgres-owned function execution fail closed globally', () => {
    expect(defaultAclSql).toContain('alter default privileges for role postgres revoke execute on functions from public, anon, authenticated')
    expect(defaultAclSql).not.toContain('in schema')
  })

  test('completes only the selected canonical first action', () => {
    for (const action of ['group_message', 'direct_message', 'shadow_pin_heart']) {
      expect(sql).toContain(`'${action}'`)
    }
    expect(sql).toContain('journey.selected_first_action_kind = action_kind')
    expect(sql).toMatch(/after insert on public\.messages[\s\S]*?'group_message'/)
    expect(sql).toMatch(/after insert on public\.dm_messages[\s\S]*?'direct_message'/)
    expect(sql).toMatch(/after insert on public\.shadow_pin_image_hearts[\s\S]*?'shadow_pin_heart'/)
    expect(sql).toContain('and journey.first_action_completed_at is null')
    expect(sql).toContain('first_action_kind = selected_first_action_kind')
    expect(sql).toContain("presentation_state = 'expanded'")
    expect(sql).toMatch(/first_action[\s\S]*?identity and preferences must be completed before selecting a first action/)
  })

  test('persists resumable presentation without making install a core gate', () => {
    expect(sql).toContain("presentation_state text not null default 'expanded'")
    expect(sql).toContain("target_choice not in ('expanded', 'minimized')")
    expect(sql).toContain("when target_choice = 'minimized' then clock_timestamp()")
    expect(sql).toMatch(/completion_requires_core_steps_check[\s\S]*?identity_completed_at is not null[\s\S]*?preferences_completed_at is not null[\s\S]*?first_action_completed_at is not null/)
    expect(sql).not.toMatch(/completion_requires_core_steps_check[\s\S]*?install_completed_at is not null/)
  })

  test('enforces identity, preferences, action, and optional-install receipt order', () => {
    expect(orderSql).toContain('preferences_completed_at is null or identity_completed_at is not null')
    expect(orderSql).toMatch(/selected_first_action_kind is null or \( identity_completed_at is not null and preferences_completed_at is not null \)/)
    expect(orderSql).toContain('install_completed_at is null or completed_at is not null')
    expect(orderSql.match(/validate constraint user_activation_journeys_/g)).toHaveLength(3)
  })

  test('keeps manual RPC row and normalized application types aligned', () => {
    for (const field of [
      'selected_first_action_kind',
      'presentation_state',
      'dismissed_at',
      'notification_choice',
      'first_action_completed_at',
      'current_step',
      'revision',
    ]) {
      expect(types).toContain(field)
    }
    for (const field of [
      'selectedFirstActionKind',
      'presentationState',
      'dismissedAt',
      'notificationChoice',
      'firstActionCompletedAt',
      'currentStep',
    ]) {
      expect(types).toContain(field)
    }
  })
})
