-- No evidence is purged by this migration. Service-only preparation defaults to
-- dry-run and execution requires an explicit reviewed case allowlist.
begin;
create table private.moderation_retention_holds (
  case_id uuid primary key references public.moderation_cases(id) on delete cascade,
  hold_type text not null check (hold_type in ('active_appeal','legal_hold')),
  reason text not null check (length(trim(reason)) between 10 and 1000),
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create table private.moderation_purge_jobs (
  case_id uuid primary key,
  manifest jsonb not null check (jsonb_typeof(manifest) = 'object'),
  cancelled_at timestamptz,
  prepared_at timestamptz not null default now()
);
alter table private.moderation_retention_holds enable row level security;
alter table private.moderation_purge_jobs enable row level security;
revoke all on private.moderation_retention_holds, private.moderation_purge_jobs from public, anon, authenticated;
grant select, insert, update, delete on private.moderation_retention_holds, private.moderation_purge_jobs to service_role;

create function private.guard_moderation_purge()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare case_key uuid;
begin
  case_key := case when tg_table_name = 'moderation_cases' then (to_jsonb(old)->>'id')::uuid else (to_jsonb(new)->>'case_id')::uuid end;
  -- The same parent row lock serializes hold/report changes and preparation.
  perform 1 from public.moderation_cases where id = case_key for update;
  if exists(select 1 from private.moderation_purge_jobs where case_id = case_key)
    and not coalesce(current_setting('role', true) = 'service_role'
      and current_setting('shadowchat.moderation_purge_case', true) = case_key::text,false) then
    if tg_op = 'DELETE' then raise exception 'Case deletion requires the scoped purge worker'; end if;
    -- New evidence, reopening, or a new hold always cancels preparation. An
    -- operator must review and explicitly prepare again before more removal.
    update private.moderation_purge_jobs set cancelled_at = now() where case_id = case_key;
  end if;
  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;
revoke all on function private.guard_moderation_purge() from public, anon, authenticated;
create trigger moderation_case_purge_guard before update or delete on public.moderation_cases
  for each row execute function private.guard_moderation_purge();
create trigger moderation_case_reports_purge_guard before insert on public.moderation_case_reports
  for each row execute function private.guard_moderation_purge();
create trigger moderation_case_holds_purge_guard before insert or update on private.moderation_retention_holds
  for each row execute function private.guard_moderation_purge();

-- Preserve all existing immutable-update checks by wrapping the former guard.
alter function private.reject_moderation_audit_mutation() rename to reject_moderation_audit_mutation_original;
-- Triggers remain bound to the renamed function, so recreate only their target.
create function private.reject_moderation_audit_mutation()
returns trigger language plpgsql security definer set search_path = '' as $$
declare old_row jsonb := to_jsonb(old); new_row jsonb := to_jsonb(new);
  purge_case uuid := nullif(current_setting('shadowchat.moderation_purge_case', true), '')::uuid;
  plan jsonb; field text;
begin
  if tg_op = 'DELETE' and current_setting('role', true) = 'service_role' and purge_case is not null then
    select manifest into plan from private.moderation_purge_jobs where case_id = purge_case;
    if plan is not null and (
      old_row->>'case_id' = purge_case::text
      or (tg_table_name = 'member_reports' and plan->'report_ids' ? (old_row->>'id'))
      or (tg_table_name = 'moderation_report_attachments' and plan->'report_ids' ? (old_row->>'report_id'))
      or (tg_table_name = 'moderation_action_channel_bans' and plan->'action_ids' ? (old_row->>'action_id'))
    ) then return old; end if;
  end if;
  -- Identical to the original guard: foreign keys may only clear these actor
  -- fields, with every snapshot/note/hash unchanged.
  if tg_op = 'UPDATE' then
    if tg_table_name = 'member_reports'
      and new_row - 'reporter_user_id' - 'subject_user_id' = old_row - 'reporter_user_id' - 'subject_user_id'
      and (new_row->'reporter_user_id' = old_row->'reporter_user_id' or new_row->'reporter_user_id' = 'null'::jsonb)
      and (new_row->'subject_user_id' = old_row->'subject_user_id' or new_row->'subject_user_id' = 'null'::jsonb) then return new; end if;
    field := case tg_table_name when 'moderation_evidence' then 'source_author_id'
      when 'moderation_case_events' then 'actor_user_id' when 'moderation_case_actions' then 'actor_user_id'
      when 'moderation_report_attachments' then 'uploader_user_id' else null end;
    if field is not null and new_row - field = old_row - field
      and (new_row->field = old_row->field or new_row->field = 'null'::jsonb) then return new; end if;
  end if;
  raise exception 'Moderation intake and audit rows are immutable';
end;
$$;
revoke all on function private.reject_moderation_audit_mutation() from public, anon, authenticated;
do $$ declare table_name text; begin
  foreach table_name in array array['member_reports','moderation_case_reports','moderation_evidence','moderation_case_events','moderation_case_actions','moderation_action_channel_bans','moderation_report_attachments'] loop
    execute format('drop trigger %I on public.%I', table_name || '_immutable', table_name);
    execute format('create trigger %I before update or delete on public.%I for each row execute function private.reject_moderation_audit_mutation()', table_name || '_immutable', table_name);
  end loop;
end; $$;
drop function private.reject_moderation_audit_mutation_original();

create function public.prepare_moderation_retention_purge(target_case_ids uuid[] default null, dry_run boolean default true)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare case_row record; plan jsonb; result jsonb := '[]'::jsonb; requested_id uuid;
begin
  if not dry_run and (target_case_ids is null or cardinality(target_case_ids) not between 1 and 50) then
    raise exception 'Execution requires an explicit allowlist of 1 to 50 reviewed cases';
  end if;
  if not dry_run then
    foreach requested_id in array target_case_ids loop
      perform 1 from public.moderation_cases where id = requested_id for update;
      if not found then raise exception 'Requested case does not exist'; end if;
      if not exists(select 1 from public.moderation_cases c where c.id = requested_id
        and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now() - interval '90 days'
        and not exists(select 1 from private.moderation_retention_holds h where h.case_id = c.id and (h.expires_at is null or h.expires_at > now()))) then
        raise exception 'Every requested case must be closed for 90 days with no active appeal or legal hold';
      end if;
    end loop;
  end if;
  for case_row in select c.id, c.status, coalesce(c.resolved_at,c.updated_at) + interval '90 days' as eligible_at
    from public.moderation_cases c where (target_case_ids is null or c.id = any(target_case_ids))
      and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now() - interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id = c.id and (h.expires_at is null or h.expires_at > now()))
    order by coalesce(c.resolved_at,c.updated_at),c.id limit 100
  loop
    select jsonb_build_object('case_id',case_row.id,'eligible_at',case_row.eligible_at,
      'report_ids',coalesce((select jsonb_agg(report_id) from public.moderation_case_reports where case_id = case_row.id),'[]'::jsonb),
      'action_ids',coalesce((select jsonb_agg(id) from public.moderation_case_actions where case_id = case_row.id),'[]'::jsonb),
      'storage',coalesce((select jsonb_agg(jsonb_build_object('bucket',a.bucket,'path',a.path)) from public.moderation_report_attachments a
        join public.moderation_case_reports l on l.report_id = a.report_id where l.case_id = case_row.id),'[]'::jsonb)) into plan;
    if not dry_run then
      insert into private.moderation_purge_jobs(case_id,manifest) values(case_row.id,plan)
        on conflict(case_id) do update set manifest=excluded.manifest,cancelled_at=null,prepared_at=now();
      select manifest into plan from private.moderation_purge_jobs where case_id = case_row.id;
    end if;
    result := result || jsonb_build_array(plan || jsonb_build_object('dry_run',dry_run));
  end loop;
  return result;
