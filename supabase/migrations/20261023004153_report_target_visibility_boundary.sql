-- Enforce canonical caller RLS before privileged evidence capture. The former
-- intake hand-checked blocks but missed hidden categories and unready Pins.
begin;

-- Keep privileged implementations inaccessible to direct browser-role SQL.
-- Legacy full-app RPCs still require USAGE on the separate private schema.
create schema if not exists member_mutation_private;
revoke all on schema member_mutation_private from public, anon, authenticated, service_role;

alter function public.submit_member_report(text, uuid, text, uuid, text, jsonb) set schema member_mutation_private;
alter function member_mutation_private.submit_member_report(text, uuid, text, uuid, text, jsonb) rename to submit_member_report_impl;
revoke all on function member_mutation_private.submit_member_report_impl(text, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function member_mutation_private.submit_member_report_impl(text, uuid, text, uuid, text, jsonb) to authenticated;

create function private.member_report_target_is_visible(target_type text, target_id uuid)
returns boolean language sql stable security invoker set search_path = ''
return (
  select case lower(trim(coalesce(target_type, '')))
    when 'user' then exists(select 1 from public.users where id = target_id)
    when 'general_message' then exists(select 1 from public.messages where id = target_id)
    when 'dm_message' then exists(select 1 from public.dm_messages where id = target_id)
    when 'shadow_pin_image' then exists(select 1 from public.shadow_pin_images where id = target_id)
    when 'shadow_pin_comment' then exists(select 1 from public.shadow_pin_comments where id = target_id)
    else false
  end
);
revoke all on function private.member_report_target_is_visible(text, uuid) from public, anon, authenticated;
grant execute on function private.member_report_target_is_visible(text, uuid) to authenticated;

-- A lost receipt can still be retrieved after the already-reported target is
-- removed or hidden. This reveals no other member's report or target content.
create function private.has_own_member_report_retry(client_report_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists(select 1 from public.member_reports
    where reporter_user_id = auth.uid() and member_reports.client_report_id = has_own_member_report_retry.client_report_id);
$$;
revoke all on function private.has_own_member_report_retry(uuid) from public, anon, authenticated;
grant execute on function private.has_own_member_report_retry(uuid) to authenticated;

create function private.require_visible_member_report_target(target_id uuid, is_authorized boolean)
returns uuid language plpgsql volatile security invoker set search_path = ''
as $$
begin
  if is_authorized is distinct from true then
    raise exception 'This report target is not available' using errcode = '42501';
  end if;
  return target_id;
end;
$$;
revoke all on function private.require_visible_member_report_target(uuid, boolean) from public, anon, authenticated;
grant execute on function private.require_visible_member_report_target(uuid, boolean) to authenticated;

-- SQL-standard binding avoids granting member_mutation_private USAGE. The privileged
-- intake cannot run until its target argument passes this caller-RLS check.
create function public.submit_member_report(
  p_target_type text,
  p_target_id uuid,
  p_category text,
  p_client_report_id uuid,
  p_details text default '',
  p_attachments jsonb default '[]'::jsonb
)
returns table (report_id uuid, case_id uuid, case_number bigint, case_status text)
language sql volatile security invoker set search_path = ''
begin atomic
  select * from member_mutation_private.submit_member_report_impl(
    p_target_type,
    private.require_visible_member_report_target(p_target_id,
      private.is_active_member() and (
        private.member_report_target_is_visible(p_target_type, p_target_id)
        or private.has_own_member_report_retry(p_client_report_id)
      )),
    p_category, p_client_report_id, p_details, p_attachments
  );
end;
revoke all on function public.submit_member_report(text, uuid, text, uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.submit_member_report(text, uuid, text, uuid, text, jsonb) to authenticated;

comment on function public.submit_member_report(text, uuid, text, uuid, text, jsonb) is
  'Caller-RLS visibility boundary before private authoritative evidence capture; existing own report retries remain idempotent.';
notify pgrst, 'reload schema';
commit;
