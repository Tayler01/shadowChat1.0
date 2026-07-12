begin;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000301', 'authenticated', 'authenticated', 'reporter@example.test', '', now(), '{}'::jsonb, '{"username":"case_reporter","display_name":"Case Reporter"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000302', 'authenticated', 'authenticated', 'subject@example.test', '', now(), '{}'::jsonb, '{"username":"case_subject","display_name":"Case Subject"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000303', 'authenticated', 'authenticated', 'unrelated@example.test', '', now(), '{}'::jsonb, '{"username":"case_unrelated","display_name":"Case Unrelated"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000304', 'authenticated', 'authenticated', 'operator@example.test', '', now(), '{}'::jsonb, '{"username":"case_operator","display_name":"Case Operator"}'::jsonb, now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000305', 'authenticated', 'authenticated', 'admin@example.test', '', now(), '{}'::jsonb, '{"username":"case_admin","display_name":"Case Admin"}'::jsonb, now(), now());

insert into public.user_roles (user_id, role, created_by)
values
  ('00000000-0000-0000-0000-000000000304', 'sub_admin', '00000000-0000-0000-0000-000000000305'),
  ('00000000-0000-0000-0000-000000000305', 'admin', '00000000-0000-0000-0000-000000000305');

insert into public.messages (id, user_id, content, message_type, created_at, updated_at)
values (
  '30000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  'Preserve this exact reported message',
  'text',
  '2026-07-12 00:31:00+00',
  '2026-07-12 00:31:00+00'
);

insert into public.dm_conversations (id, participants, last_message_at)
values (
  '31000000-0000-0000-0000-000000000301',
  array[
    '00000000-0000-0000-0000-000000000301'::uuid,
    '00000000-0000-0000-0000-000000000302'::uuid
  ],
  '2026-07-12 00:32:00+00'
);

insert into public.dm_messages (
  id, conversation_id, sender_id, content, message_type, created_at, updated_at
)
values (
  '32000000-0000-0000-0000-000000000301',
  '31000000-0000-0000-0000-000000000301',
  '00000000-0000-0000-0000-000000000302',
  'Only this DM may enter operator evidence',
  'text',
  '2026-07-12 00:32:00+00',
  '2026-07-12 00:32:00+00'
);

do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moderation_cases'
  ) then
    raise exception 'moderation_cases is not published to Realtime';
  end if;
  if not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'moderation_report_updates'
  ) then
    raise exception 'moderation_report_updates is not published to Realtime';
  end if;
end
$$;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000301', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000301","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  first_result record;
  repeated_result record;
  dm_result record;
  protected_result record;
  self_report_denied boolean := false;
begin
  select * into first_result
  from public.submit_member_report(
    'general_message',
    '30000000-0000-0000-0000-000000000301',
    'harassment',
    '33000000-0000-0000-0000-000000000301',
    'This report has enough useful context.'
  );
  select * into repeated_result
  from public.submit_member_report(
    'general_message',
    '30000000-0000-0000-0000-000000000301',
    'harassment',
    '33000000-0000-0000-0000-000000000301',
    'This report has enough useful context.'
  );

  if first_result.report_id is distinct from repeated_result.report_id
    or first_result.case_id is distinct from repeated_result.case_id then
    raise exception 'Report submission is not idempotent';
  end if;

  select * into dm_result
  from public.submit_member_report(
    'dm_message',
    '32000000-0000-0000-0000-000000000301',
    'privacy_or_impersonation',
    '33000000-0000-0000-0000-000000000302',
    'This DM is the exact evidence target.'
  );

  select * into protected_result
  from public.submit_member_report(
    'user',
    '00000000-0000-0000-0000-000000000304',
    'other',
    '33000000-0000-0000-0000-000000000303',
    'Protected operator case for hierarchy proof.'
  );

  begin
    perform public.submit_member_report(
      'user',
      '00000000-0000-0000-0000-000000000301',
      'other',
      '33000000-0000-0000-0000-000000000304',
      'Attempting to report my own profile.'
    );
  exception when others then
    self_report_denied := sqlerrm like '%own%';
  end;
  if not self_report_denied then
    raise exception 'Self-reporting was not rejected';
  end if;

  perform set_config('verify.general_case_id', first_result.case_id::text, true);
  perform set_config('verify.general_case_version', '1', true);
  perform set_config('verify.dm_case_id', dm_result.case_id::text, true);
  perform set_config('verify.protected_case_id', protected_result.case_id::text, true);
end
$$;

do $$
declare
  direct_write_denied boolean := false;
begin
  if (select count(*) from public.list_my_member_reports()) <> 3 then
    raise exception 'Reporter-safe report history is incomplete';
  end if;
  if (select count(*) from public.moderation_report_updates where read_at is null) <> 3 then
    raise exception 'Reporter updates are not owner-visible';
  end if;

  begin
    update public.member_reports set details = 'forged';
  exception when insufficient_privilege then
    direct_write_denied := true;
  end;
  if not direct_write_denied then
    raise exception 'Member report intake was directly mutable';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000303', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000303","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  dm_report_denied boolean := false;
