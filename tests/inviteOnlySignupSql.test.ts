import { readFileSync } from 'node:fs'
import path from 'node:path'

const migration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260602012149_invite_only_signup_auth.sql'),
  'utf8'
)
const grantMigration = readFileSync(
  path.join(process.cwd(), 'supabase/migrations/20260602013640_lock_signup_invite_rpc_acl.sql'),
  'utf8'
)

const compactSql = migration.replace(/\s+/g, ' ').toLowerCase()
const compactGrantSql = grantMigration.replace(/\s+/g, ' ').toLowerCase()

describe('invite-only signup migration contract', () => {
  it('keeps invite storage private and hash-only', () => {
    expect(compactSql).toContain('create table if not exists private.signup_invites')
    expect(compactSql).toContain('code_hash text not null unique')
    expect(compactSql).toContain("check (code_hash ~ '^[a-f0-9]{64}$')")
    expect(compactSql).toContain('revoke all on table private.signup_invites from public, anon, authenticated')
    expect(compactSql).toContain('revoke all on table private.signup_invite_redemptions from public, anon, authenticated')
    expect(compactSql).not.toContain('invite_code text not null')
  })

  it('rejects missing, invalid, revoked, reused, expired, and wrong-email invite codes in the auth hook', () => {
    expect(compactSql).toContain('a valid invite code is required to sign up.')
    expect(compactSql).toContain('invite code is invalid.')
    expect(compactSql).toContain('invite code has been revoked.')
    expect(compactSql).toContain('invite code has already been used.')
    expect(compactSql).toContain('invite code has expired.')
    expect(compactSql).toContain('invite code is locked to a different email address.')
  })

  it('limits hook execution to Supabase auth admin and strips invite metadata after signup', () => {
    expect(compactSql).toContain('revoke all on function private.validate_signup_invite_for_auth_hook(jsonb) from public, anon, authenticated')
    expect(compactSql).toContain('grant execute on function private.validate_signup_invite_for_auth_hook(jsonb) to supabase_auth_admin')
    expect(compactSql).toContain('revoke all on function public.hook_validate_signup_invite(jsonb) from public, anon, authenticated')
    expect(compactSql).toContain('grant execute on function public.hook_validate_signup_invite(jsonb) to supabase_auth_admin')
    expect(compactSql).toContain("new.raw_user_meta_data := coalesce(new.raw_user_meta_data, '{}'::jsonb) - 'invite_code' - 'invitecode' - 'signup_invite_code'")
  })

  it('requires operator authorization inside public invite administration RPCs', () => {
    expect(compactSql).toContain('create or replace function public.create_signup_invite')
    expect(compactSql).toContain('create or replace function public.revoke_signup_invite')
    expect(compactSql).toContain('create or replace function public.list_signup_invites')
    expect(compactSql).toContain('if creator_user_id is null or not public.is_app_operator(creator_user_id) then raise exception')
    expect(compactSql).toContain('if actor_user_id is null or not public.is_app_operator(actor_user_id) then raise exception')
    expect(compactSql).toContain('if auth.uid() is null or not public.is_app_operator(auth.uid()) then raise exception')
    expect(compactSql).toContain('revoke all on function public.create_signup_invite(text) from public, anon')
    expect(compactSql).toContain('revoke all on function public.revoke_signup_invite(uuid, text) from public, anon')
    expect(compactSql).toContain('revoke all on function public.list_signup_invites() from public, anon')
  })

  it('resets broad public RPC grants before assigning intended roles', () => {
    expect(compactGrantSql).toContain('revoke all on function public.create_signup_invite(text) from service_role')
    expect(compactGrantSql).toContain('grant execute on function public.create_signup_invite(text) to authenticated')
    expect(compactGrantSql).toContain('revoke all on function public.revoke_signup_invite(uuid, text) from service_role')
    expect(compactGrantSql).toContain('grant execute on function public.revoke_signup_invite(uuid, text) to authenticated')
    expect(compactGrantSql).toContain('revoke all on function public.list_signup_invites() from service_role')
    expect(compactGrantSql).toContain('grant execute on function public.list_signup_invites() to authenticated')
    expect(compactGrantSql).toContain('revoke all on function public.hook_validate_signup_invite(jsonb) from service_role')
    expect(compactGrantSql).toContain('grant execute on function public.hook_validate_signup_invite(jsonb) to supabase_auth_admin')
  })
})
