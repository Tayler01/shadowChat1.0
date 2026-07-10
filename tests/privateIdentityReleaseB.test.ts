import { readFileSync } from 'node:fs'
import path from 'node:path'

const read = (filePath: string) => readFileSync(path.join(process.cwd(), filePath), 'utf8')

const migration = read('supabase/migrations/20260710042548_private_identity_release_a_consumers.sql')
const compactMigration = migration.replace(/\s+/g, ' ').toLowerCase()

test('cuts profile creation over to public presentation fields before Release B', () => {
  const handleNewUser = compactMigration.slice(
    compactMigration.indexOf('create or replace function public.handle_new_user()'),
    compactMigration.indexOf('revoke all on function public.handle_new_user()')
  )
  const insertColumns = handleNewUser.match(/insert into public\.users \(([^)]+)\)/)?.[1] ?? ''

  expect(insertColumns).toContain('username')
  expect(insertColumns).toContain('display_name')
  expect(insertColumns).not.toMatch(/\bemail\b/)
  expect(insertColumns).not.toMatch(/\bfull_name\b/)
  expect(compactMigration).toContain('alter column email drop not null')
  expect(compactMigration).toContain('alter column full_name drop not null')
})

test('keeps guarded admin email sourced from auth.users', () => {
  const adminList = compactMigration.slice(
    compactMigration.indexOf('create or replace function public.list_admin_access_users()'),
    compactMigration.indexOf('revoke all on function public.list_admin_access_users()')
  )

  expect(adminList).toContain('join auth.users auth_users on auth_users.id = profiles.id')
  expect(adminList).toContain('auth_users.email::text')
  expect(adminList).not.toContain('profiles.email')
  expect(adminList).toContain('full admin role required')
})

test('AI and preserved Bridge profile upserts no longer mirror private identity', () => {
  const aiSource = read('supabase/functions/_shared/ai.ts')
  const aiUpsert = aiSource.match(/\.from\('users'\)\s+\.upsert\(\{([\s\S]*?)\}, \{ onConflict: 'id' \}\)/)?.[0] ?? ''
  const bridgeSource = read('supabase/functions/_shared/bridge.ts')
  const bridgeUpsert = bridgeSource.match(/\.from\('users'\)\s+\.upsert\(\{([\s\S]*?)\}, \{ onConflict: 'id' \}\)/)?.[0] ?? ''

  expect(aiUpsert).toContain('.upsert')
  expect(bridgeUpsert).toContain('.upsert')
  expect(aiUpsert).not.toMatch(/\bemail\s*:/)
  expect(aiUpsert).not.toMatch(/\bfull_name\s*:/)
  expect(bridgeUpsert).not.toMatch(/\bemail\s*:/)
  expect(bridgeUpsert).not.toMatch(/\bfull_name\s*:/)
})