begin
  if (select count(*) from public.list_my_member_reports()) <> 0
    or (select count(*) from public.moderation_cases) <> 0 then
    raise exception 'Subject or unrelated-member report privacy failed';
  end if;

  begin
    perform public.submit_member_report(
      'dm_message',
      '32000000-0000-0000-0000-000000000301',
      'harassment',
      '33000000-0000-0000-0000-000000000305',
      'Known-id DM visibility bypass attempt.'
    );
  exception when others then
    dm_report_denied := sqlerrm like '%not available%';
  end;
  if not dm_report_denied then
    raise exception 'Unrelated member could report a private DM by id';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000304', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000304","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  claimed public.moderation_cases%rowtype;
  action_result jsonb;
  failed_action_result jsonb;
  case_payload jsonb;
  stale_denied boolean := false;
  protected_visible boolean;
begin
  if (select count(*) from public.list_moderation_cases('all')) <> 2 then
    raise exception 'Sub-admin queue did not exclude the protected operator case';
  end if;

  select exists (
    select 1 from public.list_moderation_cases('all') listed
    where listed.case_id = current_setting('verify.protected_case_id')::uuid
  ) into protected_visible;
  if protected_visible then
    raise exception 'Sub-admin could see a protected operator case';
  end if;

  select * into claimed
  from public.assign_moderation_case(
    current_setting('verify.general_case_id')::uuid,
    current_setting('verify.general_case_version')::integer,
    '00000000-0000-0000-0000-000000000304'
  );

  if claimed.assigned_to <> '00000000-0000-0000-0000-000000000304'::uuid
    or claimed.status <> 'triaged' then
    raise exception 'Case claim did not assign and triage atomically';
  end if;

  begin
    perform public.transition_moderation_case(
      claimed.id,
      claimed.version - 1,
      'investigating',
      null,
      null,
      'stale operator write',
      null
    );
  exception when others then
    stale_denied := sqlerrm like '%changed%';
  end;
  if not stale_denied then
    raise exception 'Stale operator case version was accepted';
  end if;

  if (public.get_moderation_case(claimed.id)->'evidence'->0->'snapshot'->>'content')
      <> 'Preserve this exact reported message' then
    raise exception 'Immutable evidence snapshot is missing reported content';
  end if;

  action_result := public.apply_moderation_case_action(
    claimed.id,
    claimed.version,
    'remove_content',
    '{}'::text[],
    null,
    null,
    'Reviewed exact General Chat evidence.'
  );

  if coalesce((action_result->>'ok')::boolean, false) is not true then
    raise exception 'Supported content-removal action failed: %', action_result;
  end if;
  if exists (select 1 from public.messages where id = '30000000-0000-0000-0000-000000000301') then
    raise exception 'Applied content-removal action left the target visible';
  end if;
  if (public.get_moderation_case(claimed.id)->'evidence'->0->'snapshot'->>'content')
      <> 'Preserve this exact reported message' then
    raise exception 'Content removal destroyed preserved evidence';
  end if;

  case_payload := public.get_moderation_case(claimed.id);
  failed_action_result := public.apply_moderation_case_action(
    claimed.id,
    (case_payload->'case'->>'version')::integer,
    'remove_content',
    '{}'::text[],
    null,
    null,
    'Prove failed enforcement is retained without losing evidence.'
  );

  if coalesce((failed_action_result->>'ok')::boolean, true) is not false then
    raise exception 'A missing target did not produce a failed audited action';
  end if;
  case_payload := public.get_moderation_case(claimed.id);
  if not exists (
    select 1 from jsonb_array_elements(case_payload->'actions') action
    where action->>'status' = 'failed'
  ) or not exists (
    select 1 from jsonb_array_elements(case_payload->'events') event
    where event->>'event_type' = 'action_failed'
  ) then
    raise exception 'Failed enforcement attempt was not preserved in action and event audit';
  end if;
  if (case_payload->'evidence'->0->'snapshot'->>'content')
      <> 'Preserve this exact reported message' then
    raise exception 'Failed enforcement attempt changed immutable evidence';
  end if;
end
$$;

reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-000000000305', true);
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-000000000305","role":"authenticated"}', true);
set local role authenticated;

do $$
declare
  protected_case record;
begin
  select * into protected_case
  from public.list_moderation_cases('all') listed
  where listed.case_id = current_setting('verify.protected_case_id')::uuid;

  if protected_case.case_id is null then
    raise exception 'Full admin could not see the protected operator case';
  end if;
end
$$;

reset role;
rollback;

select 'member-reporting-case-center-local-verification-passed' as result;
