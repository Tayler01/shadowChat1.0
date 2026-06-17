import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const migrationSql = readFileSync(
  join(root, 'supabase/migrations/20260501233924_admin_roles_foundation.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()

const readSource = (path: string) => readFileSync(join(root, path), 'utf8')

describe('admin role authority contract', () => {
  it('keeps public.users.admin_role as a display mirror, not a client-writable authority source', () => {
    expect(migrationSql).toContain('revoke update (admin_role) on public.users from anon, authenticated')
    expect(migrationSql).toContain('create or replace function public.sync_user_admin_role()')
    expect(migrationSql).toContain('security definer')
    expect(migrationSql).toContain('create trigger sync_user_admin_role_on_user_roles')
  })

  it('uses the RPC-backed admin access hook for current-user operator controls', () => {
    const authoritySurfaces = [
      'src/components/profile/PublicProfileDialog.tsx',
      'src/components/chat/MessageItem.tsx',
      'src/components/art/ArtBoard.tsx',
      'src/features/shadow-pin/ShadowPin.tsx',
    ]

    for (const path of authoritySurfaces) {
      expect(readSource(path)).toContain('useAdminAccess')
    }
  })
})
