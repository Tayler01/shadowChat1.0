import { readFileSync } from 'fs'
import { join } from 'path'

const root = join(__dirname, '..')
const migrationSql = readFileSync(
  join(root, 'supabase/migrations/20260501233924_admin_roles_foundation.sql'),
  'utf8'
).replace(/\s+/g, ' ').toLowerCase()
const authorityCleanupSql = readFileSync(
  join(root, 'supabase/migrations/20260620121500_admin_authority_source_cleanup.sql'),
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

  it('keeps server-side authority checks on user_roles instead of the public users mirror', () => {
    const deleteAccountSource = readSource('supabase/functions/delete-account/index.ts')
      .replace(/\s+/g, ' ')
      .toLowerCase()
    const deletionWorkflow = readSource('supabase/functions/_shared/account-deletion-workflow.ts')
    const deletionSql = readSource('supabase/migrations/20261023001141_complete_account_deletion.sql')
      .replace(/\s+/g, ' ')
      .toLowerCase()

    expect(authorityCleanupSql).toContain('from public.user_roles roles')
    expect(authorityCleanupSql).toContain("roles.role in ('admin', 'sub_admin')")
    expect(authorityCleanupSql).toContain('from public.user_roles message_author_role')
    expect(authorityCleanupSql).toContain("message_author_role.role in ('admin', 'sub_admin')")
    expect(authorityCleanupSql).not.toContain('select users.admin_role')
    expect(authorityCleanupSql).not.toContain('message_author.admin_role')
    expect(authorityCleanupSql).toContain(
      'revoke all on function public.set_user_channel_bans(uuid, text[], integer, text) from public, anon, authenticated'
    )
    expect(authorityCleanupSql).toContain(
      'grant execute on function public.set_user_channel_bans(uuid, text[], integer, text) to authenticated'
    )

    // Authority is checked atomically with job creation in Postgres, rather
    // than a separate Edge read that could race a concurrent role transfer.
    expect(deleteAccountSource).toContain('runaccountdeletion')
    expect(deletionWorkflow).toContain("client.rpc('begin_account_deletion'")
    const roleLock = deletionSql.indexOf("perform 1 from public.user_roles where role = 'admin' for update")
    const adminGuard = deletionSql.indexOf("if exists (select 1 from public.user_roles where user_id = target_user_id and role = 'admin')")
    const refusal = deletionSql.indexOf("errcode = 'pt403', message = 'transfer full admin access before deleting this account.'")
    const jobInsert = deletionSql.indexOf('insert into private.account_deletion_jobs')
    expect(roleLock).toBeGreaterThan(-1)
    expect(adminGuard).toBeGreaterThan(roleLock)
    expect(refusal).toBeGreaterThan(adminGuard)
    expect(jobInsert).toBeGreaterThan(refusal)
    expect(deletionSql).not.toContain('users.admin_role')
    expect(deleteAccountSource).not.toContain("select('admin_role')")
    expect(deleteAccountSource).not.toContain(".eq('admin_role', 'admin')")
  })
})
