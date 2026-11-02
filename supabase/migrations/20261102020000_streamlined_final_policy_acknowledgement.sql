-- Final streamlined policy. Coordinate with the matching frontend publication.
-- Existing adult declarations and historical receipts are retained. This changes
-- only streamlined acknowledgement; full-app chat/media access is unaffected.
begin;
alter table public.streamlined_membership_acknowledgements
  alter column policy_version set default '2026-11-01.1';
alter policy "Members explicitly acknowledge the current streamlined policy"
  on public.streamlined_membership_acknowledgements
  with check (user_id = (select auth.uid()) and policy_version = '2026-11-01.1'
    and adult_declared and terms_accepted and privacy_acknowledged
    and (select private.is_active_member()));

create or replace function public.get_streamlined_membership_acknowledgement()
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
    and acknowledgement.policy_version in ('2026-11-01.1', '2026-10-22.2')
  order by (acknowledgement.policy_version = '2026-11-01.1') desc, acknowledgement.accepted_at desc
  limit 1;
$$;

create or replace function public.accept_streamlined_membership(
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
  if p_policy_version is distinct from '2026-11-01.1' then
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
    and acknowledgement.policy_version = '2026-11-01.1';
end;
$$;

-- CREATE OR REPLACE preserves the existing invoker boundary and execution grants.
commit;