end;
$$;

create function public.finish_moderation_retention_purge(target_case_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare plan jsonb; report_ids uuid[]; action_ids uuid[];
begin
  perform 1 from public.moderation_cases where id = target_case_id for update;
  select manifest into plan from private.moderation_purge_jobs where case_id = target_case_id for update;
  if plan is null then
    if not exists(select 1 from public.moderation_cases where id = target_case_id) then return; end if;
    raise exception 'A reviewed purge must be prepared first';
  end if;
  if exists(select 1 from private.moderation_purge_jobs where case_id=target_case_id and cancelled_at is not null)
    or not exists(select 1 from public.moderation_cases c where c.id=target_case_id
      and c.status in ('resolved','dismissed','closed') and coalesce(c.resolved_at,c.updated_at) <= now()-interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()))) then
    raise exception 'Purge was cancelled or current retention eligibility changed';
  end if;
  if exists(select 1 from jsonb_array_elements(plan->'storage') item join storage.objects o
    on o.bucket_id = item->>'bucket' and o.name = item->>'path') then
    raise exception 'Remove the planned evidence files through the Storage API before finishing';
  end if;
  perform set_config('shadowchat.moderation_purge_case',target_case_id::text,true);
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into report_ids from jsonb_array_elements_text(plan->'report_ids');
  select coalesce(array_agg(value::uuid),'{}'::uuid[]) into action_ids from jsonb_array_elements_text(plan->'action_ids');
  delete from public.moderation_report_attachments where report_id = any(report_ids);
  delete from public.moderation_report_updates where report_id = any(report_ids);
  delete from public.moderation_evidence where case_id = target_case_id;
  delete from public.moderation_case_events where case_id = target_case_id;
  delete from public.moderation_action_channel_bans where action_id = any(action_ids);
  delete from public.moderation_case_actions where case_id = target_case_id;
  delete from public.moderation_case_reports where case_id = target_case_id;
  delete from public.member_reports where id = any(report_ids);
  delete from public.moderation_cases where id = target_case_id;
  delete from private.moderation_purge_jobs where case_id = target_case_id;
