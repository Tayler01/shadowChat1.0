-- Preserve the published full client's authenticated {confirm:'DELETE'} API.
-- These aliases only finish a previously authorized job. The Edge handler
-- validates Auth before binding a bearer digest; no raw bearer is stored.
begin;

create table private.account_deletion_legacy_bearers (
  bearer_digest text primary key check (bearer_digest ~ '^[0-9a-f]{64}$'),
  user_id uuid not null references private.account_deletion_jobs(user_id) on delete cascade,
  created_at timestamptz not null default now()
);
create index account_deletion_legacy_bearers_user_id_idx on private.account_deletion_legacy_bearers(user_id);
alter table private.account_deletion_legacy_bearers enable row level security;
revoke all on private.account_deletion_legacy_bearers from public, anon, authenticated;
grant select, insert on private.account_deletion_legacy_bearers to service_role;

create function public.begin_legacy_account_deletion(
  target_user_id uuid, request_bearer_digest text, generated_receipt_digest text
) returns jsonb language plpgsql security invoker set search_path = '' as $$
declare job private.account_deletion_jobs%rowtype;
begin
  if target_user_id is null or request_bearer_digest is null or generated_receipt_digest is null
    or request_bearer_digest !~ '^[0-9a-f]{64}$' or generated_receipt_digest !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid deletion request';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('account-deletion:' || target_user_id::text, 0));
  select * into job from private.account_deletion_jobs where user_id = target_user_id for update;
  if not found then
    perform public.begin_account_deletion(target_user_id, generated_receipt_digest);
    select * into strict job from private.account_deletion_jobs where user_id = target_user_id for update;
  end if;
  -- Never call begin_account_deletion for an existing job: its receipt refresh
  -- behavior must not invalidate another device's saved completion receipt.
  insert into private.account_deletion_legacy_bearers(bearer_digest, user_id)
    values (request_bearer_digest, target_user_id) on conflict (bearer_digest) do nothing;
  if not exists (select 1 from private.account_deletion_legacy_bearers
    where bearer_digest = request_bearer_digest and user_id = target_user_id) then
    raise exception 'Deletion credential is already bound';
  end if;
  return jsonb_build_object('user_id', job.user_id, 'state', job.state, 'manifest', job.manifest);
end;
$$;

create function public.get_legacy_account_deletion_job(request_bearer_digest text)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object('user_id', j.user_id, 'state', j.state, 'manifest', j.manifest)
    from private.account_deletion_jobs j
    join private.account_deletion_legacy_bearers b on b.user_id = j.user_id
    where b.bearer_digest = request_bearer_digest
      and (j.state <> 'completed' or j.receipt_expires_at > now());
$$;

revoke all on function public.begin_legacy_account_deletion(uuid,text,text),
  public.get_legacy_account_deletion_job(text) from public, anon, authenticated;
grant execute on function public.begin_legacy_account_deletion(uuid,text,text),
  public.get_legacy_account_deletion_job(text) to service_role;
comment on table private.account_deletion_legacy_bearers is
  'Completion-only aliases for bearer tokens verified by the deletion Edge handler; never raw tokens. Cascades when completed deletion receipts are pruned.';

notify pgrst, 'reload schema';
commit;
