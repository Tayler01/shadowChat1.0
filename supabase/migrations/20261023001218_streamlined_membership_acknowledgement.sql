-- This edition's acknowledgement is a self-declaration, not age verification.
-- It does not alter membership, chat permissions, or the full app's access.
-- Depends on 20261023001140_active_member_access_boundary.sql.
begin;

create table public.streamlined_membership_acknowledgements (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  policy_version text not null default '2026-10-22.2',
  adult_declared boolean not null check (adult_declared is true),
  terms_accepted boolean not null check (terms_accepted is true),
  privacy_acknowledged boolean not null check (privacy_acknowledged is true),
  accepted_at timestamptz not null default now(),
  primary key (user_id, policy_version)
);

alter table public.streamlined_membership_acknowledgements enable row level security;
revoke all on table public.streamlined_membership_acknowledgements from public, anon, authenticated;
grant select on table public.streamlined_membership_acknowledgements to authenticated;
-- Identity, version and timestamp are server-owned. Browser clients cannot
-- supply them, rewrite accepted records, or accept on another member's behalf.
grant insert (adult_declared, terms_accepted, privacy_acknowledged)
  on public.streamlined_membership_acknowledgements to authenticated;
grant all on table public.streamlined_membership_acknowledgements to service_role;

create policy "Members read their own streamlined acknowledgement"
  on public.streamlined_membership_acknowledgements for select to authenticated
  using (user_id = (select auth.uid()) and (select private.is_active_member()));

create policy "Members explicitly acknowledge the current streamlined policy"
  on public.streamlined_membership_acknowledgements for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and policy_version = '2026-10-22.2'
    and adult_declared and terms_accepted and privacy_acknowledged
    and (select private.is_active_member())
  );

create function public.get_streamlined_membership_acknowledgement()
returns table (
  user_id uuid,
  policy_version text,
  adult_declared boolean,
  terms_accepted boolean,
  privacy_acknowledged boolean,
  accepted_at timestamptz
)
language sql stable security invoker set search_path = ''
as $$
  select acknowledgement.user_id, acknowledgement.policy_version, acknowledgement.adult_declared,
    acknowledgement.terms_accepted, acknowledgement.privacy_acknowledged,
    acknowledgement.accepted_at
  from public.streamlined_membership_acknowledgements acknowledgement
  where acknowledgement.user_id = (select auth.uid())
    and acknowledgement.policy_version = '2026-10-22.2';
$$;

create function public.accept_streamlined_membership(
  p_expected_user_id uuid,
  p_policy_version text,
  p_adult_declared boolean,
  p_terms_accepted boolean,
  p_privacy_acknowledged boolean
)
returns table (
  user_id uuid,
  policy_version text,
  adult_declared boolean,
  terms_accepted boolean,
  privacy_acknowledged boolean,
  accepted_at timestamptz
)
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null or p_expected_user_id is distinct from auth.uid() then
    raise exception 'The signed-in account changed. Reload before acknowledging the membership policy' using errcode = '42501';
  end if;
  if p_policy_version is distinct from '2026-10-22.2' then
    raise exception 'The membership policy has changed. Reload and review the current policy' using errcode = '22023';
  end if;
  if p_adult_declared is distinct from true
    or p_terms_accepted is distinct from true
    or p_privacy_acknowledged is distinct from true then
    raise exception 'An adult declaration and explicit policy acknowledgement are required' using errcode = '22023';
  end if;

  -- RLS also checks current membership. No SECURITY DEFINER bypass is needed.
  insert into public.streamlined_membership_acknowledgements (
    adult_declared, terms_accepted, privacy_acknowledged
  ) values (p_adult_declared, p_terms_accepted, p_privacy_acknowledged)
  on conflict on constraint streamlined_membership_acknowledgements_pkey do nothing;

  return query select acknowledgement.user_id, acknowledgement.policy_version, acknowledgement.adult_declared,
    acknowledgement.terms_accepted, acknowledgement.privacy_acknowledged,
    acknowledgement.accepted_at
  from public.streamlined_membership_acknowledgements acknowledgement
  where acknowledgement.user_id = auth.uid()
    and acknowledgement.policy_version = '2026-10-22.2';
end;
$$;

revoke all on function public.get_streamlined_membership_acknowledgement() from public, anon, authenticated;
revoke all on function public.accept_streamlined_membership(uuid, text, boolean, boolean, boolean) from public, anon, authenticated;
grant execute on function public.get_streamlined_membership_acknowledgement() to authenticated;
grant execute on function public.accept_streamlined_membership(uuid, text, boolean, boolean, boolean) to authenticated;

comment on table public.streamlined_membership_acknowledgements is
  'Owner-private, versioned adult self-declaration and terms/privacy acknowledgement for the streamlined edition. Not verified age; no full-app authorization effect. Removed with the Auth account.';

commit;
