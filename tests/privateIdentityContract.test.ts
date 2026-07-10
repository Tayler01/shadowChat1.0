import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { PUBLIC_PROFILE_COLUMNS, PUBLIC_PROFILE_SELECT } from '../supabase/functions/_shared/public-profile'

const root = process.cwd()
const read = (filePath: string) => readFileSync(path.join(root, filePath), 'utf8')

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap(entry => {
    const relativePath = path.join(directory, entry.name)
    if (entry.isDirectory()) return collectSourceFiles(relativePath)
    return /\.(?:ts|tsx|mjs|js)$/.test(entry.name) ? [relativePath] : []
  })

const migration = read('supabase/migrations/20260710035027_private_identity_release_a.sql')
const compactMigration = migration.replace(/\s+/g, ' ').toLowerCase()
const publicProfileFunction = compactMigration.slice(
  compactMigration.indexOf('create or replace function public.user_public_profile_json'),
  compactMigration.indexOf('revoke all on function public.user_public_profile_json')
)

describe('private identity public profile contract', () => {
  it('defines one explicit TypeScript projection without private identity columns', () => {
    expect(PUBLIC_PROFILE_COLUMNS).toContain('id')
    expect(PUBLIC_PROFILE_COLUMNS).toContain('display_name')
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain('email' as never)
    expect(PUBLIC_PROFILE_COLUMNS).not.toContain('full_name' as never)
    expect(PUBLIC_PROFILE_SELECT).not.toMatch(/\b(?:email|full_name)\b/)
  })

  it('keeps browser, active Edge, and preserved-source user embeds explicit', () => {
    const files = [
      ...collectSourceFiles('src'),
      ...collectSourceFiles('supabase/functions'),
      ...collectSourceFiles('scripts'),
    ]
    const source = files.map(filePath => read(filePath)).join('\n')

    expect(source).not.toMatch(/users![^(,\s]+\(\s*\*\s*\)/)
    expect(source).not.toMatch(/users![^(,\s]+\([^)]*\b(?:email|full_name)\b[^)]*\)/s)
    expect(source).not.toMatch(/\.from\(['"]users['"]\)[\s\S]{0,160}?\.select\(\s*['"]\*['"]\s*\)/)
  })

  it('excludes email and full_name from General Chat and DM RPC user payloads', () => {
    expect(publicProfileFunction).toContain("'display_name', profile.display_name")
    expect(publicProfileFunction).not.toMatch(/'email'\s*,/)
    expect(publicProfileFunction).not.toMatch(/'full_name'\s*,/)

    expect(compactMigration).toContain(
      'select public.user_public_profile_json(other_user_row) from public.users other_user_row'
    )
    expect(compactMigration).toContain(
      "'to_jsonb(user_row)', 'public.user_public_profile_json(user_row)'"
    )
    expect(compactMigration).not.toContain('select to_jsonb(other_user_row)')
  })

  it('keeps admin email access behind the full-admin-only RPC', () => {
    const adminMigration = read('supabase/migrations/20260501233924_admin_roles_foundation.sql')
      .replace(/\s+/g, ' ')
      .toLowerCase()
    const adminListFunction = adminMigration.slice(
      adminMigration.indexOf('create or replace function public.list_admin_access_users()'),
      adminMigration.indexOf('drop function if exists public.search_users(text)')
    )

    expect(adminListFunction).toContain(
      'if auth.uid() is null or not public.is_app_admin(auth.uid()) then'
    )
    expect(adminListFunction).toContain('users.email')
    expect(adminListFunction).toContain('security definer')
  })

  it('separates public User data from authenticated session email', () => {
    const supabaseSource = read('src/lib/supabase.ts')
    const publicUserType = supabaseSource.slice(
      supabaseSource.indexOf('export interface User {'),
      supabaseSource.indexOf('export interface AuthenticatedUser')
    )
    const authenticatedUserType = supabaseSource.slice(
      supabaseSource.indexOf('export interface AuthenticatedUser'),
      supabaseSource.indexOf('export type ChatMessageType')
    )
    const authSource = read('src/lib/auth.ts')

    expect(publicUserType).not.toMatch(/\bemail\s*:/)
    expect(authenticatedUserType).toMatch(/\bemail\s*:\s*string/)
    expect(authSource).toContain('pickPublicProfile(data as unknown as Record<string, unknown>)')
    expect(authSource).toContain('email: user.email')
    expect(authSource).not.toContain(".select('*')")
  })

  it('loads preserved bridge refresh email from Auth rather than public.users', () => {
    const bridgeRefresh = read('supabase/functions/bridge-session-refresh/index.ts')
    const seedProbe = read('scripts/group-chat-scroll-probe.mjs')

    expect(bridgeRefresh).toContain('supabase.auth.admin.getUserById(session.user_id)')
    expect(bridgeRefresh).not.toMatch(/\.from\(['"]users['"]\)[\s\S]{0,160}?\bemail\b/)
    expect(seedProbe).not.toMatch(/\.from\(['"]users['"]\)[\s\S]{0,160}?\.eq\(['"]email['"]/)
  })
})