end;
$$;
create function public.cancel_moderation_retention_purge(target_case_id uuid)
returns void language sql security invoker set search_path='' as $$
  update private.moderation_purge_jobs set cancelled_at=now() where case_id=target_case_id;
$$;
-- Call immediately before each external Storage removal batch. Preparation is
-- revocable; a new hold/case change cancels the job. Previously removed bytes
-- cannot be restored, so the operator must stop promptly if this check fails.
create function public.authorize_moderation_retention_batch(target_case_id uuid)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare plan jsonb;
begin
  perform 1 from public.moderation_cases where id=target_case_id for update;
  select j.manifest into plan from private.moderation_purge_jobs j join public.moderation_cases c on c.id=j.case_id
    where j.case_id=target_case_id and j.cancelled_at is null and c.status in ('resolved','dismissed','closed')
      and coalesce(c.resolved_at,c.updated_at)<=now()-interval '90 days'
      and not exists(select 1 from private.moderation_retention_holds h where h.case_id=c.id and (h.expires_at is null or h.expires_at>now()));
  if plan is null then raise exception 'Purge was cancelled or current retention eligibility changed'; end if;
  return plan;
end;
$$;
revoke all on function public.prepare_moderation_retention_purge(uuid[],boolean), public.finish_moderation_retention_purge(uuid) from public, anon, authenticated;
grant execute on function public.prepare_moderation_retention_purge(uuid[],boolean), public.finish_moderation_retention_purge(uuid) to service_role;
revoke all on function public.cancel_moderation_retention_purge(uuid),public.authorize_moderation_retention_batch(uuid) from public,anon,authenticated;
grant execute on function public.cancel_moderation_retention_purge(uuid),public.authorize_moderation_retention_batch(uuid) to service_role;
comment on table private.moderation_retention_holds is 'Documented appeal/legal holds extend the default 90-day closed-case evidence retention. No automatic purge is enabled.';
notify pgrst, 'reload schema';
commit;
