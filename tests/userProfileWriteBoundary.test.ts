import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (filePath: string) =>
  readFileSync(path.join(process.cwd(), filePath), 'utf8')

const migration = read('supabase/migrations/20260709215314_user_profile_write_boundary.sql')
  .replace(/\s+/g, ' ')
  .toLowerCase()

describe('public.users write boundary', () => {
  it('removes table-wide client privileges and grants only supported profile update columns', () => {
    expect(migration).toContain(
      'revoke all privileges on table public.users from public, anon, authenticated, service_role'
    )
    expect(migration).toContain('grant select on table public.users to authenticated')

    const updateGrant = migration.match(
      /grant update \(([^)]+)\) on table public\.users to authenticated/
    )
    expect(updateGrant).not.toBeNull()

    const grantedColumns = (updateGrant?.[1] ?? '')
      .split(',')
      .map(column => column.trim())
      .sort()

    expect(grantedColumns).toEqual([
      'avatar_thumbnail_path',
      'avatar_thumbnail_url',
      'avatar_url',
      'banner_thumbnail_path',
      'banner_thumbnail_url',
      'banner_url',
      'color',
      'display_name',
      'presence_visibility',
      'status',
      'status_message',
    ])

    for (const protectedColumn of [
      'id',
      'email',
      'username',
      'admin_role',
      'last_active',
      'checkers_crown',
      'war_sword',
      'shadow_pin_gold_pin',
      'gold_easter_egg',
      'shadow_runner_sprint_medal',
      'shadow_runner_knight_medal',
      'shadow_runner_knight_level_id',
    ]) {
      expect(grantedColumns).not.toContain(protectedColumn)
    }
  })

  it('keeps row ownership true before and after an update and disables client inserts', () => {
    expect(migration).toContain(
      'drop policy if exists "users can insert own profile" on public.users'
    )
    expect(migration).toContain('using ((select auth.uid()) = id)')
    expect(migration).toContain('with check ((select auth.uid()) = id)')
  })

  it('uses canonical user_roles for Netlify operator authorization', () => {
    const source = read('netlify/functions/_shared/shadow-pin-media.mjs')
    const operatorCheck = source.slice(
      source.indexOf('async function isOperator'),
      source.indexOf('async function assertCanMutate')
    )

    expect(operatorCheck).toContain(".from('user_roles')")
    expect(operatorCheck).toContain(".select('role')")
    expect(operatorCheck).toContain(".eq('user_id', userId)")
    expect(operatorCheck).toContain(".in('role', ['admin', 'sub_admin'])")
    expect(operatorCheck).not.toContain(".from('users')")
    expect(operatorCheck).not.toContain('admin_role')
  })
})
